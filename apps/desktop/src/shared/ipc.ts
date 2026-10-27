/**
 * The one contract between the renderer and the host (main process).
 *
 * - Methods: `window.jig.call(method, args)` → handled in main by `registerHandlers` modules.
 * - Events: `window.jig.on(topic, listener)` ← `emit(topic, payload)` in main.
 *
 * Add a method or event here first, then implement it in main, then document it in
 * docs/reference/ipc.md.
 */
import type { DeepPartial, JigConfig } from "./config";
import type { ChatUpdate, PermissionDecision, PermissionMode, SessionMeta, SessionSnapshot } from "./engine";
import type { Layout } from "./layout";
import type { Project, ProjectColor, ProjectsState } from "./projects";
import type { JigTheme, OpenVsxExtension, ThemeSummary } from "./themes";

export const CHANNEL_CALL = "jig:call";
export const CHANNEL_EVENT = "jig:event";

export interface AppInfo {
  version: string;
  platform: "win32" | "darwin" | "linux" | string;
  jigHome: string;
  dev: boolean;
  engine: "claude" | "fake";
}

/** Method name → argument and result types. */
export interface HostMethods {
  "app.info": { args: void; result: AppInfo };
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
  "sessions.send": { args: { id: string; text: string }; result: void };
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
