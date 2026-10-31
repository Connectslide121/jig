import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cacheDirFor,
  galleryEntry,
  galleryRecords,
  readGallery,
  sourceFolder,
  sourceProblem,
} from "./gallery";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jig-gallery-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

async function addon(dir: string, id: string, extra: Record<string, unknown> = {}) {
  await mkdir(join(dir, id), { recursive: true });
  await writeFile(
    join(dir, id, "addon.json"),
    JSON.stringify({ id, name: `Add-on ${id}`, version: "1.2.0", description: "Does a thing", ...extra }),
  );
}

describe("sourceProblem", () => {
  it("accepts https, ssh and absolute folders", () => {
    expect(sourceProblem("https://example.com/shop/addons.git")).toBeUndefined();
    expect(sourceProblem("git@example.com:shop/addons.git")).toBeUndefined();
    expect(sourceProblem("ssh://git@example.com/shop/addons.git")).toBeUndefined();
    expect(sourceProblem(root)).toBeUndefined();
  });
  it("refuses other transports, relative folders and option-like text", () => {
    expect(sourceProblem("")).toBeTruthy();
    expect(sourceProblem("file:///tmp/x")).toBeTruthy();
    expect(sourceProblem("ext::sh -c touch /tmp/x")).toBeTruthy();
    expect(sourceProblem("--upload-pack=touch")).toBeTruthy();
    expect(sourceProblem("addons")).toBeTruthy();
  });
});

describe("cacheDirFor", () => {
  it("gives each URL its own folder", () => {
    expect(cacheDirFor("/c", "https://a/x.git")).not.toBe(cacheDirFor("/c", "https://a/y.git"));
    expect(cacheDirFor("/c", " https://a/x.git ")).toBe(cacheDirFor("/c", "https://a/x.git"));
  });
});

describe("galleryRecords", () => {
  it("finds add-ons at the top level and under addons/, once each", async () => {
    await addon(root, "alpha");
    await addon(join(root, "addons"), "beta");
    await addon(join(root, "addons"), "alpha");
    await mkdir(join(root, "docs"));
    const ids = (await galleryRecords(root)).map((r) => r.id).sort();
    expect(ids).toEqual(["alpha", "beta"]);
  });
});

describe("galleryEntry and readGallery", () => {
  it("says which version you have", async () => {
    await addon(root, "alpha", { permissions: ["exec"] });
    const [record] = await galleryRecords(root);
    const entry = galleryEntry(record!, [{ id: "alpha", source: "user", version: "1.0.0" }]);
    expect(entry).toMatchObject({
      id: "alpha",
      name: "Add-on alpha",
      version: "1.2.0",
      permissions: ["exec"],
      installed: { source: "user", version: "1.0.0" },
    });
  });

  it("reports a source it can't read without failing the others", async () => {
    await addon(root, "alpha");
    const result = await readGallery([root, join(root, "missing"), "relative"], join(root, "cache"), []);
    expect(result[0]!.addons.map((a) => a.id)).toEqual(["alpha"]);
    expect(result[1]!.error).toMatch(/doesn't exist/);
    expect(result[2]!.error).toMatch(/full path/);
  });
});

describe("sourceFolder with git", () => {
  it("reads a local repository as a folder and refuses file://", async () => {
    const repo = join(root, "repo");
    await addon(repo, "alpha");
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "init");
    // A local path isn't a git source Jig clones; only https/ssh are, so a local repo reads as a folder.
    expect(await sourceFolder(repo, join(root, "cache"))).toBe(repo);
    await expect(sourceFolder(`file://${repo}`, join(root, "cache"))).rejects.toThrow(/https/);
  });
});
