import { Lightbulb, Search, UserRound } from "lucide-react";
import { useEffect } from "react";
import { call, useHostEvent } from "../../lib/host";
import { useConfig } from "../../stores/config";
import { CountBadge } from "../../ui";
import { useProjects } from "../../workbench/projects";
import { registerAction, registerTabType, registerTopbarItem, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";
import { startProfileInterview } from "./interview";
import { KnowledgeTab } from "./KnowledgeTab";
import { SuggestionsView } from "./SuggestionsView";
import { lookForPatterns, useLearning } from "./store";

/** Asked at most once per launch. */
let profileNudged = false;
const NUDGE_OFF = "jig.profileNudge.off";

/**
 * When Jig opens and what it knows about you is empty, a toast offers the interview (D-169): once per
 * launch, only when a chat can start (a project is active), and never again after "Don't ask again".
 */
function useProfileNudge(): void {
  const hasProject = useProjects((s) => Boolean(s.activeId));
  const engine = useConfig((s) => s.info?.engine);
  useEffect(() => {
    // The scripted engine (tests) has nobody to interview.
    if (profileNudged || !hasProject || !engine || engine === "fake") return;
    profileNudged = true;
    if (localStorage.getItem(NUDGE_OFF)) return;
    void call("learning.knowledge").then(({ profileEmpty }) => {
      if (!profileEmpty) return;
      notify({
        title: "Tell Jig how you work",
        message:
          "What Jig knows about you is empty. A short chat where Claude asks you questions fills it in, so suggestions fit you.",
        timeout: 0,
        actions: [
          { label: "Start the interview", run: () => void startProfileInterview() },
          { label: "Not now", run: () => {} },
          { label: "Don't ask again", run: () => localStorage.setItem(NUDGE_OFF, "1") },
        ],
      });
    });
  }, [hasProject, engine]);
}

/** Top bar: a light bulb with the number of new suggestions. */
function SuggestionsBadge() {
  useProfileNudge();
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
  registerTabType({
    type: "jig.knowledge",
    title: () => "What Jig knows about me",
    icon: UserRound,
    component: KnowledgeTab,
    owner: "core",
  });
  registerAction({
    id: "jig.knowledge",
    title: "What Jig knows about me",
    group: "Build",
    icon: UserRound,
    keywords: ["profile", "learning", "notes", "privacy"],
    run: () => void workbench.openTab("jig.knowledge"),
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
