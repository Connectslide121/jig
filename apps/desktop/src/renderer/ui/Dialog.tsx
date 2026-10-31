import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { Button, IconButton } from "./Button";
import { cn } from "./cn";
import { Input } from "./Input";

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = "md",
  column = false,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  /**
   * Lay the content out as a flex column, so a part of it (a list you add to, `min-h-0 flex-1
   * overflow-y-auto`) grows with the dialog up to the window's height and then scrolls on its own.
   */
  column?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, [data-autofocus]");
    (first ?? ref.current)?.focus();
    return () => previous?.focus?.();
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div
      className="no-drag fixed inset-0 z-40 flex items-center justify-center bg-scrim p-6 backdrop-blur-xs"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        className={cn(
          "flex max-h-full w-full flex-col rounded-xl border border-line bg-elevated text-fg shadow-popover outline-none",
          { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-6xl" }[width],
        )}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0 flex-1 truncate text-base font-semibold">{title}</div>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm", column && "flex flex-col")}>
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface Pending {
  kind: "confirm" | "prompt";
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  initial?: string;
  placeholder?: string;
  /** A prompt that may be answered with nothing (e.g. an optional title). */
  allowEmpty?: boolean;
  resolve: (value: string | undefined) => void;
}
const usePending = create<{ pending: Pending | undefined }>(() => ({ pending: undefined }));

/** Shows a dialog; one already open is answered "cancel" first, so its caller isn't left waiting. */
function show(next: Pending) {
  usePending.getState().pending?.resolve(undefined);
  usePending.setState({ pending: next });
}

/** Asks a yes/no question. Resolves `true` when confirmed. */
export function confirmDialog(options: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) =>
    show({
      kind: "confirm",
      confirmLabel: "OK",
      ...options,
      resolve: (value) => resolve(value !== undefined),
    }),
  );
}

/** Asks for a line of text. Resolves `undefined` when cancelled. */
export function promptDialog(options: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  initial?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}): Promise<string | undefined> {
  return new Promise((resolve) => show({ kind: "prompt", confirmLabel: "OK", ...options, resolve }));
}

/** Mount once at the root. */
export function DialogHost() {
  const pending = usePending((s) => s.pending);
  if (!pending) return null;
  return <PendingDialog key={pendingKey(pending)} pending={pending} />;
}

const keys = new WeakMap<Pending, number>();
let nextKey = 0;
function pendingKey(p: Pending): number {
  let key = keys.get(p);
  if (key === undefined) {
    key = ++nextKey;
    keys.set(p, key);
  }
  return key;
}

/** One question; its text field starts with `initial` on the first render (no effect, no race). */
function PendingDialog({ pending }: { pending: Pending }) {
  const [value, setValue] = useState(pending.initial ?? "");
  const finish = (result: string | undefined) => {
    usePending.setState({ pending: undefined });
    pending.resolve(result);
  };
  return (
    <Dialog
      open
      width="sm"
      title={pending.title}
      onClose={() => finish(undefined)}
      testId="dialog"
      footer={
        <>
          <Button variant="ghost" onClick={() => finish(undefined)}>
            Cancel
          </Button>
          <Button
            data-autofocus
            variant={pending.danger ? "danger" : "primary"}
            disabled={pending.kind === "prompt" && !pending.allowEmpty && !value.trim()}
            onClick={() => finish(pending.kind === "prompt" ? value.trim() : "")}
            data-testid="dialog-confirm"
          >
            {pending.confirmLabel}
          </Button>
        </>
      }
    >
      {pending.message && <div className="mb-2 text-muted">{pending.message}</div>}
      {pending.kind === "prompt" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() || pending.allowEmpty) finish(value.trim());
          }}
        >
          <Input
            value={value}
            placeholder={pending.placeholder}
            onChange={(e) => setValue(e.target.value)}
            data-testid="dialog-input"
          />
        </form>
      )}
    </Dialog>
  );
}
