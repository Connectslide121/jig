import {
  type Arrangement,
  addDivider,
  arrange,
  moveKey,
  removeDivider,
  renameDivider,
  toggleHidden,
} from "@jig/sdk";
import { Eye, EyeOff, GripVertical, Minus, Pencil, SeparatorHorizontal, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn, IconButton, promptDialog } from "../ui";

const DRAG = "application/x-jig-arrange";

/**
 * A list you can arrange (for add-ons, `@jig/sdk/ui`): hide items, drag them into your order, and
 * group them with dividers. Normally it shows the visible items with their dividers; with `arranging`
 * it shows everything with a handle, an eye and divider controls. The add-on keeps the `Arrangement`
 * (e.g. in `ctx.storage`) and gets each change through `onChange`.
 */
export function ArrangeList<T>({
  items,
  keyOf,
  arrangement,
  onChange,
  arranging,
  renderItem,
  testId,
  dragType = DRAG,
  showFooter = true,
}: {
  items: T[];
  keyOf: (item: T) => string;
  arrangement: Arrangement;
  onChange: (next: Arrangement) => void;
  arranging: boolean;
  renderItem: (item: T) => ReactNode;
  testId?: string;
  /** A list inside another list's items needs its own type, so a drag only moves within its own list. */
  dragType?: string;
  /** Hide the trailing add-divider/help row in nested lists; per-row divider buttons remain. */
  showFooter?: boolean;
}) {
  const [over, setOver] = useState<string>();
  const entries = arrange(items, keyOf, arrangement, arranging);
  /** Adds a divider just above `before` (or at the end), asking for its title. */
  const insertDivider = async (before?: string) => {
    const title = await promptDialog({
      title: "Add a divider",
      placeholder: "A title, or empty for a plain line",
      confirmLabel: "Add",
      allowEmpty: true,
    });
    if (title !== undefined) onChange(addDivider(items, keyOf, arrangement, title.trim(), before));
  };
  const drop = (before: string | undefined, e: React.DragEvent) => {
    const key = e.dataTransfer.getData(dragType);
    setOver(undefined);
    if (!key || key === before) return;
    e.preventDefault();
    onChange(moveKey(items, keyOf, arrangement, key, before));
  };
  const dragProps = (key: string) =>
    arranging
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData(dragType, key);
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
          },
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(dragType)) return;
            e.preventDefault();
            setOver(key);
          },
          onDrop: (e: React.DragEvent) => drop(key, e),
        }
      : {};
  return (
    <div data-testid={testId}>
      {entries.map((entry) =>
        entry.kind === "divider" ? (
          <div
            key={entry.key}
            {...dragProps(entry.key)}
            className={cn(
              "group flex items-center gap-1.5 px-2 pt-2 pb-1",
              over === entry.key && "border-t-2 border-accent",
            )}
            data-testid="arrange-divider"
          >
            {arranging && <GripVertical className="size-3.5 shrink-0 cursor-grab text-hint" />}
            {entry.title ? (
              <span className="shrink-0 text-2xs font-semibold tracking-wide text-hint uppercase">
                {entry.title}
              </span>
            ) : null}
            <span className="h-px flex-1 bg-line" />
            {arranging && (
              <>
                <IconButton
                  icon={Pencil}
                  size="sm"
                  label="Rename the divider"
                  onClick={async () => {
                    const title = await promptDialog({
                      title: "Divider title",
                      initial: entry.title,
                      placeholder: "Empty for a plain line",
                      confirmLabel: "Save",
                      allowEmpty: true,
                    });
                    if (title !== undefined) onChange(renameDivider(arrangement, entry.key, title));
                  }}
                />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label="Remove the divider"
                  onClick={() => onChange(removeDivider(arrangement, entry.key))}
                />
              </>
            )}
          </div>
        ) : (
          <div
            key={entry.key}
            {...dragProps(entry.key)}
            className={cn(
              "flex items-center",
              arranging && entry.hidden && "opacity-50",
              over === entry.key && "border-t-2 border-accent",
            )}
            data-testid={`arrange-item-${entry.key}`}
          >
            {arranging && <GripVertical className="ml-1 size-3.5 shrink-0 cursor-grab text-hint" />}
            <div className="min-w-0 flex-1">{renderItem(entry.item)}</div>
            {arranging && (
              <IconButton
                icon={SeparatorHorizontal}
                size="sm"
                label="Add a divider above"
                data-testid={`arrange-divider-above-${entry.key}`}
                onClick={() => void insertDivider(entry.key)}
              />
            )}
            {arranging && (
              <IconButton
                icon={entry.hidden ? EyeOff : Eye}
                size="sm"
                label={entry.hidden ? "Show it" : "Hide it"}
                data-testid={`arrange-toggle-${entry.key}`}
                onClick={() => onChange(toggleHidden(arrangement, entry.key))}
              />
            )}
          </div>
        ),
      )}
      {arranging && showFooter && (
        <div
          className={cn("flex items-center gap-1 px-2 py-1", over === "" && "border-t-2 border-accent")}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(dragType)) return;
            e.preventDefault();
            setOver("");
          }}
          onDrop={(e) => drop(undefined, e)}
        >
          <button
            type="button"
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-hover hover:text-fg"
            data-testid="arrange-add-divider"
            onClick={() => void insertDivider()}
          >
            <Minus className="size-3.5" /> Add divider
          </button>
          <span className="text-2xs text-hint">
            Drag the handles to reorder; ⎯ on a row adds a divider above it.
          </span>
        </div>
      )}
    </div>
  );
}
