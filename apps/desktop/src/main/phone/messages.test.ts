import { describe, expect, it } from "vitest";
import type { ChatItem, SessionMeta } from "../../shared/engine";
import {
  answeredLine,
  chatPicker,
  codeIn,
  escapeHtml,
  excerpt,
  lastReply,
  optionDecision,
  type PermissionItem,
  parseTap,
  permissionMessage,
  replyDecision,
  singleQuestion,
  statusMessage,
  tapDecision,
} from "./messages";

const meta = (over: Partial<SessionMeta> = {}) =>
  ({ id: "s1", title: "Shop <api>", status: "idle", updatedAt: "2025-01-01", ...over }) as SessionMeta;

const permission = (
  toolName: string,
  input: Record<string, unknown> = {},
  over: Partial<PermissionItem> = {},
) =>
  ({
    kind: "permission",
    id: "p1",
    request: { requestId: "r1", toolName, input, canAlwaysAllow: false },
    status: "pending",
    ...over,
  }) as PermissionItem;

const question = (multiSelect = false) =>
  permission("AskUserQuestion", {
    questions: [
      { question: "Which db?", multiSelect, options: [{ label: "Postgres" }, { label: "SQLite" }] },
    ],
  });

describe("text", () => {
  it("escapes HTML", () => expect(escapeHtml("<a & b>")).toBe("&lt;a &amp; b&gt;"));

  it("keeps the end of long text, masks secrets and escapes", () => {
    expect(excerpt("abcdefghij", 5)).toBe("…ghij");
    expect(excerpt("a <b>")).toBe("a &lt;b&gt;");
    expect(excerpt("key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789")).not.toContain(
      "abcdefghijklmnop",
    );
  });

  it("finds Claude's last reply since your last message", () => {
    const items = [
      { kind: "user", id: "u", text: "hi" },
      { kind: "assistant", id: "a1", text: "First" },
      { kind: "assistant", id: "a2", text: "Sub", parentId: "t" },
      { kind: "assistant", id: "a3", text: "Last" },
    ] as unknown as ChatItem[];
    expect(lastReply(items)).toBe("Last");
    expect(lastReply([...items, { kind: "user", id: "u2", text: "more" } as ChatItem])).toBeUndefined();
  });

  it("reads a pairing code with spaces", () => expect(codeIn("123 456")).toBe("123456"));
});

describe("statusMessage", () => {
  it("tells a finished turn with its reply", () => {
    const m = statusMessage("working", meta(), "Done <ok>", true);
    expect(m?.text).toContain("Finished");
    expect(m?.text).toContain("Shop &lt;api&gt;");
    expect(m?.text).toContain("Done &lt;ok&gt;");
  });

  it("shows Claude's Markdown formatted, not raw", () => {
    const m = statusMessage("working", meta(), "**Fixed** the `cart` total:\n- tests pass", true);
    expect(m?.text).toContain("<b>Fixed</b> the <code>cart</code> total:\n• tests pass");
  });

  it("tells an error, even with finished messages off", () => {
    expect(
      statusMessage("working", meta({ status: "error", lastError: "Boom\nstack" }), undefined, false)?.text,
    ).toContain("Boom");
  });

  it("stays quiet otherwise", () => {
    expect(statusMessage("working", meta(), "x", false)).toBeUndefined();
    expect(statusMessage(undefined, meta(), "x", true)).toBeUndefined();
    expect(statusMessage("idle", meta({ status: "working" }), "x", true)).toBeUndefined();
    expect(statusMessage("working", meta({ kind: "builder" }), "x", true)).toBeUndefined();
  });
});

describe("permissionMessage", () => {
  it("puts a one-choice question's options on buttons", () => {
    const m = permissionMessage(meta(), question(), "k");
    expect(m.text).toContain("Which db?");
    expect(m.buttons).toEqual([[{ text: "Postgres", data: "q:k:0" }], [{ text: "SQLite", data: "q:k:1" }]]);
  });

  it("lists several questions with a Skip button", () => {
    const m = permissionMessage(meta(), question(true), "k");
    expect(m.text).toContain("Postgres · SQLite");
    expect(m.buttons).toEqual([[{ text: "Skip", data: "p:k:d" }]]);
  });

  it("shows a plan with Approve and Keep planning", () => {
    const m = permissionMessage(meta(), permission("ExitPlanMode", { plan: "1. Build" }), "k");
    expect(m.text).toContain("1. Build");
    expect(m.buttons?.[0]?.map((b) => b.data)).toEqual(["p:k:a", "p:k:d"]);
  });

  it("shows a permission with its command", () => {
    const m = permissionMessage(meta(), permission("Bash", { command: "rm -rf dist" }), "k");
    expect(m.text).toContain("<pre>rm -rf dist</pre>");
    expect(m.buttons?.[0]?.map((b) => b.text)).toEqual(["Allow", "Deny"]);
  });
});

describe("reading the phone", () => {
  it("parses taps", () => {
    expect(parseTap("p:a1:a")).toEqual({ kind: "permission", key: "a1", allow: true });
    expect(parseTap("q:a1:2")).toEqual({ kind: "option", key: "a1", index: 2 });
    expect(parseTap("c:abc-1")).toEqual({ kind: "chat", sessionId: "abc-1" });
    expect(parseTap("x:1")).toBeUndefined();
  });

  it("turns taps into decisions", () => {
    expect(tapDecision(permission("Bash").request, true)).toEqual({ behavior: "allow" });
    expect(tapDecision(permission("ExitPlanMode").request, false)).toMatchObject({ behavior: "deny" });
    expect(optionDecision(question().request, 1)).toMatchObject({
      behavior: "allow",
      updatedInput: { answers: { "Which db?": "SQLite" } },
    });
    expect(optionDecision(question().request, 5)).toBeUndefined();
    expect(singleQuestion(question(true).request)).toBeUndefined();
  });

  it("turns a reply into an answer or a refusal with your words", () => {
    expect(replyDecision(question().request, "MySQL")).toMatchObject({
      updatedInput: { answers: { "Which db?": "MySQL" } },
    });
    expect(replyDecision(permission("Bash").request, "use npm")).toMatchObject({
      behavior: "deny",
      message: expect.stringContaining("use npm"),
    });
  });

  it("says how a request was answered", () => {
    expect(answeredLine(permission("Bash", {}, { status: "allowed" }), "phone")).toContain("Allowed");
    expect(answeredLine(permission("ExitPlanMode", {}, { status: "denied" }), "computer")).toContain(
      "Kept planning</b> on the computer",
    );
    expect(answeredLine(permission("Bash", {}, { status: "cancelled", timedOut: true }), "phone")).toContain(
      "nobody answered",
    );
  });
});

describe("chatPicker", () => {
  it("lists chats needing you first, without drafts or builders", () => {
    const m = chatPicker(
      [
        meta({ id: "a", title: "Old", updatedAt: "2025-01-01" }),
        meta({ id: "b", title: "Asks", status: "needs_you" }),
        meta({ id: "c", title: "Draft", draft: true }),
        meta({ id: "d", title: "Builder", kind: "builder" }),
      ],
      "a",
    );
    expect(m.buttons?.map((r) => r[0]?.data)).toEqual(["c:b", "c:a"]);
    expect(m.buttons?.[1]?.[0]?.text).toBe("• Old");
  });

  it("says when there are none", () => expect(chatPicker([], undefined).buttons).toEqual([]));

  it("offers Jig itself first when it can answer", () =>
    expect(chatPicker([], "s1", 8, true).buttons).toEqual([[{ text: "🤖 Jig itself", data: "c:jig" }]]));
});
