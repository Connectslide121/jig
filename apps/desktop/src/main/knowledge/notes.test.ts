import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NotesStore } from "./notes";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "jig-notes-"));
  dirs.push(dir);
  return dir;
}
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

describe("project notes", () => {
  it("keeps notes per project, serializes edits, and keeps who wrote them", async () => {
    const store = new NotesStore(await temp());
    await Promise.all([
      store.add("p1", { kind: "note", text: "Totals include VAT" }, "you"),
      store.add("p1", { kind: "wait", text: "Pipeline improvements await the migration" }, "claude"),
      store.add("p1", { kind: "link", text: "Design https://figma.example/x" }, "you"),
    ]);
    expect(await store.list("p1")).toMatchObject([
      { id: "1", by: "you" },
      { id: "2", kind: "wait", by: "claude" },
      { id: "3", kind: "link", text: "Design", url: "https://figma.example/x" },
    ]);
    expect(await store.list("p2")).toEqual([]);
    await store.update("p1", "2", { done: true }, "you");
    expect((await store.list("p1"))[1]).toMatchObject({ done: true, by: "you" });
    await store.remove("p1", "1");
    expect((await store.list("p1")).map((n) => n.id)).toEqual(["2", "3"]);
    await expect(store.update("p1", "9", { text: "x" }, "you")).rejects.toThrow("no note 9");
    expect(() => store.add("p1", { kind: "todo", text: "x" }, "you")).toThrow("wait, note or link");
    expect(() => store.add("p1", { kind: "note", text: " " }, "you")).toThrow("needs text");
    await expect(store.list("../x")).rejects.toThrow("Unknown project");
  });

  it("moves the Notes add-on's notes into existing projects once and keeps the old file aside", async () => {
    const dir = await temp();
    const old = join(dir, "addon-notes.json");
    const note = { id: "1", kind: "note", text: "Totals include VAT", by: "you", createdAt: 1 };
    await writeFile(
      old,
      JSON.stringify({
        "chat:s1": [{ kind: "todo", text: "Old task" }],
        "@project(p1) notes": [note, { ...note, id: "2", kind: "wait", text: "API review", done: true }],
        "@project(p2) notes": [{ ...note, text: "Not moved: p2 has notes" }],
        "@project(gone) notes": [note],
      }),
    );
    const store = new NotesStore(join(dir, "knowledge"));
    await store.add("p2", { kind: "note", text: "Already here" }, "you");
    expect(await store.migrateFromAddon(["p1", "p2", "p3"], old)).toBe(2);
    expect(await store.list("p1")).toEqual([
      note,
      { ...note, id: "2", kind: "wait", text: "API review", done: true },
    ]);
    expect((await store.list("p2")).map((n) => n.text)).toEqual(["Already here"]);
    expect(await exists(join(dir, "knowledge", "gone"))).toBe(false);
    expect(await exists(old)).toBe(false);
    expect(JSON.parse(await readFile(`${old}.migrated`, "utf8"))).toHaveProperty("@project(p1) notes");
    // Once moved, a later start finds nothing to move.
    expect(await store.migrateFromAddon(["p1"], old)).toBe(0);
  });
});
