import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { Kbd } from "./Card";
import { cn } from "./cn";

/**
 * Menus are how every feature is reached (principle 4). One menu is open at a time; open it with
 * `openMenu(entries, position)` (or `MenuButton`, or `onContextMenu={contextMenu(entries)}`).
 * `MenuHost` is mounted once at the root.
 */
export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  onSelect?: () => void;
  submenu?: MenuEntry[];
  /** Used by tests (`data-testid`). */
  testId?: string;
}
export type MenuEntry = MenuItem | { separator: true } | { heading: string };

export interface MenuPosition {
  x: number;
  y: number;
  /** Align the menu's right edge to `x` (for buttons on the right of the window). */
  alignRight?: boolean;
  /** A submenu: its parent's left edge, where it opens instead when there's no room on the right. */
  parentLeft?: number;
}

interface MenuState {
  open: { entries: MenuEntry[]; position: MenuPosition; minWidth?: number; menuBar?: string } | undefined;
}
const useMenu = create<MenuState>(() => ({ open: undefined }));

export function openMenu(
  entries: MenuEntry[],
  position: MenuPosition,
  minWidth?: number,
  menuBar?: string,
): void {
  useMenu.setState({ open: { entries, position, minWidth, menuBar } });
}
export function closeMenu(): void {
  useMenu.setState({ open: undefined });
}

/** Opens a menu below (or at the right edge of) an element. */
export function openMenuAt(
  element: HTMLElement,
  entries: MenuEntry[],
  alignRight = false,
  menuBar?: string,
): void {
  const rect = element.getBoundingClientRect();
  openMenu(
    entries,
    { x: alignRight ? rect.right : rect.left, y: rect.bottom + 4, alignRight },
    rect.width,
    menuBar,
  );
}

/** Switch only within an already-open menu bar; hovering alone never opens a menu. */
export function switchMenuAt(
  element: HTMLElement,
  entries: MenuEntry[],
  menuBar: string,
  alignRight = false,
): void {
  if (useMenu.getState().open?.menuBar === menuBar) openMenuAt(element, entries, alignRight, menuBar);
}

/** `onContextMenu={contextMenu(() => entries)}` */
export function contextMenu(entries: MenuEntry[] | (() => MenuEntry[])) {
  return (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu(typeof entries === "function" ? entries() : entries, { x: event.clientX, y: event.clientY });
  };
}

const isItem = (e: MenuEntry): e is MenuItem => "label" in e;

function MenuList({
  entries,
  position,
  minWidth,
  depth,
  onClose,
}: {
  entries: MenuEntry[];
  position: MenuPosition;
  minWidth?: number;
  depth: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; position: MenuPosition } | undefined>();
  const items = entries.map((e, i) => ({ e, i })).filter(({ e }) => isItem(e) && !e.disabled);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let left = position.alignRight ? position.x - width : position.x;
    let top = position.y;
    // A submenu without room on the right opens on its parent's left, never over the parent.
    if (position.parentLeft !== undefined && left + width > window.innerWidth - 4)
      left = position.parentLeft - width + 2;
    if (left + width > window.innerWidth - 4) left = Math.max(4, window.innerWidth - width - 4);
    if (top + height > window.innerHeight - 4) top = Math.max(4, window.innerHeight - height - 4);
    setPlace({ left: Math.max(4, left), top });
  }, [position]);

  useEffect(() => {
    if (depth === 0) ref.current?.focus();
  }, [depth]);

  const openSub = (index: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const parent = ref.current?.getBoundingClientRect();
    setSub({
      index,
      position: { x: rect.right - 2, y: rect.top - 4, parentLeft: parent?.left ?? rect.left },
    });
  };

  const select = (entry: MenuItem, el: HTMLElement | null, index: number) => {
    if (entry.disabled) return;
    if (entry.submenu) {
      if (el) openSub(index, el);
      return;
    }
    onClose();
    entry.onSelect?.();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (sub) return;
    const pos = items.findIndex(({ i }) => i === active);
    if (event.key === "ArrowDown") setActive(items[(pos + 1) % items.length]?.i ?? -1);
    else if (event.key === "ArrowUp") setActive(items[(pos - 1 + items.length) % items.length]?.i ?? -1);
    else if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
      const entry = entries[active];
      if (entry && isItem(entry) && (event.key !== "ArrowRight" || entry.submenu))
        select(entry, ref.current?.querySelector(`[data-index="${active}"]`) ?? null, active);
    } else if (event.key === "Escape" || (event.key === "ArrowLeft" && depth > 0)) onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const subEntry = sub ? entries[sub.index] : undefined;
  return (
    <>
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ left: place.left, top: place.top, minWidth: Math.max(minWidth ?? 0, 180) }}
        className="no-drag fixed z-50 max-h-[var(--jig-menu-max-h)] max-w-sm overflow-y-auto rounded-lg border border-line bg-elevated p-1 text-sm text-fg shadow-popover outline-none"
      >
        {entries.map((entry, index) => {
          if ("separator" in entry) return <div key={index} className="my-1 h-px bg-line" />;
          if ("heading" in entry)
            return (
              <div
                key={index}
                className="px-2 pt-1.5 pb-1 text-2xs font-semibold tracking-wide text-hint uppercase"
              >
                {entry.heading}
              </div>
            );
          const Icon = entry.icon;
          return (
            <div
              key={index}
              role="menuitem"
              tabIndex={-1}
              data-index={index}
              data-testid={entry.testId}
              aria-disabled={entry.disabled}
              onMouseEnter={(e) => {
                setActive(index);
                if (entry.submenu) openSub(index, e.currentTarget);
                else setSub(undefined);
              }}
              onClick={(e) => select(entry, e.currentTarget, index)}
              className={cn(
                "flex h-7 cursor-default items-center gap-2 rounded-md px-2",
                active === index && !entry.disabled && "bg-accent-soft ring-1 ring-inset ring-accent/60",
                entry.disabled && "opacity-50",
                entry.danger && "text-danger",
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-muted">
                {entry.checked ? (
                  <Check className="size-3.5 text-accent" />
                ) : Icon ? (
                  <Icon className="size-4" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.shortcut && <Kbd>{entry.shortcut}</Kbd>}
              {entry.submenu && <ChevronRight className="size-3.5 text-muted" />}
            </div>
          );
        })}
      </div>
      {sub && subEntry && isItem(subEntry) && subEntry.submenu && (
        <MenuList
          entries={subEntry.submenu}
          position={sub.position}
          depth={depth + 1}
          onClose={() => {
            setSub(undefined);
            onClose();
          }}
        />
      )}
    </>
  );
}

/** Mount once at the root. */
export function MenuHost() {
  const open = useMenu((s) => s.open);
  useEffect(() => {
    if (!open) return;
    const close = () => closeMenu();
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest?.("[role=menu]")) closeMenu();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <MenuList
      key={JSON.stringify(open.position)}
      entries={open.entries}
      position={open.position}
      minWidth={open.minWidth}
      depth={0}
      onClose={closeMenu}
    />,
    document.body,
  );
}

/** A button that opens a menu below itself. */
export function MenuButton({
  entries,
  children,
  alignRight,
  className,
  label,
  testId,
}: {
  entries: MenuEntry[] | (() => MenuEntry[]);
  children: ReactNode;
  alignRight?: boolean;
  className?: string;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn("no-drag", className)}
      onClick={(event) =>
        openMenuAt(event.currentTarget, typeof entries === "function" ? entries() : entries, alignRight)
      }
    >
      {children}
    </button>
  );
}
