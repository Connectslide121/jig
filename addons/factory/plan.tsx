/**
 * The Plan step (ui.md → Plan, D-460), after you approve the brief: the run's stages, the pack's
 * outputs with a language per group, who owns each gate, the level and how the stage chats ask. Start
 * run finishes the step and the run goes on.
 */

import type { AddonUiContext } from "@jig/sdk";
import { Button, Dialog, Input, PERMISSION_MODE_LABELS, Select, Switch, useHostCall } from "@jig/sdk/ui";
import { type ReactNode, useState } from "react";
import {
  type BriefDoc,
  LANGUAGE_GROUP_LABELS,
  LANGUAGE_GROUPS,
  LANGUAGES,
  type LanguageGroup,
  outputsFor,
  PLAN_OUTPUTS,
  planLanguages,
} from "./lib/brief";
import { GATE_ORDER, GATES } from "./lib/gates";
import { holds, type Track, type TrackItem } from "./lib/graph";
import type { GateId, Level, Owner, Run, RunPlan } from "./lib/run";

type OwnerDraft = { kind: Owner["kind"]; name: string };

export function PlanDialog({
  ctx,
  run,
  brief,
  onClose,
}: {
  ctx: AddonUiContext;
  run: Run;
  brief: BriefDoc | null;
  onClose: () => void;
}) {
  const { data: track } = useHostCall<Track>("track", { projectId: run.projectId, runId: run.id });
  const [outputs, setOutputs] = useState<string[]>(
    run.plan?.outputs?.length ? run.plan.outputs : PLAN_OUTPUTS.filter((o) => o.ticked).map((o) => o.id),
  );
  const [languages, setLanguages] = useState<Record<LanguageGroup, string>>(() =>
    planLanguages({ ...(brief?.languages ?? {}), ...(run.languages ?? {}) }),
  );
  const [owners, setOwners] = useState<Record<string, OwnerDraft>>(() =>
    Object.fromEntries(
      GATE_ORDER.map((g) => [g, { kind: run.owners[g]?.kind ?? "me", name: run.owners[g]?.name ?? "" }]),
    ),
  );
  const [level, setLevel] = useState<Level>(brief?.level ?? run.level ?? run.brief?.level ?? "L1");
  const [mode, setMode] = useState<RunPlan["permissionMode"]>(run.plan?.permissionMode ?? "acceptEdits");
  const [build, setBuild] = useState(run.plan?.build ?? false);
  const [exists, setExists] = useState(run.plan?.productExists ?? false);
  const [critical, setCritical] = useState(run.plan?.critical ?? false);
  const isCR = (track?.id ?? run.track) === "change-request";
  const offered = outputsFor(track ?? undefined);
  const { data: boards } = useHostCall<{
    targets: Array<{ id: string; name: string; type?: string; problem?: string }>;
    problem?: string;
  }>("boardTargets", { projectId: run.projectId });
  const [approvals, setApprovals] = useState(run.plan?.approvals?.boardId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const waiting = run.stages.some((s) => s.recipe === "plan" && s.status === "needs-you");
  const gates = GATE_ORDER.filter((g) => !track || track.stages.some((i) => i.gate === g));
  const skipped = skippedItems(track?.stages ?? [], {
    "product.exists": exists,
    "build.requested": build,
    critical: isCR && critical,
  });
  const toggle = (id: string, on: boolean) =>
    setOutputs((l) => (on ? [...new Set([...l, id])] : l.filter((x) => x !== id)));
  const usable = (boards?.targets ?? []).filter((t) => t.type && !t.problem);
  const picked = usable.find((t) => t.id === approvals);
  const approvalsBoard = picked?.type ? { id: picked.id, name: picked.name, type: picked.type } : undefined;
  const anyPerson = gates.some((g) => owners[g]?.kind === "person");
  const ownersValid = gates.every((g) => owners[g]?.kind === "me" || owners[g]?.name.trim());
  return (
    <Dialog
      open
      onClose={onClose}
      width="xl"
      testId="factory-plan"
      title={`Plan · ${run.title}`}
      footer={
        <>
          <span className="w-14 shrink-0 text-xs text-hint">Level</span>
          <Select
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            className="w-48"
            data-testid="factory-plan-level"
          >
            <option value="L1">L1 · clickable screens</option>
            <option value="L2">L2 · working flows</option>
            <option value="L3">L3 · a real slice</option>
          </Select>
          <Select
            value={mode}
            onChange={(e) => setMode(e.target.value as RunPlan["permissionMode"])}
            className="w-36"
            data-testid="factory-plan-mode"
          >
            <option value="acceptEdits">{PERMISSION_MODE_LABELS.acceptEdits}</option>
            <option value="bypassPermissions">{PERMISSION_MODE_LABELS.bypassPermissions}</option>
          </Select>
          <span className="min-w-0 flex-1 truncate text-right text-xs text-danger">{error}</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {waiting ? "Later" : "Close"}
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={!waiting || !outputs.some((o) => offered.some((x) => x.id === o)) || !ownersValid}
            data-testid="factory-plan-start"
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await ctx.host.call("plan", {
                  projectId: run.projectId,
                  runId: run.id,
                  outputs: outputs.filter((o) => offered.some((x) => x.id === o)),
                  level,
                  languages,
                  owners: Object.fromEntries(
                    gates.map((g) => [
                      g,
                      owners[g]?.kind === "person"
                        ? { kind: "person", name: owners[g]?.name.trim() }
                        : { kind: "me" },
                    ]),
                  ),
                  permissionMode: mode,
                  build,
                  productExists: exists,
                  ...(isCR ? { critical } : {}),
                  approvals: approvalsBoard
                    ? { boardId: approvalsBoard.id, name: approvalsBoard.name, type: approvalsBoard.type }
                    : null,
                });
                onClose();
                ctx.openTab("run", { projectId: run.projectId, runId: run.id, title: run.title });
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Start run
          </Button>
        </>
      }
    >
      <div className="@container">
        <div className="grid gap-6 text-xs @max-3xl:grid-cols-1 @3xl:grid-cols-3">
          <Column title="Stages">
            <div className="flex flex-col gap-2">
              <Select
                value={exists ? "existing" : "new"}
                onChange={(e) => setExists(e.target.value === "existing")}
                disabled={track?.productExists !== undefined}
                data-testid="factory-plan-product"
              >
                <option value="existing">An existing product (extract its kit)</option>
                <option value="new">A new product (three directions)</option>
              </Select>
              <div className="flex h-7 items-center gap-2">
                <Switch checked={build} onChange={setBuild} label="Build it after the docs are approved" />
                <span className="min-w-0 flex-1 truncate text-fg">Build it after the docs are approved</span>
              </div>
              {isCR && (
                <div className="flex h-7 items-center gap-2" data-testid="factory-plan-critical">
                  <Switch checked={critical} onChange={setCritical} label="A critical bug: fix it now" />
                  <span className="min-w-0 flex-1 truncate text-fg">A critical bug: fix it now, no demo</span>
                </div>
              )}
            </div>
            <ol className="flex flex-col" data-testid="factory-plan-stages">
              {(track?.stages ?? []).map((i) => {
                const id = i.id ?? i.gate ?? i.fanout ?? "";
                const off = skipped.has(id);
                const name = i.gate ? GATES[i.gate].label : (i.title ?? id);
                return (
                  <li key={id} className="flex h-7 items-center gap-2">
                    <span className="w-9 shrink-0 font-mono text-hint">{id}</span>
                    <span
                      className={
                        off
                          ? "min-w-0 flex-1 truncate text-hint line-through"
                          : "min-w-0 flex-1 truncate text-fg"
                      }
                    >
                      {name}
                    </span>
                    <span className="w-12 shrink-0 text-right text-hint">
                      {i.gate ? "gate" : i.person ? "you" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Column>
          <Column title="Outputs">
            {LANGUAGE_GROUPS.map((g) => (
              <div key={g} className="flex flex-col gap-1">
                <div className="flex h-7 items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold text-muted">{LANGUAGE_GROUP_LABELS[g]}</span>
                  <Select
                    value={languages[g]}
                    onChange={(e) => setLanguages((l) => ({ ...l, [g]: e.target.value }))}
                    className="w-32"
                    aria-label={`${LANGUAGE_GROUP_LABELS[g]} language`}
                    data-testid={`factory-plan-lang-${g}`}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </div>
                {offered
                  .filter((o) => o.group === g)
                  .map((o) => (
                    <label key={o.id} className="flex h-6 cursor-pointer items-center gap-2 pl-2 text-fg">
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={outputs.includes(o.id)}
                        onChange={(e) => toggle(o.id, e.target.checked)}
                        data-testid={`factory-plan-output-${o.id}`}
                      />
                      {o.label}
                    </label>
                  ))}
              </div>
            ))}
          </Column>
          <Column title="Gates">
            {gates.map((g: GateId) => {
              const o = owners[g] ?? { kind: "me", name: "" };
              const set = (v: Partial<OwnerDraft>) => setOwners((m) => ({ ...m, [g]: { ...o, ...v } }));
              return (
                <div key={g} className="flex h-8 items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-fg">{GATES[g].label}</span>
                  <Select
                    value={o.kind}
                    onChange={(e) => set({ kind: e.target.value as Owner["kind"] })}
                    className="w-20 shrink-0"
                    aria-label={`${GATES[g].label} owner`}
                    data-testid={`factory-plan-owner-${g}`}
                  >
                    <option value="me">Me</option>
                    <option value="person">A person</option>
                  </Select>
                  <Input
                    value={o.kind === "me" ? "" : o.name}
                    disabled={o.kind === "me"}
                    placeholder={o.kind === "me" ? "" : "Name"}
                    onChange={(e) => set({ name: e.target.value })}
                    className="min-w-0 flex-1"
                    aria-label={`${GATES[g].label} person`}
                  />
                </div>
              );
            })}
            <div
              className="flex h-8 items-center gap-2"
              title="Gates other people own get a card there, assigned to them: moved to done approves, a comment starting with “changes:” asks for changes. GD stays in Jig."
            >
              <span className="w-28 shrink-0 truncate text-muted">Their cards on</span>
              <Select
                value={picked ? picked.id : ""}
                onChange={(e) => setApprovals(e.target.value)}
                disabled={!anyPerson}
                className="min-w-0 flex-1"
                aria-label="Board for other people's approvals"
                data-testid="factory-plan-approvals"
              >
                <option value="">
                  {(boards?.targets ?? []).length ? "None: they decide in Jig" : "No board followed: in Jig"}
                </option>
                {(boards?.targets ?? []).map((t) => (
                  <option key={t.id} value={t.id} disabled={!t.type || !!t.problem}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          </Column>
        </div>
      </div>
    </Dialog>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-semibold text-fg">{title}</span>
      {children}
    </section>
  );
}

/**
 * What the run will skip with these choices, as the Conductor would: an item whose `when` fails, or
 * whose every `after` term is skipped (a term `A|B` when all of them are). GD is the new product's gate.
 */
function skippedItems(items: TrackItem[], facts: Record<string, boolean>): Set<string> {
  const off = new Set<string>();
  for (const i of items) {
    const id = i.id ?? i.gate ?? i.fanout ?? "";
    const after = i.after ?? [];
    const termOff = (term: string) => term.split("|").every((t) => off.has(t.split(":")[0] ?? t));
    if (
      !holds(i.when, facts) ||
      (i.gate === "GD" && facts["product.exists"]) ||
      (after.length > 0 && after.every(termOff))
    )
      off.add(id);
  }
  return off;
}
