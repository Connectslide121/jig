import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  FlaskConical,
  Globe,
  MonitorSmartphone,
  RotateCw,
  SquareTerminal,
  X,
} from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState, type WheelEvent } from "react";
import {
  type BrowserInput,
  type BrowserState,
  type ConsoleEntry,
  isNetworkError,
  type NetworkEntry,
  VIEWPORTS,
} from "../../../shared/browser";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Badge, cn, Empty, IconButton, Input, openMenuAt } from "../../ui";
import { Pane } from "../../workbench/Pane";
import type { ViewProps } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { testSomething } from "./testing";

const LEVEL_TONE: Record<ConsoleEntry["level"], string> = {
  log: "text-muted",
  info: "text-info",
  warning: "text-warning",
  error: "text-danger",
};

const send = (event: BrowserInput) => void call("browser.input", event).catch(() => {});

function useBrowser() {
  const [state, setState] = useState<BrowserState>();
  const [frame, setFrame] = useState<string>();
  useEffect(() => {
    void call("browser.state").then(setState);
    void call("browser.watch", { on: true });
    return () => void call("browser.watch", { on: false }).catch(() => {});
  }, []);
  useHostEvent("browser.state", setState);
  useHostEvent("browser.frame", (f) => setFrame(`data:image/jpeg;base64,${f.data}`));
  return { state, frame };
}

/**
 * Claude's browser: the live page Claude opens with its jig_browser_* tools. You watch it work and can
 * take over at any time: clicks, scrolling and typing on the picture go to the page.
 */
export function BrowserView(_props: ViewProps) {
  const { state, frame } = useBrowser();
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<"console" | "network">();
  const showConsole = panel === "console";
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [requests, setRequests] = useState<NetworkEntry[]>([]);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!editing) setAddress(state?.url ?? "");
  }, [state?.url, editing]);
  useEffect(() => {
    if (panel === "console") void call("browser.console", {}).then(setEntries);
    if (panel === "network") void call("browser.network", {}).then(setRequests);
  }, [panel]);
  useHostEvent("browser.state", () => {
    if (panel === "console") void call("browser.console", {}).then(setEntries);
    if (panel === "network") void call("browser.network", {}).then(setRequests);
  });

  const go = async (args: { url?: string; action?: "back" | "forward" | "reload" }) => {
    try {
      await call("browser.navigate", args);
    } catch (e) {
      notify({ title: "Couldn't open the page", message: errorMessage(e), tone: "danger" });
    }
  };

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

  const preset = Object.entries(VIEWPORTS).find(
    ([, v]) => v.width === state?.width && v.height === state?.height,
  )?.[0];
  const open = state?.open && state.url && state.url !== "about:blank";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden" data-testid="browser-view">
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1">
        <IconButton
          size="sm"
          icon={ArrowLeft}
          label="Back"
          disabled={!state?.canGoBack}
          onClick={() => void go({ action: "back" })}
        />
        <IconButton
          size="sm"
          icon={ArrowRight}
          label="Forward"
          disabled={!state?.canGoForward}
          onClick={() => void go({ action: "forward" })}
        />
        <IconButton
          size="sm"
          icon={state?.loading ? X : RotateCw}
          label={state?.loading ? "Loading…" : "Reload"}
          disabled={!open}
          onClick={() => void go({ action: "reload" })}
        />
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            if (address.trim()) void go({ url: address.trim() });
          }}
        >
          <Input
            value={address}
            placeholder="localhost:5173"
            aria-label="Address"
            data-testid="browser-address"
            onFocus={(e) => {
              setEditing(true);
              e.currentTarget.select();
            }}
            onBlur={() => setEditing(false)}
            onChange={(e) => setAddress(e.target.value)}
          />
        </form>
        <IconButton
          size="sm"
          icon={FlaskConical}
          label="Test this page… (a chat on the small tester model)"
          onClick={() => void testSomething()}
          data-testid="browser-test"
        />
        <IconButton
          size="sm"
          icon={MonitorSmartphone}
          label={`Window size: ${preset ? VIEWPORTS[preset as keyof typeof VIEWPORTS].label : state ? `${state.width}×${state.height}` : "desktop"}`}
          onClick={(e) =>
            openMenuAt(
              e.currentTarget,
              Object.entries(VIEWPORTS).map(([id, v]) => ({
                label: `${v.label} (${v.width}×${v.height})`,
                checked: id === preset,
                onSelect: () => void call("browser.resize", { width: v.width, height: v.height }),
              })),
              true,
            )
          }
        />
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
        {Boolean(state?.failedRequests) && (
          <span title="Failed requests">
            <Badge tone="warning">{state?.failedRequests}</Badge>
          </span>
        )}
        {Boolean(state?.errors) && (
          <span data-testid="browser-errors">
            <Badge tone="danger">{state?.errors}</Badge>
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1 bg-canvas">
        {open && frame ? (
          <div
            role="application"
            aria-label="Claude's browser page"
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
          <Empty title="Claude's browser" icon={Globe}>
            Claude opens pages here to check its work: it clicks, types, takes screenshots and reads the
            console, and you watch. Ask a chat to "open the app and check the login form", or type an address
            above.
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
          <NetworkList entries={requests} />
        </Pane>
      )}
    </div>
  );
}

/** The page's requests (Claude reads the same log with jig_browser_network). Click one for detail. */
function NetworkList({ entries }: { entries: NetworkEntry[] }) {
  const [open, setOpen] = useState<string>();
  const [detail, setDetail] = useState<NetworkEntry & { body?: string; bodyNote?: string }>();
  useEffect(() => {
    setDetail(undefined);
    if (!open) return;
    let current = true;
    void call("browser.networkDetail", { id: open })
      .then((d) => current && setDetail(d))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [open]);
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
