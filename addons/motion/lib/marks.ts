import { LIMITS, type Mark, type Scene, sceneId } from "./storyboard";

/** A capture's step events (from `api.capture.record`). */
export interface StepEvent {
  step: number;
  do: string;
  at: number;
  box?: { x: number; y: number; w: number; h: number };
}

/**
 * Marks that follow what a capture did (M2): a zoom where it clicked or typed, a highlight where it
 * highlighted (labelled with the step's name), an arrow where it hovered. You edit them afterwards.
 */
export function marksFromEvents(events: StepEvent[], names: Array<string | undefined> = []): Mark[] {
  const out: Mark[] = [];
  let zoomFree = 0;
  for (const e of events) {
    if (!e.box || out.length >= LIMITS.marks) continue;
    const { x, y, w, h } = e.box;
    const label = names[e.step]?.trim().slice(0, 80) || undefined;
    if ((e.do === "click" || e.do === "type") && e.at >= zoomFree) {
      out.push({ kind: "zoom", at: Math.max(0, round(e.at - 0.4)), hold: 1.6, x, y, w, h });
      zoomFree = e.at + 2.8;
    } else if (e.do === "highlight")
      out.push({ kind: "highlight", at: round(e.at), hold: 1.8, x, y, w, h, ...(label ? { label } : {}) });
    else if (e.do === "hover")
      out.push({ kind: "arrow", at: round(e.at), hold: 1.6, x, y, w, h, ...(label ? { label } : {}) });
  }
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** A capture scene for a kept take: it lasts as long as the recording (at most a scene's limit). */
export function captureScene(
  take: { path: string; seconds: number; events: StepEvent[] },
  title: string,
  taken: Iterable<string>,
  names: Array<string | undefined> = [],
): Scene {
  return {
    id: sceneId(title || "capture", taken),
    type: "capture",
    title,
    media: { path: take.path, kind: "video" },
    duration: Math.max(1, Math.min(LIMITS.sceneSeconds, Math.round(take.seconds * 10) / 10)),
    marks: marksFromEvents(take.events, names),
  };
}
