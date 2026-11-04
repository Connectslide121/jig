import { useEffect } from "react";
import { create } from "zustand";
import type { WorkbenchPanel } from "../../shared/layout";

/**
 * The panel you are working in (D-349): where keyboard focus or your last click is. Panels mark
 * themselves with `data-panel` (a sidebar or its lower half, the bottom panel, a main-area pane); a
 * chat marks itself `data-panel="chat"`, which counts as no panel. Undefined while Jig's window isn't
 * focused. Use it to decide whether something may switch a panel's tab under you (`revealAction`).
 */
export const useFocusedPanel = create<{ panel?: WorkbenchPanel }>(() => ({}));

export function focusedPanel(): WorkbenchPanel | undefined {
  return useFocusedPanel.getState().panel;
}

function panelAt(target: EventTarget | null): WorkbenchPanel | undefined {
  if (!(target instanceof Element)) return undefined;
  const panel = target.closest<HTMLElement>("[data-panel]")?.dataset.panel;
  return panel && panel !== "chat" ? (panel as WorkbenchPanel) : undefined;
}

/** Mounted once by the workbench: follows focus and clicks into panels. */
export function useTrackFocusedPanel(): void {
  useEffect(() => {
    const set = (panel: WorkbenchPanel | undefined) => {
      if (useFocusedPanel.getState().panel !== panel) useFocusedPanel.setState({ panel });
    };
    const onEvent = (e: Event) => set(panelAt(e.target));
    const onBlur = () => set(undefined);
    const onFocus = () => set(panelAt(document.activeElement));
    document.addEventListener("focusin", onEvent, true);
    document.addEventListener("pointerdown", onEvent, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("focusin", onEvent, true);
      document.removeEventListener("pointerdown", onEvent, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
}
