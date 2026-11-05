import { describe, expect, it } from "vitest";
import type { ChatItem } from "../../shared/engine";
import { chunkMarkdown, historyItems, stepLine, stepsMessage, toTelegramHtml } from "./mirror";

describe("toTelegramHtml", () => {
  it("turns Markdown into Telegram's HTML, escaped", () => {
    expect(
      toTelegramHtml("## Plan\n**Fix** the `a<b>` check, see [docs](https://x.dev/a).\n- one\n- two"),
    ).toBe(
      '<b>Plan</b>\n<b>Fix</b> the <code>a&lt;b&gt;</code> check, see <a href="https://x.dev/a">docs</a>.\n• one\n• two',
    );
  });

  it("keeps code blocks as they are", () => {
    expect(toTelegramHtml("Run:\n```bash\nnpm test && echo **ok**\n```\nDone")).toBe(
      "Run:\n<pre>npm test &amp;&amp; echo **ok**</pre>\nDone",
    );
  });
});

describe("chunkMarkdown", () => {
  it("leaves a short reply whole", () =>
    expect(chunkMarkdown("Hello\n\nWorld", 100)).toEqual(["Hello\n\nWorld"]));

  it("cuts at paragraphs", () => {
    const text = `${"a".repeat(60)}\n\n${"b".repeat(60)}`;
    expect(chunkMarkdown(text, 80)).toEqual(["a".repeat(60), "b".repeat(60)]);
  });

  it("cuts a long code block into blocks of its own", () => {
    const code = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const chunks = chunkMarkdown(`\`\`\`ts\n${code}\n\`\`\``, 80);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.startsWith("```ts\n")).toBe(true);
      expect(c.endsWith("```")).toBe(true);
    }
  });
});

describe("steps", () => {
  const tool = (name: string, input: Record<string, unknown>, status = "done") =>
    ({ kind: "tool", id: "t", name, input, status, at: "" }) as Extract<ChatItem, { kind: "tool" }>;

  it("names a step and what it works on", () => {
    expect(stepLine(tool("Read", { file_path: "C:\\repo\\src\\app.ts" }))).toBe("✓ Read <code>app.ts</code>");
    expect(stepLine(tool("Bash", { command: "npm test" }, "running"))).toBe("⏳ Bash <code>npm test</code>");
    expect(stepLine(tool("mcp__jig__jig_browser_open", { url: "http://localhost:5173/" }))).toBe(
      "✓ jig_browser_open <code>localhost:5173/</code>",
    );
  });

  it("shows the last steps and counts the rest", () => {
    const lines = Array.from({ length: 8 }, (_, i) => `✓ Step ${i}`);
    expect(stepsMessage(lines, true, 3)).toBe("🔧 8 steps\n<i>…5 earlier</i>\n✓ Step 5\n✓ Step 6\n✓ Step 7");
  });
});

describe("historyItems", () => {
  it("keeps the last turns' messages and replies, oldest first", () => {
    const items = [
      { kind: "user", id: "u1", text: "one" },
      { kind: "assistant", id: "a1", text: "first" },
      { kind: "user", id: "u2", text: "two" },
      { kind: "tool", id: "t", name: "Bash", input: {}, status: "done" },
      { kind: "assistant", id: "a2", text: "second" },
    ] as ChatItem[];
    expect(historyItems(items, 1).map((i) => i.id)).toEqual(["u2", "a2"]);
    expect(historyItems(items, 5).map((i) => i.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });
});
