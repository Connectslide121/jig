import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freeName, safeName, saveAddonCopy } from "./saveCopy";

let root: string;
let data: string;
let out: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jig-savecopy-"));
  data = join(root, "data");
  out = join(root, "out");
  await mkdir(join(data, "p_1", "v1"), { recursive: true });
  await mkdir(out);
  await writeFile(join(data, "p_1", "v1", "index.html"), "<p>hi</p>");
  await writeFile(join(root, "secret.txt"), "secret");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const pickers = (folder?: string, file?: string) => ({
  folder: async () => folder,
  file: async () => file,
});

describe("saveAddonCopy", () => {
  it("copies a folder into the chosen one under its name, never over something there", async () => {
    const from = join(data, "p_1", "v1");
    const first = await saveAddonCopy(data, from, { name: "Q3 report" }, pickers(out));
    expect(first).toBe(join(out, "Q3 report"));
    expect(await readFile(join(out, "Q3 report", "index.html"), "utf8")).toBe("<p>hi</p>");
    const second = await saveAddonCopy(data, from, { name: "Q3 report" }, pickers(out));
    expect(second).toBe(join(out, "Q3 report 2"));
    expect((await readdir(out)).sort()).toEqual(["Q3 report", "Q3 report 2"]);
  });

  it("copies a file to where the Save dialog says", async () => {
    const target = join(out, "page.html");
    expect(
      await saveAddonCopy(data, join(data, "p_1", "v1", "index.html"), {}, pickers(undefined, target)),
    ).toBe(target);
    expect(await readFile(target, "utf8")).toBe("<p>hi</p>");
  });

  it("does nothing when the user cancels", async () => {
    expect(await saveAddonCopy(data, join(data, "p_1"), {}, pickers())).toBeUndefined();
    expect(await readdir(out)).toEqual([]);
  });

  it("refuses anything outside the add-on's data folder", async () => {
    for (const from of [
      join(root, "secret.txt"),
      root,
      data,
      join(data, "..", "secret.txt"),
      join(data, "gone"),
    ])
      await expect(saveAddonCopy(data, from, {}, pickers(out, join(out, "x")))).rejects.toThrow(
        /own data folder/,
      );
    expect(await readdir(out)).toEqual([]);
  });
});

describe("names", () => {
  it("numbers a taken name and keeps its extension", async () => {
    await writeFile(join(out, "a.html"), "");
    expect(await freeName(out, "a.html")).toBe(join(out, "a 2.html"));
    expect(await freeName(out, "b.html")).toBe(join(out, "b.html"));
  });

  it("makes titles usable as file names", () => {
    expect(safeName('Q3: "report" / draft?')).toBe("Q3 report draft");
    expect(safeName("...")).toBe("copy");
    expect(safeName("a".repeat(300)).length).toBe(120);
  });
});
