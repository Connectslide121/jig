/**
 * The Demo review tab's pure logic (ui.md → Demo review, D-462): the device frames, the demo's
 * versions with their change log and scorecard, and the comment pins that become a gate's feedback.
 */
import type { Output, Pin, Run } from "./run";

export type Device = Pin["device"];

/** The three frames, at the widths the demo kit's check screenshots (demo-quality.md). */
export const DEVICES: ReadonlyArray<{ id: Device; label: string; width: number; height: number }> = [
  { id: "desktop", label: "Desktop", width: 1440, height: 900 },
  { id: "tablet", label: "Tablet", width: 834, height: 1112 },
  { id: "phone", label: "Phone", width: 390, height: 844 },
];

/** The rubric's eight axes, in the critic's order (demo-quality.md). */
export const AXES = [
  "hierarchy",
  "spacing",
  "typography",
  "colour",
  "density",
  "consistency",
  "polish",
  "story",
] as const;

export interface Fix {
  screen?: string;
  element?: string;
  change: string;
}

export interface Scorecard {
  pass: boolean;
  /** 0–100 (the axes' average × 20). */
  score?: number;
  /** Each axis 1–5, in AXES order; missing axes are left out. */
  axes: Array<{ axis: string; value: number }>;
  fixes: Fix[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** A critic's `quality/v<N>.json`, forgiving about names ("spacing rhythm") and shapes. */
export function parseScorecard(text: string): Scorecard | undefined {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const given = (raw.axes && typeof raw.axes === "object" ? raw.axes : {}) as Record<string, unknown>;
  const byKey = new Map(
    Object.entries(given).map(([k, v]) => [k.toLowerCase().split(/[\s_-]/)[0] ?? k, num(v)] as const),
  );
  const axes = AXES.flatMap((axis) => {
    const value = byKey.get(axis === "colour" && !byKey.has("colour") ? "color" : axis);
    return value === undefined ? [] : [{ axis, value }];
  });
  const average = axes.length ? axes.reduce((n, a) => n + a.value, 0) / axes.length : undefined;
  const fixes = (Array.isArray(raw.fixes) ? raw.fixes : []).flatMap((f): Fix[] => {
    if (typeof f === "string") return f.trim() ? [{ change: f.trim() }] : [];
    const o = f as Record<string, unknown>;
    const change = typeof o?.change === "string" ? o.change.trim() : "";
    if (!change) return [];
    return [
      {
        screen: typeof o.screen === "string" ? o.screen : undefined,
        element: typeof o.element === "string" ? o.element : undefined,
        change,
      },
    ];
  });
  return {
    pass: raw.pass === true,
    score: num(raw.score) ?? (average === undefined ? undefined : Math.round(average * 20)),
    axes,
    fixes,
  };
}

/** The score as the rubric says it: "4.3" out of 5 (score 86 → 4.3). */
export const scoreOutOf5 = (score: number) => (score / 20).toFixed(1);

export interface DemoVersion {
  version: number;
  /** The demo's entry file, relative to the run's folder (`demo/v2/index.html`). */
  path: string;
  /** Its CHANGES.md, beside it. */
  changes: string;
  /** The critic's scorecard for it (`quality/v<N>.json`), when there is one. */
  quality?: string;
  status: Output["status"];
}

/** The demo's versions, oldest first: the run's `demo` outputs and the quality files that judge them. */
export function demoVersions(run: Pick<Run, "outputs">): DemoVersion[] {
  const quality = new Map<number, string>();
  for (const o of run.outputs)
    if (o.kind === "quality" || o.kind === "quality-file") {
      const m = /v(\d+)\.json$/.exec(o.path);
      if (m) quality.set(Number(m[1]), o.path);
    }
  const seen = new Set<number>();
  return run.outputs
    .filter((o) => o.kind === "demo" && /\.html?$/.test(o.path))
    .sort((a, b) => a.version - b.version)
    .flatMap((o) => {
      const version = Number(/v(\d+)\//.exec(o.path)?.[1] ?? o.version);
      if (seen.has(version)) return [];
      seen.add(version);
      return [
        {
          version,
          path: o.path,
          changes: o.path.replace(/[^/]+$/, "CHANGES.md"),
          quality: quality.get(version),
          status: o.status,
        },
      ];
    });
}

/** A pin's place: rounded percentages of the frame, so pins survive a frame's resizing. */
export function pinAt(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const pct = (v: number, of: number) =>
    Math.min(100, Math.max(0, Math.round((v / Math.max(1, of)) * 1000) / 10));
  return { x: pct(x, width), y: pct(y, height) };
}

/** The pins as the next version's feedback: one numbered line each, with the device and the screen. */
export function pinsNote(pins: Pin[]): string {
  return pins
    .map(
      (p, i) =>
        `${i + 1}. ${p.device}${p.screen ? `, ${p.screen}` : ""} (${p.x}% across, ${p.y}% down): ${p.text}`,
    )
    .join("\n");
}

/** What Ask for changes sends: your note and the pins, at least one of them. */
export function changesNote(note: string, pins: Pin[]): string {
  const parts = [note.trim(), pins.length ? `Pins on the demo:\n${pinsNote(pins)}` : ""].filter(Boolean);
  return parts.join("\n\n");
}

export interface Direction {
  /** `2-bold` */
  id: string;
  /** `Bold` */
  name: string;
  /** The board's file, relative to the run's folder. */
  path: string;
}

/** A new brand's direction boards (`directions/<n>-<name>.svg|png`), in order. */
export function directionsOf(run: Pick<Run, "outputs">): Direction[] {
  const seen = new Set<string>();
  return run.outputs
    .filter(
      (o) => /(^|\/)directions\/[^/]+\.(svg|png|jpe?g|webp)$/i.test(o.path) && o.status !== "superseded",
    )
    .map((o) => {
      const id = o.path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
      const word =
        id
          .replace(/^\d+[-_ ]*/, "")
          .replace(/[-_]+/g, " ")
          .trim() || id;
      return { id, name: word.charAt(0).toUpperCase() + word.slice(1), path: o.path };
    })
    .filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
