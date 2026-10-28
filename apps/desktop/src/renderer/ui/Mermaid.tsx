import { useEffect, useState } from "react";
import { useAppearance } from "../stores/appearance";
import { CodeBlock } from "./CodeBlock";
import { cn } from "./cn";

let renderCount = 0;

/** The theme's colours (computed custom properties are plain colours) for Mermaid's theme. */
function themeVariables() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: v("--color-surface"),
    mainBkg: v("--color-raised"),
    primaryColor: v("--color-raised"),
    primaryTextColor: v("--color-fg"),
    primaryBorderColor: v("--color-accent"),
    secondaryColor: v("--color-surface"),
    tertiaryColor: v("--color-canvas"),
    nodeBorder: v("--color-accent"),
    clusterBkg: v("--color-surface"),
    clusterBorder: v("--color-line-strong"),
    lineColor: v("--color-muted"),
    textColor: v("--color-fg"),
    edgeLabelBackground: v("--color-surface"),
    noteBkgColor: v("--color-raised"),
    noteTextColor: v("--color-fg"),
    noteBorderColor: v("--color-line-strong"),
    actorBkg: v("--color-raised"),
    actorBorder: v("--color-accent"),
    actorTextColor: v("--color-fg"),
    signalColor: v("--color-fg"),
    signalTextColor: v("--color-fg"),
    fontFamily: css.fontFamily,
  };
}

/**
 * A Mermaid diagram (flowchart, sequence, class, state, ER, Gantt…), drawn in the current theme's
 * colours. Mermaid loads on first use; `securityLevel: "strict"` keeps diagrams from running code.
 * Shows the source with the error when the diagram can't be drawn.
 */
export function Mermaid({ code, className }: { code: string; className?: string }) {
  const theme = useAppearance((s) => s.highlightVersion);
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `theme` redraws in the new colours.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: themeVariables(),
        });
        const { svg } = await mermaid.render(`jig-mermaid-${++renderCount}`, code);
        if (!cancelled) {
          setSvg(svg);
          setError(undefined);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, theme]);
  if (error)
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <div className="text-xs text-danger">Can't draw this diagram: {error.split("\n")[0]}</div>
        <CodeBlock code={code} lang="mermaid" />
      </div>
    );
  return (
    <div
      data-testid="mermaid"
      className={cn(
        "my-2 flex justify-center overflow-x-auto rounded-md border border-line bg-surface p-3",
        className,
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid's own SVG, rendered with securityLevel "strict" (sanitised).
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
