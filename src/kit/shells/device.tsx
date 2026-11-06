import { type ReactNode, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Link } from "../router";
import type { DemoConfig } from "../types";
import { Mark, navRoutes, Screen, UserAvatar, useCurrentRoute } from "./common";
import { SidebarShell } from "./sidebar";

const DEVICES = {
  phone: { width: 390, height: 844, radius: "rounded-[3rem]", bezel: "border-[10px]" },
  tablet: { width: 834, height: 1112, radius: "rounded-[2.25rem]", bezel: "border-[14px]" },
} as const;

/** The scale that fits the device in the space beside it (never above 1). */
function useFit(device: keyof typeof DEVICES) {
  const { width, height } = DEVICES[device];
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      const pad = 48;
      const bannerAndPad = 36 + pad * 2;
      setScale(Math.min(1, (window.innerWidth - pad * 2) / (width + 28), (window.innerHeight - bannerAndPad) / (height + 28)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [width, height]);
  return scale;
}

/**
 * A device frame on a quiet backdrop, scaled to fit. When the window is about the device's own size
 * (a phone opening a phone demo), the app fills the window instead.
 */
function Frame({ device, children }: { device: keyof typeof DEVICES; children: ReactNode }) {
  const d = DEVICES[device];
  const scale = useFit(device);
  const bare = typeof window !== "undefined" && window.innerWidth <= d.width + 40;
  if (bare) return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/60">
      <div style={{ width: (d.width + 28) * scale, height: (d.height + 28) * scale }} className="shrink-0">
        <div
          data-kit="device"
          className={cn("origin-top-left overflow-hidden border-foreground/90 bg-background shadow-overlay", d.radius, d.bezel)}
          style={{ width: d.width + 28, height: d.height + 28, transform: `scale(${scale})` }}
        >
          <div className="flex h-full flex-col overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** A phone app: a title bar, the screen, and a tab bar of up to five routes. */
export function PhoneShell({ demo }: { demo: DemoConfig }) {
  const current = useCurrentRoute(demo);
  const tabs = navRoutes(demo).slice(0, 5);
  return (
    <Frame device="phone">
      <div className="@container/shell flex min-h-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b bg-card px-4">
          <Mark demo={demo} className="size-7" />
          <span className="flex-1 truncate font-display text-base font-semibold">{current.title}</span>
          {demo.shellExtras}
          <UserAvatar demo={demo} />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto" data-kit="main">
          <Screen route={current} />
        </main>
        <nav className="grid h-16 shrink-0 border-t bg-card" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }} aria-label="Main">
          {tabs.map((r) => {
            const Icon = r.icon;
            const active = r.path === current.path;
            return (
              <Link
                key={r.path}
                to={r.path}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground",
                  active && "text-primary",
                )}
              >
                {Icon && <Icon className="size-5" aria-hidden />}
                <span className="max-w-full truncate px-1">{r.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </Frame>
  );
}

/** A tablet app: the sidebar shell (as an icon rail) inside a tablet frame. */
export function TabletShell({ demo }: { demo: DemoConfig }) {
  return (
    <Frame device="tablet">
      <SidebarShell demo={demo} />
    </Frame>
  );
}
