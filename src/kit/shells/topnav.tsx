import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Link } from "../router";
import type { DemoConfig } from "../types";
import { Mark, navRoutes, Screen, UserAvatar, useCurrentRoute } from "./common";

/** A product app with its navigation across the top (a menu below 768 px of width). */
export function TopNavShell({ demo }: { demo: DemoConfig }) {
  const current = useCurrentRoute(demo);
  const [open, setOpen] = useState(false);
  const routes = navRoutes(demo);
  return (
    <div className="@container/shell flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b bg-card px-4 @3xl/shell:px-6">
        <div className="flex items-center gap-2.5">
          <Mark demo={demo} />
          <span className="font-display text-base font-semibold whitespace-nowrap">{demo.name}</span>
        </div>
        <nav className="hidden h-full items-stretch gap-1 @3xl/shell:flex" aria-label="Main">
          {routes.map((r) => (
            <Link
              key={r.path}
              to={r.path}
              aria-current={r.path === current.path ? "page" : undefined}
              className={cn(
                "flex items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                r.path === current.path && "border-primary text-foreground",
              )}
            >
              {r.title}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        {demo.shellExtras}
        <UserAvatar demo={demo} />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open the menu" className="@3xl/shell:hidden">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="font-display">{demo.name}</SheetTitle>
              <SheetDescription className="sr-only">Navigation</SheetDescription>
            </SheetHeader>
            <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
              {routes.map((r) => (
                <Link
                  key={r.path}
                  to={r.path}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-10 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted",
                    r.path === current.path && "bg-muted",
                  )}
                >
                  {r.title}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto" data-kit="main">
        <Screen route={current} />
      </main>
    </div>
  );
}
