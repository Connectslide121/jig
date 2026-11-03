import { NotebookPen } from "lucide-react";
import { registerAction, registerView } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { NOTES_VIEW, NotesView } from "./Notes";

/** The project's notes as a view (D-289; left, follows the project, D-102). */
export function registerKnowledge(): void {
  registerView({
    id: NOTES_VIEW,
    title: "Project notes",
    icon: NotebookPen,
    defaultRegion: "left",
    component: NotesView,
    owner: "core",
  });
  registerAction({
    id: "jig.notes.show",
    title: "Show this project's notes",
    group: "Projects",
    icon: NotebookPen,
    keywords: ["notes", "knowledge", "decisions", "dependencies", "waiting"],
    run: () => workbench.showView(NOTES_VIEW),
  });
}
