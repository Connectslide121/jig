/**
 * New idea (ui.md → New idea, D-460): the idea as typed, dictated or pasted, files, a meeting from your
 * history, the project and whether it is a change to its product or a new one; Start interview opens
 * the run's Interview tab. It opens from the top bar, the Floor, a message's ⋯ menu and a meeting's
 * ⋯ menu (through the `ideaFrom` export, which leaves a pending idea for this dialog).
 */

import type { AddonAttachment, AddonUiContext } from "@jig/sdk";
import {
  Attachments,
  Button,
  Dialog,
  Dictate,
  ProjectSwatch,
  Select,
  Textarea,
  useActiveProject,
  useHostCall,
  useProjectList,
} from "@jig/sdk/ui";
import { Paperclip } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Run } from "./lib/run";
import { openInterview } from "./parts";

export interface IdeaPrefill {
  text?: string;
  title?: string;
  source?: Run["source"];
}

// Which New idea is open: module state, so the top bar, the Floor and the menus open the same one.
let open: IdeaPrefill | undefined;
const listeners = new Set<() => void>();

export function openNewIdea(prefill: IdeaPrefill = {}) {
  open = prefill;
  for (const l of listeners) l();
}

export function closeNewIdea() {
  open = undefined;
  for (const l of listeners) l();
}

export function useNewIdea(): IdeaPrefill | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}

/** The manifest's action and the top bar's "New idea…". */
export function newIdea(_ctx: AddonUiContext) {
  openNewIdea();
}

/** A message's ⋯ menu: the reply becomes the idea (`context.message`). */
export function fromMessage(_ctx: AddonUiContext, target: { sessionId?: string; text?: string }) {
  openNewIdea({
    text: target?.text ?? "",
    source: { kind: "message", ...(target?.sessionId ? { ref: target.sessionId } : {}) },
  });
}

/** Adds dictated words after the text that was there when you started speaking. */
function useDictation(text: string, setText: (t: string) => void) {
  const base = useRef<string | undefined>(undefined);
  const latest = useRef(text);
  latest.current = text;
  return (words: string, final: boolean) => {
    base.current ??= latest.current;
    const b = base.current;
    const gap = b && !/\s$/.test(b) ? " " : "";
    setText(`${b}${gap}${words}`);
    if (final) base.current = undefined;
  };
}

type Meeting = { id: string; title: string; startedAt: string };

export function NewIdeaDialog({ ctx, prefill }: { ctx: AddonUiContext; prefill: IdeaPrefill }) {
  const projects = useProjectList();
  const active = useActiveProject();
  const { data: meetings } = useHostCall<Meeting[]>("meetings");
  const [text, setText] = useState(prefill.text ?? "");
  const [projectId, setProjectId] = useState(active?.id ?? projects[0]?.id ?? "");
  const [product, setProduct] = useState<"existing" | "new">("existing");
  const [meetingId, setMeetingId] = useState(
    prefill.source?.kind === "meeting" && !prefill.text ? (prefill.source.ref ?? "") : "",
  );
  const [files, setFiles] = useState<AddonAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const dictated = useDictation(text, setText);
  const project = projects.find((p) => p.id === projectId);
  const ready = !!projectId && (!!text.trim() || !!meetingId);
  const add = (list: AddonAttachment[]) => setFiles((f) => [...f, ...list].slice(0, 20));
  const close = () => {
    if (!busy) closeNewIdea();
  };
  return (
    <Dialog
      open
      onClose={close}
      width="lg"
      testId="factory-new-idea"
      title={prefill.title ? `New idea · ${prefill.title}` : "New idea"}
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
            data-testid="factory-idea-start"
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                const r = await ctx.host.call<Run>("startRun", {
                  projectId,
                  text: text.trim() || undefined,
                  title: prefill.title,
                  meetingId: meetingId || undefined,
                  attachments: files.map((f) => ({ path: f.path, name: f.name })),
                  productExists: product === "existing",
                  source: prefill.source,
                });
                closeNewIdea();
                openInterview(ctx, r);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Start interview
          </Button>
        </>
      }
    >
      <div
        className="flex flex-col gap-3 text-xs"
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          add(await ctx.attachments.add(e.dataTransfer.files));
        }}
      >
        <div className="relative">
          <Textarea
            rows={6}
            value={text}
            autoFocus
            placeholder="Describe the idea, paste anything, or press the mic…"
            onChange={(e) => setText(e.target.value)}
            onPaste={async (e) => {
              if (!e.clipboardData.files.length) return;
              e.preventDefault();
              add(await ctx.attachments.add(e.clipboardData.files));
            }}
            className="pr-10"
            data-testid="factory-idea-text"
          />
          <span className="absolute right-2 bottom-2">
            <Dictate target="factory-new-idea" onText={dictated} />
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            icon={Paperclip}
            data-testid="factory-idea-files"
            onClick={async () => add(await ctx.attachments.pick({ title: "Files for the interview" }))}
          >
            Add files…
          </Button>
          <Select
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            className="w-72"
            disabled={!meetings?.length && !meetingId}
            data-testid="factory-idea-meeting"
          >
            <option value="">{meetings?.length ? "From a meeting…" : "No meetings in your history"}</option>
            {meetingId && !meetings?.some((m) => m.id === meetingId) && (
              <option value={meetingId}>{prefill.title ?? "This meeting"}</option>
            )}
            {(meetings ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.startedAt.slice(0, 10)} · {m.title}
              </option>
            ))}
          </Select>
        </div>
        {/* A fixed box for the files, so adding one moves nothing. */}
        <div className="flex h-16 items-center overflow-x-auto rounded-md border border-dashed border-line px-2">
          {files.length ? (
            <Attachments
              files={files}
              row
              onRemove={(f) => setFiles((l) => l.filter((x) => x.path !== f.path))}
            />
          ) : (
            <span className="w-full text-center text-hint">
              Drop or paste screenshots, documents and notes here
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-hint">Project</span>
          <span className="flex size-4 shrink-0 items-center justify-center">
            <ProjectSwatch color={project?.color} />
          </span>
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-60"
            data-testid="factory-idea-project"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            value={product}
            onChange={(e) => setProduct(e.target.value as typeof product)}
            className="w-60"
            data-testid="factory-idea-product"
          >
            <option value="existing">A change to its product</option>
            <option value="new">A new product</option>
          </Select>
        </div>
        <span className="text-hint">
          Jig interviews you about the idea with question cards, writes a one-page brief and checks it against
          what exists. Nothing else starts until you say the brief looks right.
        </span>
      </div>
    </Dialog>
  );
}
