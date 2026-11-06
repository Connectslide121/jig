import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useRoute } from "../router";
import type { DemoConfig, DemoRoute } from "../types";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** The product's mark: its logo component, else a lettermark in the primary colour. */
export function Mark({ demo, className }: { demo: DemoConfig; className?: string }) {
  const Logo = demo.logo;
  if (Logo) return <Logo className={cn("size-8 shrink-0", className)} />;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground",
        className,
      )}
    >
      {initials(demo.name).slice(0, 1)}
    </span>
  );
}

export function navRoutes(demo: DemoConfig) {
  return demo.routes.filter((r) => r.nav !== false);
}

/** The route for the current hash; unknown paths show the first route. */
export function useCurrentRoute(demo: DemoConfig): DemoRoute {
  const path = useRoute();
  const first = demo.routes[0];
  if (!first) throw new Error("A demo needs at least one route");
  return demo.routes.find((r) => r.path === path) ?? first;
}

export function UserAvatar({ demo, className }: { demo: DemoConfig; className?: string }) {
  if (!demo.user) return null;
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials(demo.user.name)}</AvatarFallback>
    </Avatar>
  );
}

export function Screen({ route }: { route: DemoRoute }) {
  const El = route.element;
  return <El />;
}
