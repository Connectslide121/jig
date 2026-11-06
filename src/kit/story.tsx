// Story mode ("What to try") and presenter mode share the demo's story steps. Both draw on top of the
// demo (a floating panel, a caption bar, a ring around the step's target), so nothing moves.
import { ArrowLeft, ArrowRight, Check, Presentation, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { navigate, useRoute } from "./router";
import type { DemoConfig, StoryStep } from "./types";

interface StoryState {
  steps: StoryStep[];
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** The step being shown (-1: none). */
  active: number;
  go: (index: number) => void;
  presenting: boolean;
  setPresenting: (on: boolean) => void;
  done: Set<number>;
}

const Ctx = createContext<StoryState | null>(null);

export function useStory() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStory outside StoryProvider");
  return s;
}

export function StoryProvider({ demo, children }: { demo: DemoConfig; children: ReactNode }) {
  const steps = demo.story;
  const [panelOpen, setPanelOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [presenting, setPresentingState] = useState(false);
  const [done, setDone] = useState<Set<number>>(() => new Set());

  const go = useCallback(
    (index: number) => {
      const step = steps[index];
      if (!step) return;
      setActive(index);
      setDone((d) => new Set(d).add(index));
      navigate(step.route);
    },
    [steps],
  );
  const setPresenting = useCallback(
    (on: boolean) => {
      setPresentingState(on);
      if (on) {
        setPanelOpen(false);
        go(active >= 0 ? active : 0);
      } else setActive(-1);
    },
    [active, go],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!presenting) {
        if (e.key === "p" || e.key === "P") setPresenting(true);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(Math.min(active + 1, steps.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(Math.max(active - 1, 0));
      } else if (e.key === "Escape") setPresenting(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, active, go, setPresenting, steps.length]);

  return (
    <Ctx.Provider value={{ steps, panelOpen, setPanelOpen, active, go, presenting, setPresenting, done }}>
      {children}
      <StoryPanel scenario={demo.scenario} />
      <PresenterBar />
      <Spotlight />
    </Ctx.Provider>
  );
}

function StoryPanel({ scenario }: { scenario: DemoConfig["scenario"] }) {
  const { steps, panelOpen, setPanelOpen, active, go, done, setPresenting } = useStory();
  return (
    <AnimatePresence>
      {panelOpen && (
        <motion.aside
          data-kit="story-panel"
          aria-label="What to try"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          className="fixed right-4 bottom-4 z-50 flex max-h-[min(34rem,calc(100dvh-5rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-overlay"
        >
          <div className="flex items-start gap-3 border-b p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{scenario.moment}</p>
              <h2 className="mt-1 text-base font-semibold">{scenario.persona}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{scenario.summary}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Close What to try" onClick={() => setPanelOpen(false)}>
              <X />
            </Button>
          </div>
          <ol className="flex-1 overflow-y-auto p-2">
            {steps.map((s, i) => (
              <li key={`${s.route}-${s.title}`}>
                <button
                  type="button"
                  data-kit="story-step"
                  onClick={() => go(i)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted",
                    active === i && "bg-accent text-accent-foreground hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                      done.has(i) && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {done.has(i) ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="block text-sm text-muted-foreground">{s.caption}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <span className="text-xs text-muted-foreground">
              {done.size} of {steps.length} tried
            </span>
            <Button size="sm" variant="outline" onClick={() => setPresenting(true)}>
              <Presentation /> Present
            </Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function PresenterBar() {
  const { steps, presenting, active, go, setPresenting } = useStory();
  const step = steps[active];
  return (
    <AnimatePresence>
      {presenting && step && (
        <motion.div
          data-kit="presenter"
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="fixed bottom-4 left-1/2 z-50 flex w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-overlay"
        >
          <span className="w-12 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
            {active + 1} / {steps.length}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{step.title}</p>
            <p className="truncate text-sm text-muted-foreground">{step.caption}</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Previous step" disabled={active === 0} onClick={() => go(active - 1)}>
            <ArrowLeft />
          </Button>
          <Button size="icon-sm" aria-label="Next step" disabled={active === steps.length - 1} onClick={() => go(active + 1)}>
            <ArrowRight />
          </Button>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Kbd>Esc</Kbd>
          </span>
          <Button variant="ghost" size="icon-sm" aria-label="Stop presenting" onClick={() => setPresenting(false)}>
            <X />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A ring around the active step's target, drawn over the page (fixed), following it on scroll. */
function Spotlight() {
  const { steps, active, panelOpen, presenting } = useStory();
  const route = useRoute();
  const step = steps[active];
  const show = (panelOpen || presenting) && step?.target && step.route === route;
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!show || !step?.target) {
      setRect(null);
      return;
    }
    let frame = 0;
    let scrolled = false;
    const tick = () => {
      const el = document.querySelector(`[data-demo="${step.target}"]`);
      if (el && !scrolled) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        scrolled = true;
      }
      const r = el?.getBoundingClientRect() ?? null;
      setRect((prev) =>
        prev && r && prev.x === r.x && prev.y === r.y && prev.width === r.width && prev.height === r.height ? prev : r,
      );
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [show, step?.target]);
  if (!show || !rect) return null;
  return (
    <div
      aria-hidden
      data-kit="spotlight"
      className="pointer-events-none fixed z-40 rounded-lg ring-2 ring-highlight ring-offset-2 ring-offset-background"
      style={{
        left: rect.left - 4,
        top: rect.top - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        animation: presenting ? "kit-pulse 1.6s var(--kit-ease) infinite" : undefined,
      }}
    />
  );
}
