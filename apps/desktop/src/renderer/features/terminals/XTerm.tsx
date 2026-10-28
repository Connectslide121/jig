import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { call } from "../../lib/host";
import { useAppearance } from "../../stores/appearance";
import { useConfig } from "../../stores/config";
import { setTerminalWriter } from "./store";

/** One xterm.js instance bound to a host pty. Coloured by the theme's terminal palette. */
export function XTerm({ id, active }: { id: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal>(undefined);
  const fit = useRef<FitAddon>(undefined);
  const theme = useAppearance((s) => s.theme);
  const appearance = useConfig((s) => s.config?.appearance);

  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      scrollback: 10000,
      fontSize: 13,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace",
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    term.current = t;
    fit.current = f;
    let disposed = false;
    // Redraw what happened before this view existed, then follow live output.
    void call("terminals.buffer", { id })
      .then((buffer) => {
        if (!disposed) t.write(buffer);
      })
      .finally(() => {
        if (!disposed) setTerminalWriter(id, (data) => t.write(data));
      });
    const input = t.onData((data) => void call("terminals.write", { id, data }).catch(() => {}));
    const resize = t.onResize(
      ({ cols, rows }) => void call("terminals.resize", { id, cols, rows }).catch(() => {}),
    );
    const observer = new ResizeObserver(() => {
      if (host.current?.offsetParent) {
        try {
          f.fit();
        } catch {
          // Not laid out yet.
        }
      }
    });
    observer.observe(host.current);
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      setTerminalWriter(id, undefined);
      t.dispose();
    };
  }, [id]);

  useEffect(() => {
    const t = term.current;
    if (!t || !theme) return;
    const c = theme.terminal;
    t.options.theme = {
      background: c.background,
      foreground: c.foreground,
      cursor: c.cursor,
      cursorAccent: c.background,
      selectionBackground: c.selection,
      black: c.black,
      red: c.red,
      green: c.green,
      yellow: c.yellow,
      blue: c.blue,
      magenta: c.magenta,
      cyan: c.cyan,
      white: c.white,
      brightBlack: c.brightBlack,
      brightRed: c.brightRed,
      brightGreen: c.brightGreen,
      brightYellow: c.brightYellow,
      brightBlue: c.brightBlue,
      brightMagenta: c.brightMagenta,
      brightCyan: c.brightCyan,
      brightWhite: c.brightWhite,
    };
  }, [theme]);

  useEffect(() => {
    const t = term.current;
    if (!t || !appearance) return;
    t.options.fontFamily = `"${appearance.monoFont}", "JetBrains Mono Variable", Consolas, monospace`;
    t.options.fontSize = appearance.fontSize;
    try {
      fit.current?.fit();
    } catch {
      // Hidden.
    }
  }, [appearance]);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      try {
        fit.current?.fit();
      } catch {
        // Hidden.
      }
      term.current?.focus();
    });
  }, [active]);

  return <div ref={host} className="jig-xterm h-full w-full" data-testid={`xterm-${id}`} />;
}
