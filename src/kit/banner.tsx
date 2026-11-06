// The strip every demo carries: PROTOTYPE · sample data, the version and its change log, What to try,
// presenter mode, the theme. A recipe can't remove it (the quality gate checks it is there).
import { FlaskConical, ListChecks, Monitor, Moon, MoreHorizontal, Presentation, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useStory } from "./story";
import { type ThemeChoice, useTheme } from "./theme";
import type { DemoConfig } from "./types";

export function Banner({ demo }: { demo: DemoConfig }) {
  const story = useStory();
  const theme = useTheme();
  const [log, setLog] = useState(false);
  return (
    <div
      data-kit="banner"
      className="relative z-30 flex h-9 shrink-0 items-center gap-2 border-b bg-foreground px-3 text-xs text-background"
    >
      <FlaskConical className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <span className="font-semibold tracking-wide whitespace-nowrap uppercase">Prototype</span>
      <span className="opacity-60" aria-hidden>
        ·
      </span>
      <span className="whitespace-nowrap opacity-80">sample data</span>
      <button
        type="button"
        data-kit="version"
        onClick={() => setLog(true)}
        className="ml-1 rounded-md bg-background/15 px-1.5 py-0.5 font-medium tabular-nums transition-colors hover:bg-background/25"
        title="See what changed"
      >
        v{demo.version}
        <span className="sr-only">, see what changed</span>
      </button>
      <div className="flex-1" />
      <button
        type="button"
        data-kit="story"
        onClick={() => story.setPanelOpen(!story.panelOpen)}
        aria-pressed={story.panelOpen}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 font-medium transition-colors hover:bg-background/15 aria-pressed:bg-background/20"
      >
        <ListChecks className="size-3.5" aria-hidden />
        <span className="max-xs:sr-only">What to try</span>
      </button>
      <button
        type="button"
        data-kit="present"
        onClick={() => story.setPresenting(!story.presenting)}
        aria-pressed={story.presenting}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 font-medium transition-colors hover:bg-background/15 aria-pressed:bg-background/20 max-sm:hidden"
      >
        <Presentation className="size-3.5" aria-hidden />
        Present
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Demo settings"
          className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-background/15"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme.choice} onValueChange={(v) => theme.setChoice(v as ThemeChoice)}>
            <DropdownMenuRadioItem value="light">
              <Sun /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor /> Same as the computer
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={theme.reducedMotion} onCheckedChange={(on) => theme.setReducedMotion(on === true)}>
            Reduce motion
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onSelect={() => story.setPresenting(true)}>
            <Presentation /> Present <Kbd className="ml-auto">P</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLog(true)}>What changed</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangeLog demo={demo} open={log} onOpenChange={setLog} />
    </div>
  );
}

function ChangeLog({ demo, open, onOpenChange }: { demo: DemoConfig; open: boolean; onOpenChange: (o: boolean) => void }) {
  const changes = [...demo.changes].sort((a, b) => b.version - a.version);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What changed</DialogTitle>
          <DialogDescription>
            {demo.name} prototype, version {demo.version}. Everything in it is sample data.
          </DialogDescription>
        </DialogHeader>
        <ol className="max-h-80 space-y-4 overflow-y-auto">
          {changes.map((c) => (
            <li key={c.version} className="grid grid-cols-[3rem_1fr] gap-3">
              <span className="text-sm font-semibold tabular-nums">v{c.version}</span>
              <div>
                <p className="text-xs text-muted-foreground">{c.when}</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                  {c.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

/** The scenario the demo opens on, once per version; the quality gate skips it. */
export function Welcome({ demo }: { demo: DemoConfig }) {
  const story = useStory();
  const key = `kit:welcomed:${demo.name}:v${demo.version}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [key]);
  const close = (tour: boolean) => {
    setOpen(false);
    try {
      localStorage.setItem(key, "1");
    } catch {}
    if (tour) {
      story.setPanelOpen(true);
      story.go(0);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close(false)}>
      <DialogContent className="sm:max-w-lg" data-kit="welcome">
        <DialogHeader>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{demo.scenario.moment}</p>
          <DialogTitle className="text-xl">{demo.scenario.persona}</DialogTitle>
          <DialogDescription className="text-base">{demo.scenario.summary}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This is a clickable prototype of {demo.name} with invented sample data. Nothing you do here is saved.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Explore on my own
          </Button>
          <Button onClick={() => close(true)}>
            <ListChecks /> Show me what to try
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
