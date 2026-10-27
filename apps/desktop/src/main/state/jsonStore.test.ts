import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson, writeJson } from "./jsonStore";

const Schema = z.object({ name: z.string().default("x"), count: z.number().default(0) });

describe("jsonStore", () => {
  it("returns defaults for a missing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-"));
    expect(await readJson(join(dir, "a.json"), Schema)).toEqual({ name: "x", count: 0 });
  });

  it("round-trips and serialises concurrent writes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-"));
    const file = join(dir, "nested", "a.json");
    await Promise.all([1, 2, 3, 4, 5].map((count) => writeJson(file, { name: "y", count })));
    expect(await readJson(file, Schema)).toEqual({ name: "y", count: 5 });
    expect(JSON.parse(await readFile(file, "utf8")).count).toBe(5);
  });

  it("moves an invalid file aside and falls back to defaults", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-"));
    const file = join(dir, "a.json");
    await writeFile(file, "{ not json");
    expect(await readJson(file, Schema)).toEqual({ name: "x", count: 0 });
    expect((await readdir(dir)).some((f) => f.startsWith("a.json.invalid-"))).toBe(true);
  });
});
