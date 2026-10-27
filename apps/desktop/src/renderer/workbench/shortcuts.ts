/** Keyboard shortcuts: `Mod+Shift+K` style strings; Mod = Cmd on macOS, Ctrl elsewhere. */
export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const normalizeKey = (key: string) => (key.length === 1 ? key.toUpperCase() : key);

export function matchesShortcut(shortcut: string, event: KeyEventLike, mac = isMac): boolean {
  const parts = shortcut.split("+");
  const key = parts.pop()!;
  const want = { mod: false, ctrl: false, shift: false, alt: false };
  for (const p of parts) want[p.toLowerCase() as keyof typeof want] = true;
  const ctrl = want.ctrl || (want.mod && !mac);
  const meta = want.mod && mac;
  return (
    event.ctrlKey === ctrl &&
    event.metaKey === meta &&
    event.shiftKey === want.shift &&
    event.altKey === want.alt &&
    normalizeKey(event.key) === normalizeKey(key === "Plus" ? "+" : key)
  );
}

/** Human-readable form for menus: `Ctrl+Shift+K` or `⌘⇧K`. */
export function formatShortcut(shortcut: string, mac = isMac): string {
  const parts = shortcut.split("+");
  const key = parts.pop()!;
  const names: Record<string, [string, string]> = {
    mod: ["Ctrl", "⌘"],
    ctrl: ["Ctrl", "⌃"],
    shift: ["Shift", "⇧"],
    alt: ["Alt", "⌥"],
  };
  const mods = parts.map((p) => names[p.toLowerCase()]?.[mac ? 1 : 0] ?? p);
  const k = key === "Plus" ? "+" : key.length === 1 ? key.toUpperCase() : key;
  return mac ? [...mods, k].join("") : [...mods, k].join("+");
}
