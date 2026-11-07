/**
 * Publish a demo (D-438, D-470): where (this computer or a publish target from Settings), for how
 * long, and whether the customer confirms it. The pre-publish scan runs as the dialog opens and for
 * each version; any real-looking data keeps Publish disabled. The run's published copies are listed
 * in the Run tab with Take down.
 */

import type { AddonUiContext } from "@jig/sdk";
import {
  Button,
  Dialog,
  IconButton,
  Input,
  SectionTitle,
  Select,
  Spinner,
  Switch,
  useHostCall,
} from "@jig/sdk/ui";
import { CircleCheck, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { LOCAL, PUBLISH_DAYS, type Published, type RealDataHit } from "./lib/publish";
import type { Run } from "./lib/run";

interface PublishInfo {
  targets: Array<{ name: string; url: string }>;
  versions: number[];
  published: Published[];
}

const KIND_WORD: Record<RealDataHit["kind"], string> = { email: "E-mail", phone: "Phone", name: "Real name" };

export function PublishDialog({ ctx, run, onClose }: { ctx: AddonUiContext; run: Run; onClose: () => void }) {
  const args = { projectId: run.projectId, runId: run.id };
  const { data: info } = useHostCall<PublishInfo>("publishInfo", args);
  const [version, setVersion] = useState<number>();
  const [where, setWhere] = useState(LOCAL);
  const [days, setDays] = useState(30);
  const [confirm, setConfirm] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (info && version === undefined) setVersion(info.versions.at(-1));
  }, [info, version]);
  const { data: scan, loading: scanning } = useHostCall<{
    hits: RealDataHit[];
    files: number;
    names: number;
  }>("publishScan", { ...args, version }, { skip: version === undefined });
  const mailOk = !confirm || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const clean = !!scan && !scanning && scan.hits.length === 0;
  const ready = version !== undefined && clean && mailOk && !busy;
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Dialog
      open
      onClose={close}
      title={`Publish ${run.title}'s demo`}
      testId="factory-publish"
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
          <Button size="sm" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={!ready}
            data-testid="factory-publish-go"
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                const p = await ctx.host.call<Published>("publish", {
                  ...args,
                  version,
                  where,
                  days,
                  confirmTo: confirm ? to.trim() : undefined,
                });
                ctx.notify({
                  title: `Demo v${p.version} published`,
                  message: p.url ?? "On this computer, to send yourself",
                  tone: "success",
                  actions: [
                    {
                      label: p.url ? "Open" : "Show",
                      run: () => (p.url ? ctx.openExternal(p.url) : p.path && ctx.openPath(p.path)),
                    },
                  ],
                });
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Publish
          </Button>
        </>
      }
    >
      {!info ? (
        <div className="h-72">
          <Spinner center />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Version">
              <Select
                value={version === undefined ? "" : String(version)}
                disabled={!info.versions.length}
                onChange={(e) => setVersion(Number(e.target.value))}
                data-testid="factory-publish-version"
              >
                {!info.versions.length && <option value="">No approved demo yet</option>}
                {info.versions.map((v) => (
                  <option key={v} value={v}>
                    Demo v{v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="For how long">
              <Select
                value={String(days)}
                onChange={(e) => setDays(Number(e.target.value))}
                data-testid="factory-publish-days"
              >
                {PUBLISH_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Where"
            hint={
              where === LOCAL
                ? "A copy in Jig's data folder, for you to send. Nothing leaves this computer."
                : `Deployed with your az sign-in to ${info.targets.find((t) => t.name === where)?.url}/…`
            }
          >
            <Select
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              data-testid="factory-publish-where"
            >
              <option value={LOCAL}>This computer only</option>
              {info.targets.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm text-fg">The customer confirms it</span>
                <span className="text-xs text-muted">
                  A bar on the page asks "Is this what you wanted?"; the answer comes to you by e-mail.
                </span>
              </div>
              <Switch label="The customer confirms it" checked={confirm} onChange={setConfirm} />
            </div>
            <Input
              value={to}
              disabled={!confirm}
              placeholder="Answers go to (your e-mail)"
              onChange={(e) => setTo(e.target.value)}
              data-testid="factory-publish-to"
            />
          </div>
          <div
            className="flex h-24 flex-col gap-1 overflow-y-auto rounded-md border border-line bg-surface px-3 py-2 text-xs"
            data-testid="factory-publish-scan"
          >
            {scanning || !scan ? (
              <Spinner center />
            ) : scan.hits.length ? (
              <>
                <span className="flex items-center gap-2 font-medium text-danger">
                  <TriangleAlert className="size-4 shrink-0" />
                  Real-looking data: ask for a change to the demo before publishing it
                </span>
                {scan.hits.map((h) => (
                  <span key={`${h.kind}:${h.value}`} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-hint">{KIND_WORD[h.kind]}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-fg">{h.value}</span>
                  </span>
                ))}
              </>
            ) : (
              <span className="flex items-center gap-2 text-muted">
                <CircleCheck className="size-4 shrink-0 text-success" />
                No real-looking e-mail, phone or names in {scan.files} {scan.files === 1 ? "file" : "files"}
                {scan.names ? ` (${scan.names} real names checked)` : ""}. The page ends itself after {days}{" "}
                days.
              </span>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is inside.
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint !== undefined && <span className="h-5 truncate text-xs leading-5 text-hint">{hint}</span>}
    </label>
  );
}

const day = (iso: string) => iso.slice(0, 10);

/** The run's published copies (D-470): click one to open it; Take down is a person's click. */
export function PublishedList({ ctx, run }: { ctx: AddonUiContext; run: Run }) {
  const list = (run.published ?? []).filter((p) => !p.takenDown);
  if (!list.length) return null;
  const ended = (p: Published) => Date.parse(p.until) < Date.now();
  return (
    <>
      <SectionTitle>Published</SectionTitle>
      <ul className="flex flex-col" data-testid="factory-published">
        {list.map((p) => (
          <li key={p.id} className="group flex h-7 items-center gap-2 px-3 text-xs hover:bg-hover">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => (p.url ? ctx.openExternal(p.url) : p.path && ctx.openPath(p.path))}
            >
              <span className="w-16 shrink-0 text-right text-hint tabular-nums">v{p.version}</span>
              <span className="min-w-0 flex-1 truncate text-muted">
                {p.where === LOCAL ? "This computer" : p.where}
              </span>
              <span className="w-20 shrink-0 text-right text-2xs text-hint tabular-nums">
                {ended(p) ? "ended" : `to ${day(p.until)}`}
              </span>
            </button>
            <IconButton
              icon={Trash2}
              size="sm"
              label="Take down"
              data-testid="factory-published-down"
              onClick={async () => {
                if (
                  await ctx.confirm({
                    title: `Take demo v${p.version} down?`,
                    message:
                      p.where === LOCAL
                        ? "Its copy on this computer is deleted. Copies you sent stay, and end on their date."
                        : `It is removed from ${p.where} and the site is deployed again.`,
                    confirmLabel: "Take down",
                    danger: true,
                  })
                )
                  await ctx.host
                    .call("takeDown", { projectId: run.projectId, runId: run.id, id: p.id })
                    .catch((e) =>
                      ctx.notify({
                        title: "Couldn't take it down",
                        message: String(e?.message ?? e),
                        tone: "danger",
                      }),
                    );
              }}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
