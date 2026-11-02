import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { forgetOriginal, isModified, readOrigin, restoreOriginal, saveOriginal } from "./originals";

let home: string;
let dir: string;
let root: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "jig-originals-"));
  dir = join(home, "addons", "greeter");
  root = join(home, "addon-originals");
  await mkdir(join(dir, "lib"), { recursive: true });
  await writeFile(join(dir, "addon.json"), '{"id":"greeter"}');
  await writeFile(join(dir, "lib", "a.ts"), "export const a = 1;\n");
});
afterEach(() => rm(home, { recursive: true, force: true }));

it("keeps the original, sees edits, added and removed files, and restores it", async () => {
  expect(await isModified(root, "greeter", dir)).toBe(false);
  await saveOriginal(root, "greeter", dir, { kind: "gallery", source: "/g", version: "1.0.0" });
  expect(await readOrigin(root, "greeter")).toMatchObject({ kind: "gallery", source: "/g" });
  expect(await isModified(root, "greeter", dir)).toBe(false);

  await writeFile(join(dir, "lib", "a.ts"), "export const a = 2;\n");
  expect(await isModified(root, "greeter", dir)).toBe(true);
  await writeFile(join(dir, "lib", "a.ts"), "export const a = 1;\n");
  await writeFile(join(dir, "extra.ts"), "");
  expect(await isModified(root, "greeter", dir)).toBe(true);

  await restoreOriginal(root, "greeter", dir);
  expect(await isModified(root, "greeter", dir)).toBe(false);
  await expect(stat(join(dir, "extra.ts"))).rejects.toThrow();
  expect(await readFile(join(dir, "lib", "a.ts"), "utf8")).toBe("export const a = 1;\n");

  await rm(join(dir, "lib", "a.ts"));
  expect(await isModified(root, "greeter", dir)).toBe(true);
});

it("has nothing to restore without an original", async () => {
  await expect(restoreOriginal(root, "greeter", dir)).rejects.toThrow("no original");
  await saveOriginal(root, "greeter", dir, { kind: "import" });
  await forgetOriginal(root, "greeter");
  expect(await readOrigin(root, "greeter")).toBeUndefined();
});
