import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./browser";

describe("normalizeUrl", () => {
  it("adds http to local addresses and https to host names", () => {
    expect(normalizeUrl("localhost:5173")).toBe("http://localhost:5173/");
    expect(normalizeUrl("127.0.0.1:3000/login")).toBe("http://127.0.0.1:3000/login");
    expect(normalizeUrl("example.com/docs")).toBe("https://example.com/docs");
  });

  it("keeps http, https and file URLs", () => {
    expect(normalizeUrl(" https://example.com ")).toBe("https://example.com/");
    expect(normalizeUrl("file:///tmp/page.html")).toBe("file:///tmp/page.html");
  });

  it("refuses other schemes and empty input", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(/http\(s\) and file/);
    expect(() => normalizeUrl("data:text/html,hi")).toThrow();
    expect(() => normalizeUrl("chrome://settings")).toThrow();
    expect(() => normalizeUrl("")).toThrow("Give a URL");
  });
});
