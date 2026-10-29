import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { builtinExtensionsDir, isInside } from "./sources";

describe("isInside", () => {
  it("accepts the folder itself and anything below it, nothing next to it", () => {
    expect(isInside("/repo", "/repo", "linux")).toBe(true);
    expect(isInside("/repo/api", "/repo", "linux")).toBe(true);
    expect(isInside("/repo-other", "/repo", "linux")).toBe(false);
    expect(isInside("/repo/../etc", "/repo", "linux")).toBe(false);
  });

  it("ignores case on Windows only", () => {
    expect(isInside("/Repo/api", "/repo", "linux")).toBe(false);
    expect(isInside("/Repo/api", "/repo", "win32")).toBe(true);
  });
});

describe("builtinExtensionsDir", () => {
  const ext = (...p: string[]) => join("/vscode", ...p, "resources", "app", "extensions");
  const fs = (dirs: Record<string, number>, names: string[]) => ({
    exists: (p: string) => p in dirs,
    list: () => names,
    mtimeMs: (p: string) => dirs[p] ?? 0,
  });

  it("uses resources/app/extensions in the install folder", () => {
    expect(builtinExtensionsDir("/vscode", fs({ [ext()]: 1 }, []))).toBe(ext());
  });

  it("else the newest build folder that has them (newer VS Code versions)", () => {
    const f = fs({ [ext("6d62b1d5da")]: 2, [ext("0ld")]: 1 }, ["0ld", "bin", "6d62b1d5da"]);
    expect(builtinExtensionsDir("/vscode", f)).toBe(ext("6d62b1d5da"));
    expect(builtinExtensionsDir("/vscode", fs({}, ["bin"]))).toBe(ext());
  });
});
