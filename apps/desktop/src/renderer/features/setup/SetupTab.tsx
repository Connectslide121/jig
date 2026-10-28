import { CheckCircle2, CircleAlert, CircleDashed, ExternalLink, LogIn, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { SetupCheck, UpdateInfo } from "../../../shared/setup";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Badge, Button, Card, Spinner } from "../../ui";
import { runAction } from "../../workbench/registry";
import { workbench } from "../../workbench/store";
import { notify } from "../../workbench/toasts";

function CheckRow({ check }: { check: SetupCheck }) {
  const Icon = check.ok ? CheckCircle2 : check.optional ? CircleDashed : CircleAlert;
  const tone = check.ok ? "text-success" : check.optional ? "text-hint" : "text-danger";
  return (
    <div
      className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0"
      data-testid={`setup-${check.id}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {check.label}
          {check.optional && <Badge>optional</Badge>}
        </div>
        <div className="selectable text-sm text-muted">{check.detail}</div>
        {!check.ok && check.help && <div className="selectable mt-1 text-xs text-hint">{check.help}</div>}
      </div>
      <div className="flex shrink-0 gap-2">
        {check.id === "claude" && check.ok && (
          <Button size="sm" icon={LogIn} onClick={() => runAction("jig.claudeLogin")}>
            Sign in to Claude Code…
          </Button>
        )}
        {!check.ok && check.url && (
          <Button
            size="sm"
            variant="ghost"
            icon={ExternalLink}
            onClick={() => void call("app.openExternal", { url: check.url! })}
          >
            How to install
          </Button>
        )}
      </div>
    </div>
  );
}

/** Get started: what Jig needs on this machine, and updates. Opens on an installed Jig's first start. */
export function SetupTab() {
  const [checks, setChecks] = useState<SetupCheck[]>();
  const [loading, setLoading] = useState(false);
  const firstRunDone = useConfig((s) => s.config?.setup.firstRunDone);
  const load = useCallback(() => {
    setLoading(true);
    void call("setup.check")
      .then(setChecks)
      .catch((e) => notify({ title: "Couldn't run the checks", message: errorMessage(e), tone: "danger" }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);
  const missing = checks?.filter((c) => !c.ok && !c.optional).length ?? 0;
  return (
    <div className="h-full overflow-y-auto" data-testid="setup-tab">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Get started</h1>
          <p className="mt-1 text-sm text-muted">
            Jig uses the tools already on your machine with your own logins — Claude Code, git, and optionally
            the GitHub and Azure CLIs and VS Code. It only asks each for its version; it never reads a login.
          </p>
        </div>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm">
            <span className="flex-1 font-medium">
              {checks === undefined
                ? "Checking…"
                : missing
                  ? `${missing} needed tool${missing === 1 ? "" : "s"} missing`
                  : "Everything Jig needs is there"}
            </span>
            {loading && <Spinner size="sm" />}
            <Button
              size="sm"
              variant="ghost"
              icon={RefreshCw}
              onClick={load}
              disabled={loading}
              data-testid="setup-recheck"
            >
              Check again
            </Button>
          </div>
          {checks?.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </Card>
        <UpdatesCard />
        {!firstRunDone && (
          <div>
            <Button
              variant="primary"
              onClick={() => {
                void updateConfig({ setup: { firstRunDone: true } });
                const tab = workbench.activeTab();
                if (tab?.type === "jig.setup") workbench.closeTab(tab.id);
              }}
              data-testid="setup-done"
            >
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export async function applyUpdate(info: UpdateInfo): Promise<void> {
  try {
    const { restarting } = await call("updates.apply");
    if (info.mode === "source")
      notify({
        title: restarting ? "Updated — restarting Jig" : "Updated — restart Jig to use it",
        tone: "success",
      });
  } catch (error) {
    notify({ title: "Update failed", message: errorMessage(error), tone: "danger" });
  }
}

function UpdatesCard() {
  const [info, setInfo] = useState<UpdateInfo>();
  const [busy, setBusy] = useState(false);
  const check = () => {
    setBusy(true);
    void call("updates.check")
      .then(setInfo)
      .catch((e) => notify({ title: "Couldn't check for updates", message: errorMessage(e), tone: "danger" }))
      .finally(() => setBusy(false));
  };
  return (
    <Card className="flex flex-col gap-2 p-4 text-sm" data-testid="updates-card">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">Updates</span>
        <Button size="sm" icon={RefreshCw} onClick={check} disabled={busy} data-testid="updates-check">
          Check for updates
        </Button>
      </div>
      <div className="text-muted">
        {info
          ? info.detail
          : "Running from a git clone, Jig updates with git pull + build. An installed Jig looks for a newer release on GitHub."}
      </div>
      {info?.available && (
        <div>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void applyUpdate(info).finally(() => setBusy(false));
            }}
            data-testid="updates-apply"
          >
            {info.mode === "source" ? "Pull, build and restart" : "Download the new version"}
          </Button>
        </div>
      )}
    </Card>
  );
}
