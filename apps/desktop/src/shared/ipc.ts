/**
 * The one contract between the renderer and the host (main process).
 *
 * - Methods: `window.jig.call(method, args)` → handled in main by `registerHandlers` modules.
 * - Events: `window.jig.on(topic, listener)` ← `emit(topic, payload)` in main.
 *
 * Add a method or event here first, then implement it in main, then document it in
 * docs/reference/ipc.md.
 */

import type { AddonCommit, AddonInfo } from "./addons";
import type { BuildJob, BuildRequestInput } from "./builds";
import type { DeepPartial, JigConfig } from "./config";
import type {
  ChatImage,
  ChatUpdate,
  PermissionDecision,
  PermissionMode,
  SessionMeta,
  SessionSnapshot,
} from "./engine";
import type { ImageData } from "./files";
import type { Layout } from "./layout";
import type { LearningState, PatternRun, SuggestionAnswer } from "./learning";
import type { Project, ProjectColor, ProjectsState } from "./projects";
import type { SetupCheck, UpdateInfo } from "./setup";
import type { ProjectScripts, ScriptGroup, TerminalInfo } from "./terminals";
import type {
  FileIconThemeData,
  FileIconThemeList,
  JigTheme,
  OpenVsxExtension,
  ThemeSummary,
} from "./themes";

export const CHANNEL_CALL = "jig:call";
export const CHANNEL_EVENT = "jig:event";

export interface AppInfo {
  version: string;
  platform: "win32" | "darwin" | "linux" | string;
  jigHome: string;
  dev: boolean;
  engine: "claude" | "fake";
  /** Started by the launcher in safe mode: your own add-ons are off. */
  safeMode: boolean;
  /** The launcher had to fall back after a change to Jig failed to start. */
  startedAfterFailure: boolean;
  /** An installed build (not running from source). */
  packaged: boolean;
  /** Set in a preview instance of a level-3 change (the build id). */
  preview?: string;
}

/** Method name → argument and result types. */
export interface HostMethods {
  "app.info": { args: void; result: AppInfo };
  /** An image file as a data URL, for previews (image types only, ≤ 25 MB). */
  "files.image": { args: { path: string }; result: ImageData };
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
  /** Without `path`, shows the folder picker; resolves `undefined` when cancelled. */
  "projects.add": { args: { path?: string }; result: Project | undefined };
  "projects.update": { args: { id: string; name?: string; color?: ProjectColor }; result: ProjectsState };
  "projects.remove": { args: { id: string }; result: ProjectsState };
  "projects.setActive": { args: { id: string | undefined }; result: ProjectsState };
  "projects.reorder": { args: { ids: string[] }; result: ProjectsState };
  "sessions.list": { args: void; result: SessionMeta[] };
  "sessions.get": { args: { id: string }; result: SessionSnapshot };
  "sessions.create": { args: { projectId: string; title?: string }; result: SessionMeta };
  /** Sends a message, or queues it while Claude is busy. */
  /** Sends a message (with images saved by `sessions.addImage`), or queues it while Claude works. */
  "sessions.send": { args: { id: string; text: string; images?: ChatImage[] }; result: void };
  /**
   * Keeps an image for the next message: pasted/dropped bytes (`data`, base64, with `mime`) or a file
   * (`path`). PNG, JPEG, GIF or WebP up to 5 MB. Errors: `not_supported`, `too_large`, `not_found`.
   */
  "sessions.addImage": {
    args: { id: string; data?: string; mime?: string; path?: string };
    result: ChatImage;
  };
  "sessions.interrupt": { args: { id: string }; result: void };
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
  "builds.list": { args: void; result: BuildJob[] };
  "builds.start": { args: BuildRequestInput; result: BuildJob };
  /** Applies a build in preview: layout/settings, or merges the add-on into ~/.jig/addons. */
  /** For a level-3 change that touches protected files, `confirmProtected` must be true. */
  "builds.accept": { args: { id: string; confirmProtected?: boolean }; result: BuildJob };
  /** You agreed to a level-3 proposal: the builder changes Jig's source in a worktree. */
  "builds.startAppChange": { args: { id: string }; result: BuildJob };
  /** Starts the changed Jig as a separate preview window (with a copy of your Jig home). */
  "builds.openPreview": { args: { id: string }; result: void };
  /** Reverts the last accepted change to Jig, rebuilds and restarts. */
  "app.undoLastChange": { args: void; result: { goal: string } };
  "builds.discard": { args: { id: string }; result: BuildJob };
  /** The patch of one file a build changed. */
  "builds.diff": { args: { id: string; path: string }; result: string };
  "learning.state": { args: void; result: LearningState };
  /** Look for patterns now (no AI call when nothing repeats enough). */
  "learning.runNow": { args: void; result: PatternRun };
  "learning.answer": { args: { id: string; answer: SuggestionAnswer }; result: void };
  "learning.clearActivity": { args: void; result: void };
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
  "terminals.data": { id: string; data: string };
  "terminals.changed": TerminalInfo[];
  "scripts.changed": ProjectScripts;
  "addons.changed": AddonInfo[];
  "builds.changed": BuildJob[];
  "learning.changed": LearningState;
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
