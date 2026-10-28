import { NotebookPen } from "lucide-react";
import { registerAction } from "../../workbench/registry";
import { openStandup } from "./StandupDialog";

export { openStandup, StandupHost } from "./StandupDialog";

export function registerDigest(): void {
  registerAction({
    id: "jig.standup",
    title: "Write my standup…",
    group: "Claude",
    icon: NotebookPen,
    keywords: ["standup", "daily", "summary", "digest", "what did I do", "report"],
    run: () => openStandup(),
  });
}
