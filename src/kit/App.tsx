import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Banner, Welcome } from "./banner";
import { useRoute } from "./router";
import { PhoneShell, TabletShell } from "./shells/device";
import { LandingShell } from "./shells/landing";
import { SidebarShell } from "./shells/sidebar";
import { TopNavShell } from "./shells/topnav";
import { StoryProvider } from "./story";
import { ThemeProvider, useTheme } from "./theme";
import type { DemoConfig } from "./types";

const SHELLS = { sidebar: SidebarShell, topnav: TopNavShell, phone: PhoneShell, tablet: TabletShell, landing: LandingShell };

declare global {
  interface Window {
    /** What the quality gate (`npm run check`) reads: the demo's routes and story. */
    __demo?: { name: string; version: number; routes: string[]; story: { route: string; target?: string }[]; allowDomains: string[] };
  }
}

function Shell({ demo }: { demo: DemoConfig }) {
  const { reducedMotion } = useTheme();
  const route = useRoute();
  const Body = SHELLS[demo.shell];
  useEffect(() => {
    const r = demo.routes.find((x) => x.path === route) ?? demo.routes[0];
    document.title = r ? `${r.title} · ${demo.name}` : demo.name;
  }, [route, demo]);
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <TooltipProvider delayDuration={300}>
        <StoryProvider demo={demo}>
          <div className="flex h-dvh flex-col overflow-hidden">
            <Banner demo={demo} />
            <Body demo={demo} />
          </div>
          <Welcome demo={demo} />
        </StoryProvider>
      </TooltipProvider>
    </MotionConfig>
  );
}

export function DemoApp({ demo }: { demo: DemoConfig }) {
  window.__demo = {
    name: demo.name,
    version: demo.version,
    routes: demo.routes.map((r) => r.path),
    story: demo.story.map((s) => ({ route: s.route, target: s.target })),
    allowDomains: demo.allowDomains ?? [],
  };
  return (
    <ThemeProvider>
      <Shell demo={demo} />
    </ThemeProvider>
  );
}
