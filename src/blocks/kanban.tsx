import { MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type Tone, toneDot } from "./status";

export interface KanbanColumn {
  id: string;
  title: string;
  tone: Tone;
  /** Work-in-progress limit, shown beside the count. */
  limit?: number;
}

export interface KanbanCard {
  id: string;
  column: string;
  title: string;
  /** One quiet line: a customer, a place. */
  detail?: string;
  /** A short tag at the bottom left (a type, a priority). */
  tag?: { label: string; tone: Tone };
  /** The right edge of the bottom row: a date or an amount. */
  meta?: string;
  assignee?: { name: string; initials: string };
}

/**
 * A board: columns of cards. A card opens on click; "Move to" in its menu changes its column (no
 * dragging to get wrong in a demo). Columns scroll sideways inside the board on narrow screens.
 */
export function Kanban({
  columns,
  cards,
  onCardClick,
  onMove,
  demo,
}: {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  onCardClick?: (card: KanbanCard) => void;
  onMove?: (card: KanbanCard, column: string) => void;
  demo?: string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 @3xl:mx-0 @3xl:px-0" data-demo={demo}>
      <div className="grid auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3">
        {columns.map((col) => {
          const list = cards.filter((c) => c.column === col.id);
          const over = col.limit !== undefined && list.length > col.limit;
          return (
            <section key={col.id} className="flex min-h-96 flex-col rounded-xl bg-muted/60 p-2" aria-label={col.title}>
              <header className="flex h-9 items-center gap-2 px-2">
                <span className={cn("size-2 rounded-full", toneDot(col.tone))} aria-hidden />
                <h3 className="flex-1 truncate text-sm font-semibold">{col.title}</h3>
                <span className={cn("text-xs text-muted-foreground tabular-nums", over && "font-semibold text-destructive")}>
                  {list.length}
                  {col.limit !== undefined && ` / ${col.limit}`}
                </span>
              </header>
              <ol className="flex flex-col gap-2">
                {list.map((card) => (
                  <li key={card.id} className="group relative">
                    <button
                      type="button"
                      data-demo={`card-${card.id}`}
                      onClick={() => onCardClick?.(card)}
                      className="flex h-28 w-full flex-col rounded-lg border bg-card p-3 text-left shadow-card transition-shadow hover:border-ring/40 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <p className="line-clamp-2 pr-7 text-sm font-medium">{card.title}</p>
                      {card.detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.detail}</p>}
                      <div className="mt-auto flex items-center gap-2">
                        {card.tag && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span className={cn("size-1.5 rounded-full", toneDot(card.tag.tone))} aria-hidden />
                            {card.tag.label}
                          </span>
                        )}
                        <span className="flex-1" />
                        {card.meta && <span className="text-xs text-muted-foreground tabular-nums">{card.meta}</span>}
                        {card.assignee && (
                          <Avatar className="size-6">
                            <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{card.assignee.initials}</AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    </button>
                    {onMove && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Move ${card.title}`}
                            className="absolute top-2 right-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {columns
                            .filter((c) => c.id !== card.column)
                            .map((c) => (
                              <DropdownMenuItem key={c.id} onSelect={() => onMove(card, c.id)}>
                                <span className={cn("size-2 rounded-full", toneDot(c.tone))} aria-hidden />
                                {c.title}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                ))}
                {list.length === 0 && (
                  <li className="flex h-28 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">Nothing here</li>
                )}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
