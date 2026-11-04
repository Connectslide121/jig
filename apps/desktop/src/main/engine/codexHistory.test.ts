import { describe, expect, it } from "vitest";
import type { EngineEvent } from "../../shared/engine";
import { savedThread, structuredPatch, threadMessages } from "./codexHistory";
import { CodexNormalizer } from "./codexNormalize";
import { PLAN_APPROVED_PROMPT, PLAN_MODE_PROMPT } from "./codexTools";
import { Normalizer } from "./normalize";

describe("Codex history (D-315)", () => {
  it("lists a thread like a saved Claude Code chat", () => {
    expect(
      savedThread({
        id: "t1",
        name: null,
        preview: "Tidy the README\nand more",
        cwd: "/work/shop",
        gitInfo: { branch: "main" },
        createdAt: 100,
        updatedAt: 200,
      }),
    ).toEqual({
      sessionId: "t1",
      provider: "codex",
      title: "Tidy the README",
      cwd: "/work/shop",
      gitBranch: "main",
      lastModified: 200_000,
      createdAt: 100_000,
    });
    expect(savedThread({ preview: "no id" })).toBeUndefined();
  });

  it("turns a unified diff into Claude Code's structured patch", () => {
    expect(structuredPatch("@@ -1,2 +1,2 @@\n-a\n+b\n c")).toEqual([
      { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: ["-a", "+b", " c"] },
    ]);
    expect(structuredPatch("@@ -3 +3 @@\n-x\n+y")[0]).toMatchObject({ oldLines: 1, newLines: 1 });
  });

  it("reads a thread's items as transcript messages, without what Jig added", () => {
    const messages = threadMessages({
      turns: [
        {
          items: [
            {
              type: "userMessage",
              id: "u1",
              content: [
                { type: "text", text: PLAN_MODE_PROMPT },
                { type: "text", text: "<jig-context>\nx\n</jig-context>\n\nTidy it" },
              ],
            },
            {
              type: "commandExecution",
              id: "c1",
              command: "bash -lc 'ls'",
              aggregatedOutput: "a",
              exitCode: 2,
            },
            {
              type: "fileChange",
              id: "f1",
              status: "completed",
              changes: [{ path: "/w/a.md", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-a\n+b" }],
            },
            { type: "mcpToolCall", id: "m1", server: "jig", tool: "exit_plan", arguments: { plan: "p" } },
            { type: "agentMessage", id: "a1", text: "Done." },
          ],
        },
        {
          items: [{ type: "userMessage", id: "u2", content: [{ type: "text", text: PLAN_APPROVED_PROMPT }] }],
        },
      ],
    });
    expect(messages[0]).toMatchObject({
      type: "user",
      message: { content: [{ type: "text", text: "Tidy it" }] },
    });
    expect(messages[1]).toMatchObject({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] },
    });
    expect(messages[2]).toMatchObject({
      message: { content: [{ type: "tool_result", content: "a\nExit code 2", is_error: true }] },
    });
    expect(messages[3]).toMatchObject({
      message: { content: [{ name: "Edit", input: { file_path: "/w/a.md" } }] },
    });
    expect(messages[4]?.tool_use_result).toMatchObject({ structuredPatch: [{ lines: ["-a", "+b"] }] });
    expect(messages[5]).toMatchObject({ message: { content: [{ name: "ExitPlanMode" }] } });
    expect(messages.at(-1)).toMatchObject({ type: "assistant", message: { content: [{ text: "Done." }] } });
    // The turn Jig started itself has nothing you typed.
    expect(messages.filter((m) => m.type === "user" && m.uuid === "u2")).toHaveLength(0);
  });

  it("replays tool items on the same cards as the live chat showed", () => {
    const hunk = "@@ -1 +1 @@\n-a\n+b\n";
    const update = (path: string) => ({ path, kind: { type: "update", move_path: null }, diff: hunk });
    const items = [
      { type: "commandExecution", id: "c1", command: "bash -lc 'rm -rf build'", status: "declined" },
      { type: "commandExecution", id: "c2", command: "npm test", status: "failed", aggregatedOutput: "boom" },
      {
        type: "commandExecution",
        id: "c3",
        command: "ls",
        status: "completed",
        exitCode: 2,
        aggregatedOutput: "x",
      },
      { type: "mcpToolCall", id: "m1", server: "jig", tool: "run", arguments: { a: 1 }, success: false },
      {
        type: "mcpToolCall",
        id: "m2",
        server: "jig",
        tool: "shot",
        arguments: {},
        result: {
          content: [
            { type: "text", text: "Done" },
            { type: "image", data: "AAAA", mimeType: "image/png" },
          ],
        },
      },
      {
        type: "dynamicToolCall",
        id: "d1",
        namespace: "x",
        tool: "draw",
        arguments: {},
        success: true,
        contentItems: [
          { type: "inputText", text: "Here" },
          { type: "inputImage", imageUrl: "data:image/jpeg;base64,BBBB" },
        ],
      },
      { type: "imageView", id: "i1", path: "/shop/logo.png" },
      { type: "webSearch", id: "w1", query: "codex" },
      {
        type: "fileChange",
        id: "f1",
        status: "completed",
        changes: [
          { path: "/shop/new.ts", kind: { type: "add" }, diff: "export {};\n" },
          { path: "/shop/old.ts", kind: { type: "delete" }, diff: "gone\n" },
          { path: "/shop/a.ts", kind: { type: "update", move_path: "/shop/b.ts" }, diff: hunk },
        ],
      },
      { type: "fileChange", id: "f2", status: "declined", changes: [update("/shop/c.ts")] },
    ];

    const cards = (events: EngineEvent[]): Record<string, unknown>[] =>
      events.flatMap((e): Record<string, unknown>[] =>
        e.type === "tool_use"
          ? [{ use: e.id, name: e.name, input: e.input }]
          : e.type === "tool_result"
            ? [
                {
                  result: e.toolUseId,
                  output: e.output,
                  isError: e.isError,
                  images: e.imageData ?? [],
                  diff: e.diff ? structuredPatch(e.diff) : [],
                },
              ]
            : [],
      );

    const live = new CodexNormalizer();
    const liveEvents = items.flatMap((item) => [
      ...live.handle({ method: "item/started", params: { item } }),
      ...live.handle({ method: "item/completed", params: { item } }),
    ]);
    const saved = new Normalizer();
    const savedEvents = threadMessages({ turns: [{ items }] }).flatMap((m) => saved.handle(m));

    expect(cards(savedEvents)).toEqual(cards(liveEvents));
    // What used to be lost: statuses, dropped items, Write's content, Edit's delete and move.
    expect(cards(savedEvents)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ result: "c1", isError: true }),
        expect.objectContaining({ result: "c2", isError: true }),
        expect.objectContaining({ result: "m1", isError: true }),
        expect.objectContaining({
          result: "d1",
          output: "Here\n[image]",
          images: [{ mime: "image/jpeg", data: "BBBB" }],
        }),
        expect.objectContaining({ result: "m2", images: [{ mime: "image/png", data: "AAAA" }] }),
        expect.objectContaining({ use: "i1", name: "Read" }),
        expect.objectContaining({
          use: "f1:0",
          name: "Write",
          input: { file_path: "/shop/new.ts", content: "export {};\n" },
        }),
        expect.objectContaining({ use: "f1:1", input: { file_path: "/shop/old.ts", delete: true } }),
        expect.objectContaining({ use: "f1:2", input: { file_path: "/shop/a.ts", new_path: "/shop/b.ts" } }),
      ]),
    );
  });
});
