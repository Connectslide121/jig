import { ScrollText } from "lucide-react";
import { registerAction, registerTabType } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { ChangelogTab } from "./ChangelogTab";

/** Opens What's new, at `version` when given (D-393). */
export function openChangelog(version?: string): void {
  workbench.openTab("jig.changelog", version ? { version } : {});
}

export function registerChangelog(): void {
  registerTabType({
    type: "jig.changelog",
    title: () => "What's new",
    icon: ScrollText,
    component: ChangelogTab,
    singleton: true,
    owner: "core",
  });
  registerAction({
    id: "jig.changelog",
    title: "What's new",
    group: "Jig",
    icon: ScrollText,
    keywords: ["changelog", "release notes", "version", "updates", "new"],
    run: () => openChangelog(),
  });
}
