import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  codexExecArgs,
  codexRateLimitRequests,
  codexSignInText,
  findCodex,
  parseCodexExec,
  parseCodexLoginStatus,
  parseCodexModels,
  parseCodexRateLimits,
  RATE_LIMITS_REQUEST_ID,
} from "./codex";

describe("parseCodexLoginStatus", () => {
  it("keeps only whether Codex is signed in and how", () => {
    expect(parseCodexLoginStatus("Logged in using ChatGPT\n")).toEqual({
      loggedIn: true,
      method: "your ChatGPT account",
    });
    const key = parseCodexLoginStatus("Logged in using an API key - sk-proj-***ABCD\n");
    expect(key).toEqual({ loggedIn: true, method: "an OpenAI API key" });
    expect(JSON.stringify(key)).not.toContain("sk-");
    expect(parseCodexLoginStatus("Not logged in\n")).toEqual({ loggedIn: false });
  });

  it("skips log lines before the answer and gives up on anything else", () => {
    expect(parseCodexLoginStatus("2026-11-03 WARN something\nLogged in using ChatGPT")?.loggedIn).toBe(true);
    expect(parseCodexLoginStatus("error: unexpected argument")).toBeUndefined();
    expect(parseCodexLoginStatus("")).toBeUndefined();
  });

  it("says it in plain words", () => {
    expect(codexSignInText({ loggedIn: true, method: "your ChatGPT account" })).toBe(
      "Signed in with your ChatGPT account.",
    );
    expect(codexSignInText({ loggedIn: false })).toContain("Not signed in");
    expect(codexSignInText(undefined)).toContain("Couldn't ask Codex");
  });
});

describe("parseCodexExec", () => {
  it("returns the last agent message", () => {
    const out = [
      '{"type":"thread.started","thread_id":"t1"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking"}}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"first"}}',
      '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"hello there"}}',
      '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}',
    ].join("\n");
    expect(parseCodexExec(out)).toBe("hello there");
  });

  it("ignores warning items and stray lines, and handles CRLF", () => {
    const out = [
      "Reading prompt from stdin...",
      '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata not found."}}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"ok"}}',
      "{not json",
    ].join("\r\n");
    expect(parseCodexExec(out)).toBe("ok");
  });

  it("throws the failure message", () => {
    const message = "The model is not supported when using Codex with a ChatGPT account.";
    const out = [
      '{"type":"thread.started","thread_id":"t1"}',
      JSON.stringify({ type: "error", message }),
      JSON.stringify({ type: "turn.failed", error: { message } }),
    ].join("\n");
    expect(() => parseCodexExec(out)).toThrow(message);
    expect(() => parseCodexExec('{"type":"error","message":"stream disconnected"}')).toThrow(
      "stream disconnected",
    );
  });

  it("keeps the answer of a completed turn after a passing error", () => {
    const out = [
      '{"type":"error","message":"Reconnecting... 2/5"}',
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"answer"}}',
      '{"type":"turn.completed"}',
    ].join("\n");
    expect(parseCodexExec(out)).toBe("answer");
    expect(parseCodexExec(out, 0)).toBe("answer");
  });

  it("throws when Codex exits badly before the turn completed, even after a message", () => {
    const out =
      '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Let me look"}}';
    expect(() => parseCodexExec(out, 1)).toThrow("exit code 1");
    expect(() => parseCodexExec(out, null)).toThrow("stopped before it answered");
    expect(parseCodexExec(out, 0)).toBe("Let me look");
    expect(parseCodexExec(`${out}\n{"type":"turn.completed"}`, 1)).toBe("Let me look");
  });

  it("throws when there is no answer", () => {
    expect(() => parseCodexExec('{"type":"turn.completed"}')).toThrow("without an answer");
    expect(() => parseCodexExec("")).toThrow("without an answer");
  });
});

describe("codexExecArgs", () => {
  const pair = (args: string[], flag: string) => args.slice(args.indexOf(flag), args.indexOf(flag) + 2);

  it("runs read-only with no approvals or tools, the chosen model, and the prompt on stdin", () => {
    const args = codexExecArgs("gpt-6.1-terra", "/home/me/.jig");
    expect(args[0]).toBe("exec");
    expect(args).toContain("--json");
    expect(pair(args, "--sandbox")).toEqual(["--sandbox", "read-only"]);
    expect(args).toContain('approval_policy="never"');
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--ignore-user-config");
    for (const tool of ["shell_tool", "unified_exec", "plugins", "apps", "multi_agent"])
      expect(args.join(" ")).toContain(`--disable ${tool}`);
    expect(pair(args, "--model")).toEqual(["--model", "gpt-6.1-terra"]);
    expect(pair(args, "--cd")).toEqual(["--cd", "/home/me/.jig"]);
    expect(args.at(-1)).toBe("-");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("leaves the model to Codex when none is chosen", () => {
    expect(codexExecArgs("", "/tmp")).not.toContain("--model");
  });
});

describe("parseCodexModels", () => {
  it("lists the visible models in Codex's order", () => {
    const json = JSON.stringify({
      models: [
        { slug: "gpt-b", display_name: "GPT B", description: "Second", visibility: "list", priority: 2 },
        { slug: "hidden", display_name: "Hidden", visibility: "hide", priority: 0 },
        { slug: "gpt-a", display_name: "GPT A", description: "First", visibility: "list", priority: 1 },
        { slug: "gpt-c", visibility: "list" },
      ],
    });
    expect(parseCodexModels(json)).toEqual([
      { value: "gpt-a", displayName: "GPT A", description: "First" },
      { value: "gpt-b", displayName: "GPT B", description: "Second" },
      { value: "gpt-c", displayName: "gpt-c", description: "" },
    ]);
  });

  it("returns nothing for output it doesn't understand", () => {
    expect(parseCodexModels("error: unknown command")).toEqual([]);
    expect(parseCodexModels('{"data":[]}')).toEqual([]);
  });
});

describe("findCodex", () => {
  const which = (found?: string) => (bin: string) => (bin === "codex" ? found : undefined);

  it("uses the native codex.exe behind npm's codex.cmd on Windows", () => {
    const npm = join("C:", "npm");
    const exe = join(
      npm,
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "bin",
      "codex.exe",
    );
    const shim = join(npm, "codex.cmd");
    expect(findCodex({ platform: "win32", arch: "x64", which: which(shim), exists: (p) => p === exe })).toBe(
      exe,
    );
  });

  it("falls back to what PATH has", () => {
    const shim = join("C:", "npm", "codex.cmd");
    expect(findCodex({ platform: "win32", arch: "x64", which: which(shim), exists: () => false })).toBe(shim);
    const exe = join("C:", "tools", "codex.exe");
    expect(findCodex({ platform: "win32", arch: "x64", which: which(exe), exists: () => true })).toBe(exe);
    const brew = "/opt/homebrew/bin/codex";
    expect(findCodex({ platform: "darwin", arch: "arm64", which: which(brew), exists: () => true })).toBe(
      brew,
    );
    expect(findCodex({ platform: "linux", arch: "x64", which: which(), exists: () => true })).toBeUndefined();
  });
});

describe("Codex rate limits (app-server)", () => {
  it("initializes, then reads the rate limits without reset-credit details", () => {
    const lines = codexRateLimitRequests("0.7.0")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "jig", version: "0.7.0" } },
    });
    expect(lines[1]).toEqual({ method: "initialized" });
    expect(lines[2]).toEqual({
      id: RATE_LIMITS_REQUEST_ID,
      method: "account/rateLimits/read",
      params: { excludeResetCreditDetails: true },
    });
  });

  it("keeps only the windows and the plan type from the answer", () => {
    const out = [
      '{"id":1,"result":{"userAgent":"jig/0.166.0","codexHome":"C:\\Users\\me\\.codex"}}',
      '{"method":"account/updated","params":{"authMode":"chatgpt","planType":"plus"}}',
      JSON.stringify({
        id: 2,
        result: {
          ordinaryUsageAllowed: true,
          rateLimits: {
            limitId: "codex",
            primary: { usedPercent: 13, windowDurationMins: 300, resetsAt: 1793756480 },
            secondary: { usedPercent: 92, windowDurationMins: 10080, resetsAt: 1794089243 },
            credits: { hasCredits: false, unlimited: false, balance: "0" },
            planType: "plus",
            rateLimitReachedType: null,
          },
          accountId: "00000000-0000-0000-0000-000000000000",
        },
      }),
    ].join("\n");
    const answer = parseCodexRateLimits(out);
    expect(answer).toEqual({
      limits: {
        primary: { usedPercent: 13, windowDurationMins: 300, resetsAt: 1793756480 },
        secondary: { usedPercent: 92, windowDurationMins: 10080, resetsAt: 1794089243 },
        planType: "plus",
        rateLimitReachedType: null,
      },
    });
    expect(JSON.stringify(answer)).not.toContain("0000-0000");
  });

  it("waits for the answer, says when Codex isn't signed in, and throws other errors", () => {
    expect(parseCodexRateLimits('{"id":1,"result":{}}\n{"id":2,"res')).toBeUndefined();
    expect(
      parseCodexRateLimits(
        '{"error":{"code":-32600,"message":"codex account authentication required to read rate limits"},"id":2}',
      ),
    ).toEqual({ signedOut: true });
    expect(() =>
      parseCodexRateLimits('{"error":{"code":-32603,"message":"backend unavailable"},"id":2}'),
    ).toThrow("backend unavailable");
  });
});
