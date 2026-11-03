import type { JigEventName, JigEventPayloads } from "./events";
import type { StorageOptions, StorageScope } from "./storage";

/**
 * The API add-ons are written against. UI components get `ctx: AddonUiContext` as a prop (and via
 * `useAddon()` from `@jig/sdk/ui`); host code gets `api: AddonHostApi`. Reference:
 * docs/reference/addon-api.md.
 */

/**
 * A project: a group of chats the user manages (D-101). `path` and the facts below are about its
 * default workspace, the folder its chats start in.
 */
export interface AddonProject {
  id: string;
  name: string;
  /** The project's default workspace folder. */
  path: string;
  isGitRepo: boolean;
  exists: boolean;
  /**
   * A workspace (a folder that isn't a repository) lists the git repositories inside it; empty for a
   * single repository. `name` is the path relative to the project (`client-a/api`).
   */
  repos: Array<{ path: string; name: string }>;
  /** The project's default Git repository (Git actions and the status bar use it). */
  focusRepo?: string;
  /** Its colour (UI only), for `ProjectSwatch` and a menu entry's `project`. */
  color?: string;
}

/** A folder the user added (a repository or a folder of repositories), whatever the projects. */
export interface AddonWorkspace {
  id: string;
  /** The folder's name. */
  name: string;
  path: string;
  isGitRepo: boolean;
  exists: boolean;
  /** For a folder of repositories: the repositories inside (`name` relative to the folder). */
  repos: Array<{ path: string; name: string }>;
}

export type NotifyTone = "info" | "success" | "warning" | "danger";

/**
 * Where a click leads (a toast button from host code, a search result): a host.ts export of this
 * add-on (`run`, called with `args`), one of its views (short id, or any view by its full id), one of
 * its tab types, a web page, or a file shown in Jig's Preview.
 */
export type AddonTarget =
  | { run: string; args?: unknown }
  | { view: string }
  | { tab: string; params?: Record<string, unknown> }
  | { url: string }
  | { file: string };

export interface AddonNotifyInput {
  title: string;
  message?: string;
  tone?: NotifyTone;
  /** ms; 0 = stays until closed (danger toasts stay by default). */
  timeout?: number;
  /**
   * Also a system notification when Jig isn't the window in front (a watcher found a failed pipeline
   * while you're in another app); clicking it brings Jig forward, where the toast waits until closed.
   */
  system?: boolean;
}

/** A view's badge on its icon: a count (0 clears it) or a short text such as "!"; undefined clears it. */
export type AddonBadge = number | string | undefined;

/** One result an add-on adds to Jig's search (`contributes.search`). */
export interface AddonSearchResult {
  id: string;
  label: string;
  /** Second line: where it is, its state. */
  detail?: string;
  /** Lucide icon name in kebab case. */
  icon?: string;
  /** What choosing it does. */
  open: AddonTarget;
}

/** What a search provider (`contributes.search`) is called with. */
export interface AddonSearchQuery {
  query: string;
  projectId?: string;
  /** The active project's folder. */
  cwd?: string;
}

/** Another add-on, as other add-ons see it: `exports` are the host methods it lets them call. */
export interface AddonPublicInfo {
  id: string;
  name: string;
  enabled: boolean;
  exports: string[];
}

/** A program started with `api.spawn`: its output arrives while it runs. */
export interface AddonProcess {
  pid?: number;
  /** Writes to its standard input. */
  write(text: string): void;
  /** Closes its standard input. */
  end(): void;
  kill(): void;
  /** Resolves when it ends (code 127: the program wasn't found). */
  done: Promise<{ code: number }>;
}

/** A script Jig found in a project (package.json, .ps1/.sh, dotnet, Azure Functions). */
export interface AddonScript {
  id: string;
  name: string;
  kind: string;
  folder: string;
  cwd: string;
  command: string;
  detail?: string;
  /** Where it listens, when known (a backend's launch profile). */
  url?: string;
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
  /**
   * A multi-select row (a filter's values): a checkbox, and choosing it toggles the box and runs
   * `onSelect` without closing the menu.
   */
  keepOpen?: boolean;
  /** A person: their avatar (profile picture or initials, like `PersonAvatar`) before the label. */
  person?: { name?: string; email?: string };
  /** A project id: its colour square before the label (a menu of projects). */
  project?: string;
  /** A small marker at the far right, in a column shared by the whole menu (a count). */
  badge?: string;
  /** Used by tests (`data-testid`). */
  testId?: string;
  onSelect?: () => void;
  submenu?: MenuInput[];
}

/** One entry of an add-on menu: an item, a separator line or a small heading. */
export type MenuInput = MenuItemInput | { separator: true } | { heading: string };

/**
 * A `contributes.menuGroups[].items` export (D-305): the live entries of a top bar menu group,
 * computed each time the menu opens. Return quickly (or a Promise within half a second).
 */
export type MenuGroupItems = (ctx: AddonUiContext) => MenuInput[] | Promise<MenuInput[]>;

export interface AddonUiContext {
  /**
   * Opens Jig's dedicated Teams meeting window; the call survives project/view switches. `history()`
   * opens the meeting history as a tab in this window (D-250).
   */
  meetings: { open(): Promise<void>; history(): void };
  /**
   * People in your organisation (D-291): `photo(email)` is someone's Microsoft profile picture as a
   * data URL, or null (no picture, or the meeting sign-in isn't there). Cached; `PersonAvatar` from
   * `@jig/sdk/ui` uses it.
   */
  people: { photo(email: string): Promise<string | null> };
  addon: { id: string; name: string };
  /** Calls a named export of this add-on's host.ts: `export async function status(args, api)`. */
  host: { call<T = unknown>(method: string, args?: unknown): Promise<T> };
  /** Events your host code sends with `api.emit(topic, payload)`. Returns an unsubscribe function. */
  on(topic: string, listener: (payload: unknown) => void): () => void;
  /**
   * Something that happened in Jig (`JIG_EVENTS`: a chat finished or needs you, a commit, a branch
   * switch, another active project). Returns an unsubscribe function. Host code uses
   * `contributes.events` instead, which also runs when no view is open.
   */
  onJigEvent<N extends JigEventName>(name: N, listener: (payload: JigEventPayloads[N]) => void): () => void;
  /**
   * The Azure tenant picked in the top bar (D-282), which every `az` the host code runs uses:
   * `tenant()` the active one, `tenants()` all of them (your az login first), `switchTo(key)` makes
   * another one active (a view's "Switch" for something that lives in another tenant). Follow changes
   * with the `azure.tenant` event.
   */
  azure: {
    tenant(): AddonAzureTenant;
    tenants(): AddonAzureTenant[];
    switchTo(key: string): Promise<void>;
  };
  /**
   * A badge on one of this add-on's views (its icon in the sidebar and as a tab): a count such as
   * "3 cards assigned to you", or a short text. 0 or undefined clears it.
   */
  setBadge(viewId: string, value: AddonBadge): void;
  /** Other add-ons: the list, and calling the host methods they share (their manifest's `exports`). */
  addons: {
    list(): AddonPublicInfo[];
    call<T = unknown>(addonId: string, method: string, args?: unknown): Promise<T>;
  };
  projects: {
    active(): AddonProject | undefined;
    list(): AddonProject[];
    setActive(projectId: string): Promise<void>;
    /** Workspaces: sets the repository Git actions and the status bar use. */
    setFocusRepo(projectId: string, repoPath: string | undefined): Promise<void>;
    /** Workspaces: looks for the repositories inside the folder again. */
    rescanRepos(projectId: string): Promise<void>;
  };
  /** Every folder the user added (for views that cover all repositories, e.g. Repos). */
  workspaces: { list(): AddonWorkspace[] };
  /**
   * Starts a new chat and opens it: in the active project (or `projectId`), in `cwd` if given (a folder
   * inside it), with `draft` in the message box (not sent: the user reads it and presses Enter).
   * With `sessionId`, opens that existing chat instead.
   */
  openChat(options?: { projectId?: string; cwd?: string; draft?: string; sessionId?: string }): Promise<void>;
  /**
   * Asks Claude a one-shot question through the user's Claude Code and returns the answer text. No
   * tools and a single turn, so it can only answer (summaries, commit messages, explanations). Uses the
   * user's plan. Needs the `ai` permission. `cwd`: the folder it runs in (default Jig's data folder).
   * `quick`: a short, simple answer (a commit message, a label). The provider (Claude or ChatGPT) and
   * model are the user's choice in Settings → AI features: "Add-ons: short answers" for `quick`, else
   * "Add-ons: other questions". `feature` names one of Jig's own rows instead (the built-in Git and
   * Releases add-ons: `commitMessage`, `commitCheck`, `releaseNotes`).
   */
  ai: {
    ask(
      prompt: string,
      options?: { cwd?: string; quick?: boolean; feature?: "commitMessage" | "commitCheck" | "releaseNotes" },
    ): Promise<string>;
    /**
     * Opens a guided tour of the uncommitted changes of the repository `cwd` is in: Claude orders the
     * changes for understanding and explains each step next to its diff. `focus` says what they're for.
     */
    tour(cwd: string, options?: { focus?: string }): Promise<void>;
  };
  /** Opens one of this add-on's tab types (short type id from the manifest). */
  openTab(type: string, params?: Record<string, unknown>): void;
  /**
   * Changes an open tab of this add-on (its `tabId` from AddonTabProps): `params` are merged into its
   * own, so `title` renames it and `undefined` drops a param (a draft that has been saved).
   */
  updateTab(tabId: string, params: Record<string, unknown>): void;
  /** Opens an image file (absolute path) in Jig's image tab. */
  openImage(path: string): void;
  /**
   * Opens a file (absolute path) in Jig's Preview tab: rendered Markdown (with Mermaid), HTML, PDF,
   * CSV/Excel tables, JSON, notebooks, images, audio, video, Word/PowerPoint text, or highlighted code.
   */
  openPreview(path: string): void;
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
    /** Called when a project's scripts or groups change (rescan, a group added). Returns unsubscribe. */
    onChange(listener: (projectId: string) => void): () => void;
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
  /**
   * Keeps files for a message the add-on's host sends later (`api.chats.send({ attachments })`), like
   * the chat's message box: pasted or dropped files (`add`), or files the user picks (`pick`). Images
   * (≤ 5 MB), PDFs, Word/Excel/PowerPoint and text files. A file Claude can't take is reported to the
   * user and left out. Show them with `<Attachments>` from `@jig/sdk/ui`.
   */
  attachments: {
    /** A `FileList` or `File[]` (from a paste or drop event's `clipboardData`/`dataTransfer`). */
    add(files: ArrayLike<{ name: string; type: string }>): Promise<AddonAttachment[]>;
    pick(options?: { title?: string; defaultPath?: string }): Promise<AddonAttachment[]>;
  };
  /** Sends text to a chat (a new session in the active project unless `sessionId`). Needs `chat`. */
  sendToChat(text: string, options?: { sessionId?: string; send?: boolean }): Promise<void>;
  /**
   * Shows a toast. `timeout` in ms (0 = stays until closed; danger toasts stay by default). Returns a
   * function that closes it, e.g. a "Working…" toast replaced by the result.
   */
  notify(input: AddonNotifyInput & { actions?: Array<{ label: string; run: () => void }> }): () => void;
  /**
   * Per-add-on storage (JSON), shared with host code. With a declared scope (`"storage": { "scope":
   * "project" }` in addon.json) each project (or repository) has its own copy: the active one unless
   * `options` say otherwise. `scope` is the declared scope; `useStorage` follows the active one.
   */
  storage: {
    get<T = unknown>(key: string, options?: StorageOptions): Promise<T | undefined>;
    set(key: string, value: unknown, options?: StorageOptions): Promise<void>;
    scope: StorageScope;
    /** The active project id or repository path for the declared scope (undefined for global). */
    scopeId(): string | undefined;
  };
  openExternal(url: string): void;
  openPath(path: string): void;
  copy(text: string): void;
  /**
   * Opens a menu at the mouse position (right-click) or below an element. With `target`, entries
   * other add-ons contribute to that context menu (`context.*` slots) are added.
   */
  menu(items: MenuInput[], at: MouseEvent | HTMLElement, target?: MenuTarget): void;
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

/**
 * What an approval card (`chat.permissionRenderer`) receives besides `ctx`: Claude's request to use
 * one of the add-on's tools, and `respond` to answer it. Allowing may pass changed `input` (what the
 * tool then runs with); denying may say why, which Claude reads.
 */
export interface AddonPermissionProps extends AddonComponentProps {
  request: {
    /** The tool's full name, e.g. `mcp__jig__addon_tasks_add`. */
    toolName: string;
    input: Record<string, unknown>;
    title?: string;
  };
  /** pending until answered; then what the user chose. */
  status: "pending" | "allowed" | "always" | "denied" | "cancelled";
  sessionId: string;
  /** The chat's project. */
  projectId?: string;
  respond(
    decision: { behavior: "allow"; input?: Record<string, unknown> } | { behavior: "deny"; message?: string },
  ): Promise<void>;
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

/**
 * A file kept for a message (`ctx.attachments`), sent with `api.chats.send({ attachments })`: an image
 * or PDF (sent as is), or an Office or text file (sent as text). The same as a chat's attachments.
 */
export interface AddonAttachment {
  path: string;
  mime: string;
  /** The original file name. */
  name?: string;
  kind?: "image" | "pdf" | "office" | "text";
}

export interface AddonChatSend {
  text: string;
  /** Files kept with `ctx.attachments` (copied into the chat when sent). */
  attachments?: AddonAttachment[];
  sessionId?: string;
  projectId?: string;
  cwd?: string;
  title?: string;
  /** For a new chat; never bypasses permissions. Default: the project's (or Jig's) default. */
  permissionMode?: "default" | "acceptEdits" | "plan";
}

export interface AddonChatInfo {
  id: string;
  title: string;
  status: "idle" | "starting" | "working" | "needs_you" | "error";
  projectId?: string;
  cwd: string;
  costUsd: number;
  /** Messages waiting in the chat's queue. */
  queued: number;
  /** Claude's last answer and when it came. */
  lastAnswer?: string;
  lastAnswerAt?: string;
  error?: string;
}

/** The Azure tenant every `az` Jig runs uses (D-282): `default` is your own az login. */
export type AddonAzureTenant = JigEventPayloads["azure.tenant"];

export interface AddonHostApi {
  addon: { id: string; dir: string; dataDir: string };
  /**
   * Azure through the user's own `az` (D-284), with the tenant picked in Jig's top bar (D-282).
   * `tenant()` is the active one now: key caches by its `key` and reload on the `azure.tenant` event.
   * `az(args)` runs `az <args> -o json --only-show-errors` (needs `exec:az`) and resolves with the
   * parsed JSON; a failure rejects with a message for the user that names the tenant (not signed in,
   * sign-in expired, az or the azure-devops extension missing, or what az said).
   */
  azure: {
    tenant(): AddonAzureTenant;
    az<T = unknown>(args: string[], options?: { timeoutMs?: number }): Promise<T>;
  };
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
    /**
     * Watches a file or folder (`fs:read`); `listener` gets the changed paths, gathered over
     * `debounceMs` (default 200). Folders under `ignore` (default node_modules and .git) are skipped.
     * Returns a function that stops watching (it also stops when the add-on reloads).
     */
    watch(
      path: string,
      listener: (changes: string[]) => void,
      options?: { recursive?: boolean; ignore?: string[]; debounceMs?: number },
    ): () => void;
  };
  /**
   * Starts a program (no shell; same permission as `exec`) and streams its output while it runs:
   * logs, a deploy, a dev server. Send it on to the UI with `api.emit`.
   */
  spawn(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      onOutput?: (text: string, stream: "stdout" | "stderr") => void;
    },
  ): AddonProcess;
  /** `fetch`, with the `net` permission. */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /**
   * The same storage as the UI. Host code doesn't know the active project, so it reads the global part
   * unless `options` name the scope and the project id / repository path (e.g. from a tool's `chat`).
   */
  storage: {
    get<T = unknown>(key: string, options?: StorageOptions): Promise<T | undefined>;
    set(key: string, value: unknown, options?: StorageOptions): Promise<void>;
  };
  /** A toast; its buttons lead somewhere (`AddonTarget`), e.g. `{ label: "Open", view: "runs" }`. */
  notify(input: AddonNotifyInput & { actions?: Array<{ label: string } & AddonTarget> }): void;
  /** A badge on one of this add-on's views (see the UI's `setBadge`), e.g. from a watcher. */
  setBadge(viewId: string, value: AddonBadge): void;
  /** Other add-ons: the list, and calling the host methods they share (their manifest's `exports`). */
  addons: {
    list(): Promise<AddonPublicInfo[]>;
    call<T = unknown>(addonId: string, method: string, args?: unknown): Promise<T>;
  };
  /** Sends an event to this add-on's UI (`ctx.on(topic, …)`). */
  emit(topic: string, payload?: unknown): void;
  projects(): Promise<AddonProject[]>;
  /** Every folder the user added, with its repositories. */
  workspaces(): Promise<AddonWorkspace[]>;
  /**
   * Chats this add-on runs (the `chat` permission). `create` starts an empty chat (in `projectId` with
   * its defaults, or in `cwd`); `send` sends a message to a chat, creating one first unless `sessionId`
   * is given; a busy chat queues it. Chats it created, sent to or asked about report their status
   * changes to the host export `chatChanged({ sessionId, status })`.
   */
  chats: {
    create(input: Omit<AddonChatSend, "text" | "sessionId">): Promise<{ sessionId: string }>;
    send(input: AddonChatSend): Promise<{ sessionId: string; sentAt: string }>;
    get(sessionId: string): Promise<AddonChatInfo>;
  };
  /** Files this add-on kept with `ctx.attachments`: delete the ones it no longer needs. */
  attachments: { remove(list: AddonAttachment[]): Promise<void> };
  log(message: string, detail?: unknown): void;
}

/** A host.ts export callable from the UI (`ctx.host.call(name, args)`) or as a watcher. */
export type HostMethod<A = unknown, R = unknown> = (args: A, api: AddonHostApi) => Promise<R> | R;
