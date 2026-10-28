import { Minimize2 } from "lucide-react";
import type { ContextUsage, SessionMeta } from "../../../shared/engine";
import { call } from "../../lib/host";
import { Button, cn, type MenuEntry, openMenuAt, promptDialog, Tooltip } from "../../ui";
import { formatTokens } from "./Transcript";

/** From this much on the header shows a Compact button. */
export const COMPACT_HINT_PERCENT = 70;

/** Asks Claude Code to compact the conversation (its own `/compact`), optionally with what to keep. */
export function compactSession(meta: SessionMeta, instructions?: string): void {
  const text = instructions?.trim() ? `/compact ${instructions.trim()}` : "/compact";
  void call("sessions.send", { id: meta.id, text });
}

async function compactWithInstructions(meta: SessionMeta) {
  const instructions = await promptDialog({
    title: "Compact with instructions",
    message: "Claude Code summarises the conversation so far. Say what the summary must keep.",
    placeholder: "e.g. keep the decisions about the API and the open todo list",
    confirmLabel: "Compact",
  });
  if (instructions !== undefined) compactSession(meta, instructions);
}

export function compactMenu(meta: SessionMeta): MenuEntry[] {
  const empty = meta.turns === 0;
  return [
    {
      label: "Compact conversation",
      icon: Minimize2,
      disabled: empty,
      onSelect: () => compactSession(meta),
      testId: "compact-now",
    },
    {
      label: "Compact with instructions…",
      disabled: empty,
      onSelect: () => void compactWithInstructions(meta),
    },
  ];
}

const SEGMENT = ["bg-accent", "bg-info", "bg-success", "bg-warning", "bg-danger", "bg-hint"];
const tone = (percent: number) =>
  percent >= 90 ? "text-danger" : percent >= COMPACT_HINT_PERCENT ? "text-warning" : "text-accent";

function ContextCard({ context }: { context: ContextUsage }) {
  const used = context.categories.filter((c) => c.kind === "used");
  const buffer = context.categories.find((c) => c.kind === "buffer");
  const max = context.maxTokens || 1;
  return (
    <div className="flex w-72 flex-col gap-2" data-testid="context-card">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-fg">Context window</span>
        <span className="flex-1" />
        <span className={cn("text-sm font-semibold tabular-nums", tone(context.percent))}>
          {context.percent}%
        </span>
      </div>
      <div className="text-xs text-muted">
        {formatTokens(context.usedTokens)} of {formatTokens(context.maxTokens)} tokens
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-active">
        {used.map((c, i) => (
          <div
            key={c.name}
            className={SEGMENT[i % SEGMENT.length]}
            style={{ width: `${(c.tokens / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        {used.map((c, i) => (
          <div key={c.name} className="flex items-center gap-2 text-xs">
            <span className={cn("size-2 shrink-0 rounded-sm", SEGMENT[i % SEGMENT.length])} />
            <span className="min-w-0 flex-1 truncate text-muted">{c.name}</span>
            <span className="tabular-nums text-fg">{formatTokens(c.tokens)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-line pt-1.5 text-2xs text-hint">
        {buffer
          ? `Claude Code compacts on its own when the window is full (${formatTokens(buffer.tokens)} kept free for that). `
          : "Claude Code compacts on its own when the window is full. "}
        Click to compact now.
      </div>
    </div>
  );
}

/** Chat header: how full the context window is (hover for the breakdown, click to compact). */
export function ContextMeter({ meta }: { meta: SessionMeta }) {
  const context = meta.context;
  if (!context) return null;
  const busy = meta.status === "working" || meta.status === "starting" || meta.status === "needs_you";
  return (
    <>
      {context.percent >= COMPACT_HINT_PERCENT && (
        <Button
          size="sm"
          variant="ghost"
          icon={Minimize2}
          disabled={busy}
          onClick={() => compactSession(meta)}
          data-testid="compact-button"
          title="Summarise the conversation so far to free the context window"
        >
          Compact
        </Button>
      )}
      <Tooltip content={<ContextCard context={context} />} delay={150} className="max-w-none p-2">
        <button
          type="button"
          onClick={(e) => openMenuAt(e.currentTarget, compactMenu(meta), true)}
          className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted hover:bg-hover hover:text-fg"
          data-testid="context-meter"
          aria-label="Context window"
        >
          <span className="relative h-1.5 w-8 overflow-hidden rounded-full bg-active" aria-hidden>
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full bg-current", tone(context.percent))}
              style={{ width: `${context.percent}%` }}
            />
          </span>
          <span className="tabular-nums">{context.percent}%</span>
        </button>
      </Tooltip>
    </>
  );
}
