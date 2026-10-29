import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { JigError } from "../../shared/ipc";
import { type WorktreeChat, worktreeBranch } from "../../shared/worktrees";
import { addWorktree, applyAttempt, headCommit, removeWorktree } from "../attempts/git";
import { readJson, writeJson } from "../state/jsonStore";

const FileSchema = z.object({ chats: z.array(z.custom<WorktreeChat>()).default([]) });

export interface WorktreeDeps {
  /** `~/.jig/worktree-chats.json` */
  file: string;
  /** `~/.jig/worktrees` */
  dir: string;
  createSession(input: { projectId?: string; cwd: string; title: string }): Promise<{ id: string }>;
  onChange(chats: WorktreeChat[]): void;
}

/**
 * Chats in their own git worktree (backlog: "Git worktree per chat"): a new chat works on a copy of the
 * repository on its own branch, so it can't disturb your working copy; Apply brings its changes into
 * your working copy (uncommitted), Remove deletes the copy and the branch. Normal chats are unchanged.
 */
export class WorktreeService {
  private chats: WorktreeChat[] | undefined;

  constructor(private readonly deps: WorktreeDeps) {}

  async list(): Promise<WorktreeChat[]> {
    this.chats ??= (await readJson(this.deps.file, FileSchema)).chats;
    return this.chats;
  }

  private async save(chats: WorktreeChat[]) {
    this.chats = chats;
    await writeJson(this.deps.file, { chats });
    this.deps.onChange(chats);
  }

  private async get(sessionId: string): Promise<WorktreeChat> {
    const chat = (await this.list()).find((c) => c.sessionId === sessionId);
    if (!chat) throw new JigError("not_found", "This chat doesn't have its own worktree");
    return chat;
  }

  async start(input: { repo: string; name: string; projectId?: string }): Promise<WorktreeChat> {
    const id = randomUUID().slice(0, 6);
    const base = await headCommit(input.repo);
    const branch = worktreeBranch(input.name, id);
    const path = join(this.deps.dir, id);
    await addWorktree(input.repo, path, branch, base);
    const session = await this.deps.createSession({
      projectId: input.projectId,
      cwd: path,
      title: input.name.trim() || `Worktree ${id}`,
    });
    const chat: WorktreeChat = {
      sessionId: session.id,
      projectId: input.projectId,
      repo: input.repo,
      path,
      branch,
      base,
      createdAt: new Date().toISOString(),
    };
    await this.save([...(await this.list()), chat]);
    return chat;
  }

  /** Brings the worktree's changes (commits and uncommitted work since the start) into the repository. */
  async apply(sessionId: string): Promise<void> {
    const chat = await this.get(sessionId);
    await applyAttempt(chat.repo, chat.path, chat.base);
  }

  async remove(sessionId: string): Promise<void> {
    const chat = await this.get(sessionId);
    await removeWorktree(chat.repo, chat.path, chat.branch);
    await this.save((await this.list()).filter((c) => c.sessionId !== sessionId));
  }
}
