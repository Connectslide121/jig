import { describe, expect, it } from "vitest";
import { fileUri, languageId, sameUri, serverFor, uriPath } from "./lsp";

describe("language servers", () => {
  it("picks the server and language id by extension", () => {
    expect(serverFor("src/cart.tsx")?.id).toBe("typescript");
    expect(serverFor("Program.cs")?.id).toBe("csharp");
    expect(serverFor("README.md")).toBeUndefined();
    expect(languageId("a.tsx")).toBe("typescriptreact");
  });
  it("turns paths into file URIs and back, on Windows too", () => {
    expect(fileUri("C:\\repos\\my shop\\a.ts")).toBe("file:///C:/repos/my%20shop/a.ts");
    expect(fileUri("/home/x/a#b.ts")).toBe("file:///home/x/a%23b.ts");
    expect(uriPath("file:///c%3A/repos/my%20shop/a.ts", true)).toBe("C:\\repos\\my shop\\a.ts");
    expect(uriPath("file:///home/x/a.ts", false)).toBe("/home/x/a.ts");
    expect(sameUri("file:///C:/repos/a.ts", "file:///c%3A/repos/a.ts")).toBe(true);
    expect(sameUri("file:///C:/repos/a.ts", "file:///C:/repos/b.ts")).toBe(false);
  });
});
