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
    // Adding a folder also adds it as a workspace (one more notice each).
    expect(events).toEqual([0, 1, 1, 2, 2, 2, 2, 1]);
  });

  it("projects are yours: created with a default workspace, preferences, and kept apart from folders", async () => {
    const store = new ProjectStore(file);
    const { project } = await store.create({ name: " Shop ", path: join(root, "alpha"), model: "opus" });
    let state = await store.state();
    expect(state.workspaces.map((w) => w.path)).toEqual([join(root, "alpha")]);
    expect(state.projects[0]).toMatchObject({ name: "Shop", path: join(root, "alpha"), model: "opus" });
    expect(state.activeId).toBe(project.id);
    // Two projects can share a workspace.
    await store.create({ name: "Integration", path: join(root, "alpha") });
    state = await store.update(project.id, {
      instructions: "  Release notes in Swedish. ",
      starters: ["Fix the failing test", " ", "Plan the next ticket"],
      permissionMode: "plan",
      effort: "high",
    });
    expect(state.workspaces).toHaveLength(1);
    expect(state.projects[0]).toMatchObject({
      instructions: "Release notes in Swedish.",
      starters: ["Fix the failing test", "Plan the next ticket"],
      permissionMode: "plan",
      effort: "high",
    });
    // Empty values clear a preference; a new default workspace is added as a workspace.
    state = await store.update(project.id, { model: "", starters: [], path: join(root, "beta") });
    expect(state.projects[0]?.model).toBeUndefined();
    expect(state.projects[0]?.starters).toBeUndefined();
    expect(state.workspaces.map((w) => w.path).sort()).toEqual([join(root, "alpha"), join(root, "beta")]);
    await expect(store.create({ name: " ", path: join(root, "alpha") })).rejects.toThrow("needs a name");
  });

  it("workspaces: added once, not removed while a project uses them as default", async () => {
    const store = new ProjectStore(file);
    const first = await store.addWorkspace(join(root, "alpha"));
    const again = await store.addWorkspace(join(root, "alpha"));
    expect(again.workspace.id).toBe(first.workspace.id);
    await store.create({ name: "Shop", path: join(root, "alpha") });
    await expect(store.removeWorkspace(first.workspace.id)).rejects.toThrow("Shop uses this folder");
    const beta = await store.addWorkspace(join(root, "beta"));
    const state = await store.removeWorkspace(beta.workspace.id);
    expect(state.workspaces.map((w) => w.path)).toEqual([join(root, "alpha")]);
  });

  it("reports projects whose folder disappeared", async () => {
    const store = new ProjectStore(file);
    await store.add(join(root, "beta"));
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "beta"), { recursive: true });
    expect((await store.state()).projects[0]?.exists).toBe(false);
  });

  it("workspaces: lists the repositories inside, keeps a focus repository, and rescans", async () => {
    const store = new ProjectStore(file);
    const ws = join(root, "repos");
    await mkdir(join(ws, "api", ".git"), { recursive: true });
    await mkdir(join(ws, "client-a", "portal", ".git"), { recursive: true });
    const { project } = await store.add(ws);
    let info = (await store.state()).projects.find((p) => p.id === project.id)!;
    expect(info).toMatchObject({ isGitRepo: false, focusRepo: undefined });
    expect(info.repos.map((r) => r.name)).toEqual(["api", "client-a/portal"]);
    const portal = join(ws, "client-a", "portal");
    await store.setFocusRepo(project.id, portal);
    info = (await store.state()).projects.find((p) => p.id === project.id)!;
    expect(info.focusRepo).toBe(portal);
    await expect(store.setFocusRepo(project.id, join(root, "elsewhere"))).rejects.toMatchObject({
      code: "not_found",
    });
    // A new repo shows up after a rescan (the list is cached).
    await mkdir(join(ws, "web", ".git"), { recursive: true });
    expect((await store.state()).projects.find((p) => p.id === project.id)!.repos).toHaveLength(2);
    info = (await store.rescanRepos(project.id)).projects.find((p) => p.id === project.id)!;
    expect(info.repos.map((r) => r.name)).toEqual(["api", "client-a/portal", "web"]);
    // A single repository has no inner repos.
    const single = (await store.state()).projects.find((p) => p.name === "alpha");
    expect(single?.repos ?? []).toEqual([]);
  });
});
