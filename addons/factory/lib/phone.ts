/**
 * Factory's phone cards (D-434, D-468, architecture.md → Phone buttons): which cards a run should
 * have on your phone right now, what a card says once it's settled, and what a tap means. Pure: the
 * Conductor (host.ts) sends, updates and acts on them through `api.phone`.
 *
 * A card's key says what it is about: `gate:<id>` (a gate of yours waits), `ask:<stage>` (a stage needs
 * you), `stuck` (the run can't go on by itself), `done` (the run finished). The run keeps its cards'
 * keys and message ids (`Run.phone`); a card whose subject is settled is updated without buttons and
 * forgotten, so the same gate waiting again later gets a new card.
 */
import { gateOutputs } from "./conductor";
import { GATES, isMine, ownerOf } from "./gates";
import { demoVersions } from "./review";
import type { GateId, Run, StageRun } from "./run";

export interface PhoneButton {
  id: "approve" | "changes" | "answer" | "open";
  label: string;
  reply?: boolean;
}

export interface PhoneCard {
  key: string;
  text: string;
  buttons: PhoneButton[];
  /** The demo version whose screenshot goes with the card (G1). */
  demo?: number;
}

export type CardSubject =
  | { kind: "gate"; gate: GateId }
  | { kind: "ask"; stage: string }
  | { kind: "stuck" }
  | { kind: "done" };

/** A finished run gets its "is done" card only this soon after it finished (not after pairing later). */
export const DONE_FRESH_MS = 30 * 60_000;

const OPEN: PhoneButton = { id: "open", label: "🖥️ Open in Jig" };
const APPROVE: PhoneButton = { id: "approve", label: "✅ Approve" };
const CHANGES: PhoneButton = { id: "changes", label: "✏️ Ask for changes", reply: true };
const ANSWER: PhoneButton = { id: "answer", label: "💬 Answer", reply: true };

/** What a card's key is about; undefined for a key this version doesn't know. */
export function subjectOf(key: string): CardSubject | undefined {
  if (key === "stuck" || key === "done") return { kind: key };
  const gate = /^gate:(G0|GD|G1|G2|G3|G4|G4m|G5)$/.exec(key);
  if (gate) return { kind: "gate", gate: gate[1] as GateId };
  const ask = /^ask:(.+)$/.exec(key);
  return ask ? { kind: "ask", stage: ask[1]! } : undefined;
}

const name = (p: string) => p.split("/").pop() ?? p;

/** The run's open questions for a stage. */
function openQuestions(run: Run, stage: string) {
  return (run.questions ?? []).filter((q) => q.stage === stage && !q.answer);
}

/** The cards a run should have now: your waiting gates, stages that need you, stuck, just finished. */
export function wantedCards(run: Run, stageTitle: (s: StageRun) => string, now = Date.now()): PhoneCard[] {
  if (run.state === "stopped") return [];
  const cards: PhoneCard[] = [];
  for (const g of run.gates) {
    if (g.status !== "waiting" || !isMine(ownerOf(run, g.id))) continue;
    cards.push(gateCard(run, g.id));
  }
  for (const s of run.stages) if (s.status === "needs-you") cards.push(askCard(run, s, stageTitle(s)));
  if (run.state === "stuck") cards.push(stuckCard(run, stageTitle));
  if (run.state === "done" && now - Date.parse(run.updatedAt) < DONE_FRESH_MS)
    cards.push({
      key: "done",
      text: `🏁 **${run.title}** is done\n\n${approvedLine(run)}`,
      buttons: [OPEN],
    });
  return cards;
}

function approvedLine(run: Run): string {
  const main = run.outputs.filter(
    (o) => !o.kind.endsWith("-file") && (o.status === "approved" || o.status === "published"),
  );
  return `${main.length} output${main.length === 1 ? "" : "s"} approved.`;
}

function gateCard(run: Run, gate: GateId): PhoneCard {
  const label = GATES[gate].label;
  if (gate === "G1") {
    const latest = demoVersions(run)
      .filter((v) => v.status !== "superseded" && v.status !== "rejected")
      .at(-1);
    const head = latest ? `Demo v${latest.version} is ready` : "The demo is ready";
    return {
      key: `gate:${gate}`,
      text: `🖼️ **${run.title}** · ${head}\n\nApprove it, or ask for changes and say what to change.`,
      buttons: [APPROVE, CHANGES, OPEN],
      demo: latest?.version,
    };
  }
  if (gate === "GD")
    return {
      key: `gate:${gate}`,
      text: `🎨 **${run.title}** · ${label}\n\nThree directions wait for you: pick one in Jig.`,
      buttons: [OPEN],
    };
  const files = gateOutputs(run, gate)
    .filter((o) => !o.kind.endsWith("-file") && o.status !== "approved" && o.status !== "published")
    .map((o) => `• ${name(o.path)}`);
  const list = files.length > 8 ? [...files.slice(0, 8), `• and ${files.length - 8} more`] : files;
  return {
    key: `gate:${gate}`,
    text: `📋 **${run.title}** · ${label} waits for you${list.length ? `\n\n${list.join("\n")}` : ""}`,
    buttons: [APPROVE, CHANGES, OPEN],
  };
}

function askCard(run: Run, s: StageRun, title: string): PhoneCard {
  const open = openQuestions(run, s.id);
  const key = `ask:${s.id}`;
  if (open.length > 1)
    return {
      key,
      text: `❓ **${run.title}** needs you · ${title}\n\n${open.map((q) => `• ${q.text}`).join("\n")}\n\nAnswer them in Jig.`,
      buttons: [OPEN],
    };
  const q = open[0];
  const text = q ? `${q.text}${q.suggestion ? `\n\n*Suggested:* ${q.suggestion}` : ""}` : s.question;
  return {
    key,
    text: `❓ **${run.title}** needs you · ${title}${text ? `\n\n${text}` : ""}`,
    buttons: q || s.question ? [ANSWER, OPEN] : [OPEN],
  };
}

function stuckCard(run: Run, stageTitle: (s: StageRun) => string): PhoneCard {
  const failed = run.stages.find((s) => s.status === "failed");
  const gate = run.gates.find((g) => g.status === "changes");
  const why = failed
    ? `${stageTitle(failed)} failed after its retries.`
    : gate
      ? `${GATES[gate.id].label} used up its AI revisions.`
      : "It can't go on by itself.";
  return { key: "stuck", text: `⚠️ **${run.title}** is stuck\n\n${why}`, buttons: [OPEN] };
}

/** What a card says once its subject is settled (no buttons): the gate's decision, an answer, moving again. */
export function settledText(run: Run, key: string, stageTitle: (id: string) => string): string {
  const subject = subjectOf(key);
  if (!subject) return `**${run.title}**`;
  if (subject.kind === "gate") {
    const g = run.gates.find((x) => x.id === subject.gate);
    const label = GATES[subject.gate].label;
    const how =
      g?.status === "approved"
        ? "✅ Approved"
        : g?.status === "changes" || (g?.status === "closed" && g.revisions > 0)
          ? `✏️ Changes asked${g.note ? `: ${g.note}` : ""}`
          : g?.status === "rejected"
            ? "❌ Rejected"
            : run.state === "stopped"
              ? "⏹️ The run was stopped"
              : "Settled in Jig";
    return `**${run.title}** · ${label}\n\n${how}`;
  }
  if (subject.kind === "ask")
    return `**${run.title}** · ${stageTitle(subject.stage)}\n\n${run.state === "stopped" ? "⏹️ The run was stopped" : "✅ Answered"}`;
  if (subject.kind === "stuck")
    return `**${run.title}**\n\n${run.state === "stopped" ? "⏹️ The run was stopped" : "▶️ Moving again"}`;
  return `🏁 **${run.title}** is done`;
}

/** What a tap on a run's card asks for, given the card's key; undefined when it can't apply. */
export type PhoneTap =
  | { kind: "decide"; gate: GateId; decision: "approve" | "changes"; note?: string }
  | { kind: "answer"; stage: string; text: string }
  | { kind: "open" };

export function tapOf(key: string, buttonId: string, text?: string): PhoneTap | undefined {
  const subject = subjectOf(key);
  if (!subject) return undefined;
  if (buttonId === "open") return { kind: "open" };
  const said = text?.trim();
  if (subject.kind === "gate" && buttonId === "approve")
    return { kind: "decide", gate: subject.gate, decision: "approve" };
  if (subject.kind === "gate" && buttonId === "changes" && said)
    return { kind: "decide", gate: subject.gate, decision: "changes", note: said };
  if (subject.kind === "ask" && buttonId === "answer" && said)
    return { kind: "answer", stage: subject.stage, text: said };
  return undefined;
}
