import { describe, expect, it } from "vitest";
import { checkTokens } from "./tokenCheck";

describe("checkTokens", () => {
  it("accepts token utilities and CSS variables", () => {
    expect(checkTokens(`<div className="bg-surface text-muted border-border p-2 rounded-md" />`)).toEqual([]);
    expect(checkTokens(`color: var(--jig-text);`)).toEqual([]);
    expect(checkTokens(`<div className="w-[var(--jig-sidebar-width)]" />`)).toEqual([]);
  });

  it("flags hex colours but not anchors or entities", () => {
    expect(checkTokens(`const c = "#ff0000";`).map((v) => v.rule)).toEqual(["hex-colour"]);
    expect(checkTokens(`<a href="#section">x</a>`)).toEqual([]);
    expect(checkTokens(`&#123;`)).toEqual([]);
  });

  it("flags colour functions, palette colours and arbitrary values", () => {
    expect(checkTokens(`style={{ color: "rgb(1, 2, 3)" }}`).map((v) => v.rule)).toEqual([
      "css-colour-function",
    ]);
    expect(checkTokens(`className="text-red-500 bg-white/50"`).map((v) => v.rule)).toEqual([
      "palette-colour",
      "palette-colour",
    ]);
    expect(checkTokens(`className="w-[13px]"`).map((v) => v.rule)).toEqual(["arbitrary-value"]);
  });

  it("does not flag token names that contain palette words", () => {
    expect(checkTokens(`className="text-text bg-bg border-border-strong"`)).toEqual([]);
  });

  it("honours the ignore marker and reports positions", () => {
    expect(checkTokens(`const c = "#fff"; // jig-tokens-ignore-line`)).toEqual([]);
    const [v] = checkTokens(`ok\n  color: #abc;`);
    expect(v).toMatchObject({ line: 2, column: 10 });
  });
});
