import type { AddonCaptureStep } from "@jig/sdk";

/** What the steps editor offers, in the order it lists them. */
export const STEP_DO = ["click", "type", "hover", "highlight", "scroll", "wait", "go"] as const;
export type StepDo = (typeof STEP_DO)[number];

/** One row of the steps editor: what to do, on what, and its text (typed text, a label, ms). */
export interface StepRow {
  do: StepDo;
  target: string;
  text: string;
}

export const STEP_HINT: Record<StepDo, { target: string; text: string }> = {
  click: { target: "CSS selector, e.g. #buy", text: "Label (optional)" },
  type: { target: "CSS selector of the field", text: "What to type" },
  hover: { target: "CSS selector", text: "Label (optional)" },
  highlight: { target: "CSS selector", text: "Label (optional)" },
  scroll: { target: "CSS selector or pixels", text: "" },
  wait: { target: "Milliseconds, e.g. 1000", text: "" },
  go: { target: "Address", text: "" },
};

/** Turns the editor's rows into capture steps, or says which row is wrong. */
export function toSteps(rows: StepRow[]): { steps: AddonCaptureStep[] } | { error: string } {
  const steps: AddonCaptureStep[] = [];
  for (const [i, r] of rows.entries()) {
    const target = r.target.trim();
    const text = r.text.trim();
    const name = text ? { name: text.slice(0, 80) } : {};
    const bad = (why: string) => ({ error: `Step ${i + 1}: ${why}` });
    switch (r.do) {
      case "go":
        if (!/^(https?|file):/i.test(target))
          return bad("an address starts with http://, https:// or file://");
        steps.push({ do: "go", url: target });
        break;
      case "wait": {
        const ms = Number(target);
        if (!Number.isFinite(ms) || ms <= 0 || ms > 10_000) return bad("wait between 1 and 10000 ms");
        steps.push({ do: "wait", ms: Math.round(ms) });
        break;
      }
      case "scroll":
        if (!target) steps.push({ do: "scroll", y: 0 });
        else if (/^\d+$/.test(target)) steps.push({ do: "scroll", y: Number(target) });
        else steps.push({ do: "scroll", selector: target });
        break;
      case "type":
        if (!target) return bad("which field to type into");
        if (!text) return bad("what to type");
        steps.push({ do: "type", selector: target, text: text.slice(0, 500) });
        break;
      default:
        if (!target) return bad(`what to ${r.do}`);
        steps.push({ do: r.do, selector: target, ...name });
    }
  }
  return { steps };
}

/** The steps' labels, by step index (for marks). */
export const stepNames = (steps: AddonCaptureStep[]) => steps.map((s) => s.name);
