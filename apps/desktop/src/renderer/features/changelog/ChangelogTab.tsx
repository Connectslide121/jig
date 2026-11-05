import changelog from "virtual:jig-changelog";
import { useEffect, useRef, useState } from "react";
import { useConfig } from "../../stores/config";
import { Badge, cn, Markdown } from "../../ui";
import { Pane } from "../../workbench/Pane";
import type { TabProps } from "../../workbench/registry";

/** "6 Nov 2026" from a tag's YYYY-MM-DD, read as a local day. */
function releaseDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The version whose section is at the top of the scroller (the last one once scrolled to the end). */
function useCurrentVersion(root: React.RefObject<HTMLDivElement | null>): string | undefined {
  const [current, setCurrent] = useState(changelog[0]?.version);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const update = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        setCurrent(changelog.at(-1)?.version);
        return;
      }
      const top = el.getBoundingClientRect().top + 80;
      let best = changelog[0]?.version;
      for (const s of el.querySelectorAll<HTMLElement>("[data-version]"))
        if (s.getBoundingClientRect().top <= top) best = s.dataset.version;
      setCurrent(best);
    };
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [root]);
  return current;
}

/** What's new: every published version's release notes, newest first, as GitHub shows them (D-393). */
export function ChangelogTab({ params }: TabProps) {
  const installed = useConfig((s) => s.info?.version);
  const scroller = useRef<HTMLDivElement>(null);
  const current = useCurrentVersion(scroller);
  const go = (version: string, behavior: ScrollBehavior = "smooth") =>
    scroller.current
      ?.querySelector(`[data-version="${version}"]`)
      ?.scrollIntoView({ behavior, block: "start" });
  const requested = typeof params.version === "string" ? params.version : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the requested version changes.
  useEffect(() => {
    if (requested) go(requested, "instant");
  }, [requested]);

  if (!changelog.length)
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted" data-testid="changelog">
        No release notes in this build.
      </div>
    );

  return (
    <div className="@container flex h-full" data-testid="changelog">
      <Pane
        id="jig.changelog.nav"
        edge="right"
        defaultSize={200}
        min={160}
        max={320}
        label="Resize the version list"
        className="@max-2xl:hidden"
      >
        <nav className="h-full overflow-y-auto border-r border-line bg-surface p-2" aria-label="Versions">
          {changelog.map((r) => (
            <button
              key={r.version}
              type="button"
              onClick={() => go(r.version)}
              data-testid={`changelog-nav-${r.version}`}
              aria-current={current === r.version ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                current === r.version ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              <span className="min-w-0 flex-1 truncate tabular-nums">{r.version}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {r.date ? releaseDay(r.date) : ""}
              </span>
              <span className="flex w-1.5 shrink-0 justify-end">
                {r.version === installed && (
                  <span className="size-1.5 rounded-full bg-accent" title="The version you're running" />
                )}
              </span>
            </button>
          ))}
        </nav>
      </Pane>
      <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-6">
          <h1 className="text-xl font-semibold text-fg">What's new in Jig</h1>
          <p className="mt-1 text-sm text-muted">
            The release notes of every version, newest first.
            {installed && <> You're running {installed}.</>}
          </p>
          {changelog.map((r) => (
            <section
              key={r.version}
              data-version={r.version}
              data-testid={`changelog-version-${r.version}`}
              className="scroll-mt-4 border-t border-line py-6 first-of-type:mt-6"
            >
              <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
                <span className="tabular-nums">Jig {r.version}</span>
                {r.version === installed && <Badge tone="accent">Installed</Badge>}
                <span className="ml-auto text-sm font-normal text-muted tabular-nums">
                  {r.date ? releaseDay(r.date) : ""}
                </span>
              </h2>
              <Markdown text={r.notes} className="mt-2" />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
