/**
 * The Demo review tab (ui.md → Demo review, D-462): the demo in three device frames, its versions with
 * what changed, the critic's scorecard, comment pins, and G1's Approve / Ask for changes.
 * Frames load through `ctx.frameUrl` (a file grant, scripts on, no network) in a sandboxed iframe.
 */

import type { AddonTabProps, AddonUiContext } from "@jig/sdk";
import {
  Button,
  cn,
  Dialog,
  Empty,
  IconButton,
  Markdown,
  Spinner,
  Tabs,
  Textarea,
  useAddonEvent,
  useHostCall,
  useStorage,
} from "@jig/sdk/ui";
import { Check, ExternalLink, MapPin, MonitorPlay, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReviewVersion } from "./host";
import { DEVICES, type Device, pinAt, scoreOutOf5 } from "./lib/review";
import type { Pin, Run } from "./lib/run";
import { useAct } from "./sheets";

type Params = { projectId?: string; runId?: string };

export function ReviewTab({ ctx, params }: AddonTabProps) {
  const p = params as Params;
  const skip = !p.projectId || !p.runId;
  const run = useHostCall<Run>("run", p, { skip });
  const data = useHostCall<{ versions: ReviewVersion[] }>("review", p, { skip });
  useAddonEvent("changed", () => {
    void run.reload();
    void data.reload();
  });
  const versions = data.data?.versions ?? [];
  const [picked, setPicked] = useState<number>();
  const shown = versions.find((v) => v.version === picked) ?? versions.at(-1);
  const [pins, setPins] = useStorage<Pin[]>(`pins:${p.runId}`, [], { scope: "global" });
  const [pinMode, setPinMode] = useState(false);
  const [asking, setAsking] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  if (skip) return <Empty icon={MonitorPlay} title="No run" className="h-full" />;
  if (!run.data || !data.data)
    return run.error ? <div className="p-3 text-xs text-danger">{run.error}</div> : <Spinner center />;
  const r = run.data;
  const g1 = r.gates.find((g) => g.id === "G1");
  const waiting = g1?.status === "waiting";
  const addPin = async (pin: Omit<Pin, "text" | "screen">) => {
    const text = await ctx.prompt({
      title: `Pin ${pins.length + 1}`,
      message: "What should change here?",
      confirmLabel: "Add pin",
    });
    if (text?.trim()) await setPins([...pins, { ...pin, screen: "", text: text.trim() }]);
  };
  return (
    <div className="@container flex h-full min-h-0 flex-col" data-testid="factory-review">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="min-w-0 truncate text-sm font-semibold text-fg">{r.title}</span>
        <span className="shrink-0 text-sm text-hint @max-xl:hidden @xl:inline">· Demo review</span>
        <span className="flex shrink-0 items-center gap-1" data-testid="factory-review-versions">
          {versions.map((v) => (
            <button
              key={v.version}
              type="button"
              onClick={() => setPicked(v.version)}
              className={cn(
                "h-6 w-9 rounded-md border text-xs tabular-nums",
                v.version === shown?.version
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:bg-hover",
              )}
            >
              v{v.version}
            </button>
          ))}
        </span>
        <span
          className="flex w-24 shrink-0 items-center gap-1 text-xs text-muted"
          data-testid="factory-review-score"
        >
          {shown?.quality?.score !== undefined && (
            <>
              score <span className="tabular-nums text-fg">{scoreOutOf5(shown.quality.score)}</span>
              {shown.quality.pass ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <X className="size-3.5 text-danger" />
              )}
            </>
          )}
        </span>
        <span className="flex-1" />
        <IconButton
          icon={ExternalLink}
          size="sm"
          label="Open the demo"
          disabled={!shown}
          data-testid="factory-review-open"
          onClick={(e) => {
            if (!shown) return;
            ctx.menu(
              [
                { label: "Open in Preview", icon: "eye", onSelect: () => ctx.openPreview(shown.file) },
                { label: "Open in browser", icon: "globe", onSelect: () => ctx.openPath(shown.file) },
                {
                  label: "Show in Pages",
                  icon: "layout-template",
                  testId: "factory-review-pages",
                  onSelect: () =>
                    void ctx.host
                      .call("showInPages", { projectId: r.projectId, runId: r.id, version: shown.version })
                      .then(
                        () =>
                          ctx.notify({
                            title: `Demo v${shown.version} is in Pages`,
                            message: "Open it from the Pages view; Run scripts there for story mode.",
                            tone: "success",
                          }),
                        (err: unknown) =>
                          ctx.notify({
                            title: "Couldn't show it in Pages",
                            message: err instanceof Error ? err.message : String(err),
                            tone: "danger",
                          }),
                      ),
                },
              ],
              e.currentTarget,
            );
          }}
        />
        <Button
          size="sm"
          variant={pinMode ? "primary" : "ghost"}
          data-testid="factory-review-pin"
          onClick={() => setPinMode(!pinMode)}
          title="Click on a frame to drop a numbered pin with a comment"
        >
          <MapPin className="size-3.5" />
          Pin{pins.length ? <span className="tabular-nums"> · {pins.length}</span> : null}
        </Button>
        {waiting && (
          <>
            <Button size="sm" data-testid="factory-review-changes" onClick={() => setAsking(true)}>
              Ask for changes
            </Button>
            <ApproveButton ctx={ctx} run={r} />
          </>
        )}
      </div>
      {!shown ? (
        <Empty icon={MonitorPlay} title="No demo yet" className="flex-1" />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="@max-5xl:block @5xl:hidden">
              <Tabs
                items={DEVICES.map((d) => ({ id: d.id, label: `${d.label} ${d.width}` }))}
                value={device}
                onChange={setDevice}
              />
            </div>
            <div className="flex min-h-0 flex-1 gap-3 p-3">
              {DEVICES.map((d) => (
                <div
                  key={d.id}
                  className={cn(
                    "min-w-0 flex-col gap-1",
                    d.id === device ? "@max-5xl:flex" : "@max-5xl:hidden",
                    "@5xl:flex",
                    d.id === "desktop" ? "flex-3" : d.id === "tablet" ? "flex-2" : "flex-1",
                  )}
                >
                  <span className="h-4 truncate text-2xs text-hint tabular-nums @max-5xl:hidden @5xl:block">
                    {d.label} {d.width}
                  </span>
                  <Frame
                    ctx={ctx}
                    file={shown.file}
                    device={d.id}
                    pins={pins}
                    pinMode={pinMode}
                    onPin={(x, y) => void addPin({ device: d.id, x, y })}
                  />
                </div>
              ))}
            </div>
          </div>
          <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line p-3 @max-3xl:hidden @3xl:flex">
            <section className="flex flex-col gap-1">
              <span className="text-2xs font-semibold tracking-wide text-hint uppercase">
                What changed in v{shown.version}
              </span>
              <div className="text-xs" data-testid="factory-review-changes-log">
                {shown.changes ? (
                  <Markdown text={shown.changes} />
                ) : (
                  <span className="text-hint">No change log</span>
                )}
              </div>
            </section>
            <section className="flex flex-col gap-1" data-testid="factory-review-scorecard">
              <span className="text-2xs font-semibold tracking-wide text-hint uppercase">Scorecard</span>
              {shown.quality?.axes.length ? (
                shown.quality.axes.map((a) => (
                  <div key={a.axis} className="flex h-6 items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-muted capitalize">{a.axis}</span>
                    <span className="w-8 text-right text-fg tabular-nums">{a.value.toFixed(1)}</span>
                  </div>
                ))
              ) : (
                <span className="text-xs text-hint">Not scored yet</span>
              )}
              {!!shown.quality?.fixes.length && (
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-xs text-muted">
                  {shown.quality.fixes.map((f, i) => (
                    <li key={i}>
                      {f.screen ? <span className="text-fg">{f.screen}: </span> : null}
                      {f.change}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {!!pins.length && (
              <section className="flex flex-col gap-1">
                <span className="text-2xs font-semibold tracking-wide text-hint uppercase">Pins</span>
                <PinList pins={pins} onRemove={(i) => void setPins(pins.filter((_, j) => j !== i))} />
              </section>
            )}
          </aside>
        </div>
      )}
      {asking && (
        <AskDialog
          ctx={ctx}
          run={r}
          pins={pins}
          onRemove={(i) => void setPins(pins.filter((_, j) => j !== i))}
          onSent={() => void setPins([])}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}

function ApproveButton({ ctx, run }: { ctx: AddonUiContext; run: Run }) {
  const { act, busy } = useAct(ctx, run, () => undefined);
  return (
    <Button
      size="sm"
      variant="primary"
      busy={busy}
      data-testid="factory-review-approve"
      onClick={() => void act("decide", { gateId: "G1", kind: "approve" })}
    >
      Approve
    </Button>
  );
}

/** One device frame: the demo at the device's width, scaled to fit, with its pins over it. */
function Frame({
  ctx,
  file,
  device,
  pins,
  pinMode,
  onPin,
}: {
  ctx: AddonUiContext;
  file: string;
  device: Device;
  pins: Pin[];
  pinMode: boolean;
  onPin: (x: number, y: number) => void;
}) {
  const spec = DEVICES.find((d) => d.id === device) ?? {
    id: device,
    label: device,
    width: 1440,
    height: 900,
  };
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    ctx.frameUrl(file).then(
      (u) => live && setUrl(u),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [ctx, file]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(Math.min(el.clientWidth / spec.width, el.clientHeight / spec.height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [spec]);
  const w = spec.width * scale;
  const h = spec.height * scale;
  return (
    <div ref={box} className="relative min-h-0 flex-1" data-testid={`factory-frame-${device}`}>
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 overflow-hidden rounded-md border border-line bg-surface"
        style={{ width: w, height: h }}
      >
        {url && scale > 0 ? (
          <iframe
            title={`${spec.label} frame`}
            src={url}
            sandbox="allow-scripts"
            className="origin-top-left border-0"
            style={{ width: spec.width, height: spec.height, transform: `scale(${scale})` }}
          />
        ) : (
          <Spinner center />
        )}
        <div
          className={cn("absolute inset-0", pinMode ? "cursor-crosshair" : "pointer-events-none")}
          data-testid={`factory-frame-${device}-overlay`}
          onClick={(e) => {
            if (!pinMode) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const at = pinAt(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
            onPin(at.x, at.y);
          }}
        >
          {pins.map((p, i) =>
            p.device === device ? (
              <span
                key={i}
                className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-2xs font-semibold text-on-accent tabular-nums"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                title={p.text}
              >
                {i + 1}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

function PinList({ pins, onRemove }: { pins: Pin[]; onRemove: (i: number) => void }) {
  return (
    <div className="flex flex-col" data-testid="factory-pins">
      {pins.map((p, i) => (
        <div key={i} className="group flex min-h-7 items-center gap-2 text-xs">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-2xs font-semibold text-on-accent tabular-nums">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-fg" title={p.text}>
            {p.text}
          </span>
          <span className="w-12 shrink-0 text-right text-hint capitalize">{p.device}</span>
          <IconButton icon={X} size="sm" label="Remove pin" onClick={() => onRemove(i)} />
        </div>
      ))}
    </div>
  );
}

/** Ask for changes on G1: the pins to send (remove any first) and a note; the next version gets both. */
function AskDialog({
  ctx,
  run,
  pins,
  onRemove,
  onSent,
  onClose,
}: {
  ctx: AddonUiContext;
  run: Run;
  pins: Pin[];
  onRemove: (i: number) => void;
  onSent: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const { act, busy, error } = useAct(ctx, run, () => {
    onSent();
    onClose();
  });
  const empty = !note.trim() && !pins.length;
  return (
    <Dialog
      open
      onClose={onClose}
      width="md"
      testId="factory-review-ask"
      title="Ask for changes"
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={busy}
            disabled={empty}
            title={empty ? "Drop a pin or say what to change" : undefined}
            data-testid="factory-review-send"
            onClick={() => void act("decide", { gateId: "G1", kind: "changes", note: note.trim(), pins })}
          >
            Send to Jig
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {pins.length ? (
          <PinList pins={pins} onRemove={onRemove} />
        ) : (
          <span className="text-xs text-hint">
            No pins. Turn on Pin and click a frame to point at something.
          </span>
        )}
        <Textarea
          rows={3}
          value={note}
          placeholder="Anything else to change"
          onChange={(e) => setNote(e.target.value)}
          data-testid="factory-review-note"
        />
      </div>
    </Dialog>
  );
}
