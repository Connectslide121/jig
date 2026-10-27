import { Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { cn, Kbd } from "../ui";
import { type ActionDef, useRegistry } from "./registry";
import { formatShortcut } from "./shortcuts";

/**
 * The Tools menu: every core and add-on action, grouped and searchable. It is a menu you can see and
 * click, not a command line — typing only filters what is already listed (principle 4).
 */
const useToolsMenu = create<{ at: { x: number; y: number } | undefined }>(() => ({ at: undefined }));

export function openToolsMenu(anchor?: HTMLElement): void {
  const rect = anchor?.getBoundingClientRect();
  useToolsMenu.setState({
    at: rect ? { x: rect.left, y: rect.bottom + 4 } : { x: window.innerWidth / 2 - 220, y: 48 },
  });
}
export const closeToolsMenu = () => useToolsMenu.setState({ at: undefined });

/** Pure: filters and groups actions for the menu. Every word of the query must match. */
export function filterActions(
  actions: ActionDef[],
  query: string,
): Array<{ group: string; actions: ActionDef[] }> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = actions.filter((a) => a.visible?.() !== false);
  const matches = visible.filter((a) => {
    const text = [a.title, a.group, ...(a.keywords ?? [])].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const groups = new Map<string, ActionDef[]>();
  for (const action of matches) groups.set(action.group, [...(groups.get(action.group) ?? []), action]);
  const order = ["Build", "Sessions", "Projects", "Terminals", "Git", "Layout", "Appearance", "Jig"];
  const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([group, list]) => ({ group, actions: list.sort((a, b) => a.title.localeCompare(b.title)) }));
}

export function ToolsMenuHost() {
  const at = useToolsMenu((s) => s.at);
  const actions = useRegistry((s) => s.actions);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: 0, top: 0 });

  const groups = useMemo(() => filterActions(Object.values(actions), query), [actions, query]);
  const flat = groups.flatMap((g) => g.actions);

  useEffect(() => {
    if (!at) return;
    setQuery("");
    setIndex(0);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeToolsMenu();
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [at]);

  useLayoutEffect(() => {
    if (!at || !ref.current) return;
    const { width } = ref.current.getBoundingClientRect();
    setPlace({ left: Math.max(4, Math.min(at.x, window.innerWidth - width - 4)), top: at.y });
  }, [at]);

  if (!at) return null;
  const run = (action: ActionDef | undefined) => {
    if (!action) return;
    closeToolsMenu();
    void action.run();
  };
  let n = -1;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      data-testid="tools-menu"
      style={{ left: place.left, top: place.top }}
      className="no-drag fixed z-50 flex max-h-[var(--jig-menu-max-h)] w-md flex-col rounded-lg border border-line bg-elevated text-sm text-fg shadow-popover"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") setIndex((i) => Math.min(flat.length - 1, i + 1));
        else if (e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
        else if (e.key === "Enter") run(flat[index]);
        else if (e.key === "Escape") closeToolsMenu();
        else return;
        e.preventDefault();
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Search className="size-4 text-hint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          placeholder="Filter tools…"
          data-testid="tools-filter"
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-hint"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {flat.length === 0 && (
          <div className="px-3 py-4 text-center text-muted">Nothing matches “{query}”.</div>
        )}
        {groups.map((group) => (
          <div key={group.group}>
            <div className="px-2 pt-2 pb-1 text-2xs font-semibold tracking-wide text-hint uppercase">
              {group.group}
            </div>
            {group.actions.map((action) => {
              n++;
              const i = n;
              const Icon = action.icon;
              return (
                <div
                  key={action.id}
                  role="menuitem"
                  tabIndex={-1}
                  data-testid={`tool-${action.id}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(action)}
                  className={cn(
                    "flex h-7 cursor-default items-center gap-2 rounded-md px-2",
                    i === index && "bg-hover",
                  )}
                >
                  <span className="flex size-4 items-center justify-center text-muted">
                    {Icon && <Icon className="size-4" />}
                  </span>
                  <span className="flex-1 truncate">{action.title}</span>
                  {action.shortcut && <Kbd>{formatShortcut(action.shortcut)}</Kbd>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
