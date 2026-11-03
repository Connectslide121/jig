import { CheckCircle2, Copy, Download, LogIn, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { copyText } from "../../lib/clipboard";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, Dialog, Spinner } from "../../ui";
import { useCompletion, watchCompletion } from "./store";

const useDialog = create<{ open: boolean }>(() => ({ open: false }));

/** Opens "Set up GitHub Copilot": download the language server, then sign in to GitHub (D-255). */
export function openCopilotDialog(): void {
  watchCompletion();
  useDialog.setState({ open: true });
}

function Step({
  n,
  title,
  done,
  active,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-3", !active && !done && "opacity-50")}>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          done ? "bg-success-soft text-success" : "bg-accent-soft text-accent",
        )}
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm font-medium">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Body() {
  const state = useCompletion((s) => s.state);
  const [code, setCode] = useState<string>();
  const [busy, setBusy] = useState<"download" | "signin">();
  const [error, setError] = useState("");
  const copilot = state?.copilot;
  const close = () => useDialog.setState({ open: false });
  // Signed in meanwhile (in the browser): the code is no longer needed.
  useEffect(() => {
    if (copilot?.signedIn) setCode(undefined);
  }, [copilot?.signedIn]);
  const run = async (what: "download" | "signin", work: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(undefined);
    }
  };
  const installed = Boolean(copilot?.installed);
  const signedIn = Boolean(copilot?.signedIn);
  return (
    <Dialog
      open
      title="Set up GitHub Copilot"
      width="md"
      onClose={close}
      testId="copilot-dialog"
      footer={
        <Button variant={signedIn ? "primary" : "secondary"} onClick={close}>
          {signedIn ? "Done" : "Close"}
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Optional: Copilot suggests code as you type in the editor; Tab takes a suggestion. It needs a GitHub
          account with Copilot. Jig uses it for completions only, and GitHub's own program keeps your sign-in.
        </p>
        <Step n={1} title="Download Copilot's language server" done={installed} active={!installed}>
          <div className="flex h-8 items-center gap-3">
            {installed ? (
              <span className="text-xs text-muted">Version {copilot?.version}</span>
            ) : (
              <Button
                size="sm"
                icon={Download}
                busy={busy === "download" || copilot?.phase === "downloading"}
                onClick={() => void run("download", () => call("completion.copilotSetup"))}
              >
                Download (about 28 MB)
              </Button>
            )}
          </div>
        </Step>
        <Step n={2} title="Sign in to GitHub" done={signedIn} active={installed && !signedIn}>
          {/* A fixed height, so the dialog doesn't move when the code or the account appears. */}
          <div className="flex h-16 items-center gap-3">
            {signedIn ? (
              <span className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-muted" />
                Signed in{copilot?.user ? ` as ${copilot.user}` : ""}
              </span>
            ) : code ? (
              <>
                <code className="rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-lg tracking-widest">
                  {code}
                </code>
                <div className="min-w-0 flex-1 text-xs text-muted">
                  The code is copied. Paste it on the GitHub page that opened in your browser.
                  {copilot?.phase === "signing-in" && <Spinner size="sm" className="ml-2 inline-block" />}
                </div>
                <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copyText(code)}>
                  Copy
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                icon={LogIn}
                disabled={!installed}
                busy={busy === "signin"}
                onClick={() =>
                  void run("signin", async () => {
                    const result = await call("completion.copilotSignIn");
                    if (result.userCode) {
                      setCode(result.userCode);
                      await copyText(result.userCode);
                    }
                  })
                }
              >
                Sign in with GitHub…
              </Button>
            )}
          </div>
        </Step>
        <p
          role={error ? "alert" : "status"}
          className={cn("h-8 text-xs", error ? "text-danger" : "text-hint")}
        >
          {error || copilot?.message || ""}
        </p>
      </div>
    </Dialog>
  );
}

export function CopilotDialogHost() {
  const open = useDialog((s) => s.open);
  return open ? <Body /> : null;
}
