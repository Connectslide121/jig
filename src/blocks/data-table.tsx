import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, ListFilter, SearchX } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // biome-ignore lint/correctness/noUnusedVariables: matches TanStack's declaration
  interface ColumnMeta<TData, TValue> {
    /** Numbers, money and times: right. Status: right, at the row's edge. */
    align?: "left" | "right";
    /** A fixed width class for the column ("w-32"), so columns don't move as rows change. */
    width?: string;
    /** Hidden below this container width. */
    hideBelow?: "md" | "xl" | "3xl";
  }
}

export interface Facet {
  column: string;
  label: string;
  options: { value: string; label: string }[];
}

const HIDE = { md: "@max-md:hidden", xl: "@max-xl:hidden", "3xl": "@max-3xl:hidden" } as const;

/**
 * A data table: search, faceted filters, sorting, pagination, whole-row click. Rows have a fixed
 * height and columns fixed widths; loading shows skeleton rows in the same space.
 */
export function DataTable<T>({
  data,
  columns,
  search,
  facets = [],
  onRowClick,
  pageSize = 10,
  loading,
  actions,
  empty,
  getRowId,
  initialSort,
  demo,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  search?: { placeholder: string; fields: (keyof T & string)[] };
  facets?: Facet[];
  onRowClick?: (row: T) => void;
  pageSize?: number;
  loading?: boolean;
  actions?: React.ReactNode;
  /** Shown when there are no rows at all (not when a filter hides them). */
  empty?: React.ReactNode;
  getRowId?: (row: T) => string;
  initialSort?: SortingState;
  demo?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  const [query, setQuery] = useState("");
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters: filters, globalFilter: query },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    onGlobalFilterChange: setQuery,
    globalFilterFn: (row, _id, value: string) => {
      const q = value.trim().toLowerCase();
      if (!q || !search) return true;
      return search.fields.some((f) => String(row.original[f] ?? "").toLowerCase().includes(q));
    },
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const visibleColumns = table.getVisibleLeafColumns();

  const facetValues = (column: string) => (table.getColumn(column)?.getFilterValue() as string[] | undefined) ?? [];
  const setFacet = (column: string, value: string, on: boolean) => {
    const next = on ? [...facetValues(column), value] : facetValues(column).filter((v) => v !== value);
    table.getColumn(column)?.setFilterValue(next.length ? next : undefined);
    table.setPageIndex(0);
  };

  return (
    <div className="@container flex flex-col gap-3" data-demo={demo}>
      {(search || facets.length > 0 || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                table.setPageIndex(0);
              }}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              className="h-9 w-full @xl:w-64"
            />
          )}
          {facets.map((f) => {
            const chosen = facetValues(f.column);
            return (
              <DropdownMenu key={f.column}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 border-dashed">
                    <ListFilter /> {f.label}
                    {chosen.length > 0 && (
                      <span className="rounded-sm bg-primary/10 px-1.5 text-xs font-semibold text-primary tabular-nums">{chosen.length}</span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel>{f.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {f.options.map((o) => (
                    <DropdownMenuCheckboxItem
                      key={o.value}
                      checked={chosen.includes(o.value)}
                      onCheckedChange={(on) => setFacet(f.column, o.value, on === true)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {o.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
          <div className="flex-1" />
          {actions}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  const sorted = h.column.getIsSorted();
                  return (
                    <TableHead
                      key={h.id}
                      className={cn(
                        "h-10 bg-muted/40 text-xs font-medium text-muted-foreground first:pl-4 last:pr-4",
                        meta?.align === "right" && "text-right",
                        meta?.width,
                        meta?.hideBelow && HIDE[meta.hideBelow],
                      )}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn("inline-flex items-center gap-1 hover:text-foreground", meta?.align === "right" && "flex-row-reverse")}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 6) }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders
                <TableRow key={i} className="h-13">
                  {visibleColumns.map((c) => (
                    <TableCell key={c.id} className={cn("first:pl-4 last:pr-4", c.columnDef.meta?.hideBelow && HIDE[c.columnDef.meta.hideBelow])}>
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length} className="h-64 p-0">
                  {data.length === 0 && empty ? (
                    empty
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <SearchX className="size-5" />
                      Nothing matches these filters.
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setQuery("");
                          setFilters([]);
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn("h-13", onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "truncate first:pl-4 last:pr-4",
                          meta?.align === "right" && "text-right tabular-nums",
                          meta?.hideBelow && HIDE[meta.hideBelow],
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex h-12 items-center gap-2 border-t px-4 text-sm text-muted-foreground">
          <span className="flex-1 tabular-nums">{loading ? "" : total === 0 ? "No rows" : `${from}–${to} of ${total}`}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The filter function for a faceted column (`filterFn: facetFilter`): its value is one of the chosen ones. */
// biome-ignore lint/suspicious/noExplicitAny: shared by every row type
export const facetFilter: FilterFn<any> = (row, id, chosen: string[] | undefined) => !chosen?.length || chosen.includes(String(row.getValue(id)));
