import type { AddonUiContext, MenuItemInput } from "@jig/sdk";
import { cn, IconButton, SearchInput } from "@jig/sdk/ui";
import { ChevronDown, Funnel, FunnelX } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import {
  type BoardFilter,
  type Facet,
  type Facets,
  type FilterField,
  isFiltering,
  ME,
  pickedCount,
  toggle,
  UNASSIGNED,
} from "./lib/filter";

/** The pickers, in Azure DevOps' order. Iteration and area show only when the board's cards have them. */
const PICKERS: Array<{ field: FilterField; label: string; icon: string; optional?: boolean }> = [
  { field: "types", label: "Type", icon: "shapes" },
  { field: "people", label: "Assigned to", icon: "users" },
  { field: "states", label: "State", icon: "circle-dot" },
  { field: "tags", label: "Tags", icon: "tag" },
  { field: "iterations", label: "Iteration", icon: "repeat", optional: true },
  { field: "areas", label: "Area", icon: "map", optional: true },
];

/** A picker's button: its name, a chevron, and a count in a fixed slot (empty when nothing is picked). */
function PickerButton({
  label,
  count,
  disabled,
  icon,
  testId,
  onOpen,
}: {
  label: string;
  count: number;
  disabled?: boolean;
  icon?: ReactNode;
  testId: string;
  onOpen: (el: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={testId}
      aria-label={count ? `${label}: ${count} picked` : label}
      title={count ? `${label}: ${count} picked` : label}
      onClick={(e) => onOpen(e.currentTarget)}
      className={cn(
        "no-drag flex h-7 shrink-0 items-center gap-1 rounded-md pr-1 pl-2 text-sm whitespace-nowrap transition-colors",
        "hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-50",
        count ? "text-fg" : "text-muted",
      )}
    >
      {icon}
      <span>{label}</span>
      <ChevronDown className="size-3.5 text-hint" aria-hidden />
      <span
        className={cn(
          "flex h-4 w-5 items-center justify-center rounded-full text-2xs font-semibold tabular-nums",
          count ? "bg-accent-soft text-accent" : "invisible",
        )}
      >
        {count > 99 ? "99" : count}
      </span>
    </button>
  );
}

/**
 * The board's filter bar (D-304), like Azure DevOps': the search field, then a picker per field (a
 * menu with checkboxes, several at once), and Clear filters in a reserved slot. Wide: every picker
 * in the row; narrow (a sidebar): one Filter button that leads to them. Everything has a fixed place,
 * so nothing moves as filters change.
 */
export function FilterBar({
  ctx,
  filter,
  facets,
  disabled,
  me,
  searchRef,
  onText,
  onChange,
}: {
  ctx: AddonUiContext;
  filter: BoardFilter;
  facets?: Facets;
  disabled: boolean;
  /** Your e-mail (the signed-in az user), for @Me. */
  me?: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onText: (text: string) => void;
  /** Applies a change to the newest filter (menus stay open across several ticks). */
  onChange: (change: (f: BoardFilter) => BoardFilter) => void;
}) {
  const filtering = isFiltering(filter);
  const pick = (field: FilterField, value: string) =>
    onChange((f) => ({ ...f, [field]: toggle(f[field], value) }));
  const row = (field: FilterField, x: Facet, extra: Partial<MenuItemInput> = {}): MenuItemInput => ({
    label: x.label,
    keepOpen: true,
    checked: filter[field].includes(x.value),
    badge: String(x.count),
    testId: `board-filter-${field}-${x.label}`,
    onSelect: () => pick(field, x.value),
    ...extra,
  });
  const entries = (field: FilterField): Array<MenuItemInput | { separator: true }> => {
    const values = facets?.[field] ?? [];
    if (field === "people")
      return [
        {
          label: "@Me",
          keepOpen: true,
          checked: filter.people.includes(ME),
          disabled: !me,
          icon: "user",
          ...(me ? { person: { email: me } } : {}),
          testId: "board-filter-people-@Me",
          onSelect: () => pick("people", ME),
        },
        {
          label: "Unassigned",
          keepOpen: true,
          checked: filter.people.includes(UNASSIGNED),
          icon: "user-x",
          badge: String(facets?.unassigned ?? 0),
          testId: "board-filter-people-Unassigned",
          onSelect: () => pick("people", UNASSIGNED),
        },
        ...(values.length ? [{ separator: true as const }] : []),
        ...values.map((x) => row("people", x, { person: { name: x.label, email: x.email } })),
      ];
    return values.length
      ? values.map((x) => row(field, x))
      : [{ label: "None on this board", disabled: true }];
  };
  const visible = PICKERS.filter((p) => !p.optional || (facets?.[p.field].length ?? 0) > 0);
  const openPicker = (field: FilterField, el: HTMLElement) => ctx.menu(entries(field), el);
  const openAll = (el: HTMLElement) =>
    ctx.menu(
      visible.map((p) => ({
        label: p.label,
        icon: p.icon,
        badge: filter[p.field].length ? String(filter[p.field].length) : undefined,
        testId: `board-filter-menu-${p.field}`,
        onSelect: () => openPicker(p.field, el),
      })),
      el,
    );

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div className="min-w-0 @max-5xl:flex-1 @5xl:w-56 @5xl:flex-none">
        <SearchInput
          ref={searchRef}
          value={filter.text}
          disabled={disabled}
          placeholder="Filter by keyword"
          aria-label="Filter cards by id, title, tag or person"
          data-testid="board-search"
          onChange={(e) => onText(e.target.value)}
          onClear={() => onText("")}
          onKeyDown={(e) => {
            if (e.key === "Escape" && filter.text) {
              e.preventDefault();
              e.stopPropagation();
              onText("");
            }
          }}
        />
      </div>
      {/* Narrow: one Filter button with how many values are picked. */}
      <div className="shrink-0 @max-5xl:flex @5xl:hidden">
        <PickerButton
          label="Filter"
          count={pickedCount(filter)}
          disabled={disabled}
          icon={<Funnel className={cn("size-3.5", filtering ? "text-accent" : "text-hint")} aria-hidden />}
          testId="board-filter-all"
          onOpen={openAll}
        />
      </div>
      {/* Wide: the filter mark, then every picker in a row. */}
      <div className="min-w-0 items-center gap-0.5 overflow-hidden @max-5xl:hidden @5xl:flex">
        <span
          className="flex size-7 shrink-0 items-center justify-center"
          title={filtering ? "Filters are on" : "Filters"}
          data-testid="board-filtering"
          data-on={filtering ? "true" : undefined}
        >
          <Funnel className={cn("size-3.5", filtering ? "text-accent" : "text-hint")} aria-hidden />
        </span>
        {visible.map((p) => (
          <PickerButton
            key={p.field}
            label={p.label}
            count={filter[p.field].length}
            disabled={disabled}
            testId={`board-filter-${p.field}`}
            onOpen={(el) => openPicker(p.field, el)}
          />
        ))}
      </div>
      {/* Clear filters: its slot is always there, the button only while filtering. */}
      <IconButton
        icon={FunnelX}
        label="Clear filters"
        size="sm"
        disabled={!filtering}
        className={filtering ? undefined : "invisible"}
        data-testid="board-filter-clear"
        onClick={() => {
          onText("");
          onChange((f) => ({ ...f, types: [], people: [], states: [], tags: [], iterations: [], areas: [] }));
        }}
      />
    </div>
  );
}
