import { describe, expect, it } from "vitest";
import {
  isInside,
  LIMITS,
  normalizeRel,
  type Page,
  pageTitle,
  readableSource,
  referencedPaths,
  versionsToPrune,
} from "./pages";

describe("normalizeRel", () => {
  it("keeps paths inside the folder, with forward slashes", () => {
    expect(normalizeRel("img/logo.png")).toBe("img/logo.png");
    expect(normalizeRel("./img\\logo.png")).toBe("img/logo.png");
    expect(normalizeRel("a//b/./c.css")).toBe("a/b/c.css");
  });

  it("refuses .., absolute paths and empty ones", () => {
    for (const bad of [
      "../x.png",
      "a/../../x",
      "..\\x",
      "/etc/passwd",
      "\\\\server\\share\\x",
      "C:\\x.png",
      "c:/x",
      "",
      " ",
      ".",
      "a\0b",
    ])
      expect(() => normalizeRel(bad), JSON.stringify(bad)).toThrow();
  });
});

describe("isInside / readableSource", () => {
  it("accepts the folder and what lies under it, not siblings or parents", () => {
    expect(isInside("/work/shop/a.html", "/work/shop", "linux")).toBe(true);
    expect(isInside("/work/shop", "/work/shop", "linux")).toBe(true);
    expect(isInside("/work/shop2/a.html", "/work/shop", "linux")).toBe(false);
    expect(isInside("/work/a.html", "/work/shop", "linux")).toBe(false);
    expect(isInside("/work/shop/../a.html", "/work/shop", "linux")).toBe(false);
  });

  it("needs one of the allowed roots", () => {
    expect(readableSource("/tmp/x/a.html", ["/work", "/tmp"], "linux")).toBe(true);
    expect(readableSource("/home/me/.ssh/id", ["/work", "/tmp"], "linux")).toBe(false);
    expect(readableSource("/tmp/a", ["", ""], "linux")).toBe(false);
  });
});

describe("referencedPaths", () => {
  it("finds the files a page loads from its own folder", () => {
    const html = `<link rel="stylesheet" href="style.css?v=2"><img src="img/a%20b.png" srcset="img/a.png 1x, img/a2.png 2x">
      <script src="app.js"></script><div style="background: url('bg.jpg')"></div>
      <style>@import "more.css"; .x{background:url(icons/x.svg)}</style>`;
    expect(referencedPaths(html).sort()).toEqual(
      [
        "style.css",
        "img/a b.png",
        "img/a.png",
        "img/a2.png",
        "app.js",
        "bg.jpg",
        "more.css",
        "icons/x.svg",
      ].sort(),
    );
  });

  it("leaves out links, absolute and remote URLs, data and anchors, and escapes", () => {
    const html = `<a href="other.html">x</a><img src="https://cdn.example/x.png"><img src="//cdn/x.png">
      <img src="data:image/png;base64,AAAA"><img src="/abs.png"><img src="#frag"><img src="../up.png">
      <link rel="canonical" href="page.html">`;
    expect(referencedPaths(html)).toEqual([]);
  });
});

describe("pageTitle", () => {
  it("prefers the given title, then <title>, then the fallback", () => {
    expect(pageTitle("  Q3 report ", "<title>Other</title>", "x")).toBe("Q3 report");
    expect(pageTitle(undefined, "<title> A  <b>b</b>\n c </title>", "x")).toBe("A b c");
    expect(pageTitle("", "<p>no title</p>", "release-notes")).toBe("release-notes");
    expect(pageTitle(undefined, "", "")).toBe("Untitled page");
    expect(pageTitle("x".repeat(500), "", "").length).toBe(LIMITS.title);
  });
});

describe("versionsToPrune", () => {
  it("keeps the newest few, drops the oldest", () => {
    const versions = [1, 2, 3, 4, 5, 6, 7];
    expect(versionsToPrune(versions)).toEqual([1, 2]);
    expect(versionsToPrune([3, 1, 2])).toEqual([]);
  });
});

describe("Page", () => {
  it("is plain data", () => {
    const p: Page = {
      id: "p_1",
      title: "T",
      entry: "index.html",
      version: 1,
      versions: [1],
      files: 1,
      bytes: 5,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
});
