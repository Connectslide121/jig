import { FolderGit2 } from "lucide-react";
import { useConfig } from "../stores/config";
import { ErrorBoundary } from "../ui";
import { useActiveProject } from "./projects";
import { useRegistry } from "./registry";

export function StatusBar() {
  const project = useActiveProject();
  const info = useConfig((s) => s.info);
  const items = Object.values(useRegistry((s) => s.statusItems)).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const side = (s: "left" | "right") =>
    items
      .filter((i) => i.side === s)
      .map((i) => (
        <ErrorBoundary key={i.id} label={i.id}>
          <i.component />
        </ErrorBoundary>
      ));
  return (
    <footer
      data-testid="statusbar"
      className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-statusbar px-2 text-xs text-on-statusbar"
    >
      {project && (
        <span className="flex items-center gap-1 truncate" title={project.path}>
          <FolderGit2 className="size-3.5" /> {project.name}
        </span>
      )}
      {side("left")}
      <div className="flex-1" />
      {side("right")}
      {info?.engine === "fake" && (
        <span title="JIG_ENGINE=fake: scripted replies, no Claude Code">fake engine</span>
      )}
    </footer>
  );
}
