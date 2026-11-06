import { cn } from "@/lib/utils";
import { Link } from "../router";
import type { DemoConfig } from "../types";
import { Mark, navRoutes, Screen, useCurrentRoute } from "./common";

/** A marketing site: a header with the pages, the page, a footer. */
export function LandingShell({ demo }: { demo: DemoConfig }) {
  const current = useCurrentRoute(demo);
  const routes = navRoutes(demo);
  return (
    <div className="@container/shell min-h-0 flex-1 overflow-y-auto" data-kit="main">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Mark demo={demo} />
            <span className="font-display text-lg font-semibold">{demo.name}</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 @2xl/shell:flex" aria-label="Main">
            {routes.map((r) => (
              <Link
                key={r.path}
                to={r.path}
                aria-current={r.path === current.path ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground",
                  r.path === current.path && "text-foreground",
                )}
              >
                {r.title}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <Screen route={current} />
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-sm text-muted-foreground">
          <span className="font-display font-semibold text-foreground">{demo.name}</span>
          {demo.tagline && <span>{demo.tagline}</span>}
          <span className="ml-auto">Prototype with sample data</span>
        </div>
      </footer>
    </div>
  );
}
