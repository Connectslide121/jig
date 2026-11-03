import type { ReactNode } from "react";
import {
  DEFAULT_SIZES,
  type MeetingLayout,
  type MeetingPanelId,
  type MeetingSizeKey,
  type MeetingSlot,
  panelsIn,
  sizeOf,
} from "../../../shared/meetingLayout";
import { cn, type ResizeEdge, ResizeHandle } from "../../ui";

/**
 * A box with a remembered width (side edges) or height (top/bottom) and a drag handle on one edge.
 * It shrinks when the window is smaller than when the size was set, so it never runs past the room
 * (under the status bar).
 */
export function SizedBox({
  layout,
  sizeKey,
  edge,
  min,
  onResize,
  className,
  label,
  children,
}: {
  layout: MeetingLayout;
  sizeKey: MeetingSizeKey;
  edge: ResizeEdge;
  min: number;
  onResize(key: MeetingSizeKey, size: number): void;
  className?: string;
  label: string;
  children: ReactNode;
}) {
  const size = sizeOf(layout, sizeKey);
  const horizontal = edge === "left" || edge === "right";
  return (
    <div
      className={cn("relative flex min-h-0 min-w-0 shrink", className)}
      style={horizontal ? { width: size } : { height: size }}
    >
      {children}
      <ResizeHandle
        edge={edge}
        size={size}
        min={min}
        max={() => (horizontal ? window.innerWidth * 0.6 : window.innerHeight * 0.7)}
        label={label}
        onResize={(next) => onResize(sizeKey, next)}
        onReset={() => onResize(sizeKey, DEFAULT_SIZES[sizeKey])}
      />
    </div>
  );
}

/**
 * One of the room's slots. Empty, it isn't rendered at all; with several panels, each but the last
 * gets a remembered share and a handle, the last one the rest.
 */
export function Slot({
  slot,
  layout,
  onResize,
  render,
}: {
  slot: MeetingSlot;
  layout: MeetingLayout;
  onResize(key: MeetingSizeKey, size: number): void;
  render(id: MeetingPanelId): ReactNode;
}) {
  const panels = panelsIn(layout, slot);
  if (!panels.length) return null;
  const across = slot === "bottom";
  const edge: ResizeEdge = slot === "left" ? "right" : slot === "right" ? "left" : "top";
  const splits: MeetingSizeKey[] = [`${slot}.split`, `${slot}.split2`, `${slot}.split3`];
  return (
    <SizedBox
      layout={layout}
      sizeKey={slot}
      edge={edge}
      min={across ? 140 : 260}
      onResize={onResize}
      label={`Resize the ${slot} panels`}
      className={cn(
        "bg-surface",
        slot === "left" && "border-r border-line",
        slot === "right" && "border-l border-line",
        slot === "bottom" && "border-t border-line",
      )}
    >
      <div className={cn("flex size-full min-h-0 min-w-0", !across && "flex-col")}>
        {panels.map((id, index) =>
          index === panels.length - 1 ? (
            // The last panel keeps at least the splits' minimum; the ones above it shrink first.
            <div key={id} className={cn("flex flex-1", across ? "min-h-0 min-w-60" : "min-h-30 min-w-0")}>
              {render(id)}
            </div>
          ) : (
            <SizedBox
              key={id}
              layout={layout}
              sizeKey={splits[index]!}
              edge={across ? "right" : "bottom"}
              min={across ? 240 : 120}
              onResize={onResize}
              label={`Resize ${id}`}
              className={across ? "border-r border-line" : "border-b border-line"}
            >
              {render(id)}
            </SizedBox>
          ),
        )}
      </div>
    </SizedBox>
  );
}
