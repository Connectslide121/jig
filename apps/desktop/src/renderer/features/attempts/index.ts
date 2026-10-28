import { Split } from "lucide-react";
import { registerAction, registerTabType } from "../../workbench/registry";
import { openAttemptsDialog } from "./AttemptsDialog";
import { AttemptsTab } from "./AttemptsTab";

export { AttemptsDialogHost, openAttemptsDialog } from "./AttemptsDialog";

export function registerAttempts(): void {
  registerTabType({
    type: "jig.attempts",
    title: () => "Attempts",
    icon: Split,
    component: AttemptsTab,
    owner: "core",
  });
  registerAction({
    id: "jig.attempts",
    title: "Try a task several ways…",
    group: "Claude",
    icon: Split,
    keywords: ["attempts", "best of", "compare", "parallel", "worktree", "race"],
    run: () => openAttemptsDialog({ task: "" }),
  });
}
