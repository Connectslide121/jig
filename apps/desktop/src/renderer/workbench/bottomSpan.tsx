import { BOTTOM_SPANS, type BottomSpan, bottomUnder } from "../../shared/layout";
import { cn, type MenuEntry } from "../ui";
import { useWorkbench, workbench } from "./store";

/** How far the bottom panel reaches (D-375): a short name, and the full one for tooltips and menus. */
export const BOTTOM_SPAN_LABELS: Record<BottomSpan, { short: string; label: string }> = {
  center: { short: "Centre", label: "Centre only: both sidebars full height" },
  left: { short: "Left", label: "Also under the left sidebar" },
  right: { short: "Right", label: "Also under the right sidebar" },
  full: { short: "Full", label: "Full window width" },
};

/**
 * A small picture of the window for one option: the sidebars as lines, the bottom panel filled. Drawn
 * in the text colour, like a Lucide icon, at the same stroke width.
 */
export function BottomSpanIcon({ span, className }: { span: BottomSpan; className?: string }) {
  const left = bottomUnder(span, "left");
  const right = bottomUnder(span, "right");
  return (
    <svg
      viewBox="0 0 20 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden
      className={cn("h-4 w-5 shrink-0", className)}
    >
      <rect
        x={left ? 1.75 : 6.5}
        y={10}
        width={(right ? 18.25 : 13.5) - (left ? 1.75 : 6.5)}
        height={4.25}
        fill="currentColor"
        stroke="none"
        opacity={0.45}
      />
      <rect x={1} y={1} width={18} height={14} rx={2.5} />
      <path d={`M6.5 1V${left ? 10 : 15}`} />
      <path d={`M13.5 1V${right ? 10 : 15}`} />
      <path d={`M${left ? 1 : 6.5} 10H${right ? 19 : 13.5}`} />
    </svg>
  );
}

/** The quick choice in the bottom panel's ⋯ menu: the four shapes, the current one marked. */
export function bottomSpanMenuEntry(): MenuEntry {
  const current = useWorkbench.getState().layout?.bottomSpan;
  return {
    label: "Panel width",
    choices: BOTTOM_SPANS.map((span) => ({
      label: BOTTOM_SPAN_LABELS[span].label,
      icon: <BottomSpanIcon span={span} />,
      selected: span === current,
      onSelect: () => workbench.setBottomSpan(span),
      testId: `bottom-span-${span}`,
    })),
  };
}
