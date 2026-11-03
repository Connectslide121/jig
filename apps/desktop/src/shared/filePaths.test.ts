import { describe, expect, it } from "vitest";
import { pathInCode, resolvePath } from "./filePaths";

describe("pathInCode", () => {
  it("finds absolute and relative paths, with a line", () => {
    expect(pathInCode("E:\\repos\\_reports\\jig-plan-23\\index.html")).toEqual({
      path: "E:\\repos\\_reports\\jig-plan-23\\index.html",
    });
    expect(pathInCode("C:\\Program Files\\Jig\\Jig.exe")).toEqual({
      path: "C:\\Program Files\\Jig\\Jig.exe",
    });
    expect(pathInCode("apps/desktop/src/main/index.ts:42")).toEqual({
      path: "apps/desktop/src/main/index.ts",
      line: 42,
    });
    expect(pathInCode("README.md")).toEqual({ path: "README.md" });
    expect(pathInCode("docs/plan/")).toEqual({ path: "docs/plan/" });
    expect(pathInCode("/etc/hosts")).toEqual({ path: "/etc/hosts" });
  });
  it("leaves code, commands and URLs alone", () => {
    for (const text of [
      "npm run verify",
      "main",
      "https://github.com/x/y",
      "a = b",
      "@jig/sdk",
      "0.3.0",
      "useState()",
      "jig_knowledge_read",
    ])
      expect(pathInCode(text), text).toBeUndefined();
  });
});

describe("resolvePath", () => {
  it("resolves relative paths from the chat's folder", () => {
    expect(resolvePath("E:\\repos\\jig", "docs/status.md")).toBe("E:\\repos\\jig\\docs\\status.md");
    expect(resolvePath("/home/x/shop", "./src/a.ts")).toBe("/home/x/shop/src/a.ts");
    expect(resolvePath("/home/x/shop", "/etc/hosts")).toBe("/etc/hosts");
    expect(resolvePath("E:\\repos", "~/notes.md", "C:\\Users\\me")).toBe("C:\\Users\\me\\notes.md");
  });
});
