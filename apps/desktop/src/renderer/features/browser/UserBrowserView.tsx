import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw, SquareTerminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UserBrowserState } from "../../../shared/browser";
import { call, errorMessage, useHostEvent } from "../../lib/host";
import { Empty, IconButton, Input } from "../../ui";
import { notify } from "../../workbench/toasts";

/** The slot is stable; Chromium renders directly into it, with native input and text. */
export function UserBrowserView() {
  const [state, setState] = useState<UserBrowserState>();
  const [address, setAddress] = useState("");
  const editing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  useHostEvent("userBrowser.state", setState);
  useHostEvent("userBrowser.address", () => {
    input.current?.focus();
    input.current?.select();
  });
  useEffect(() => {
    void call("userBrowser.state").then(setState);
  }, []);
  useEffect(() => {
    if (!editing.current) setAddress(state?.url ?? "");
  }, [state?.url]);
  const open = Boolean(state?.url);
  useEffect(() => {
    let frame = 0;
    let previous = "";
    const present = () => {
      const el = slot.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const bounds = {
          x: Math.max(0, Math.round(rect.x)),
          y: Math.max(0, Math.round(rect.y)),
          width: Math.max(0, Math.round(Math.min(rect.right, innerWidth) - Math.max(0, rect.x))),
          height: Math.max(0, Math.round(Math.min(rect.bottom, innerHeight) - Math.max(0, rect.y))),
        };
        // Native surfaces sit above the DOM. Remove them while Jig's overlays are present,
        // including animated closing overlays, and when this workbench tab is hidden.
        const visible =
          open &&
          el.checkVisibility({ visibilityProperty: true }) &&
          !document.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]');
        const args = { bounds, visible };
        const next = JSON.stringify(args);
        if (next !== previous) {
          previous = next;
          void call("userBrowser.present", args).catch(() => {});
        }
      }
      frame = requestAnimationFrame(present);
    };
    present();
    return () => {
      cancelAnimationFrame(frame);
      void call("userBrowser.present", { bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false }).catch(
        () => {},
      );
    };
  }, [open]);
  const go = async (args: { url?: string; action?: "back" | "forward" | "reload" | "stop" }) => {
    try {
      await call("userBrowser.navigate", args);
    } catch (error) {
      notify({ title: "Couldn't open the page", message: errorMessage(error), tone: "danger" });
    }
  };
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="user-browser-view"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
          event.preventDefault();
          event.stopPropagation();
          input.current?.focus();
          input.current?.select();
        }
      }}
    >
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
          label={state?.loading ? "Stop" : "Reload"}
          disabled={!open}
          onClick={() => void go({ action: state?.loading ? "stop" : "reload" })}
        />
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            editing.current = false;
            if (address.trim()) void go({ url: address.trim() });
          }}
        >
          <Input
            ref={input}
            value={address}
            aria-label="Address"
            placeholder="Enter a web address"
            data-testid="user-browser-address"
            onChange={(event) => setAddress(event.target.value)}
            onFocus={(event) => {
              editing.current = true;
              event.currentTarget.select();
            }}
            onBlur={() => {
              editing.current = false;
            }}
          />
        </form>
        <IconButton
          size="sm"
          icon={SquareTerminal}
          label="Developer tools"
          disabled={!open}
          onClick={() => void call("userBrowser.devtools")}
        />
        <IconButton
          size="sm"
          icon={ExternalLink}
          label="Open in default browser"
          disabled={!/^https?:/i.test(state?.url ?? "")}
          onClick={() => {
            if (state?.url) void call("app.openExternal", { url: state.url });
          }}
        />
      </div>
      <div
        className="flex h-6 shrink-0 items-center truncate border-b border-line px-2 text-xs text-muted"
        role="status"
        title={state?.error ?? state?.title}
      >
        {state?.error
          ? `Couldn't load this page: ${state.error}`
          : state?.title || "Your browser · separate from Jig's browser"}
      </div>
      <div ref={slot} className="relative min-h-0 flex-1 bg-canvas" data-testid="user-browser-page">
        {!open && (
          <Empty title="Browser" icon={Globe}>
            Enter an address above to browse. Jig works in its own browser.
          </Empty>
        )}
      </div>
    </div>
  );
}
