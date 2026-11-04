import { ArrowDownUp, MessageSquare, MonitorCog, MoreHorizontal, SquareTerminal, X } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState, type WheelEvent } from "react";
import {
  type BrowserInput,
  type BrowserPageInfo,
  type ConsoleEntry,
  isNetworkError,
  type NetworkEntry,
} from "../../../shared/browser";
import { useActiveChat } from "../../addons/context";
import { call, useHostEvent } from "../../lib/host";
import {
  Badge,
  cn,
  contextMenu,
  Empty,
  IconButton,
  Input,
  type MenuEntry,
  OverlayScrollbar,
  openMenuAt,
} from "../../ui";
import { Pane } from "../../workbench/Pane";
import { useProjects } from "../../workbench/projects";
import type { ViewProps } from "../../workbench/registry";
import { useWorkbench, workbench } from "../../workbench/store";
import { ProjectSwatch } from "../projects/colors";
import { useSessions } from "../sessions/store";

const LEVEL_TONE: Record<ConsoleEntry["level"], string> = {
  log: "text-muted",
  info: "text-info",
  warning: "text-warning",
  error: "text-danger",
};

/** The open pages of Claude's browser, one per chat (D-320). */
export function useBrowserPages(): BrowserPageInfo[] {
  const [pages, setPages] = useState<BrowserPageInfo[]>([]);
  useEffect(() => {
    void call("browser.pages").then(setPages);
  }, []);
  useHostEvent("browser.pages", setPages);
  return pages;
}

/**
 * The page shown: the one you clicked, else the chat in front's, else the one used last. A clicked
 * tab holds until another chat comes to the front.
 */
function useSelectedPage(pages: BrowserPageInfo[]) {
  const front = useActiveChat()?.sessionId;
  const [picked, setPicked] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new chat in front resets your pick.
  useEffect(() => setPicked(undefined), [front]);
  const has = (id?: string) => Boolean(id && pages.some((p) => p.chatId === id));
  const latest = [...pages].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0]?.chatId;
  const selected = has(picked) ? picked : has(front) ? front : latest;
  return { selected, select: setPicked };
}

/** Frames of the shown page only: the view watches one page at a time. */
function useFrame(chatId: string | undefined, open: boolean) {
  const [frames, setFrames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!chatId || !open) return;
    void call("browser.watch", { chatId, on: true });
    return () => void call("browser.watch", { chatId, on: false }).catch(() => {});
  }, [chatId, open]);
  useHostEvent("browser.frame", (f) =>
    setFrames((all) => ({ ...all, [f.chatId]: `data:image/jpeg;base64,${f.data}` })),
  );
  return chatId ? frames[chatId] : undefined;
}

/** A chat's tab in front, or a new tab for it when it isn't open. */
function openChat(sessionId: string): void {
  const tab = useWorkbench
    .getState()
    .layout?.main.tabs.find((t) => t.type === "jig.chat" && t.params.sessionId === sessionId);
  if (tab) workbench.activateTab(tab.id);
  else workbench.openTab("jig.chat", { sessionId });
}

const pageMenu = (chatId: string): MenuEntry[] => [
  {
    label: "Open chat",
    icon: MessageSquare,
    onSelect: () => openChat(chatId),
    testId: "browser-tab-open-chat",
  },
  {
    label: "Close page",
    icon: X,
    onSelect: () => void call("browser.close", { chatId }).catch(() => {}),
    testId: "browser-tab-close",
  },
];

/**
 * One chat's page on one line: the project, the chat's name and a dot while the chat drives it (the
 * page title is in the tooltip and the address row). Fixed width, so tabs coming and going never move
 * anything else.
 */
function PageTab({
  page,
  selected,
  onSelect,
}: {
  page: BrowserPageInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = useSessions((s) => s.metas[page.chatId]);
  const project = useProjects((s) => s.projects.find((p) => p.id === meta?.projectId));
  const name = meta?.title || "Chat";
  const title = page.state.title || page.state.url || "Blank page";
  return (
    <div
      role="tab"
      aria-selected={selected}
      tabIndex={0}
      title={`${name}\n${title}`}
      data-testid="browser-tab"
      data-chat={page.chatId}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onContextMenu={contextMenu(pageMenu(page.chatId))}
      className={cn(
        "group relative flex h-full shrink-0 cursor-default items-center gap-1.5 border-r border-line pr-1 pl-3 text-xs outline-none focus-visible:ring-1 focus-visible:ring-focus @max-md:w-36 @md:w-48",
        selected ? "bg-canvas text-fg" : "bg-surface text-muted hover:text-fg",
      )}
    >
      {selected && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
      {project ? <ProjectSwatch color={project.color} /> : <span className="size-2.5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate" data-testid="browser-tab-chat">
        {name}
      </span>
      <span className="flex size-2 shrink-0 items-center" data-testid="browser-tab-driving">
        {page.driving && (
          <span title="Claude is using this page" className="size-2 animate-pulse rounded-full bg-info" />
        )}
      </span>
      <button
        type="button"
        aria-label={`Options for ${name}'s page`}
        title="Options"
        data-testid="browser-tab-menu"
        onClick={(e) => {
          e.stopPropagation();
          openMenuAt(e.currentTarget, pageMenu(page.chatId), true);
        }}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-hover",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <MoreHorizontal className="size-3.5" />
      </button>
    </div>
  );
}

/** The tabs, one per open page. The strip keeps its height when there are none. */
function PageTabs({
  pages,
  selected,
  onSelect,
}: {
  pages: BrowserPageInfo[];
  selected?: string;
  onSelect: (chatId: string) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  return (
    <div className="group/strip relative shrink-0">
      <div
        ref={strip}
        role="tablist"
        aria-label="Chats’ pages"
        data-testid="browser-tabs"
        // No scrollbar squeezing the tabs: a thin one is drawn over their bottom edge on hover.
        className="tab-strip flex h-8 overflow-x-auto overflow-y-hidden border-b border-line bg-surface"
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {pages.length === 0 && (
          <span className="flex items-center px-3 text-xs text-hint">
            Each chat that browses gets its own page here.
          </span>
        )}
        {pages.map((p) => (
          <PageTab
            key={p.chatId}
            page={p}
            selected={p.chatId === selected}
            onSelect={() => onSelect(p.chatId)}
          />
        ))}
      </div>
      <OverlayScrollbar target={strip} />
    </div>
  );
}

/**
 * Claude's browser: the live pages Claude opens with its jig_browser_* tools, one tab per chat
 * (D-320). You watch a chat's page and can take over at any time: clicks, scrolling and typing on the
 * picture go to that page.
 */
export function BrowserView(_props: ViewProps) {
  const pages = useBrowserPages();
  const { selected, select } = useSelectedPage(pages);
  const state = pages.find((p) => p.chatId === selected)?.state;
  const frame = useFrame(selected, Boolean(state?.open));
  const [panel, setPanel] = useState<"console" | "network">();
  const showConsole = panel === "console";
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [requests, setRequests] = useState<NetworkEntry[]>([]);
  const image = useRef<HTMLImageElement>(null);
  const send = (input: BrowserInput) => {
    if (selected) void call("browser.input", { chatId: selected, input }).catch(() => {});
  };

  // The lists follow the shown page: its state changes when its console or requests do.
  const errors = state?.errors;
  const requestCount = state?.requests;
  // biome-ignore lint/correctness/useExhaustiveDependencies: errors and requestCount trigger a reload.
  useEffect(() => {
    if (!selected) {
      setEntries([]);
      setRequests([]);
      return;
    }
    if (panel === "console") void call("browser.console", { chatId: selected }).then(setEntries);
    if (panel === "network") void call("browser.network", { chatId: selected }).then(setRequests);
  }, [panel, selected, errors, requestCount]);

  /** Mouse position → page pixels, through the letterboxing of object-contain. */
  const toPage = (e: { clientX: number; clientY: number }) => {
    const img = image.current;
    if (!img || !state) return undefined;
    const box = img.getBoundingClientRect();
    const scale = Math.min(box.width / state.width, box.height / state.height);
    const left = box.left + (box.width - state.width * scale) / 2;
    const top = box.top + (box.height - state.height * scale) / 2;
    const x = (e.clientX - left) / scale;
    const y = (e.clientY - top) / scale;
    if (x < 0 || y < 0 || x > state.width || y > state.height) return undefined;
    return { x: Math.round(x), y: Math.round(y) };
  };
  const mouse = (type: "mouseDown" | "mouseUp" | "mouseMove") => (e: MouseEvent) => {
    const at = toPage(e);
    if (!at) return;
    if (type === "mouseDown") (e.currentTarget as HTMLElement).focus();
    send({
      type,
      ...at,
      button: e.button === 2 ? "right" : "left",
      clickCount: type === "mouseMove" ? undefined : Math.max(1, Math.min(3, e.detail)),
    });
  };
  const wheel = (e: WheelEvent) => {
    const at = toPage(e);
    if (at) send({ type: "wheel", ...at, deltaX: e.deltaX, deltaY: e.deltaY });
  };
  const key = (type: "keyDown" | "keyUp") => (e: KeyboardEvent) => {
    // Jig's own shortcuts (Ctrl/Cmd+…) stay Jig's; everything else goes to the page.
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key.length === 1) {
      if (type === "keyDown") send({ type: "text", text: e.key });
    } else send({ type, key: e.key });
  };

  const open = state?.open && state.url && state.url !== "about:blank";

  return (
    <div
      className="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="browser-view"
    >
      <PageTabs pages={pages} selected={selected} onSelect={select} />
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1">
        <div className="min-w-0 flex-1">
          <Input
            value={state?.url ?? ""}
            readOnly
            aria-label="Claude’s browser address"
            data-testid="browser-address"
            placeholder="Waiting for Claude to open a page"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
        <IconButton
          size="sm"
          icon={SquareTerminal}
          label="Console"
          active={showConsole}
          onClick={() => setPanel((v) => (v === "console" ? undefined : "console"))}
          data-testid="browser-console-toggle"
        />
        <IconButton
          size="sm"
          icon={ArrowDownUp}
          label="Network"
          active={panel === "network"}
          onClick={() => setPanel((v) => (v === "network" ? undefined : "network"))}
          data-testid="browser-network-toggle"
        />
        <span className="w-8 shrink-0 text-right" title="Failed requests">
          {Boolean(state?.failedRequests) && <Badge tone="warning">{state?.failedRequests}</Badge>}
        </span>
        <span className="w-8 shrink-0 text-right" data-testid="browser-errors">
          {Boolean(state?.errors) && <Badge tone="danger">{state?.errors}</Badge>}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 bg-canvas">
        {open && frame ? (
          <div
            role="application"
            aria-label="Claude’s browser page"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the live page takes keyboard input like a browser
            tabIndex={0}
            className="absolute inset-0 outline-none focus:ring-1 focus:ring-focus"
            onMouseDown={mouse("mouseDown")}
            onMouseUp={mouse("mouseUp")}
            onMouseMove={mouse("mouseMove")}
            onWheel={wheel}
            onKeyDown={key("keyDown")}
            onKeyUp={key("keyUp")}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text/plain");
              if (text) send({ type: "text", text });
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <img
              ref={image}
              src={frame}
              alt={state?.title || "The page"}
              draggable={false}
              className="size-full object-contain select-none"
              data-testid="browser-frame"
            />
          </div>
        ) : (
          <Empty title="Claude’s browser" icon={MonitorCog}>
            Claude opens pages here to check its work: it clicks, types, takes screenshots and reads the
            console. Each chat has its own page, in its own tab. Ask a chat to "open the app and check the
            login form".
          </Empty>
        )}
      </div>
      {showConsole && (
        <Pane id="jig.browser.console" edge="top" defaultSize={160} min={60} max={600}>
          <div
            className="h-full overflow-auto border-t border-line font-mono text-xs"
            data-testid="browser-console"
          >
            {entries.length === 0 && <div className="p-2 text-hint">No console messages.</div>}
            {entries.map((e, i) => (
              <div
                key={i}
                className={cn(
                  "border-b border-line px-2 py-0.5 break-all whitespace-pre-wrap",
                  LEVEL_TONE[e.level],
                )}
              >
                {e.message}
                {e.source && (
                  <span className="text-hint">
                    {" "}
                    · {e.source.split("/").pop()}
                    {e.line ? `:${e.line}` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Pane>
      )}
      {panel === "network" && (
        <Pane id="jig.browser.console" edge="top" defaultSize={160} min={60} max={600}>
          <NetworkList chatId={selected} entries={requests} />
        </Pane>
      )}
      <div
        className="shrink-0 border-t border-line px-2 py-2 text-xs text-muted"
        data-testid="claude-browser-hint"
      >
        Claude controls this browser. You can click and type in the page to help with sign-ins. For your own
        browsing,{" "}
        <button
          type="button"
          className="text-accent underline hover:text-fg"
          onClick={() => workbench.openViewTab("jig.userBrowser")}
          data-testid="claude-browser-open-browser"
        >
          open Browser
        </button>
        .
      </div>
    </div>
  );
}

/** The page's requests (Claude reads the same log with jig_browser_network). Click one for detail. */
function NetworkList({ chatId, entries }: { chatId?: string; entries: NetworkEntry[] }) {
  const [open, setOpen] = useState<string>();
  const [detail, setDetail] = useState<NetworkEntry & { body?: string; bodyNote?: string }>();
  useEffect(() => {
    setDetail(undefined);
    if (!open || !chatId) return;
    let current = true;
    void call("browser.networkDetail", { chatId, id: open })
      .then((d) => current && setDetail(d))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [open, chatId]);
  return (
    <div
      className="h-full overflow-auto border-t border-line font-mono text-xs"
      data-testid="browser-network"
    >
      {entries.length === 0 && <div className="p-2 text-hint">No requests yet.</div>}
      {entries.map((e) => (
        <div key={e.id} className="border-b border-line">
          <button
            type="button"
            className={cn(
              "flex w-full gap-2 px-2 py-0.5 text-left hover:bg-hover",
              isNetworkError(e) ? "text-danger" : "text-fg",
            )}
            onClick={() => setOpen(open === e.id ? undefined : e.id)}
            data-testid="browser-request"
          >
            <span className="w-10 shrink-0 text-muted">{e.method}</span>
            <span className="w-10 shrink-0">{e.error ? "failed" : (e.status ?? "…")}</span>
            <span className="w-16 shrink-0 truncate text-muted">{e.type}</span>
            <span className="min-w-0 flex-1 truncate" title={e.url}>
              {e.url}
            </span>
            <span className="shrink-0 text-hint">
              {e.durationMs !== undefined ? `${Math.round(e.durationMs)} ms` : ""}
            </span>
          </button>
          {open === e.id && (
            <div className="selectable bg-surface px-2 py-1 break-all whitespace-pre-wrap text-muted">
              {e.error && <div className="text-danger">{e.error}</div>}
              {Object.entries(detail?.responseHeaders ?? {})
                .slice(0, 20)
                .map(([k, v]) => (
                  <div key={k}>
                    <span className="text-hint">{k}:</span> {v}
                  </div>
                ))}
              {detail?.body && (
                <div className="mt-1 max-h-40 overflow-auto text-fg">{detail.body.slice(0, 4000)}</div>
              )}
              {detail?.bodyNote && <div className="text-hint">{detail.bodyNote}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
