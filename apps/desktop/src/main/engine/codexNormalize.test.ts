import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EngineEvent, PermissionRequest } from "../../shared/engine";
import { CodexNormalizer, changeDiff, displayCommand, limitReset, mcpToolApproval } from "./codexNormalize";

/**
 * Recorded `codex app-server` traffic (Codex 0.166.0, signed in with ChatGPT; paths renamed):
 * turns.jsonl has a text reply, an approved command, a file written by an approved PowerShell
 * command, an interrupt and a declined command; patch-mcp.jsonl an apply_patch edit with its
 * approval and an MCP tool call.
 */
interface Line {
  dir: "in" | "out";
  // biome-ignore lint/suspicious/noExplicitAny: recorded JSON-RPC messages.
  msg: any;
}

const fixture = (name: string): Line[] =>
  readFileSync(join(__dirname, "__fixtures__", "codex", name), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Line);

/** Plays a recording through a normalizer, the way the engine does; one entry per turn. */
function replay(name: string) {
  const n = new CodexNormalizer();
  const lines = fixture(name);
  const threadStart = lines.find((l) => l.dir === "out" && l.msg.method === "thread/start")?.msg.id;
  const init: EngineEvent[] = [];
  const turns: EngineEvent[][] = [[]];
  const permissions: PermissionRequest[] = [];
  for (const { dir, msg } of lines) {
    if (dir === "out") continue;
    const turn = turns[turns.length - 1]!;
    if (msg.method && msg.id !== undefined) {
      const request = n.permissionRequest(msg.method, msg.params);
      if (request) permissions.push(request);
    } else if (msg.method) {
      const events = n.handle(msg);
      turn.push(...events);
      if (events.some((e) => e.type === "result")) turns.push([]);
    } else if (msg.id === threadStart) init.push(...n.started(msg.result, "default"));
  }
  return { n, init, turns: turns.filter((t) => t.length), permissions };
}

const ofType = <T extends EngineEvent["type"]>(events: EngineEvent[], type: T) =>
  events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);

describe("CodexNormalizer (recorded turns)", () => {
  const { init, turns, permissions } = replay("turns.jsonl");

  it("reports the thread as the chat's session, with the model Codex picked", () => {
    expect(init).toEqual([
      expect.objectContaining({
        type: "init",
        engineSessionId: "01a1a58f-f801-7692-86ba-33f6fcf22efd",
        model: "gpt-6.1-sol",
        permissionMode: "default",
        slashCommands: [],
      }),
    ]);
    expect(turns).toHaveLength(5);
  });

  it("streams a text reply into one text block and ends the turn with its usage and estimated cost", () => {
    const [first] = turns;
    const id = "msg_043388d604341902016aeae562b62487d2af44d2b1bc65ff6a";
    expect(first![0]).toEqual({ type: "block_start", id, block: "text" });
    const streamed = ofType(first!, "block_delta")
      .map((e) => e.text)
      .join("");
    expect(streamed).toBe("Hello, Contoso!");
    expect(ofType(first!, "block_end")).toEqual([
      { type: "block_end", id, block: "text", text: "Hello, Contoso!", model: "gpt-6.1-sol" },
    ]);
    const [result] = ofType(first!, "result");
    expect(result).toMatchObject({ ok: true, numTurns: 1 });
    expect(result?.totalCostUsd).toBeUndefined();
    // gpt-6.1-sol at API prices (D-414): 24072 input × $2/M + 9 output × $10/M.
    expect(result?.turnCostUsd).toBeCloseTo((24072 * 2 + 9 * 10) / 1e6, 9);
    expect(result?.usage).toEqual({
      inputTokens: 24072,
      outputTokens: 9,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it("counts each turn's own tokens, not the thread's running total", () => {
    const [result] = ofType(turns[1]!, "result");
    // Totals 72537 in (48000 cached) / 72 out after turn 2; 24072 in / 9 out after turn 1.
    expect(result?.usage).toEqual({
      inputTokens: 72537 - 48000 - 24072,
      outputTokens: 72 - 9,
      cacheReadTokens: 48000,
      cacheWriteTokens: 0,
    });
    // Cache reads at the cached price: 465 × $2/M + 48000 × $0.10/M + 63 × $10/M.
    expect(result?.turnCostUsd).toBeCloseTo((465 * 2 + 48000 * 0.1 + 63 * 10) / 1e6, 9);
  });

  it("shows a command on the Bash card, without the shell Codex wraps it in, and asks first", () => {
    const tools = ofType(turns[1]!, "tool_use");
    expect(tools).toEqual([
      expect.objectContaining({
        id: "exec-a89179d8-1917-4238-a669-ae11e62c7356",
        name: "Bash",
        input: { command: "node --version" },
      }),
    ]);
    expect(permissions[0]).toMatchObject({
      requestId: "exec-a89179d8-1917-4238-a669-ae11e62c7356",
      toolName: "Bash",
      input: { command: "node --version", cwd: "C:\\work\\shop" },
      title: "Codex wants to run node --version",
      canAlwaysAllow: true,
    });
    expect(ofType(turns[1]!, "tool_result")).toEqual([
      {
        type: "tool_result",
        toolUseId: "exec-a89179d8-1917-4238-a669-ae11e62c7356",
        output: "v24.7.0\r\n",
        isError: false,
      },
    ]);
  });

  it("passes Codex's own reason with an approval", () => {
    expect(permissions[1]).toMatchObject({
      toolName: "Bash",
      description: "May I create hello.txt in the workspace with the requested line?",
    });
  });

  it("ends an interrupted turn as stopped, keeping what had streamed", () => {
    const interrupted = turns[3]!;
    const [result] = ofType(interrupted, "result");
    expect(result).toMatchObject({ ok: false, stopped: true });
    expect(result?.error).toBeUndefined();
    // The message had started but never completed: it is closed, not left streaming.
    const starts = ofType(interrupted, "block_start").map((e) => e.id);
    const ends = ofType(interrupted, "block_end").map((e) => e.id);
    expect(ends).toEqual(starts);
  });

  it("marks a declined command as an error with a plain reason", () => {
    expect(ofType(turns[4]!, "tool_result")).toEqual([
      {
        type: "tool_result",
        toolUseId: "exec-37c59f88-dc50-4cdf-80e0-3102d1f709fe",
        output: "You declined this command.",
        isError: true,
      },
    ]);
  });
});

describe("CodexNormalizer (recorded patch and MCP call)", () => {
  const { turns, permissions } = replay("patch-mcp.jsonl");
  const id = "exec-64bb56fb-b4d2-475b-9243-0b1abf8b4d76";

  it("puts a file change on the Edit card with its diff, after asking", () => {
    expect(ofType(turns[0]!, "tool_use").find((t) => t.id === id)).toMatchObject({
      name: "Edit",
      input: { file_path: "C:\\work\\shop\\hello.txt" },
    });
    expect(permissions).toEqual([
      expect.objectContaining({
        requestId: id,
        toolName: "Edit",
        input: { file_path: "C:\\work\\shop\\hello.txt" },
        title: "Codex wants to change hello.txt",
      }),
    ]);
    const result = ofType(turns[0]!, "tool_result").find((r) => r.toolUseId === id);
    expect(result).toMatchObject({ isError: false, output: "" });
    expect(result?.diff).toContain("@@ -1 +1 @@");
    expect(result?.diff).toContain("+Hello from Fabrikam");
  });

  it("shows an MCP call on the generic tool card with its text result", () => {
    const [tool] = ofType(turns[1]!, "tool_use");
    expect(tool).toMatchObject({
      name: "mcp__node_repl__js",
      input: { code: "nodeRepl.write(6*7)", title: "Evaluating 6*7" },
    });
    expect(ofType(turns[1]!, "tool_result")).toEqual([
      { type: "tool_result", toolUseId: tool!.id, output: "42", isError: false },
    ]);
  });

  it("shows nothing for reasoning Codex kept to itself", () => {
    expect(turns.flat().filter((e) => e.type === "block_start" && e.block === "thinking")).toEqual([]);
  });
});

describe("CodexNormalizer", () => {
  const item = (method: string, it: Record<string, unknown>) => ({ method, params: { item: it } });

  /** Codex's token update: the thread's running total and the last request's own tokens. */
  const tokens = (total: Record<string, number>, last: Record<string, number>) => ({
    method: "thread/tokenUsage/updated",
    params: { tokenUsage: { total, last, modelContextWindow: 400000 } },
  });
  const done = { method: "turn/completed", params: { turn: { id: "t", status: "completed" } } };

  it("prices each request of a turn at its own context rate (D-414)", () => {
    const n = new CodexNormalizer();
    n.model = "gpt-6.1-sol";
    // A short request (1000 in, 200 cached, 100 out), then one over 272K input tokens.
    n.handle(tokens({ inputTokens: 1000, cachedInputTokens: 200, outputTokens: 100 }, { inputTokens: 1000 }));
    n.handle(
      tokens(
        { inputTokens: 301000, cachedInputTokens: 100200, outputTokens: 200 },
        { inputTokens: 300000, cachedInputTokens: 100000, outputTokens: 100 },
      ),
    );
    const [result] = ofType(n.handle(done), "result");
    const short = (800 * 2 + 200 * 0.1 + 100 * 10) / 1e6;
    const long = (200000 * 4 + 100000 * 0.2 + 100 * 15) / 1e6;
    expect(result?.turnCostUsd).toBeCloseTo(short + long, 9);
    expect(result?.totalCostUsd).toBeUndefined();
  });

  it("gives a turn on a model without a known price no cost, never $0", () => {
    const n = new CodexNormalizer();
    n.model = "gpt-reserve";
    n.handle(tokens({ inputTokens: 1000, outputTokens: 100 }, { inputTokens: 1000 }));
    const [result] = ofType(n.handle(done), "result");
    expect(result?.turnCostUsd).toBeNull();
    expect(result?.usage).toMatchObject({ inputTokens: 1000, outputTokens: 100 });
  });

  it("streams a reasoning summary into a thinking block", () => {
    const n = new CodexNormalizer();
    expect(n.handle(item("item/started", { type: "reasoning", id: "r", summary: [], content: [] }))).toEqual(
      [],
    );
    expect(
      n.handle({ method: "item/reasoning/summaryTextDelta", params: { itemId: "r", delta: "Plan" } }),
    ).toEqual([
      { type: "block_start", id: "r", block: "thinking" },
      { type: "block_delta", id: "r", text: "Plan" },
    ]);
    expect(n.handle({ method: "item/reasoning/summaryPartAdded", params: { itemId: "r" } })).toEqual([
      { type: "block_delta", id: "r", text: "\n\n" },
    ]);
    expect(
      n.handle(
        item("item/completed", { type: "reasoning", id: "r", summary: ["Plan", "Then act"], content: [] }),
      ),
    ).toEqual([{ type: "block_end", id: "r", block: "thinking", text: "Plan\n\nThen act" }]);
  });

  it("writes a new file on the Write card with its content as an added hunk", () => {
    const n = new CodexNormalizer();
    const change = { path: "/shop/a.txt", kind: { type: "add" }, diff: "one\ntwo\n" };
    expect(
      n.handle(
        item("item/started", { type: "fileChange", id: "f", changes: [change], status: "inProgress" }),
      ),
    ).toEqual([
      {
        type: "tool_use",
        id: "f",
        name: "Write",
        input: { file_path: "/shop/a.txt", content: "one\ntwo\n" },
      },
    ]);
    expect(
      n.handle(
        item("item/completed", { type: "fileChange", id: "f", changes: [change], status: "completed" }),
      ),
    ).toEqual([
      {
        type: "tool_result",
        toolUseId: "f",
        output: "",
        isError: false,
        diff: "@@ -0,0 +1,2 @@\n+one\n+two",
      },
    ]);
  });

  it("gives each file of a multi-file change its own card", () => {
    const n = new CodexNormalizer();
    const changes = [
      { path: "/shop/a.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-a\n+b\n" },
      { path: "/shop/b.ts", kind: { type: "delete" }, diff: "" },
    ];
    const started = n.handle(
      item("item/started", { type: "fileChange", id: "f", changes, status: "inProgress" }),
    );
    expect(started.map((e) => (e.type === "tool_use" ? [e.id, e.name, e.input] : e.type))).toEqual([
      ["f:0", "Edit", { file_path: "/shop/a.ts" }],
      ["f:1", "Edit", { file_path: "/shop/b.ts", delete: true }],
    ]);
    expect(n.permissionRequest("item/fileChange/requestApproval", { itemId: "f" })).toMatchObject({
      toolName: "Edit",
      input: { file_path: "/shop/a.ts", files: ["/shop/a.ts", "/shop/b.ts"] },
      title: "Codex wants to change a.ts, b.ts",
    });
    const done = n.handle(
      item("item/completed", { type: "fileChange", id: "f", changes, status: "declined" }),
    );
    expect(done).toEqual([
      { type: "tool_result", toolUseId: "f:0", output: "You declined this change.", isError: true },
      { type: "tool_result", toolUseId: "f:1", output: "You declined this change.", isError: true },
    ]);
  });

  it("keeps cards and results paired when the completion lists a different number of changes", () => {
    const a = {
      path: "/shop/a.ts",
      kind: { type: "update", move_path: null },
      diff: "@@ -1 +1 @@\n-a\n+b\n",
    };
    const b = {
      path: "/shop/b.ts",
      kind: { type: "update", move_path: null },
      diff: "@@ -1 +1 @@\n-c\n+d\n",
    };
    const ids = (events: ReturnType<CodexNormalizer["handle"]>) =>
      events.map((e) =>
        e.type === "tool_use" ? `use ${e.id}` : e.type === "tool_result" ? `result ${e.toolUseId}` : e.type,
      );

    // One announced, two completed: the announced card is closed, both files get a card and a result.
    const grow = new CodexNormalizer();
    grow.handle(item("item/started", { type: "fileChange", id: "f", changes: [a], status: "inProgress" }));
    expect(
      ids(
        grow.handle(
          item("item/completed", { type: "fileChange", id: "f", changes: [a, b], status: "completed" }),
        ),
      ),
    ).toEqual(["use f:0", "result f:0", "use f:1", "result f:1", "result f"]);

    // Two announced, one completed: no duplicate card, and the second announced card gets a result.
    const shrink = new CodexNormalizer();
    shrink.handle(
      item("item/started", { type: "fileChange", id: "f", changes: [a, b], status: "inProgress" }),
    );
    expect(
      ids(
        shrink.handle(
          item("item/completed", { type: "fileChange", id: "f", changes: [a], status: "completed" }),
        ),
      ),
    ).toEqual(["use f", "result f", "result f:0", "result f:1"]);

    // Same count: results only.
    const same = new CodexNormalizer();
    same.handle(item("item/started", { type: "fileChange", id: "f", changes: [a, b], status: "inProgress" }));
    expect(
      ids(
        same.handle(
          item("item/completed", { type: "fileChange", id: "f", changes: [a, b], status: "completed" }),
        ),
      ),
    ).toEqual(["result f:0", "result f:1"]);
  });

  it("forgets running tools when a turn ends", () => {
    const n = new CodexNormalizer();
    n.handle({ method: "turn/started", params: { turn: { id: "t" } } });
    n.handle(
      item("item/started", { type: "mcpToolCall", id: "m", server: "jig", tool: "run", arguments: {} }),
    );
    expect(n.mcpCallId("jig", "run")).toBe("m");
    n.handle({ method: "turn/completed", params: { turn: { id: "t", status: "interrupted" } } });
    expect(n.mcpCallId("jig", "run")).toBeUndefined();
  });

  it("shows a dynamic tool's text and images, not their JSON", () => {
    const n = new CodexNormalizer();
    n.handle(
      item("item/started", { type: "dynamicToolCall", id: "d", namespace: "x", tool: "shot", arguments: {} }),
    );
    const [result] = n.handle(
      item("item/completed", {
        type: "dynamicToolCall",
        id: "d",
        success: true,
        contentItems: [
          { type: "inputText", text: "Done" },
          { type: "inputImage", imageUrl: "data:image/jpeg;base64,BBBB" },
          { type: "inputImage", imageUrl: "https://example.com/a.png" },
          { type: "inputAudio", audioUrl: "data:audio/wav;base64,CCCC" },
        ],
      }),
    );
    expect(result).toEqual({
      type: "tool_result",
      toolUseId: "d",
      output: "Done\n[image]\n[image: https://example.com/a.png]\n[audio]",
      isError: false,
      imageData: [{ mime: "image/jpeg", data: "BBBB" }],
    });
  });

  it("adds a failed command's exit code to its output", () => {
    const n = new CodexNormalizer();
    n.handle(item("item/started", { type: "commandExecution", id: "c", command: "bash -lc 'npm test'" }));
    expect(
      n.handle(
        item("item/completed", {
          type: "commandExecution",
          id: "c",
          status: "failed",
          aggregatedOutput: "1 failing\n",
          exitCode: 1,
        }),
      ),
    ).toEqual([{ type: "tool_result", toolUseId: "c", output: "1 failing\nExit code 1", isError: true }]);
  });

  it("returns an MCP tool's images with its text", () => {
    const n = new CodexNormalizer();
    n.handle(
      item("item/started", { type: "mcpToolCall", id: "m", server: "jig", tool: "shot", arguments: {} }),
    );
    const [result] = n.handle(
      item("item/completed", {
        type: "mcpToolCall",
        id: "m",
        result: {
          content: [
            { type: "text", text: "Done" },
            { type: "image", data: "AAAA", mimeType: "image/png" },
          ],
        },
      }),
    );
    expect(result).toEqual({
      type: "tool_result",
      toolUseId: "m",
      output: "Done\n[image]",
      isError: false,
      imageData: [{ mime: "image/png", data: "AAAA" }],
    });
  });

  it("turns login failures into the sign-in error and retries into a passing notice", () => {
    const n = new CodexNormalizer();
    expect(
      n.handle({
        method: "error",
        params: { willRetry: false, error: { message: "401", codexErrorInfo: "unauthorized" } },
      }),
    ).toEqual([expect.objectContaining({ type: "error", code: "not_signed_in" })]);
    expect(n.handle({ method: "account/updated", params: { authMode: null, planType: null } })).toEqual([
      expect.objectContaining({ type: "error", code: "not_signed_in" }),
    ]);
    expect(
      n.handle({ method: "error", params: { willRetry: true, error: { message: "stream disconnected" } } }),
    ).toEqual([
      { type: "notice", tone: "warning", key: "codex-retry", text: "Codex is retrying: stream disconnected" },
    ]);
    expect(n.handle({ method: "error", params: { willRetry: false, error: { message: "Boom" } } })).toEqual([
      { type: "notice", tone: "danger", text: "Boom" },
    ]);
  });

  it("reports a failed turn with Codex's message", () => {
    const n = new CodexNormalizer();
    const [result] = n.handle({
      method: "turn/completed",
      params: {
        turn: { id: "t", status: "failed", error: { message: "Context window exceeded" }, durationMs: 5 },
      },
    });
    expect(result).toMatchObject({
      type: "result",
      ok: false,
      durationMs: 5,
      error: "Context window exceeded",
    });
  });

  it("tracks MCP servers and warns once when one fails", () => {
    const n = new CodexNormalizer();
    n.handle({ method: "mcpServer/startupStatus/updated", params: { name: "docs", status: "starting" } });
    const failed = {
      method: "mcpServer/startupStatus/updated",
      params: { name: "docs", status: "failed", error: "ENOENT" },
    };
    expect(n.handle(failed)).toEqual([
      {
        type: "notice",
        tone: "warning",
        key: "mcp-docs",
        text: "The MCP server “docs” failed to start: ENOENT.",
      },
    ]);
    expect(n.handle(failed)).toEqual([]);
    expect([...n.mcpServers.values()]).toEqual([{ name: "docs", status: "failed", error: "ENOENT" }]);
  });

  it("measures the context from the last request and the model's window", () => {
    const n = new CodexNormalizer();
    expect(n.context()).toBeUndefined();
    n.handle({
      method: "thread/tokenUsage/updated",
      params: {
        tokenUsage: { total: { totalTokens: 9 }, last: { totalTokens: 50_000 }, modelContextWindow: 200_000 },
      },
    });
    expect(n.context()).toEqual({ usedTokens: 50_000, maxTokens: 200_000 });
  });

  it("ignores what it doesn't know, never throwing", () => {
    const n = new CodexNormalizer();
    for (const message of [
      null,
      undefined,
      {},
      { method: "thread/realtime/started", params: {} },
      { method: "item/started", params: {} },
      { method: "item/completed", params: { item: { type: "somethingNew", id: "x" } } },
      { method: "item/agentMessage/delta", params: { itemId: 1, delta: null } },
      { method: "turn/diff/updated", params: { diff: "…" } },
    ])
      expect(n.handle(message)).toEqual([]);
    expect(n.permissionRequest("item/tool/requestUserInput", {})).toBeUndefined();
  });
});

describe("displayCommand", () => {
  it("unwraps the shell Codex runs a command in", () => {
    expect(
      displayCommand(
        `"C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command 'node --version'`,
      ),
    ).toBe("node --version");
    expect(displayCommand(`powershell.exe -Command "Set-Content -Path 'a.txt' -Value 'x'"`)).toBe(
      "Set-Content -Path 'a.txt' -Value 'x'",
    );
    expect(displayCommand(`pwsh -NoProfile -Command 'Write-Output ''hi'''`)).toBe("Write-Output 'hi'");
    expect(displayCommand(`/bin/bash -lc 'echo '\\''hi'\\'''`)).toBe("echo 'hi'");
    expect(displayCommand('bash -c "npm test"')).toBe("npm test");
    expect(displayCommand("git status")).toBe("git status");
  });

  it("unwraps shells by path with spaces, with options before the script", () => {
    expect(
      displayCommand(
        `"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command 'Get-ChildItem'`,
      ),
    ).toBe("Get-ChildItem");
    expect(
      displayCommand(
        `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NonInteractive -c 'dir'`,
      ),
    ).toBe("dir");
    expect(displayCommand(`C:\\Git\\bin\\bash.exe -lc 'ls -la'`)).toBe("ls -la");
    expect(displayCommand(`"C:\\Program Files\\Git\\bin\\bash.exe" -lc 'ls'`)).toBe("ls");
    expect(displayCommand(`bash -l -c 'npm test'`)).toBe("npm test");
    expect(displayCommand(`/bin/zsh --login -c 'make'`)).toBe("make");
    expect(displayCommand(`bash -c "echo \\"hi\\" \\$HOME"`)).toBe(`echo "hi" $HOME`);
  });

  it("leaves a script of several quoted strings as it is", () => {
    expect(displayCommand(`powershell.exe -Command 'a' ; 'b'`)).toBe("'a' ; 'b'");
    expect(displayCommand(`bash -lc 'a' && 'b'`)).toBe("'a' && 'b'");
    expect(displayCommand(`pwsh -Command "a" + "b"`)).toBe(`"a" + "b"`);
  });
});

describe("changeDiff", () => {
  it("keeps hunks and turns a new file's content into one", () => {
    expect(changeDiff("update", "@@ -1 +1 @@\n-a\n+b\n")).toBe("@@ -1 +1 @@\n-a\n+b\n");
    expect(changeDiff("add", "x\n")).toBe("@@ -0,0 +1,1 @@\n+x");
    expect(changeDiff("add", "")).toBe("");
  });

  it("turns a deleted file's content into one removed hunk", () => {
    expect(changeDiff("delete", "a\r\nb\r\n")).toBe("@@ -1,2 +0,0 @@\n-a\n-b");
    expect(changeDiff("delete", "@@ -1 +0,0 @@\n-a\n")).toBe("@@ -1 +0,0 @@\n-a\n");
    expect(changeDiff("delete", "")).toBe("");
  });
});

describe("Codex asking before an MCP tool (D-313)", () => {
  // Recorded from Codex 0.166.0 asking before a Jig tool without readOnly.
  const params = {
    threadId: "t",
    turnId: "u",
    serverName: "jig",
    mode: "form",
    _meta: {
      codex_approval_kind: "mcp_tool_call",
      persist: ["session", "always"],
      tool_description: "Writes",
      tool_params: { text: "hi" },
      tool_params_display: [],
    },
    message: 'Allow the jig MCP server to run tool "jig_write"?',
    requestedSchema: { type: "object", properties: {} },
  };

  it("names the server, the tool and its input", () => {
    expect(mcpToolApproval(params)).toEqual({
      server: "jig",
      tool: "jig_write",
      input: { text: "hi" },
      message: 'Allow the jig MCP server to run tool "jig_write"?',
      canPersist: true,
    });
  });

  it("ignores other elicitations", () => {
    expect(mcpToolApproval({ ...params, _meta: { codex_approval_kind: "other" } })).toBeUndefined();
    expect(mcpToolApproval({ serverName: "jig", message: "Pick one" })).toBeUndefined();
  });
});

describe("ChatGPT's limit (D-338)", () => {
  it("is a typed limit, resetting when the full window resets", () => {
    const n = new CodexNormalizer();
    expect(
      n.handle({
        method: "account/rateLimits/updated",
        params: {
          rateLimits: {
            primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 1793178000 },
            secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1793600000 },
          },
        },
      }),
    ).toEqual([]);
    expect(
      n.handle({
        method: "error",
        params: { error: { message: "You've hit your usage limit.", codexErrorInfo: "usageLimitExceeded" } },
      }),
    ).toEqual([
      {
        type: "error",
        code: "rate_limit",
        message: "ChatGPT's limit is reached: You've hit your usage limit.",
        window: "primary",
        resetsAt: new Date(1793178000 * 1000).toISOString(),
      },
    ]);
  });
  it("picks the fullest window when none is full, and nothing without resets", () => {
    expect(
      limitReset({
        primary: { usedPercent: 60, resetsAt: 100 },
        secondary: { usedPercent: 90, resetsAt: 200 },
      }),
    ).toEqual({ window: "secondary", resetsAt: new Date(200_000).toISOString() });
    expect(limitReset(undefined)).toBeUndefined();
    expect(limitReset({ primary: { usedPercent: 100, resetsAt: null } })).toBeUndefined();
  });
});
