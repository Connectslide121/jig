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
}

export type NotifyTone = "info" | "success" | "warning" | "danger";

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
  projects: { active(): AddonProject | undefined; list(): AddonProject[] };
  /** Opens one of this add-on's tab types (short type id from the manifest). */
  openTab(type: string, params?: Record<string, unknown>): void;
  /** Shows one of this add-on's views (short id). */
  showView(viewId: string): void;
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
    options?: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; input?: string },
  ): Promise<ExecResult>;
  fs: {
    readFile(path: string): Promise<string>;
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
