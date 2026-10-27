import type { ReactNode } from "react";
import { create } from "zustand";
import type { ProjectInfo } from "../../../shared/projects";

/** Dashboard widgets (`dashboard.widget` slot). Add-ons register them in phase 6. */
export interface DashboardWidget {
  id: string;
  order?: number;
  owner?: string;
  render: (project: ProjectInfo) => ReactNode;
}

const useWidgets = create<{ widgets: Record<string, DashboardWidget> }>(() => ({ widgets: {} }));

export function registerDashboardWidget(widget: DashboardWidget): () => void {
  useWidgets.setState((s) => ({ widgets: { ...s.widgets, [widget.id]: widget } }));
  return () =>
    useWidgets.setState((s) => {
      const next = { ...s.widgets };
      delete next[widget.id];
      return { widgets: next };
    });
}

export function useDashboardWidgets(): DashboardWidget[] {
  const widgets = useWidgets((s) => s.widgets);
  return Object.values(widgets).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
