import { session as electronSession } from "electron";
import type { BrowserPageInfo, BrowserPageSessions } from "../../shared/browser";
import { logger } from "../log";
import { BrowserPage } from "./service";

const log = logger("browser");
/** Every chat's page uses this session unless `browser.pageSessions` is "separate" (D-320). */
export const SHARED_PARTITION = "persist:jig-browser";
/** A page nobody used (no tool call, no input, not watched) for this long is closed (D-320). */
export const IDLE_MS = 15 * 60_000;
/** At most this many pages are open; the next chat's page closes the least recently used one (D-320). */
export const MAX_PAGES = 4;
/** A chat is "driving" its page while a tool call runs and this long after it (ms): the tab's dot. */
const DRIVING_MS = 5_000;

export interface PagesEvents {
  /** The pages, or one page's state, changed. */
  changed(pages: BrowserPageInfo[]): void;
  frame(frame: { chatId: string; data: string; width: number; height: number }): void;
  /** A chat started using its page: show the view on it. */
  reveal(chatId: string): void;
  /** How pages keep cookies and storage, read when a page is made. */
  sessions(): BrowserPageSessions;
}

interface Entry {
  page: BrowserPage;
  lastUsed: number;
  /** Tool calls running on it. */
  calls: number;
  drivingUntil: number;
}

/**
 * Claude's browser, one page per chat (D-320): a chat's jig_browser_* calls (and its jig-tester
 * subagents', which run in the same chat) drive only its own page, made on first use and closed when
 * the chat is archived or deleted, after `IDLE_MS` unused, or to keep at most `MAX_PAGES` open.
 */
export class BrowserPages {
  private pages = new Map<string, Entry>();
  /** Why a chat's page was closed by Jig, for its next tool call. */
  private closedNotes = new Map<string, string>();
  private routed = new Set<string>();
  private idleTimer: NodeJS.Timeout | undefined;
  private drivingTimer: NodeJS.Timeout | undefined;
  private emitTimer: NodeJS.Timeout | undefined;

  constructor(private readonly events: PagesEvents) {}

  list(): BrowserPageInfo[] {
    const now = Date.now();
    return [...this.pages.entries()].map(([chatId, e]) => ({
      chatId,
      state: e.page.state(),
      driving: e.calls > 0 || e.drivingUntil > now,
      lastUsedAt: new Date(e.lastUsed).toISOString(),
    }));
  }

  /** The chat's page if it has one (views and IPC never make one). */
  get(chatId: string): BrowserPage | undefined {
    return this.pages.get(chatId)?.page;
  }

  /** The chat's page, made on first use (tool calls). */
  page(chatId: string): BrowserPage {
    const found = this.pages.get(chatId);
    if (found) {
      found.lastUsed = Date.now();
      return found.page;
    }
    this.makeRoom();
    const partition =
      this.events.sessions() === "separate"
        ? `jig-browser-chat-${chatId.replace(/[^\w-]/g, "")}`
        : SHARED_PARTITION;
    this.route(partition);
    const page = new BrowserPage(partition, {
      state: () => this.changedSoon(),
      frame: (frame) => this.events.frame({ chatId, ...frame }),
    });
    this.pages.set(chatId, { page, lastUsed: Date.now(), calls: 0, drivingUntil: 0 });
    this.scheduleIdle();
    this.changed();
    return page;
  }

  /** A tool call starts on the chat's page: it shows as driving, and the view opens on it. */
  begin(chatId: string): { page: BrowserPage; notice?: string } {
    const page = this.page(chatId);
    const entry = this.pages.get(chatId)!;
    entry.calls++;
    this.events.reveal(chatId);
    this.changed();
    const notice = this.closedNotes.get(chatId);
    this.closedNotes.delete(chatId);
    return { page, notice };
  }

  end(chatId: string): void {
    const entry = this.pages.get(chatId);
    if (!entry) return;
    entry.calls = Math.max(0, entry.calls - 1);
    entry.lastUsed = Date.now();
    entry.drivingUntil = Date.now() + DRIVING_MS;
    clearTimeout(this.drivingTimer);
    this.drivingTimer = setTimeout(() => this.changed(), DRIVING_MS + 50);
    this.changed();
  }

  /** You used the page (input in the view): it counts as used, so it isn't closed as idle. */
  touch(chatId: string): void {
    const entry = this.pages.get(chatId);
    if (entry) entry.lastUsed = Date.now();
  }

  /** Closes the chat's page (Close page, the chat archived or deleted). */
  close(chatId: string, note?: string): void {
    const entry = this.pages.get(chatId);
    if (!entry) return;
    this.pages.delete(chatId);
    entry.page.close();
    if (note) this.closedNotes.set(chatId, note);
    else this.closedNotes.delete(chatId);
    this.changed();
  }

  closeAll(): void {
    for (const chatId of [...this.pages.keys()]) this.close(chatId);
    clearTimeout(this.idleTimer);
    clearTimeout(this.drivingTimer);
    clearTimeout(this.emitTimer);
  }

  /** The page whose WebContents made a request (requests of a session shared by every page). */
  private byContents(id: number | undefined, partition: string): BrowserPage | undefined {
    const pages = [...this.pages.values()].map((e) => e.page).filter((p) => p.partition === partition);
    if (id === undefined) return pages.length === 1 ? pages[0] : undefined;
    return pages.find((p) => p.contentsId() === id);
  }

  /**
   * A session takes one `webRequest` listener per event, so each session gets one set that hands
   * every request to the page it came from. Also refuses downloads and permission requests.
   */
  private route(partition: string): void {
    if (this.routed.has(partition)) return;
    this.routed.add(partition);
    const s = electronSession.fromPartition(partition);
    s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    s.on("will-download", (event) => event.preventDefault());
    const web = s.webRequest;
    web.onBeforeRequest((details, callback) => {
      this.byContents(details.webContentsId, partition)?.requestStarted(details);
      callback({});
    });
    web.onBeforeSendHeaders((details, callback) => {
      this.byContents(details.webContentsId, partition)?.requestHeaders(details);
      callback({});
    });
    web.onHeadersReceived((details, callback) => {
      this.byContents(details.webContentsId, partition)?.responseHeaders(details);
      callback({});
    });
    web.onCompleted((details) => this.byContents(details.webContentsId, partition)?.requestEnded(details));
    web.onErrorOccurred((details) =>
      this.byContents(details.webContentsId, partition)?.requestEnded({ ...details, error: details.error }),
    );
  }

  /** At most `MAX_PAGES`: the least recently used page (not driven right now, if any) goes. */
  private makeRoom(): void {
    while (this.pages.size >= MAX_PAGES) {
      const entries = [...this.pages.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      const [chatId] = entries.find(([, e]) => e.calls === 0) ?? entries[0]!;
      log.info(`Closing a browser page to keep at most ${MAX_PAGES} open`);
      this.close(
        chatId,
        `Your page of Claude's browser was closed to make room (at most ${MAX_PAGES} chats have one at a time); open it again with jig_browser_open.`,
      );
    }
  }

  private scheduleIdle(): void {
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      for (const [chatId, e] of this.pages)
        if (e.calls === 0 && !e.page.watched() && now - e.lastUsed > IDLE_MS) {
          log.info("Closing an idle browser page");
          this.close(
            chatId,
            `Your page of Claude's browser was closed after ${IDLE_MS / 60_000} minutes unused; open it again with jig_browser_open.`,
          );
        }
      if (!this.pages.size) {
        clearInterval(this.idleTimer);
        this.idleTimer = undefined;
      }
    }, 60_000);
  }

  private changed(): void {
    clearTimeout(this.emitTimer);
    this.emitTimer = undefined;
    this.events.changed(this.list());
  }

  /** A page's state changes often while it loads: the list follows at most every 100 ms. */
  private changedSoon(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => this.changed(), 100);
  }
}
