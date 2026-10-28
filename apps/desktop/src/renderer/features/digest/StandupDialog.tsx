import { Copy, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Dialog, Markdown, Spinner } from "../../ui";

type Period = "workday" | "week";
const useDialog = create<{ open: boolean }>(() => ({ open: false }));

export function openStandup(): void {
  useDialog.setState({ open: true });
}

function Standup() {
  const [period, setPeriod] = useState<Period>("workday");
  const [result, setResult] = useState<{ text: string; since: string; repos: number; chats: number }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = () => useDialog.setState({ open: false });
  const write = useCallback(async (p: Period) => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await call("digest.standup", { period: p }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void write(period);
  }, [period, write]);
  return (
    <Dialog
      open
      onClose={close}
      title="Your standup"
      width="lg"
      testId="standup"
      footer={
        <>
          <Button variant="ghost" icon={RefreshCw} disabled={busy} onClick={() => void write(period)}>
            Write again
          </Button>
          <Button
            variant="primary"
            icon={Copy}
            disabled={!result || busy}
            onClick={() => {
              if (!result) return;
              void navigator.clipboard.writeText(result.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          {(
            [
              ["workday", "Since the last working day"],
              ["week", "Last 7 days"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={period === id}
              onClick={() => setPeriod(id)}
              className={cn(
                "h-6 rounded-md border px-2",
                period === id ? "border-accent bg-accent-soft text-fg" : "border-line hover:bg-hover",
              )}
            >
              {label}
            </button>
          ))}
          {result && !busy && (
            <span className="text-hint">
              from {result.repos} repositories and {result.chats} chats
            </span>
          )}
        </div>
        {busy ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted">
            <Spinner size="sm" /> Claude is reading your commits and chats…
          </div>
        ) : error ? (
          <div className="text-sm text-danger">{error}</div>
        ) : result ? (
          <div className="rounded-md border border-line bg-surface p-3" data-testid="standup-text">
            <Markdown text={result.text} />
          </div>
        ) : null}
        <div className="text-2xs text-hint">
          Written by Claude from your commits (your git email) in every repository, uncommitted changes and
          the chats you had. Read it before you share it.
        </div>
      </div>
    </Dialog>
  );
}

export function StandupHost() {
  const open = useDialog((s) => s.open);
  return open ? <Standup /> : null;
}
