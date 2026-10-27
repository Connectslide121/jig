import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { QueuedMessage, SessionMeta } from "../../../shared/engine";
import { call, errorMessage } from "../../lib/host";
import { Button, ErrorBoundary, IconButton } from "../../ui";
import { useRegistry } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { usePrompts } from "./prompts";

function relativeTo(cwd: string, path: string): string {
  const norm = (p: string) => p.replaceAll("\\", "/");
  const base = norm(cwd).replace(/\/$/, "");
  const p = norm(path);
  return p.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? p.slice(base.length + 1) : p;
}

export function Composer({
  meta,
  queue,
  active,
}: {
  meta: SessionMeta;
  queue: QueuedMessage[];
  active: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const prompts = Object.values(usePrompts());
  const toolbar = Object.values(useRegistry((s) => s.chatToolbar));
  const busy = meta.status === "working" || meta.status === "needs_you" || meta.status === "starting";

  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize whenever the text changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const send = async (value = text) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setText("");
    try {
      await call("sessions.send", { id: meta.id, text: trimmed });
    } catch (error) {
      setText(trimmed);
      notify({ title: "Not sent", message: errorMessage(error), tone: "danger" });
    }
  };
  const attach = async () => {
    const files = await call("app.pickFiles", { title: "Attach files", defaultPath: meta.cwd });
    if (!files.length) return;
    const mentions = files.map((f) => `@${relativeTo(meta.cwd, f)}`).join(" ");
    setText((t) => (t ? `${t.trimEnd()} ${mentions} ` : `${mentions} `));
    ref.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-line bg-canvas px-6 pt-2 pb-3">
      <div className="mx-auto flex max-w-[var(--jig-chat-width)] flex-col gap-2">
        {queue.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="queue">
            <div className="text-2xs font-medium text-hint uppercase">Sends after this turn</div>
            {queue.map((q) => (
              <div key={q.id} className="flex items-center gap-2 rounded-md bg-surface px-2 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate">{q.text}</span>
                <IconButton
                  icon={X}
                  size="sm"
                  label="Remove from queue"
                  onClick={() => void call("sessions.removeQueued", { id: meta.id, queuedId: q.id })}
                />
              </div>
            ))}
          </div>
        )}
        {(prompts.length > 0 || toolbar.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {toolbar.map((item) => (
              <ErrorBoundary key={item.id} label={item.id}>
                <item.component sessionId={meta.id} projectId={meta.projectId} />
              </ErrorBoundary>
            ))}
            {prompts.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant="secondary"
                onClick={() =>
                  p.send ? void send(p.text) : setText((t) => (t ? `${t}\n${p.text}` : p.text))
                }
              >
                {p.label}
              </Button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border border-line-strong bg-raised p-1.5 focus-within:border-focus">
          <IconButton icon={Paperclip} label="Attach files" onClick={() => void attach()} />
          <textarea
            ref={ref}
            rows={1}
            value={text}
            data-testid="composer-input"
            placeholder={
              busy ? "Claude is working — your message will be sent after this turn" : "Message Claude…"
            }
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              } else if (e.key === "Escape" && busy) {
                e.preventDefault();
                void call("sessions.interrupt", { id: meta.id });
              }
            }}
            className="max-h-80 min-h-7 flex-1 resize-none bg-transparent py-1 text-sm text-fg outline-none placeholder:text-hint"
          />
          {busy && (
            <Button
              size="md"
              variant="secondary"
              icon={Square}
              data-testid="composer-stop"
              onClick={() => void call("sessions.interrupt", { id: meta.id })}
            >
              Stop
            </Button>
          )}
          <Button
            size="md"
            variant="primary"
            icon={ArrowUp}
            disabled={!text.trim()}
            data-testid="composer-send"
            onClick={() => void send()}
          >
            {busy ? "Queue" : "Send"}
          </Button>
        </div>
        <div className="text-2xs text-hint">
          Enter to send · Shift+Enter for a new line · Esc stops Claude
        </div>
      </div>
    </div>
  );
}
