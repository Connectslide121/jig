import { ArrowUp, Image as ImageIcon, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatImage, QueuedMessage, SessionMeta } from "../../../shared/engine";
import { isImagePath } from "../../../shared/files";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, ErrorBoundary, IconButton } from "../../ui";
import { useRegistry } from "../../workbench/registry";
import { notify } from "../../workbench/toasts";
import { addImages, ChatImages } from "./ChatImages";
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
  const [images, setImages] = useState<ChatImage[]>([]);
  const [dragging, setDragging] = useState(false);
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

  const send = async (value = text, withImages = images) => {
    const trimmed = value.trim();
    if (!trimmed && withImages.length === 0) return;
    setText("");
    setImages([]);
    try {
      await call("sessions.send", { id: meta.id, text: trimmed, images: withImages });
    } catch (error) {
      setText(trimmed);
      setImages(withImages);
      notify({ title: "Not sent", message: errorMessage(error), tone: "danger" });
    }
  };
  const keep = async (add: () => Promise<ChatImage[]>) => {
    try {
      const added = await add();
      setImages((list) => [...list, ...added]);
    } catch (error) {
      notify({ title: "Couldn't add the image", message: errorMessage(error), tone: "danger" });
    }
  };
  /** Pasted or dropped image files (screenshots) become images of the next message. */
  const takeImages = (files: FileList | File[]): boolean => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return false;
    void keep(() => addImages(meta.id, list));
    return true;
  };
  const attach = async () => {
    const files = await call("app.pickFiles", { title: "Attach files", defaultPath: meta.cwd });
    if (!files.length) return;
    // Images go with the message; other files are mentioned so Claude Code reads them.
    const pictures = files.filter((f) => isImagePath(f) && !/\.(svg|ico|bmp|avif)$/i.test(f));
    const others = files.filter((f) => !pictures.includes(f));
    if (pictures.length)
      void keep(() => Promise.all(pictures.map((path) => call("sessions.addImage", { id: meta.id, path }))));
    if (others.length) {
      const mentions = others.map((f) => `@${relativeTo(meta.cwd, f)}`).join(" ");
      setText((t) => (t ? `${t.trimEnd()} ${mentions} ` : `${mentions} `));
    }
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
                <span className="min-w-0 flex-1 truncate">
                  {q.images?.length ? (
                    <span className="mr-1 inline-flex items-center gap-0.5 text-muted">
                      <ImageIcon className="size-3" />
                      {q.images.length}
                    </span>
                  ) : null}
                  {q.text}
                </span>
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
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop zone for images; Attach does the same from a button. */}
        <div
          className={cn(
            "flex flex-col gap-2 rounded-lg border bg-raised p-1.5 focus-within:border-focus",
            dragging ? "border-accent" : "border-line-strong",
          )}
          data-testid="composer"
          onDragOver={(e) => {
            if ([...e.dataTransfer.items].some((i) => i.type.startsWith("image/"))) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            setDragging(false);
            if (takeImages(e.dataTransfer.files)) e.preventDefault();
          }}
        >
          <ChatImages
            images={images}
            className="px-1 pt-1"
            onRemove={(image) => setImages((list) => list.filter((i) => i !== image))}
          />
          <div className="flex items-end gap-2">
            <IconButton icon={Paperclip} label="Attach files or images" onClick={() => void attach()} />
            <textarea
              ref={ref}
              rows={1}
              value={text}
              data-testid="composer-input"
              placeholder={
                busy ? "Claude is working — your message will be sent after this turn" : "Message Claude…"
              }
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                if (takeImages(e.clipboardData.files)) e.preventDefault();
              }}
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
              disabled={!text.trim() && images.length === 0}
              data-testid="composer-send"
              onClick={() => void send()}
            >
              {busy ? "Queue" : "Send"}
            </Button>
          </div>
        </div>
        <div className="text-2xs text-hint">
          Enter to send · Shift+Enter for a new line · Paste or drop screenshots · Esc stops Claude
        </div>
      </div>
    </div>
  );
}
