import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";
import { cn, IconButton } from "../ui";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
  actions?: Array<{ label: string; run: () => void }>;
  /** ms; 0 = stays until closed. Danger toasts stay by default. */
  timeout: number;
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let nextId = 1;

/** Shows a toast in the bottom-right corner. Returns its id. */
export function notify(
  input: Omit<Toast, "id" | "tone" | "timeout"> & Partial<Pick<Toast, "tone" | "timeout">>,
) {
  const tone = input.tone ?? "info";
  const toast: Toast = {
    ...input,
    id: nextId++,
    tone,
    timeout: input.timeout ?? (tone === "danger" ? 0 : 5000),
  };
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-4), toast] }));
  return toast.id;
}

export function dismiss(id: number): void {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };
const tones = { info: "text-info", success: "text-success", warning: "text-warning", danger: "text-danger" };

function ToastCard({ toast }: { toast: Toast }) {
  useEffect(() => {
    if (!toast.timeout) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.timeout);
    return () => clearTimeout(timer);
  }, [toast]);
  const Icon = icons[toast.tone];
  return (
    <div
      role="status"
      data-testid="toast"
      className="pointer-events-auto flex w-80 gap-2 rounded-lg border border-line bg-elevated p-3 text-sm shadow-popover"
    >
      <Icon className={cn("mt-px size-4 shrink-0", tones[toast.tone])} />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-fg">{toast.title}</div>
        {toast.message && (
          <div className="selectable mt-0.5 text-xs break-words text-muted">{toast.message}</div>
        )}
        {toast.actions && (
          <div className="mt-2 flex gap-3">
            {toast.actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className="text-xs font-medium text-accent hover:underline"
                onClick={() => {
                  dismiss(toast.id);
                  a.run();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <IconButton icon={X} label="Dismiss" size="sm" onClick={() => dismiss(toast.id)} />
    </div>
  );
}

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-3 bottom-8 z-50 flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}
