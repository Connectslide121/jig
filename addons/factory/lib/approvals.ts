/**
 * Approvals by other people (D-435, D-469, architecture.md → Approvals by other people): a gate a person
 * owns gets a card on the run's approvals board (the Boards add-on), assigned to them. Moving it to the
 * board's done column approves the gate; a comment starting "changes:" asks for changes with the rest
 * as the note. Pure: the Conductor (host.ts) creates, comments on and reads the cards.
 */
import { gateOutputs } from "./conductor";
import { GATES, isMine, ownerOf } from "./gates";
import type { BoardCard, GateId, GateState, Run } from "./run";

/** How often a card is read: Azure DevOps is asked at most this often per card. */
export const POLL_MS = 2 * 60_000;

/** What the Conductor does about a gate's board card now. */
export type BoardStep =
  | { kind: "create"; gate: GateId; owner: string }
  /** The gate waits again (a new version after changes): say so on its card, then read it. */
  | { kind: "again"; gate: GateId; card: BoardCard }
  | { kind: "poll"; gate: GateId; card: BoardCard }
  /**
   * The gate was decided or the run ended: one last comment when it wasn't decided on the board, and the
   * run forgets the card (the same gate waiting again later gets a new one).
   */
  | { kind: "close"; gate: GateId; card: BoardCard; text?: string };

/** Gates whose owner can decide on a board: GD's pick between three directions needs Jig. */
export function onBoard(gate: GateId): boolean {
  return gate !== "GD";
}

/** The steps for a run's gates (none when it has no approvals board). */
export function boardSteps(run: Run): BoardStep[] {
  if (!run.plan?.approvals) return [];
  const steps: BoardStep[] = [];
  for (const g of run.gates) {
    if (!onBoard(g.id)) continue;
    const owner = ownerOf(run, g.id);
    const card = g.card;
    if (g.status === "waiting" && run.state !== "stopped") {
      if (isMine(owner)) continue;
      if (!card) steps.push({ kind: "create", gate: g.id, owner: owner.name || "Someone" });
      else if (card.round !== g.revisions) steps.push({ kind: "again", gate: g.id, card });
      else steps.push({ kind: "poll", gate: g.id, card });
    } else if (card && (!["changes", "closed"].includes(g.status) || run.state === "stopped")) {
      const text = closingText(run, g);
      steps.push({ kind: "close", gate: g.id, card, ...(text ? { text } : {}) });
    }
  }
  return steps;
}

/** Who decided on the board is recorded as `board:<name>`. */
export const BY_BOARD = "board:";

function closingText(run: Run, g: GateState): string | undefined {
  if (g.decidedBy?.startsWith(BY_BOARD)) return undefined;
  if (g.status === "approved") return "Approved in Jig.";
  if (g.status === "rejected") return "Rejected in Jig: the run was stopped.";
  if (run.state === "stopped") return "The run was stopped in Jig.";
  return "Settled in Jig.";
}

/** The card's title: "<run> · <gate>". */
export function cardTitle(run: Run, gate: GateId): string {
  return `${run.title} · ${GATES[gate].label}`;
}

/** The card's description: what to review and how to decide on the board. */
export function cardDescription(run: Run, gate: GateId, board: { done: string }): string {
  const files = gateOutputs(run, gate)
    .filter((o) => !o.kind.endsWith("-file") && o.status !== "approved" && o.status !== "published")
    .map((o) => `- ${o.path}`);
  return [
    `Jig factory asks you to review ${GATES[gate].label} for "${run.title}".`,
    "",
    ...(files.length ? ["To review (on the run's branch, factory/" + run.id + "):", ...files, ""] : []),
    `To approve, move this card to ${board.done}.`,
    'To ask for changes, add a comment starting with "changes:" and say what to change.',
  ].join("\n");
}

/** The comment when the gate waits again after changes. */
export function againText(run: Run, gate: GateId): string {
  const g = run.gates.find((x) => x.id === gate);
  return `A new version is ready for review (round ${(g?.revisions ?? 0) + 1}). Move this card to done to approve, or comment "changes: …".`;
}

export interface CardStatus {
  done: boolean;
  comments: Array<{ by: string; at: string; text: string }>;
}

/** The decision a card's state means since it was last read: changes (a new "changes:" comment) first. */
export function readCard(
  status: CardStatus,
  card: BoardCard,
): { decision?: { kind: "approve" } | { kind: "changes"; note: string; by: string }; seen: number } {
  const fresh = status.comments.slice(card.seen);
  for (const c of fresh) {
    const m = /^\s*changes\s*:\s*([\s\S]*)$/i.exec(c.text);
    if (m?.[1]?.trim())
      return { decision: { kind: "changes", note: m[1].trim(), by: c.by }, seen: status.comments.length };
  }
  return { ...(status.done ? { decision: { kind: "approve" } } : {}), seen: status.comments.length };
}
