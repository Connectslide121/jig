import { type ChildProcess, spawn } from "node:child_process";
import { BrowserWindow, type Rectangle, screen } from "electron";
import { hiddenMode, markHelperWindow } from "../appWindows";

/**
 * The frame around what you share in a meeting, like Teams draws: a click-through border window
 * over the shared screen or window, kept out of the capture itself. A shared screen is framed from
 * its display's bounds; a shared window on Windows from its position, followed by a small
 * PowerShell helper (hidden while the window is minimised, gone with it). Elsewhere a shared
 * window isn't framed: Electron can't see other apps' windows.
 */

/** Jig's accent (tokens.css): the frame isn't part of the themed UI, it sits on the user's desktop. */
const FRAME_HTML = `<!doctype html><html><body style="margin:0;overflow:hidden;background:transparent"><div style="position:fixed;inset:0;border:4px solid #e0a458;border-radius:6px;box-sizing:border-box"></div></body></html>`;
const PAD = 2;

let frame: BrowserWindow | undefined;
let tracker: ChildProcess | undefined;

/** The window handle in a desktopCapturer window id (`window:<hwnd>:0`), on Windows. */
export function windowHandle(sourceId: string, platform = process.platform): string | undefined {
  if (platform !== "win32") return undefined;
  return /^window:(\d+):/.exec(sourceId)?.[1];
}

/** One line from the tracker: `x y width height` (physical pixels), `hidden`, or `gone`. */
export function trackerLine(line: string): Rectangle | "hidden" | "gone" | undefined {
  const text = line.trim();
  if (text === "hidden" || text === "gone") return text;
  const parts = text.split(" ").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [x, y, width, height] = parts as [number, number, number, number];
  return width > 0 && height > 0 ? { x, y, width, height } : "hidden";
}

/** The PowerShell loop that prints the window's visible bounds whenever they change. */
export function trackerScript(hwnd: string, parentPid: number): string {
  return `
$ErrorActionPreference = "Stop"
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class JigShare {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out R r, int s);
}
"@
$h = [IntPtr]::new([Int64]${hwnd})
$parent = Get-Process -Id ${parentPid}
$last = ""
while (-not $parent.HasExited) {
  if (-not [JigShare]::IsWindow($h)) { [Console]::Out.WriteLine("gone"); [Console]::Out.Flush(); break }
  $r = New-Object JigShare+R
  if ([JigShare]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { [void][JigShare]::GetWindowRect($h, [ref]$r) }
  $line = if ([JigShare]::IsIconic($h) -or -not [JigShare]::IsWindowVisible($h)) { "hidden" } else { "$($r.L) $($r.T) $($r.Rt - $r.L) $($r.B - $r.T)" }
  if ($line -ne $last) { [Console]::Out.WriteLine($line); [Console]::Out.Flush(); $last = $line }
  Start-Sleep -Milliseconds 120
}`;
}

function frameWindow(): BrowserWindow {
  if (frame && !frame.isDestroyed()) return frame;
  frame = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  markHelperWindow(frame);
  frame.setIgnoreMouseEvents(true);
  frame.setAlwaysOnTop(true, "screen-saver");
  // Not part of what's shared: the others see the screen, not the frame.
  frame.setContentProtection(true);
  frame.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  frame.webContents.on("will-navigate", (event) => event.preventDefault());
  void frame.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(FRAME_HTML)}`);
  frame.on("closed", () => {
    frame = undefined;
  });
  return frame;
}

function place(bounds: Rectangle): void {
  const w = frameWindow();
  w.setBounds({
    x: Math.round(bounds.x - PAD),
    y: Math.round(bounds.y - PAD),
    width: Math.round(bounds.width + PAD * 2),
    height: Math.round(bounds.height + PAD * 2),
  });
  if (!w.isVisible()) w.showInactive();
}

function hide(): void {
  if (frame && !frame.isDestroyed()) frame.hide();
}

/** Frames the shared source: a screen (`display_id`) or a window (`window:<hwnd>:0`). */
export function showShareFrame(source: { id: string; display_id: string }): void {
  hideShareFrame();
  if (hiddenMode()) return;
  if (source.id.startsWith("screen:")) {
    const display =
      screen.getAllDisplays().find((d) => String(d.id) === source.display_id) ??
      (screen.getAllDisplays().length === 1 ? screen.getPrimaryDisplay() : undefined);
    // Inset by the padding, so the frame lies exactly on the screen's edges.
    const b = display?.bounds;
    if (b) place({ x: b.x + PAD, y: b.y + PAD, width: b.width - PAD * 2, height: b.height - PAD * 2 });
    return;
  }
  const hwnd = windowHandle(source.id);
  if (!hwnd) return;
  const child = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(trackerScript(hwnd, process.pid), "utf16le").toString("base64"),
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  tracker = child;
  let rest = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    if (tracker !== child) return;
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop() ?? "";
    for (const line of lines) {
      const seen = trackerLine(line);
      if (seen === "gone") hideShareFrame();
      else if (seen === "hidden") hide();
      else if (seen) place(screen.screenToDipRect(null, seen));
    }
  });
  child.on("error", () => {
    if (tracker === child) tracker = undefined;
  });
}

/** Removes the frame and stops following the window. */
export function hideShareFrame(): void {
  tracker?.kill();
  tracker = undefined;
  if (frame && !frame.isDestroyed()) frame.destroy();
  frame = undefined;
}
