/**
 * The one contract between the renderer and the host (main process).
 *
 * - Methods: `window.jig.call(method, args)` → handled in main by `registerHandlers` modules.
 * - Events: `window.jig.on(topic, listener)` ← `emit(topic, payload)` in main.
 *
 * Add a method or event here first, then implement it in main, then document it in
 * docs/reference/ipc.md.
 */

import type { SkillInfo } from "./about";
import type { AddonCommit, AddonInfo } from "./addons";
import type { ChatArtifact, RemoteArtifact } from "./artifacts";
import type { AttemptChanges, AttemptRun, AttemptVerdict } from "./attempts";
import type { BrowserInput, BrowserState, ConsoleEntry, NetworkEntry } from "./browser";
import type { BuildJob, BuildRequestInput } from "./builds";
import type { DeepPartial, JigConfig } from "./config";
import type { DevRequestInfo, DevRequestStatus } from "./devRequest";
import type {
  ChatAttachment,
  ChatUpdate,
  EffortLevel,
  McpServerInfo,
  ModelInfo,
  PermissionDecision,
  PermissionMode,
  RewindResult,
  SavedClaudeSession,
  SessionMeta,
  SessionSnapshot,
  SlashCommandInfo,
} from "./engine";
import type { ImageData } from "./files";
import type { Layout } from "./layout";
import type { EvidenceNote, LearningState, PatternRun, SuggestionAnswer, WorkedState } from "./learning";
import type { AzureItem } from "./links";
import type { FilePreview } from "./preview";
import type { Project, ProjectPatch, ProjectsState, Workspace } from "./projects";
import type { Routine, RoutineLogEntry, RoutineRun } from "./routines";
import type { SetupCheck, UpdateInfo } from "./setup";
import type { ProjectScripts, ScriptGroup, TerminalInfo } from "./terminals";
import type {
  FileIconThemeData,
  FileIconThemeList,
  JigTheme,
  OpenVsxExtension,
  ThemeSummary,
} from "./themes";
import type { Tour } from "./tour";
import type { PlanUsage } from "./usage";
import type { WorktreeChat } from "./worktrees";

export const CHANNEL_CALL = "jig:call";
export const CHANNEL_EVENT = "jig:event";

export interface AppInfo {
  version: string;
  platform: "win32" | "darwin" | "linux" | string;
  jigHome: string;
  dev: boolean;
  engine: "claude" | "fake";
  /** Started by the launcher in safe mode (after an update failed twice): your own add-ons are off. */
  safeMode: boolean;
  /** The launcher had to fall back after an update failed to start. */
  startedAfterFailure: boolean;
  /** An installed build (not running from source). */
  packaged: boolean;
}

/** Method name → argument and result types. */
export interface HostMethods {
  "app.info": { args: void; result: AppInfo };
  /** An image file as a data URL, for previews (image types only, ≤ 25 MB). */
  "files.image": { args: { path: string }; result: ImageData };
  /** A file for the Preview tab: its kind, text or extracted content, and a `jig-file:` address. */
  "files.preview": { args: { path: string }; result: FilePreview };
  /** Size and change time of a file (`null`: gone); the Preview tab polls it to follow edits. */
  /** Files and folders of a project folder matching a fuzzy query (`@` mentions); folders end with `/`. */
  "files.search": { args: { root: string; query: string; limit?: number }; result: string[] };
  "files.stat": { args: { path: string }; result: { size: number; mtimeMs: number } | null };
  /**
   * Saves a text file (the Preview tab's editor): inside a workspace, or a file opened in Preview.
   * `expectedMtimeMs`: refuse with `changed` if the file changed on disk since. Errors: `not_allowed`,
   * `not_a_file`, `changed`, `write_failed`.
   */
  "files.write": {
    args: { path: string; text: string; expectedMtimeMs?: number };
    result: { size: number; mtimeMs: number };
  };
  /** Claude Code skills on this machine: yours and the active project's (the "What Jig can do" page). */
  /** "Write my standup": Claude summarises your commits, uncommitted work and chats since the last working day (or a week). */
  "digest.standup": {
    args: { period: "workday" | "week" };
    result: { text: string; since: string; repos: number; chats: number };
  };
  /** A guided tour of the uncommitted changes of the repository `cwd` is in (`focus`: what they're for). */
  "tour.create": { args: { cwd: string; focus?: string }; result: Tour };
  "tour.get": { args: { id: string }; result: Tour };
  /** "Try several ways": the same task in 2–4 chats, each in its own git worktree (docs/reference/attempts.md). */
  "attempts.start": {
    args: { projectId: string; repo: string; task: string; hints: string[] };
    result: AttemptRun;
  };
  "attempts.list": { args: void; result: AttemptRun[] };
  /** Chats in their own git worktree. */
  "worktrees.list": { args: void; result: WorktreeChat[] };
  "worktrees.start": { args: { repo: string; name: string; projectId?: string }; result: WorktreeChat };
  /** Brings the worktree's changes into the repository's working copy (uncommitted). */
  "worktrees.apply": { args: { sessionId: string }; result: void };
  /** Removes the worktree and its branch (the chat stays). */
  "worktrees.remove": { args: { sessionId: string }; result: void };
  "attempts.get": { args: { id: string }; result: AttemptRun };
  "attempts.changes": { args: { id: string }; result: AttemptChanges[] };
  "attempts.diff": { args: { id: string; index: number; path?: string }; result: string };
  /** Claude compares the attempts and recommends one. */
  "attempts.judge": { args: { id: string }; result: AttemptVerdict };
  /** Applies an attempt to the repository's working copy and removes every worktree. */
  "attempts.keep": { args: { id: string; index: number }; result: AttemptRun };
  "attempts.discard": { args: { id: string }; result: AttemptRun };
  "attempts.repoDirty": { args: { id: string }; result: boolean };
  /** An add-on with the `ai` permission asks Claude a one-shot question (no tools) through Claude Code. */
  "ai.ask": { args: { addonId: string; prompt: string; cwd?: string }; result: string };
  "about.skills": { args: void; result: SkillInfo[] };
  /** Your Claude plan usage (5-hour and weekly windows), as Claude Code reports it; refreshes when old. */
  "engine.models": { args: void; result: ModelInfo[] };
  "usage.get": { args: void; result: PlanUsage };
  /** Asks Claude Code again now. */
  "usage.refresh": { args: void; result: PlanUsage };
  /** First-run checks: Claude Code, git, gh, az + Azure DevOps extension, VS Code (versions only). */
  "setup.check": { args: void; result: SetupCheck[] };
  "updates.check": { args: void; result: UpdateInfo };
  /** From a git clone: pull, build, restart. Installed: opens the release page. */
  "updates.apply": { args: void; result: { restarting: boolean } };
  "app.openExternal": { args: { url: string }; result: void };
  "app.showItemInFolder": { args: { path: string }; result: void };
  /** Opens a folder in Explorer/Finder or a file with its default app. */
  "app.openPath": { args: { path: string }; result: void };
  "app.pickFolder": { args: { title?: string }; result: string | undefined };
  "app.pickFiles": { args: { title?: string; defaultPath?: string }; result: string[] };
  "app.toggleDevTools": { args: void; result: void };
  "app.reload": { args: void; result: void };
  "config.get": { args: void; result: JigConfig };
  "config.update": { args: DeepPartial<JigConfig>; result: JigConfig };
  "themes.list": { args: void; result: ThemeSummary[] };
  "themes.get": { args: { id: string }; result: JigTheme };
  "themes.rescan": { args: void; result: ThemeSummary[] };
  "themes.searchOpenVsx": { args: { query: string }; result: OpenVsxExtension[] };
  "themes.installOpenVsx": { args: { namespace: string; name: string }; result: ThemeSummary[] };
  "themes.remove": { args: { id: string }; result: void };
  /** File icon themes (VS Code `iconThemes`) found in editor installs and Open VSX. */
  "iconThemes.list": { args: void; result: FileIconThemeList };
  "iconThemes.rescan": { args: void; result: FileIconThemeList };
  "iconThemes.get": { args: { id: string }; result: FileIconThemeData };
  /** The theme chosen in Settings → Appearance → File icons; `null` = Jig's own icons. */
  "iconThemes.active": { args: void; result: FileIconThemeData | null };
  "window.setTitleBarColors": { args: { symbolColor: string }; result: void };
  "window.minimize": { args: void; result: void };
  "window.toggleMaximize": { args: void; result: void };
  "window.close": { args: void; result: void };
  "layout.get": { args: void; result: Layout };
  "layout.set": { args: Layout; result: Layout };
  "projects.list": { args: void; result: ProjectsState };
  /**
   * "Add project…" with a folder: adds it as a workspace and, unless a project has it as default, a
   * project named after it; makes that project active. Without `path`, shows the folder picker;
   * resolves `undefined` when cancelled.
   */
  "projects.add": { args: { path?: string }; result: Project | undefined };
  /** A new project with a default workspace (added as a workspace if new); it becomes active. */
  "projects.create": { args: { name: string; path: string } & ProjectPatch; result: Project };
  /** Changes a project; an empty string or list clears a preference. */
  "projects.update": { args: { id: string } & ProjectPatch; result: ProjectsState };
  /** Adds a folder as a workspace. Without `path`, shows the folder picker (`undefined` when cancelled). */
  "workspaces.add": { args: { path?: string }; result: Workspace | undefined };
  /** Forgets a workspace (never the folder); refused while a project uses it as its default. */
  "workspaces.remove": { args: { id: string }; result: ProjectsState };
  /** Forgets a project; its chats move to "No project". */
  "projects.remove": { args: { id: string }; result: ProjectsState };
  "projects.setActive": { args: { id: string | undefined }; result: ProjectsState };
  /** Looks for the repositories inside a project's (or workspace's, by its id) folder again. */
  "projects.rescanRepos": { args: { id: string }; result: ProjectsState };
  /** Workspaces: the repository Git actions and the status bar use (`undefined` = none). */
  "projects.setFocusRepo": { args: { id: string; repo?: string }; result: ProjectsState };
  "projects.reorder": { args: { ids: string[] }; result: ProjectsState };
  "sessions.list": { args: void; result: SessionMeta[] };
  "sessions.get": { args: { id: string }; result: SessionSnapshot };
  /**
   * A new chat, in a project or none. `cwd`: the folder it runs in, which can be any folder (another
   * workspace, one repository of a workspace). Default: the project's default workspace; without a
   * project, `cwd` is required. The project's model, effort and permission mode are the chat's defaults.
   */
  "sessions.create": {
    args: { projectId?: string; title?: string; cwd?: string };
    result: SessionMeta;
  };
  /**
   * Azure resource groups, or the resources of one group (`group`), through the user's own `az` login,
   * to pick project links from. Errors: `az_missing`, `az_login`, `az_failed`.
   */
  /** Resource groups of every subscription (or one group's resources), and subscriptions that couldn't be read. */
  "links.azure": {
    args: { group?: string; subscription?: string };
    result: { items: AzureItem[]; problems: string[] };
  };
  /** Puts a chat in a project, moves it to another, or takes it out (`projectId` left out). */
  "sessions.setProject": { args: { id: string; projectId?: string }; result: void };
  /** Pinned chats stay at the top of their project. */
  "sessions.setPinned": { args: { id: string; pinned: boolean }; result: void };
  /** Sends a message (with files kept by `sessions.addAttachment`), or queues it while Claude works. */
  /** `now`: while Claude works, the message joins the running turn instead of waiting in the queue. */
  "sessions.send": {
    args: { id: string; text: string; attachments?: ChatAttachment[]; now?: boolean };
    result: void;
  };
  /** Rewinds the conversation to before a message of yours (and with `files`, the files too). */
  "sessions.rewind": {
    args: { id: string; itemId: string; files: boolean };
    result: { text: string; files?: RewindResult };
  };
  /** Runs a `!` command in the chat's folder; the output goes to Claude with the next message. */
  "sessions.runShell": { args: { id: string; command: string }; result: void };
  /** Adds a line to CLAUDE.md: the project's (in the chat's folder) or your own (~/.claude). */
  "sessions.remember": {
    args: { id: string; text: string; scope: "project" | "user" };
    result: { path: string };
  };
  /** Claude Code's slash commands and skills for this chat. */
  "sessions.commands": { args: { id: string }; result: SlashCommandInfo[] };
  "sessions.models": { args: { id: string }; result: ModelInfo[] };
  "sessions.setEffort": { args: { id: string; effort?: EffortLevel }; result: void };
  /** Extra folders Claude may use (Claude Code's additional directories). */
  "sessions.setDirs": { args: { id: string; dirs: string[] }; result: void };
  "sessions.mcpStatus": { args: { id: string }; result: McpServerInfo[] };
  "sessions.mcpReconnect": { args: { id: string; name: string }; result: void };
  "sessions.mcpToggle": { args: { id: string; name: string; enabled: boolean }; result: void };
  /** Moves running commands/subagents (or the one of `toolUseId`) to the background. */
  "sessions.background": { args: { id: string; toolUseId?: string }; result: boolean };
  "sessions.stopTask": { args: { id: string; taskId: string }; result: void };
  /** Saves the chat as a Markdown file (asks where); returns the path, or nothing when cancelled. */
  "sessions.export": { args: { id: string }; result: string | undefined };
  /**
   * Keeps a file for the next message: pasted/dropped bytes (`data`, base64, with `name`/`mime`) or a
   * file on disk (`path`). Images (PNG, JPEG, GIF, WebP ≤ 5 MB), PDFs, Word/Excel/PowerPoint
   * (.docx/.xlsx/.pptx) and text files (≤ 30 MB). Errors: `not_supported`, `too_large`, `not_found`,
   * `unreadable`.
   */
  "sessions.addAttachment": {
    args: { id: string; data?: string; mime?: string; name?: string; path?: string };
    result: ChatAttachment;
  };
  "sessions.interrupt": { args: { id: string }; result: void };
  /** Undoes a change Claude made to Jig's configuration from a chat (a `change` card). */
  "sessions.undoChange": { args: { sessionId: string; itemId: string }; result: void };
  "sessions.answerPermission": {
    args: { id: string; requestId: string; decision: PermissionDecision };
    result: void;
  };
  "sessions.removeQueued": { args: { id: string; queuedId: string }; result: void };
  "sessions.setModel": { args: { id: string; model: string }; result: void };
  "sessions.setPermissionMode": { args: { id: string; mode: PermissionMode }; result: void };
  "sessions.rename": { args: { id: string; title: string }; result: void };
  "sessions.archive": { args: { id: string; archived: boolean }; result: void };
  /** Ends the Claude Code process; the conversation resumes on the next message. */
  "sessions.stop": { args: { id: string }; result: void };
  /** A new chat that continues this one as a branch (Claude Code's fork). */
  "sessions.fork": { args: { id: string }; result: SessionMeta };
  /** Conversations Claude Code saved on this machine (D-150). */
  "sessions.saved": { args: void; result: SavedClaudeSession[] };
  /** Opens one as a chat in No project (a branch of it; the original stays as it was). */
  "sessions.openSaved": { args: { sessionId: string }; result: SessionMeta };
  /** Restores files Claude changed since a user message (file checkpoints); `dryRun` only reports. */
  "sessions.rewindFiles": { args: { id: string; itemId: string; dryRun: boolean }; result: RewindResult };
  "sessions.delete": { args: { id: string }; result: void };
  "terminals.list": { args: void; result: TerminalInfo[] };
  /** A shell in the project (or `cwd`), or a shell running `command`. */
  "terminals.create": {
    args: {
      projectId?: string;
      cwd?: string;
      command?: string;
      title?: string;
      cols?: number;
      rows?: number;
    };
    result: TerminalInfo;
  };
  "terminals.write": { args: { id: string; data: string }; result: void };
  "terminals.resize": { args: { id: string; cols: number; rows: number }; result: void };
  "terminals.buffer": { args: { id: string }; result: string };
  "terminals.rename": { args: { id: string; title: string }; result: void };
  "terminals.kill": { args: { id: string }; result: void };
  "terminals.close": { args: { id: string }; result: void };
  /** Opens a private terminal running Claude Code so you can sign in (`/login`). */
  "terminals.claudeLogin": { args: { projectId?: string }; result: TerminalInfo };
  /** Claude's browser: an offscreen page Claude (and you) drive; see docs/reference/browser.md. */
  "browser.state": { args: void; result: BrowserState };
  /** Starts (`on`) or stops sending `browser.frame` events to this view. */
  "browser.watch": { args: { on: boolean }; result: void };
  /** Opens `url`, or goes back/forward/reloads. */
  "browser.navigate": {
    args: { url?: string; action?: "back" | "forward" | "reload" };
    result: BrowserState;
  };
  /** Mouse, wheel and keyboard input from the live view, in page pixels. */
  "browser.input": { args: BrowserInput; result: void };
  "browser.resize": { args: { width: number; height: number }; result: BrowserState };
  "browser.console": { args: { clear?: boolean }; result: ConsoleEntry[] };
  /** The page's requests (credentials redacted); `networkDetail` adds the response body if still there. */
  "browser.network": { args: { clear?: boolean }; result: NetworkEntry[] };
  "browser.networkDetail": {
    args: { id: string };
    result: NetworkEntry & { body?: string; bodyNote?: string };
  };
  "browser.close": { args: void; result: void };
  /** Claude Code routines (through Claude Code's RemoteTrigger tool; each call costs a small model call). */
  "routines.list": { args: { refresh?: boolean }; result: { at: string; routines: Routine[] } };
  "routines.run": { args: { id: string }; result: void };
  "routines.setEnabled": { args: { id: string; enabled: boolean }; result: void };
  "routines.runs": { args: { id: string }; result: RoutineRun[] };
  "routines.runLog": { args: { sessionId: string }; result: RoutineLogEntry[] };
  /** Artifacts your chats published (from the transcripts; no model call). */
  "artifacts.fromChats": { args: void; result: ChatArtifact[] };
  /** Your artifacts on claude.ai (through Claude Code's Artifact tool; a small model call). */
  "artifacts.list": { args: { refresh?: boolean }; result: { at: string; artifacts: RemoteArtifact[] } };
  /** Reads a claude.ai artifact through Claude Code and saves a copy to open in Preview. */
  "artifacts.fetch": { args: { url: string }; result: { path: string } };
  "scripts.list": { args: { projectId: string }; result: ProjectScripts };
  "scripts.run": { args: { projectId: string; scriptId: string }; result: TerminalInfo };
  "scripts.stop": { args: { projectId: string; scriptId: string }; result: void };
  "scripts.restart": { args: { projectId: string; scriptId: string }; result: TerminalInfo };
  "scripts.saveGroup": {
    args: { projectId: string; group: Omit<ScriptGroup, "id"> & { id?: string } };
    result: ProjectScripts;
  };
  "scripts.deleteGroup": { args: { projectId: string; groupId: string }; result: ProjectScripts };
  "scripts.runGroup": { args: { projectId: string; groupId: string }; result: TerminalInfo[] };
  "addons.list": { args: void; result: AddonInfo[] };
  "addons.setEnabled": { args: { id: string; enabled: boolean }; result: void };
  /** Calls a named export of the add-on's host.ts. */
  "addons.call": { args: { id: string; method: string; args?: unknown }; result: unknown };
  "addons.storageGet": { args: { id: string; key: string }; result: unknown };
  "addons.storageSet": { args: { id: string; key: string; value: unknown }; result: void };
  /** Rebuilds one add-on, or all when `id` is empty. */
  "addons.reload": { args: { id?: string }; result: void };
  "addons.history": { args: { id: string }; result: AddonCommit[] };
  "addons.rollback": { args: { id: string; commit: string }; result: void };
  /** Deletes one of your add-ons (its folder, as a commit); a built-in it replaced comes back. */
  "addons.remove": { args: { id: string }; result: void };
  /** Saves an add-on as a `.zip` to share (a save dialog); the chosen file, or nothing if cancelled. */
  "addons.export": { args: { id: string }; result: string | undefined };
  /** Reads an add-on package (an open dialog when no `path`) without installing it. */
  "addons.inspectPackage": {
    args: { path?: string };
    result:
      | {
          path: string;
          id: string;
          name: string;
          version?: string;
          description?: string;
          permissions: string[];
          files: string[];
          errors: string[];
          /** You already have an add-on with this id (yours, or a built-in one it would override). */
          exists?: "user" | "builtin";
        }
      | undefined;
  };
  /** Installs a package into ~/.jig/addons (replacing yours with `replace`) and loads it. */
  "addons.importPackage": { args: { path: string; replace?: boolean }; result: { id: string; name: string } };
  "builds.list": { args: void; result: BuildJob[] };
  "builds.start": { args: BuildRequestInput; result: BuildJob };
  /** Applies a build in preview: layout/settings, or merges the add-on into ~/.jig/addons. */
  "builds.accept": { args: { id: string }; result: BuildJob };
  "builds.discard": { args: { id: string }; result: BuildJob };
  /** The patch of one file a build changed. */
  "builds.diff": { args: { id: string; path: string }; result: string };
  /** A build that needs a change in Jig: its development request package (D-119). */
  "devRequests.create": { args: { buildId: string }; result: DevRequestInfo };
  /** Saves the package in Downloads and opens a new email to the developers (attach it yourself). */
  "devRequests.email": {
    args: { buildId: string };
    result: { info: DevRequestInfo; savedTo: string; to: string };
  };
  /** PROMPT.md of the package (to paste into Claude Code in Jig's repository). */
  "devRequests.prompt": { args: { buildId: string }; result: string };
  /** Whether you confirmed this version of the request, and when it was emailed. */
  "devRequests.status": { args: { buildId: string }; result: DevRequestStatus };
  /** "This is what I want": confirms the current version (needed before Email to developers). */
  "devRequests.approve": { args: { buildId: string }; result: DevRequestStatus };
  /** Sends your feedback on the request and its demo to the builder, which writes a new version. */
  "builds.reviseRequest": { args: { id: string; feedback: string }; result: BuildJob };
  "learning.state": { args: void; result: LearningState };
  /** Look for patterns now (no AI call when nothing repeats enough). */
  "learning.runNow": { args: void; result: PatternRun };
  "learning.answer": { args: { id: string; answer: SuggestionAnswer }; result: void };
  "learning.clearActivity": { args: void; result: void };
  /** What Jig knows about you: the profile, notes from chats, activity per kind (Learning 2). */
  "learning.knowledge": {
    args: void;
    result: {
      profile: string;
      profileExists: boolean;
      /** Nothing under the headings yet: Jig offers the profile interview. */
      profileEmpty: boolean;
      notes: EvidenceNote[];
      activity: Array<{ kind: string; count: number }>;
    };
  };
  "learning.setProfile": { args: { text: string }; result: void };
  "learning.removeNote": { args: { id: string }; result: void };
  "learning.clearNotes": { args: void; result: void };
  /** "How you worked" in the last 7 days (computed at most once an hour unless `refresh`). */
  "learning.worked": { args: { refresh?: boolean }; result: WorkedState };
  /** The profile interview: the first message of a chat where Claude asks questions and fills the profile (D-169). */
  "learning.interview": { args: void; result: { prompt: string } };
  /** The weekly check-in: start returns the chat's first message. */
  "learning.checkIn": {
    args: { action: "enable" | "decline" | "start" | "skip" };
    result: { prompt?: string };
  };
  /** Activity that happens in the renderer (add-on actions). */
  "learning.record": {
    args: { kind: "addon.action"; text: string; projectId?: string; detail?: Record<string, string> };
    result: void;
  };
}

/** Event topic → payload type. */
export interface HostEvents {
  "config.changed": JigConfig;
  /** The theme list or a theme file changed; refetch the list and the active theme. */
  "themes.changed": void;
  /** The host changed the layout (e.g. an accepted level-1 build). */
  "layout.changed": Layout;
  "projects.changed": ProjectsState;
  /** Transcript and metadata changes of one session. */
  "sessions.update": { sessionId: string; updates: ChatUpdate[] };
  "attempts.changed": AttemptRun;
  "worktrees.changed": WorktreeChat[];
  /** Show this terminal (Claude started it from a chat). */
  "terminals.reveal": { id: string };
  /** Claude Code's sign-in terminal ended: whether you're signed in now, and how (never who). */
  "claude.signIn": { loggedIn: boolean; method?: string };
  /** Show this chat (a desktop notification about it was clicked). */
  "sessions.reveal": { sessionId: string };
  "terminals.data": { id: string; data: string };
  "browser.state": BrowserState;
  /** Routines changed (from Jig or a chat): reload them. */
  "routines.changed": void;
  /** A JPEG of the page (base64), sent only while a view watches. */
  "browser.frame": { data: string; width: number; height: number };
  /** Show Claude's browser (Claude started using it). */
  "browser.reveal": void;
  "terminals.changed": TerminalInfo[];
  "scripts.changed": ProjectScripts;
  "addons.changed": AddonInfo[];
  "builds.changed": BuildJob[];
  "usage.changed": PlanUsage;
  "learning.changed": LearningState;
  /** The profile or the notes from chats changed. */
  "learning.knowledgeChanged": void;
  /** An add-on's host code called api.emit(topic, payload). */
  "addons.event": { id: string; topic: string; payload: unknown };
  /** A notification from the host, shown as a toast. */
  notify: HostNotification;
}

export interface HostNotification {
  title: string;
  message?: string;
  tone?: "info" | "success" | "warning" | "danger";
}

export type MethodName = keyof HostMethods;
export type MethodArgs<M extends MethodName> = HostMethods[M]["args"];
export type MethodResult<M extends MethodName> = HostMethods[M]["result"];
export type EventTopic = keyof HostEvents;

/** What crosses the `jig:call` channel back to the renderer. */
export type CallResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export type CallArgs<M extends MethodName> = MethodArgs<M> extends void ? [] : [args: MethodArgs<M>];

/**
 * The API exposed on `window.jig` by the preload script. `invoke` returns the raw envelope because
 * Error properties (like `code`) do not survive Electron's context bridge; the renderer's typed
 * `call()` (renderer/lib/host.ts) unwraps it and throws a `HostError`.
 */
export interface JigBridge {
  invoke(method: string, args: unknown): Promise<CallResponse<unknown>>;
  on<T extends EventTopic>(topic: T, listener: (payload: HostEvents[T]) => void): () => void;
}

/** Error shape used by the host; `code` is stable and can be translated or matched on. */
export class JigError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JigError";
  }
}
