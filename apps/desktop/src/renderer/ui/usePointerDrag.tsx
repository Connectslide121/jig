import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/** Where the pointer is during a drag, and the element under it (the ghost never counts). */
export interface DragPoint {
  x: number;
  y: number;
  target: Element | null;
}

export interface PointerDrag<T> {
  /** Put on the draggable element's `onPointerDown`; the drag starts once the pointer moves a little. */
  start: (e: React.PointerEvent, payload: T) => void;
  /** What is being dragged, while a drag is on. */
  active: T | undefined;
  /** A small label that follows the pointer while dragging (render it anywhere; it portals to the body). */
  ghost: (children: ReactNode) => ReactNode;
}

/** Pixels the pointer moves before a press becomes a drag (so a click stays a click). */
const THRESHOLD = 4;
/** The band at a scroller's top and bottom edge that scrolls gently while dragging, and its top speed. */
const EDGE = 24;
const EDGE_SPEED = 8;

/** The ghost sits just below and right of the pointer, clear of what it points at. */
const ghostAt = (p: { x: number; y: number }) => `translate(${p.x + 14}px, ${p.y + 10}px)`;

/** Elements inside a draggable row that keep their own press (a tick, a ⋯ button, a link). */
const OWN_PRESS = "button, a, input, select, textarea, [role='checkbox'], [data-no-drag]";

/**
 * Drag to reorder with pointer events instead of HTML5 drag and drop (D-351). Chromium on Windows
 * runs a native drag in the OS's modal drag loop, which swallows the mouse wheel and the trackpad, so
 * a long list can't be scrolled while dragging; here the wheel scrolls as usual, `onMove` runs again
 * after every scroll (so the drop target follows the list), and a narrow band at the scroller's edges
 * scrolls slowly as a fallback. Escape, a lost window focus or a cancelled pointer cancel the drag; the
 * click that ends a drag never reaches the row. Use it for lists inside one view; drags between views
 * or from other apps (files, tabs) stay HTML5 drag and drop.
 */
export function usePointerDrag<T>({
  onMove,
  onDrop,
  onEnd,
  scroller,
}: {
  onMove: (at: DragPoint, payload: T) => void;
  onDrop: (at: DragPoint, payload: T) => void;
  /** After every drag, dropped or cancelled. */
  onEnd?: () => void;
  /** The list's scrolling element, for the gentle edge scroll. */
  scroller?: RefObject<HTMLElement | null>;
}): PointerDrag<T> {
  const [active, setActive] = useState<T>();
  const ghostRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  // The latest callbacks, so the window listeners of a drag in progress never call stale ones.
  const handlers = useRef({ onMove, onDrop, onEnd });
  handlers.current = { onMove, onDrop, onEnd };
  const stop = useRef<() => void>(undefined);
  useEffect(() => () => stop.current?.(), []);

  const start = (e: React.PointerEvent, payload: T) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    const own = (e.target as Element).closest(OWN_PRESS);
    if (own && own !== e.currentTarget && e.currentTarget.contains(own)) return;
    stop.current?.();
    const origin = { x: e.clientX, y: e.clientY };
    let point: DragPoint = { ...origin, target: null };
    let dragging = false;
    let frame = 0;

    const at = (x: number, y: number): DragPoint => ({ x, y, target: document.elementFromPoint(x, y) });
    const place = () => {
      pointer.current = { x: point.x, y: point.y };
      const ghost = ghostRef.current;
      if (ghost) ghost.style.transform = ghostAt(point);
    };
    const aim = () => {
      point = at(point.x, point.y);
      handlers.current.onMove(point, payload);
    };
    // The edge band: slower near its inner side, so it only nudges unless the pointer sits at the edge.
    const edge = () => {
      frame = requestAnimationFrame(edge);
      const box = scroller?.current?.getBoundingClientRect();
      if (!box || point.x < box.left || point.x > box.right) return;
      const depth =
        point.y < box.top + EDGE
          ? box.top + EDGE - point.y
          : point.y > box.bottom - EDGE
            ? box.bottom - EDGE - point.y
            : 0;
      if (!depth) return;
      const speed = Math.sign(depth) * Math.ceil((Math.min(Math.abs(depth), EDGE) / EDGE) * EDGE_SPEED);
      scroller?.current?.scrollBy({ top: -speed });
    };
    const begin = () => {
      dragging = true;
      window.getSelection()?.removeAllRanges();
      document.body.classList.add("jig-dragging");
      setActive(payload);
      if (scroller) frame = requestAnimationFrame(edge);
    };
    const move = (ev: PointerEvent) => {
      point = { x: ev.clientX, y: ev.clientY, target: null };
      if (!dragging) {
        if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < THRESHOLD) return;
        pointer.current = { x: point.x, y: point.y };
        begin();
      }
      ev.preventDefault();
      place();
      aim();
    };
    const finish = (drop: boolean) => {
      cleanup();
      if (!dragging) return;
      if (drop) {
        // The click that follows the release would open the row under the pointer: swallow it once.
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
        handlers.current.onDrop(at(point.x, point.y), payload);
      }
      handlers.current.onEnd?.();
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !dragging) return;
      ev.preventDefault();
      ev.stopPropagation();
      cancel();
    };
    const scrolled = () => {
      if (dragging) aim();
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, { capture: true });
      document.removeEventListener("scroll", scrolled, { capture: true });
      document.body.classList.remove("jig-dragging");
      stop.current = undefined;
      setActive(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, { capture: true });
    // Scroll events don't bubble; capturing on the document hears every scroller, the wheel's included.
    document.addEventListener("scroll", scrolled, { capture: true, passive: true });
    stop.current = cleanup;
  };

  const ghost = (children: ReactNode) =>
    active === undefined
      ? null
      : createPortal(
          <div
            ref={ghostRef}
            aria-hidden
            data-testid="drag-ghost"
            style={{ transform: ghostAt(pointer.current) }}
            className={cn(
              "pointer-events-none fixed top-0 left-0 z-50 max-w-64 truncate rounded-md border border-line",
              "bg-elevated px-2 py-1 text-xs font-medium text-fg shadow-popover",
            )}
          >
            {children}
          </div>,
          document.body,
        );

  return { start, active, ghost };
}
