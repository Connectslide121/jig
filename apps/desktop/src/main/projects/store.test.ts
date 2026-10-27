import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ProjectStore } from "./store";

let root: string;
let file: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jig-projects-"));
  file = join(root, "projects.json");
  await mkdir(join(root, "alpha", ".git"), { recursive: true });
  await mkdir(join(root, "beta"), { recursive: true });
});

describe("ProjectStore", () => {
  it("adds folders, detects git, persists and activates the new project", async () => {
    const store = new ProjectStore(file);
    const { project } = await store.add(join(root, "alpha"));
    const { state } = await store.add(join(root, "beta"));
    expect(state.projects.map((p) => [p.name, p.isGitRepo, p.exists])).toEqual([
      ["alpha", true, true],
      ["beta", false, true],
    ]);
    expect(state.activeId).toBe(state.projects[1]!.id);
    expect(state.projects.map((p) => p.color)).toEqual(["accent", "info"]);
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.projects[0].id).toBe(project.id);
    expect((await new ProjectStore(file).state()).projects).toHaveLength(2);
  });

  it("returns the existing project when a folder is added twice", async () => {
    const store = new ProjectStore(file);
    const first = await store.add(join(root, "alpha"));
    await store.add(join(root, "beta"));
    const again = await store.add(join(root, "alpha", "."));
    expect(again.project.id).toBe(first.project.id);
    expect(again.state.projects).toHaveLength(2);
    expect(again.state.activeId).toBe(first.project.id);
  });

  it("rejects missing folders and empty names", async () => {
    const store = new ProjectStore(file);
    await expect(store.add(join(root, "nope"))).rejects.toMatchObject({ code: "not_a_folder" });
    const { project } = await store.add(join(root, "alpha"));
    await expect(store.update(project.id, { name: "  " })).rejects.toMatchObject({ code: "invalid_args" });
    await expect(store.update("nope", { name: "x" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("renames, recolours, reorders, removes and notifies", async () => {
    const store = new ProjectStore(file);
    const events: number[] = [];
    store.onChange((s) => events.push(s.projects.length));
    const a = (await store.add(join(root, "alpha"))).project;
    const b = (await store.add(join(root, "beta"))).project;
    let state = await store.update(a.id, { name: " Alpha ", color: "danger" });
    expect(state.projects[0]).toMatchObject({ name: "Alpha", color: "danger" });
    state = await store.reorder([b.id, a.id]);
    expect(state.projects.map((p) => p.id)).toEqual([b.id, a.id]);
    state = await store.setActive(a.id);
    state = await store.remove(a.id);
    expect(state.activeId).toBe(b.id);
    expect(events).toEqual([1, 2, 2, 2, 2, 1]);
  });

  it("reports projects whose folder disappeared", async () => {
    const store = new ProjectStore(file);
    await store.add(join(root, "beta"));
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "beta"), { recursive: true });
    expect((await store.state()).projects[0]?.exists).toBe(false);
  });
});
