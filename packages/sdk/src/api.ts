/**
 * The API add-ons are written against. UI components get `ctx: AddonUiContext` as a prop (and via
 * `useAddon()` from `@jig/sdk/ui`); host code gets `api: AddonHostApi`. Reference:
 * docs/reference/addon-api.md.
 */

export interface AddonProject {
  id: string;
  name: string;
  path: string;
  isGitRepo: boolean;
  exists: boolean;
  /**
   * A workspace (a folder that isn't a repository) lists the git repositories inside it; empty for a
   * single repository. `name` is the path relative to the project (`client-a/api`).
   */
  repos: Array<{ path: string; name: string }>;
  /** Workspaces: the repository Git actions and the status bar use. */
  focusRepo?: string;
}

export type NotifyTone = "info" | "success" | "warning" | "danger";

/** A script Jig found in a project (package.json, .ps1/.sh, dotnet, Azure Functions). */
export interface AddonScript {
  id: string;
  name: string;
  kind: string;
  folder: string;
  cwd: string;
  command: string;
  detail?: string;
}

export interface AddonScriptGroup {
  id: string;
  name: string;
  scriptIds: string[];
}

export interface RunningScript {
  terminalId: string;
  projectId: string;
  scriptId: string;
  title: string;
}

export interface MenuItemInput {
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onSelect?: () => void;
  submenu?: Array<MenuItemInput | { separator: true }>;
}

export interface AddonUiContext {
  addon: { id: string; name: string };
  /** Calls a named export of this add-on's host.ts: `export async function status(args, api)`. */
  host: { call<T = unknown>(method: string, args?: unknown): Promise<T> };
  /** Events your host code sends with `api.emit(topic, payload)`. Returns an unsubscribe function. */
  on(topic: string, listener: (payload: unknown) => void): () => void;
  projects: {
    active(): AddonProject | undefined;
    list(): AddonProject[];
    setActive(projectId: string): Promise<void>;
    /** Workspaces: sets the repository Git actions and the status bar use. */
    setFocusRepo(projectId: string, repoPath: string | undefined): Promise<void>;
    /** Workspaces: looks for the repositories inside the folder again. */
    rescanRepos(projectId: string): Promise<void>;
  };
  /**
   * Starts a new chat and opens it: in the active project (or `projectId`), in `cwd` if given (a folder
   * inside it), with `draft` in the message box (not sent: the user reads it and presses Enter).
   */
  openChat(options?: { projectId?: string; cwd?: string; draft?: string }): Promise<void>;
  /**
   * Asks Claude a one-shot question through the user's Claude Code and returns the answer text. No
   * tools and a single turn, so it can only answer (summaries, commit messages, explanations). Uses the
   * user's plan. Needs the `ai` permission. `cwd`: the folder it runs in (default Jig's data folder).
   */
  ai: { ask(prompt: string, options?: { cwd?: string }): Promise<string> };
  /** Opens one of this add-on's tab types (short type id from the manifest). */
  openTab(type: string, params?: Record<string, unknown>): void;
  /** Opens an image file (absolute path) in Jig's image tab. */
  openImage(path: string): void;
  /** Shows one of this add-on's views (short id), or any view by its full id (`addon.git.git`, `jig.terminals`). */
  showView(viewId: string): void;
  /** Scripts of a project (the same discovery as the dashboard), and running them in terminals. */
  scripts: {
    list(projectId: string): Promise<{ scripts: AddonScript[]; groups: AddonScriptGroup[] }>;
    run(projectId: string, scriptId: string): Promise<void>;
    stop(projectId: string, scriptId: string): Promise<void>;
    restart(projectId: string, scriptId: string): Promise<void>;
    runGroup(projectId: string, groupId: string): Promise<void>;
    running(): RunningScript[];
    /** Shows a running script's terminal. */
    show(terminalId: string): void;
  };
  /** Opens this add-on's settings page (`contributes.settings`). */
  openSettings(): void;
  /** Opens a terminal in the bottom panel running `command`. Needs the `terminal` permission. */
  runInTerminal(
    command: string,
    options?: { cwd?: string; title?: string; projectId?: string },
  ): Promise<void>;
  /** Sends text to a chat (a new session in the active project unless `sessionId`). Needs `chat`. */
  sendToChat(text: string, options?: { sessionId?: string; send?: boolean }): Promise<void>;
  notify(input: { title: string; message?: string; tone?: NotifyTone }): void;
  /** Per-add-on storage (JSON), shared with host code. */
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
  openExternal(url: string): void;
  openPath(path: string): void;
  copy(text: string): void;
  /**
   * Opens a menu at the mouse position (right-click) or below an element. With `target`, entries
   * other add-ons contribute to that context menu (`context.*` slots) are added.
   */
  menu(
    items: Array<MenuItemInput | { separator: true }>,
    at: MouseEvent | HTMLElement,
    target?: MenuTarget,
  ): void;
  confirm(input: {
    title: string;
    message?: string;
    confirmLabel?: string;
    danger?: boolean;
  }): Promise<boolean>;
  prompt(input: {
    title: string;
    message?: string;
    initial?: string;
    confirmLabel?: string;
  }): Promise<string | undefined>;
}

/** Props every add-on component receives. Tabs also get `params`; menu handlers get a target. */
export interface AddonComponentProps {
  ctx: AddonUiContext;
}
export interface AddonTabProps extends AddonComponentProps {
  params: Record<string, unknown>;
  tabId: string;
  active: boolean;
}

/** What a context-menu handler receives: the thing that was right-clicked. */
export type MenuTarget =
  | { slot: "context.project"; project: AddonProject }
  | { slot: "context.repo"; project: AddonProject }
  | { slot: "context.file"; project: AddonProject; path: string; commit?: string }
  | { slot: "context.message"; sessionId: string; text: string };

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface AddonHostApi {
  addon: { id: string; dir: string; dataDir: string };
  /** Runs a program with arguments (no shell). Needs `exec` or `exec:<name>`. */
  exec(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeoutMs?: number;
      env?: Record<string, string>;
      input?: string;
      /** `base64` returns stdout base64-encoded (binary output such as `git show <rev>:image.png`). */
      encoding?: "utf8" | "base64";
    },
  ): Promise<ExecResult>;
  fs: {
    /** `base64` for binary files (images). */
    readFile(path: string, encoding?: "utf8" | "base64"): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    exists(path: string): Promise<boolean>;
  };
  /** `fetch`, with the `net` permission. */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
  notify(input: { title: string; message?: string; tone?: NotifyTone }): void;
  /** Sends an event to this add-on's UI (`ctx.on(topic, …)`). */
  emit(topic: string, payload?: unknown): void;
  projects(): Promise<AddonProject[]>;
  log(message: string, detail?: unknown): void;
}

/** A host.ts export callable from the UI (`ctx.host.call(name, args)`) or as a watcher. */
export type HostMethod<A = unknown, R = unknown> = (args: A, api: AddonHostApi) => Promise<R> | R;
