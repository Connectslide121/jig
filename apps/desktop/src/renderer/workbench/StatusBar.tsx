import { FolderGit2 } from "lucide-react";
import { useConfig } from "../stores/config";
import { ErrorBoundary } from "../ui";
import { useActiveProject } from "./projects";
import { type StatusItemDef, useRegistry } from "./registry";

export function StatusBar() {
  const project = useActiveProject();
  const info = useConfig((s) => s.info);
  const items = Object.values(useRegistry((s) => s.statusItems)).sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const side = (s: "left" | "right") => {
    const render = (list: StatusItemDef[]) =>
      list.map((i) => (
        <ErrorBoundary key={i.id} label={i.id}>
          <i.component />
        </ErrorBoundary>
      ));
    const onSide = items.filter((i) => i.side === s);
    const own = onSide.filter((i) => !i.owner || i.owner === "core");
    const addons = onSide.filter((i) => i.owner && i.owner !== "core");
    // Jig's own items, a divider, then the add-ons' items. Items may render nothing, so a group that
    // ends up empty is hidden with CSS, and so is the divider (it comes last in the DOM, after both
    // peers, and is put between them with `order`).
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span className="peer/own order-1 flex items-center gap-3 empty:hidden">{render(own)}</span>
        <span className="peer/addons order-3 flex items-center gap-3 empty:hidden">{render(addons)}</span>
        <span
          className="order-2 h-3 w-px shrink-0 bg-current opacity-25 peer-empty/own:hidden peer-empty/addons:hidden"
          aria-hidden
          data-testid={`statusbar-divider-${s}`}
        />
      </div>
    );
  };
  return (
    <footer
      data-testid="statusbar"
      className="@container/statusbar flex h-6 shrink-0 items-center gap-3 border-t border-line bg-statusbar px-2 text-xs text-on-statusbar"
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
