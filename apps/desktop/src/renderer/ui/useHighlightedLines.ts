import { useEffect, useState } from "react";
import { highlightLines } from "../lib/highlight";
import { useAppearance } from "../stores/appearance";

/** Lines of `code` as highlighted HTML (theme colours), or undefined while loading/unsupported. */
export function useHighlightedLines(code: string, lang: string | undefined): string[] | undefined {
  const version = useAppearance((s) => s.highlightVersion);
  const [lines, setLines] = useState<string[]>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` re-highlights after a theme change.
  useEffect(() => {
    let cancelled = false;
    setLines(undefined);
    if (code.length > 2_000_000) return;
    void highlightLines(code, lang).then((result) => {
      if (!cancelled) setLines(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang, version]);
  return lines;
}
