import { Lightbulb, Search } from "lucide-react";
import { useEffect } from "react";
import { call, useHostEvent } from "../../lib/host";
import { CountBadge } from "../../ui";
import { registerAction, registerTopbarItem, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { SuggestionsView } from "./SuggestionsView";
import { lookForPatterns, useLearning } from "./store";

/** Top bar: a light bulb with the number of new suggestions. */
function SuggestionsBadge() {
  const count = useLearning((s) => s.state?.suggestions.filter((x) => x.status === "new").length ?? 0);
  return (
    <button
      type="button"
      title={count ? `${count} new suggestion${count > 1 ? "s" : ""}` : "Suggestions"}
      aria-label="Suggestions"
      data-testid="suggestions-badge"
      onClick={() => workbench.showView("jig.suggestions")}
      className="relative inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
    >
      <Lightbulb className="size-4" />
      {count > 0 && <CountBadge count={count} className="absolute -top-0.5 -right-0.5" />}
    </button>
  );
}

export function registerLearning(): void {
  registerView({
    id: "jig.suggestions",
    title: "Suggestions",
    icon: Lightbulb,
    defaultRegion: "right",
    component: SuggestionsView,
    owner: "core",
  });
  registerTopbarItem({ id: "jig.suggestions", order: -10, component: SuggestionsBadge, owner: "core" });
  registerAction({
    id: "jig.suggestions",
    title: "Suggestions",
    group: "Build",
    icon: Lightbulb,
    run: () => workbench.showView("jig.suggestions"),
  });
  registerAction({
    id: "jig.lookForPatterns",
    title: "Look for patterns now",
    group: "Build",
    icon: Search,
    keywords: ["learning", "suggest"],
    run: () => void lookForPatterns(),
  });
}

export function useLearningSync(): void {
  useEffect(() => {
    void call("learning.state").then((state) => useLearning.setState({ state }));
  }, []);
  useHostEvent("learning.changed", (state) => useLearning.setState({ state }));
}
