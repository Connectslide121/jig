import { Menu } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link } from "../router";
import type { DemoConfig, DemoRoute } from "../types";
import { useWidth } from "../useWidth";
import { Mark, navRoutes, Screen, UserAvatar, useCurrentRoute } from "./common";

function groups(routes: DemoRoute[]) {
  const out: { label?: string; routes: DemoRoute[] }[] = [];
  for (const r of routes) {
    const last = out[out.length - 1];
    if (last && last.label === r.group) last.routes.push(r);
    else out.push({ label: r.group, routes: [r] });
  }
  return out;
}

function NavList({
  demo,
  current,
  rail,
  tips,
  onPick,
}: { demo: DemoConfig; current: DemoRoute; rail?: boolean; tips?: boolean; onPick?: () => void }) {
  return (
    <nav className="flex flex-col gap-4" aria-label="Main">
      {groups(navRoutes(demo)).map((g) => (
        <div key={g.label ?? "main"} className="flex flex-col gap-0.5">
          {g.label && (
            <p className={cn("px-3 pb-1 text-xs font-medium text-muted-foreground", rail && "@max-5xl/shell:sr-only")}>{g.label}</p>
          )}
          {g.routes.map((r) => {
            const Icon = r.icon;
            const active = r.path === current.path;
            const item = (
              <Link
                to={r.path}
                onClick={onPick}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  active && "bg-sidebar-accent text-sidebar-foreground",
                  rail && "@max-5xl/shell:justify-center @max-5xl/shell:px-0",
                )}
              >
                {Icon && <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "opacity-70")} aria-hidden />}
                <span className={cn("flex-1 truncate", rail && "@max-5xl/shell:sr-only")}>{r.title}</span>
                {r.badge !== undefined && (
                  <span
                    className={cn(
                      "min-w-5 rounded-full bg-primary/10 px-1.5 text-center text-xs font-semibold text-primary tabular-nums",
                      rail && "@max-5xl/shell:hidden",
                    )}
                  >
                    {r.badge}
                  </span>
                )}
              </Link>
            );
            return tips ? (
              <Tooltip key={r.path}>
                <TooltipTrigger asChild>{item}</TooltipTrigger>
                <TooltipContent side="right">
                  {r.title}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div key={r.path}>{item}</div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** A product app: sidebar (full from 1024 px of shell width, icons from 768, a menu below). */
export function SidebarShell({ demo }: { demo: DemoConfig }) {
  const current = useCurrentRoute(demo);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const width = useWidth(root);
  return (
    <div ref={root} className="@container/shell flex min-h-0 flex-1">
      <aside className="hidden w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar @3xl/shell:flex @5xl/shell:w-60">
        <div className="flex h-14 items-center gap-2.5 px-4 @max-5xl/shell:justify-center @max-5xl/shell:px-0">
          <Mark demo={demo} />
          <span className="truncate font-display text-base font-semibold @max-5xl/shell:sr-only">{demo.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList demo={demo} current={current} rail tips={width >= 768 && width < 1024} />
        </div>
        {demo.user && (
          <div className="flex items-center gap-3 border-t border-sidebar-border p-3 @max-5xl/shell:justify-center">
            <UserAvatar demo={demo} />
            <div className="min-w-0 @max-5xl/shell:sr-only">
              <p className="truncate text-sm font-medium">{demo.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{demo.user.role}</p>
            </div>
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 @3xl/shell:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open the menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetHeader className="flex-row items-center gap-2.5 border-b border-sidebar-border">
                <Mark demo={demo} />
                <SheetTitle className="font-display">{demo.name}</SheetTitle>
                <SheetDescription className="sr-only">Navigation</SheetDescription>
              </SheetHeader>
              <div className="px-3">
                <NavList demo={demo} current={current} onPick={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Mark demo={demo} className="size-7" />
          <span className="flex-1 truncate font-display font-semibold">{current.title}</span>
          {demo.shellExtras}
          <UserAvatar demo={demo} />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto" data-kit="main">
          <Screen route={current} />
        </main>
      </div>
    </div>
  );
}
