import { describe, expect, it } from "vitest";
import { isNetworkError, type NetworkEntry, networkSummary, normalizeUrl, redactHeaders } from "./browser";

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

describe("network log", () => {
  const entries: NetworkEntry[] = [
    {
      id: "1",
      method: "GET",
      url: "http://localhost:5173/",
      type: "document",
      status: 200,
      startedAt: "",
      durationMs: 12.4,
      size: 900,
    },
    {
      id: "2",
      method: "POST",
      url: "http://localhost:5173/api/cart",
      type: "fetch",
      status: 500,
      startedAt: "",
    },
    {
      id: "3",
      method: "GET",
      url: "http://localhost:5173/api/user",
      type: "xhr",
      error: "net::ERR_FAILED",
      startedAt: "",
    },
  ];
  it("redacts credentials in headers", () => {
    expect(redactHeaders({ Authorization: "Bearer x", Cookie: "a=b", Accept: "*/*" })).toEqual({
      Authorization: "«redacted»",
      Cookie: "«redacted»",
      Accept: "*/*",
    });
  });
  it("summarizes, filters and finds errors", () => {
    expect(networkSummary(entries)).toBe(
      [
        "#1 GET 200 document 12ms 900B http://localhost:5173/",
        "#2 POST 500 fetch http://localhost:5173/api/cart",
        "#3 GET failed (net::ERR_FAILED) xhr http://localhost:5173/api/user",
      ].join("\n"),
    );
    expect(networkSummary(entries, { filter: "/api" }).split("\n")).toHaveLength(2);
    expect(
      networkSummary(entries, { errorsOnly: true })
        .split("\n")
        .map((l) => l.slice(0, 2)),
    ).toEqual(["#2", "#3"]);
    expect(entries.filter(isNetworkError)).toHaveLength(2);
    expect(networkSummary([])).toBe("No requests recorded.");
  });
});
