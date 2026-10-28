import { describe, expect, it } from "vitest";
import { EXECUTABLE, invalidArgs, isAllowedOrigin } from "./validate";

describe("IPC checks", () => {
  it("accepts calls from Jig's own page only", () => {
    expect(isAllowedOrigin("jig-app://app/index.html", undefined)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173/", "http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173/", undefined)).toBe(false);
    expect(isAllowedOrigin("jig-file://abc/page.html", undefined)).toBe(false);
    expect(isAllowedOrigin("https://example.com", "http://localhost:5173")).toBe(false);
    expect(isAllowedOrigin(undefined, undefined)).toBe(false);
  });

  it("checks argument shapes", () => {
    expect(invalidArgs("files.preview", { path: "/repo/README.md" })).toBeUndefined();
    expect(invalidArgs("files.preview", { path: 42 })).toMatch(/^path:/);
    expect(invalidArgs("files.preview", ["a"])).toBe("arguments must be an object");
    expect(invalidArgs("addons.storageSet", { id: "../config", key: "k", value: 1 })).toMatch(/^id:/);
    expect(invalidArgs("attempts.start", { projectId: "p", repo: "/r", task: "t", hints: ["a"] })).toMatch(
      /^hints:/,
    );
    expect(invalidArgs("terminals.resize", { id: "t", cols: 80.5, rows: 24 })).toMatch(/^cols:/);
    // Methods without a schema only need plain data.
    expect(invalidArgs("config.get", undefined)).toBeUndefined();
    expect(invalidArgs("layout.set", { main: {} } as never)).toBeUndefined();
  });

  it("knows which files would run when opened", () => {
    expect(EXECUTABLE.test("C:\\\\tools\\\\setup.EXE")).toBe(true);
    expect(EXECUTABLE.test("deploy.ps1")).toBe(true);
    expect(EXECUTABLE.test("report.pdf")).toBe(false);
  });
});
