import { describe, expect, it } from "vitest";
import {
  historyStep,
  inputMode,
  mentionsIn,
  nextPermissionMode,
  removeMention,
  replaceToken,
  tokenAt,
} from "./composerInput";

describe("tokenAt", () => {
  it("finds a command at the start and a file mention anywhere", () => {
    expect(tokenAt("/comp", 5)).toEqual({ kind: "command", query: "comp", start: 0, end: 5 });
    expect(tokenAt("/compact now", 12)).toBeUndefined();
    expect(tokenAt("look at @src/ca please", 15)).toEqual({
      kind: "file",
      query: "src/ca",
      start: 8,
      end: 15,
    });
    expect(tokenAt("look at @src/cart.ts", 11)).toEqual({ kind: "file", query: "sr", start: 8, end: 20 });
    expect(tokenAt("mail me@example.com", 19)).toBeUndefined();
    expect(tokenAt("plain text", 5)).toBeUndefined();
  });
});

describe("replaceToken", () => {
  it("replaces the word and adds a space, except after folders", () => {
    const t = tokenAt("see @ca and", 7)!;
    expect(replaceToken("see @ca and", t, "@src/cart.ts")).toEqual({
      text: "see @src/cart.ts and",
      caret: 17,
    });
    expect(replaceToken("@sr", tokenAt("@sr", 3)!, "@src/")).toEqual({ text: "@src/", caret: 5 });
    expect(replaceToken("/re", tokenAt("/re", 3)!, "/review")).toEqual({ text: "/review ", caret: 8 });
  });
});

describe("inputMode", () => {
  it("knows shell and memory input", () => {
    expect(inputMode("! git status")).toBe("shell");
    expect(inputMode("# always use pnpm")).toBe("memory");
    expect(inputMode("!")).toBeUndefined();
    expect(inputMode("hello # not memory")).toBeUndefined();
  });
});

describe("nextPermissionMode", () => {
  it("cycles ask → accept edits → plan → ask", () => {
    expect(nextPermissionMode("default")).toBe("acceptEdits");
    expect(nextPermissionMode("acceptEdits")).toBe("plan");
    expect(nextPermissionMode("plan")).toBe("default");
    expect(nextPermissionMode("bypassPermissions")).toBe("default");
  });
});

describe("historyStep", () => {
  it("walks back through sent messages and returns to the draft", () => {
    const history = ["first", "second"];
    expect(historyStep(history, -1, "up", "draft")).toEqual({ index: 0, text: "second" });
    expect(historyStep(history, 0, "up", "draft")).toEqual({ index: 1, text: "first" });
    expect(historyStep(history, 1, "up", "draft")).toBeUndefined();
    expect(historyStep(history, 0, "down", "draft")).toEqual({ index: -1, text: "draft" });
    expect(historyStep(history, -1, "down", "draft")).toBeUndefined();
  });
});

describe("mentionsIn", () => {
  it("finds files, folders and meetings, not e-mail addresses or trailing punctuation", () => {
    const text = "see @src/cart.ts, @docs/ and @meeting:weekly-sync-1a2b3c4d; mail me@example.com";
    expect(mentionsIn(text)).toEqual([
      { kind: "file", value: "src/cart.ts", start: 4, end: 16 },
      { kind: "folder", value: "docs/", start: 18, end: 24 },
      { kind: "meeting", value: "1a2b3c4d", start: 29, end: 58 },
    ]);
    expect(mentionsIn("@a.md")).toEqual([{ kind: "file", value: "a.md", start: 0, end: 5 }]);
    expect(mentionsIn("just @ and @meeting:nope")).toEqual([]);
  });
});

describe("removeMention", () => {
  it("removes the mention and one space after it", () => {
    const text = "look at @a.ts please";
    const [m] = mentionsIn(text);
    expect(removeMention(text, m!)).toEqual({ text: "look at please", caret: 8 });
  });
});
