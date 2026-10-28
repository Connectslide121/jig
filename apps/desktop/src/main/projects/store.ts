import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { JigError } from "../../shared/ipc";
import {
  PROJECT_COLORS,
  type Project,
  type ProjectInfo,
  type ProjectPatch,
  type ProjectRepo,
  type ProjectsFile,
  ProjectsFileSchema,
  type ProjectsState,
  type Workspace,
  type WorkspaceInfo,
} from "../../shared/projects";
import { readJson, writeJson } from "../state/jsonStore";
import { findRepos, REPO_SCAN_DEPTH } from "./repos";

const samePath = (a: string, b: string) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

/**
 * Workspaces and projects (`~/.jig/projects.json`, D-101/D-102).
 * - A workspace is a folder you added: a git repository, or a folder of repositories (found once and
 *   cached; `rescanRepos` refreshes).
 * - A project is a group you manage: a name, a colour, a default workspace (`path`), a default Git
 *   repository and defaults for its chats.
 * No Electron imports, so it is unit-tested with a temporary file.
 */
export class ProjectStore {
  private data: ProjectsFile | undefined;
  private listeners = new Set<(state: ProjectsState) => void>();
  /** Repositories found inside workspace folders, by folder path. */
  private repoCache = new Map<string, Promise<ProjectRepo[]>>();

  constructor(
    private readonly file: string,
    /** How deep to look for repositories inside a workspace (Settings → Projects). */
    private readonly repoDepth: () => number = () => REPO_SCAN_DEPTH,
  ) {}

  private async load(): Promise<ProjectsFile> {
    if (!this.data) {
      const data = await readJson(this.file, ProjectsFileSchema);
      // Every project's default folder is a workspace (files written before workspaces existed).
      for (const p of data.projects)
        if (!data.workspaces.some((w) => samePath(w.path, p.path)))
          data.workspaces.push({ id: randomUUID(), path: p.path, addedAt: p.addedAt });
      this.data = data;
    }
    return this.data;
  }

  private async save(data: ProjectsFile): Promise<ProjectsState> {
    this.data = data;
    await writeJson(this.file, data);
    const state = await this.state();
    for (const listener of this.listeners) listener(state);
    return state;
  }

  onChange(listener: (state: ProjectsState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async state(): Promise<ProjectsState> {
    const data = await this.load();
    return {
      workspaces: await Promise.all(data.workspaces.map((w) => this.describeWorkspace(w))),
      projects: await Promise.all(data.projects.map((p) => this.describe(p))),
      activeId: data.activeId,
    };
  }

  /** What the disk says about a folder: exists, a repository, the repositories inside. */
  private async folderFacts(
    path: string,
  ): Promise<{ exists: boolean; isGitRepo: boolean; repos: ProjectRepo[] }> {
    const [folder, git] = await Promise.all([
      stat(path).catch(() => undefined),
      stat(join(path, ".git")).catch(() => undefined),
    ]);
    const exists = Boolean(folder?.isDirectory());
    const isGitRepo = Boolean(git);
    let repos: ProjectRepo[] = [];
    if (exists && !isGitRepo) {
      const key = `${this.repoDepth()}:${path}`;
      let found = this.repoCache.get(key);
      if (!found) {
        found = findRepos(path, this.repoDepth());
        this.repoCache.set(key, found);
      }
      repos = await found;
    }
    return { exists, isGitRepo, repos };
  }

  private async describeWorkspace(workspace: Workspace): Promise<WorkspaceInfo> {
    return {
      ...workspace,
      name: basename(workspace.path) || workspace.path,
      ...(await this.folderFacts(workspace.path)),
    };
  }

  private async describe(project: Project): Promise<ProjectInfo> {
    const facts = await this.folderFacts(project.path);
    const focusRepo = facts.repos.some((r) => r.path === project.focusRepo) ? project.focusRepo : undefined;
    return { ...project, focusRepo, ...facts };
  }

  /** Tells listeners again (e.g. the search depth changed, so workspaces list other repositories). */
  async refresh(): Promise<void> {
    const state = await this.state();
    for (const listener of this.listeners) listener(state);
  }

  /** Looks for the repositories inside a folder again (repos added or removed): a project's or a workspace's. */
  async rescanRepos(id: string): Promise<ProjectsState> {
    const data = await this.load();
    const path =
      data.projects.find((p) => p.id === id)?.path ?? data.workspaces.find((w) => w.id === id)?.path;
    if (!path) throw new JigError("not_found", "Project not found");
    for (const key of this.repoCache.keys()) if (key.endsWith(`:${path}`)) this.repoCache.delete(key);
    return this.save(data);
  }

  /** The repository of a workspace that Git actions and the status bar use. */
  async setFocusRepo(id: string, repo: string | undefined): Promise<ProjectsState> {
    const data = await this.load();
    const project = await this.get(id);
    if (repo) {
      const info = await this.describe(project);
      if (!info.repos.some((r) => r.path === repo))
        throw new JigError("not_found", "That repository isn't part of this project");
    }
    return this.save({
      ...data,
      projects: data.projects.map((p) => (p.id === id ? { ...p, focusRepo: repo } : p)),
    });
  }

  async get(id: string): Promise<Project> {
    const project = (await this.load()).projects.find((p) => p.id === id);
    if (!project) throw new JigError("not_found", "Project not found");
    return project;
  }

  async list(): Promise<Project[]> {
    return (await this.load()).projects;
  }

  async workspaces(): Promise<Workspace[]> {
    return (await this.load()).workspaces;
  }

  /** A folder that exists, resolved. */
  private async folder(path: string): Promise<string> {
    const folder = resolve(path);
    const info = await stat(folder).catch(() => undefined);
    if (!info?.isDirectory()) throw new JigError("not_a_folder", `${folder} is not a folder`);
    return folder;
  }

  /** Adds a folder as a workspace (or returns the one there is). */
  async addWorkspace(path: string): Promise<{ state: ProjectsState; workspace: Workspace }> {
    const folder = await this.folder(path);
    const data = await this.load();
    const existing = data.workspaces.find((w) => samePath(w.path, folder));
    if (existing) return { state: await this.state(), workspace: existing };
    const workspace: Workspace = { id: randomUUID(), path: folder, addedAt: new Date().toISOString() };
    return { state: await this.save({ ...data, workspaces: [...data.workspaces, workspace] }), workspace };
  }

  /** Forgets a workspace (the folder is never touched). Not while a project uses it as its default. */
  async removeWorkspace(id: string): Promise<ProjectsState> {
    const data = await this.load();
    const workspace = data.workspaces.find((w) => w.id === id);
    if (!workspace) throw new JigError("not_found", "Workspace not found");
    const users = data.projects.filter((p) => samePath(p.path, workspace.path));
    if (users.length)
      throw new JigError(
        "in_use",
        `${users.map((p) => p.name).join(", ")} use${users.length === 1 ? "s" : ""} this folder as default workspace; choose another one there first`,
      );
    return this.save({ ...data, workspaces: data.workspaces.filter((w) => w.id !== id) });
  }

  private nextColor(data: ProjectsFile) {
    const used = new Set(data.projects.map((p) => p.color));
    return (
      PROJECT_COLORS.find((c) => !used.has(c)) ??
      PROJECT_COLORS[data.projects.length % PROJECT_COLORS.length]!
    );
  }

  /** Makes a project with a default workspace (added as a workspace if new) and makes it active. */
  async create(
    input: { name: string; path: string } & ProjectPatch,
  ): Promise<{ state: ProjectsState; project: Project }> {
    const name = input.name.trim();
    if (!name) throw new JigError("invalid_args", "A project needs a name");
    const { workspace } = await this.addWorkspace(input.path);
    const data = await this.load();
    const project: Project = {
      ...clean({ ...input, name, path: workspace.path }),
      id: randomUUID(),
      name,
      path: workspace.path,
      color: input.color ?? this.nextColor(data),
      addedAt: new Date().toISOString(),
    };
    return {
      state: await this.save({ ...data, projects: [...data.projects, project], activeId: project.id }),
      project,
    };
  }

  /**
   * "Add project…" with a folder: the folder becomes a workspace and, unless a project already has it
   * as its default, a project named after it. Either way that project becomes active.
   */
  async add(path: string): Promise<{ state: ProjectsState; project: Project }> {
    const folder = await this.folder(path);
    const data = await this.load();
    const existing = data.projects.find((p) => samePath(p.path, folder));
    if (existing) return { state: await this.save({ ...data, activeId: existing.id }), project: existing };
    return this.create({ name: basename(folder) || folder, path: folder });
  }

  async update(id: string, patch: ProjectPatch): Promise<ProjectsState> {
    await this.get(id);
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) throw new JigError("invalid_args", "A project needs a name");
    let path: string | undefined;
    if (patch.path !== undefined) path = (await this.addWorkspace(patch.path)).workspace.path;
    const data = await this.load();
    return this.save({
      ...data,
      projects: data.projects.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...clean({ ...patch, name, path }) };
        // A new default workspace: the default repository was the old one's.
        if (path && !samePath(path, p.path)) delete next.focusRepo;
        return next;
      }),
    });
  }

  /** Forgets a project; its chats keep going without one (the folder is never touched). */
  async remove(id: string): Promise<ProjectsState> {
    const data = await this.load();
    const projects = data.projects.filter((p) => p.id !== id);
    const activeId = data.activeId === id ? projects[0]?.id : data.activeId;
    return this.save({ ...data, projects, activeId });
  }

  async setActive(id: string | undefined): Promise<ProjectsState> {
    if (id) await this.get(id);
    return this.save({ ...(await this.load()), activeId: id });
  }

  async reorder(ids: string[]): Promise<ProjectsState> {
    const data = await this.load();
    const order = new Map(ids.map((id, i) => [id, i]));
    const projects = [...data.projects].sort(
      (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    return this.save({ ...data, projects });
  }
}

/**
 * Applies a patch: `undefined` leaves a field, an empty string or list clears it. Text is trimmed and
 * empty starter lines are dropped.
 */
function clean(patch: ProjectPatch): Partial<Project> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "starters") {
      const list = (value as string[]).map((t) => t.trim()).filter(Boolean);
      out[key] = list.length ? list : undefined;
    } else if (typeof value === "string") out[key] = value.trim() || undefined;
    else out[key] = value;
  }
  return out as Partial<Project>;
}
