import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KnowledgeStore } from "./store";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("project knowledge", () => {
  it("keeps documents per project, with unique names, and removes them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-knowledge-"));
    dirs.push(dir);
    const store = new KnowledgeStore(dir);
    const [a, b] = await Promise.all([
      store.add("p1", "style.md", "# Style", "file"),
      store.add("p1", "style.md", "# Other", "claude.ai"),
    ]);
    expect([a.name, b.name]).toEqual(["style.md", "style (2).md"]);
    expect((await store.list("p1")).map((d) => d.name)).toEqual(["style.md", "style (2).md"]);
    expect(await store.list("p2")).toEqual([]);
    expect((await store.read("p1", b.id)).text).toBe("# Other");
    await store.remove("p1", a.id);
    expect((await store.list("p1")).map((d) => d.id)).toEqual([b.id]);
    await expect(store.read("p1", a.id)).rejects.toThrow("isn't in this project");
    await expect(store.list("../x")).rejects.toThrow("Unknown project");
    await store.removeProject("p1");
    expect(await store.list("p1")).toEqual([]);
  });
});
