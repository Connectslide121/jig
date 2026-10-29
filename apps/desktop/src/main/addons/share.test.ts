import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { inspectPackage, installPackage, packAddon } from "./share";

const manifest = {
  id: "hello",
  name: "Hello",
  version: "1.2.0",
  permissions: ["exec:git"],
  contributes: { views: [{ id: "v", title: "V", region: "right", component: "V" }] },
};

describe("sharing add-ons", () => {
  it("packs a folder, inspects it and installs it elsewhere", async () => {
    const src = await mkdtemp(join(tmpdir(), "jig-share-"));
    const addon = join(src, "hello");
    await mkdir(join(addon, "lib"), { recursive: true });
    await mkdir(join(addon, "node_modules", "x"), { recursive: true });
    await writeFile(join(addon, "addon.json"), JSON.stringify(manifest));
    await writeFile(join(addon, "ui.tsx"), "export function V() { return null; }\n");
    await writeFile(join(addon, "lib", "a.ts"), "export const a = 1;\n");
    await writeFile(join(addon, "node_modules", "x", "index.js"), "");
    const bytes = await packAddon(addon, "hello");
    const { pkg } = inspectPackage(bytes);
    expect(pkg).toMatchObject({
      id: "hello",
      name: "Hello",
      version: "1.2.0",
      permissions: ["exec:git"],
      errors: [],
    });
    expect(pkg.files).toEqual(["addon.json", "lib/a.ts", "ui.tsx"]);

    const dest = await mkdtemp(join(tmpdir(), "jig-share-dest-"));
    await installPackage(bytes, dest);
    expect(await readFile(join(dest, "hello", "lib", "a.ts"), "utf8")).toBe("export const a = 1;\n");
    await expect(installPackage(bytes, dest)).rejects.toThrow(/already have/);
    await installPackage(bytes, dest, { replace: true });
  });

  it("refuses unsafe paths, missing manifests and non-zips", () => {
    const evil = zipSync({ "addon.json": strToU8(JSON.stringify(manifest)), "../outside.txt": strToU8("x") });
    expect(inspectPackage(evil).pkg.errors).toContain("Unsafe path in the package: ../outside.txt");
    expect(inspectPackage(zipSync({ "ui.tsx": strToU8("") })).pkg.errors).toContain(
      "No addon.json in the package",
    );
    expect(() => inspectPackage(strToU8("nope"))).toThrow(/zip/);
    expect(() => inspectPackage(zipSync({}))).toThrow(/empty/);
    // A small zip that unpacks to a lot.
    const bomb = zipSync({ "big.txt": new Uint8Array(101 * 1024 * 1024) }, { level: 9 });
    expect(() => inspectPackage(bomb)).toThrow(/100 MB/);
  });
});
