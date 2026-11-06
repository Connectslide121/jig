import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inputsStamp } from "./verify-lib";

let dir: string;
let info: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jig-verify-"));
  mkdirSync(join(dir, "cache"));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/a.ts"), "export const a = 1;\n");
  writeFileSync(join(dir, "src/b.ts"), "export const b = 2;\n");
  info = join(dir, "cache/web.tsbuildinfo");
  writeFileSync(info, JSON.stringify({ fileNames: ["../src/a.ts", "../src/b.ts"] }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("inputsStamp", () => {
  it("stays the same while nothing changes", () => {
    expect(inputsStamp(info, "x")?.stamp).toBe(inputsStamp(info, "x")?.stamp);
  });

  it("changes when a file the program read changes, or the extra inputs do", () => {
    const before = inputsStamp(info, "x");
    expect(inputsStamp(info, "y")?.stamp).not.toBe(before?.stamp);
    writeFileSync(join(dir, "src/b.ts"), "export const b = 3;\n");
    const later = new Date(Date.now() + 5000);
    utimesSync(join(dir, "src/b.ts"), later, later);
    const after = inputsStamp(info, "x");
    expect(after?.stamp).not.toBe(before?.stamp);
    expect(after?.newest).toBe(later.getTime());
  });

  it("is null without build info or when one of its files is gone", () => {
    expect(inputsStamp(join(dir, "cache/none.tsbuildinfo"), "x")).toBeNull();
    rmSync(join(dir, "src/a.ts"));
    expect(inputsStamp(info, "x")).toBeNull();
  });
});
