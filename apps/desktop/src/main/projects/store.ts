import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { JigError } from "../../shared/ipc";
import {
  PROJECT_COLORS,
  type Project,
  type ProjectInfo,
  type ProjectsFile,
  ProjectsFileSchema,
  type ProjectsState,
} from "../../shared/projects";
import { readJson, writeJson } from "../state/jsonStore";

/**
 * Registered projects (`~/.jig/projects.json`). A project is a folder, normally a git repository.
 * No Electron imports, so it is unit-tested with a temporary file.
 */
export class ProjectStore {
  private data: ProjectsFile | undefined;
  private listeners = new Set<(state: ProjectsState) => void>();

  constructor(private readonly file: string) {}

  private async load(): Promise<ProjectsFile> {
    this.data ??= await readJson(this.file, ProjectsFileSchema);
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
    return { projects: await Promise.all(data.projects.map(describe)), activeId: data.activeId };
  }

  async get(id: string): Promise<Project> {
    const project = (await this.load()).projects.find((p) => p.id === id);
    if (!project) throw new JigError("not_found", "Project not found");
    return project;
  }

  async list(): Promise<Project[]> {
    return (await this.load()).projects;
  }

  /** Adds a folder (or returns the existing project for it) and makes it active. */
  async add(path: string): Promise<{ state: ProjectsState; project: Project }> {
    const folder = resolve(path);
    const info = await stat(folder).catch(() => undefined);
    if (!info?.isDirectory()) throw new JigError("not_a_folder", `${folder} is not a folder`);
    const data = await this.load();
    const same = (p: Project) =>
      process.platform === "win32" ? p.path.toLowerCase() === folder.toLowerCase() : p.path === folder;
    const existing = data.projects.find(same);
    if (existing) return { state: await this.save({ ...data, activeId: existing.id }), project: existing };
    const used = new Set(data.projects.map((p) => p.color));
    const project: Project = {
      id: randomUUID(),
      name: basename(folder) || folder,
      path: folder,
      color:
        PROJECT_COLORS.find((c) => !used.has(c)) ??
        PROJECT_COLORS[data.projects.length % PROJECT_COLORS.length]!,
      addedAt: new Date().toISOString(),
    };
    return {
      state: await this.save({ projects: [...data.projects, project], activeId: project.id }),
      project,
    };
  }

  async update(id: string, patch: Partial<Pick<Project, "name" | "color">>): Promise<ProjectsState> {
    const data = await this.load();
    await this.get(id);
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) throw new JigError("invalid_args", "A project needs a name");
    return this.save({
      ...data,
      projects: data.projects.map((p) =>
        p.id === id ? { ...p, ...(name ? { name } : {}), ...(patch.color ? { color: patch.color } : {}) } : p,
      ),
    });
  }

  /** Forgets a project (the folder is never touched). */
  async remove(id: string): Promise<ProjectsState> {
    const data = await this.load();
    const projects = data.projects.filter((p) => p.id !== id);
    const activeId = data.activeId === id ? projects[0]?.id : data.activeId;
    return this.save({ projects, activeId });
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

async function describe(project: Project): Promise<ProjectInfo> {
  const [folder, git] = await Promise.all([
    stat(project.path).catch(() => undefined),
    stat(join(project.path, ".git")).catch(() => undefined),
  ]);
  return { ...project, exists: Boolean(folder?.isDirectory()), isGitRepo: Boolean(git) };
}
