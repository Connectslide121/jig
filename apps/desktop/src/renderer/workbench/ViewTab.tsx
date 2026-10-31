import { MoreHorizontal, PanelTop } from "lucide-react";
import { VIEW_TAB } from "../../shared/layout";
import { IconButton, openMenuAt } from "../ui";
import { registerTabType, type TabProps, useRegistry } from "./registry";

const viewIdOf = (params: Record<string, unknown>) => String(params.viewId ?? "");

/** A view (a sidebar view) opened as a tab in the main area: its header actions, then the view. */
function ViewTab({ params }: TabProps) {
  const id = viewIdOf(params);
  const view = useRegistry((s) => s.views[id]);
  if (!view) return <div className="p-6 text-sm text-muted">This view isn't available right now.</div>;
  const View = view.component;
  const HeaderActions = view.headerActions;
  return (
    <div className="flex h-full flex-col bg-surface" data-testid={`view-in-main-${id}`}>
      {(HeaderActions || view.headerMenu) && (
        <header className="flex h-8 shrink-0 items-center justify-end gap-0.5 border-b border-line px-1.5">
          {HeaderActions && <HeaderActions viewId={id} region="main" />}
          {view.headerMenu && (
            <IconButton
              icon={MoreHorizontal}
              label={`${view.title} options`}
              size="sm"
              data-testid={`view-menu-${id}`}
              onClick={(e) => openMenuAt(e.currentTarget, view.headerMenu!(), true)}
            />
          )}
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <View viewId={id} region="main" />
      </div>
    </div>
  );
}

export function registerViewTab(): void {
  registerTabType({
    type: VIEW_TAB,
    title: (params) => useRegistry.getState().views[viewIdOf(params)]?.title ?? "View",
    useTitle: (params) => useRegistry((s) => s.views[viewIdOf(params)]?.title ?? ""),
    icon: PanelTop,
    iconFor: (params) => useRegistry.getState().views[viewIdOf(params)]?.icon,
    component: ViewTab,
    owner: "core",
  });
}
