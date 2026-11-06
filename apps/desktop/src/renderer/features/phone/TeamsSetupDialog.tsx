import {
  BookOpen,
  CheckCircle2,
  Circle,
  FolderOpen,
  Link2,
  Package,
  Play,
  RotateCcw,
  Wrench,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  isTeamsCredential,
  type PhoneState,
  type TeamsSetupStatus,
  type TeamsSetupView,
} from "../../../shared/phone";
import { call, errorMessage } from "../../lib/host";
import { Button, cn, confirmDialog, Dialog, Input, Select, Spinner } from "../../ui";
import { notify } from "../../workbench/toasts";
import { TeamsResources } from "./TeamsResources";

/** The written guide: the same in the Azure portal, and what to ask an admin. */
export const TEAMS_GUIDE_URL = "https://github.com/Connectslide121/jig/blob/main/docs/guides/teams-phone.md";

/** A row: "where", a Create step's id, "package", "upload", "team", "teamApp" or "pair". */
type RowId = string;
interface Row {
  id: RowId;
  title: string;
  creates: string;
  status: TeamsSetupStatus;
}

const STATUS_WORDS: Record<TeamsSetupStatus, string> = {
  todo: "Not done yet",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

/** A row's status at its far right: the same slot in every row, so nothing moves when it changes. */
function StatusMark({ status }: { status: TeamsSetupStatus }) {
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center"
      role="img"
      aria-label={STATUS_WORDS[status]}
      data-status={status}
    >
      {status === "running" ? (
        <Spinner size="sm" />
      ) : status === "done" ? (
        <CheckCircle2 className="size-4 text-success" />
      ) : status === "failed" ? (
        <XCircle className="size-4 text-danger" />
      ) : (
        <Circle className="size-4 text-hint" />
      )}
    </span>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="px-2 pt-3 pb-1 text-2xs font-medium tracking-wide text-hint uppercase">{title}</div>
      {children}
    </div>
  );
}

/** The four parts of the setup and their rows, in a fixed order with fixed rows (D-370). */
function rowsOf(
  view: TeamsSetupView,
  phone: PhoneState,
): { where: Row; create: Row[]; teams: Row[]; pair: Row } {
  const created = view.created;
  const done = (yes: boolean): TeamsSetupStatus => (yes ? "done" : "todo");
  return {
    where: {
      id: "where",
      title: "Where",
      creates: view.tenant
        ? `${view.tenant.name ?? view.tenant.id} · ${view.choice.region ?? "no region"} · ${view.choice.group}`
        : "The tenant, a subscription, a region",
      status:
        view.manual || view.started ? "done" : view.loading ? "running" : view.whereError ? "failed" : "todo",
    },
    create: view.steps.map((s) => ({
      id: s.id,
      title: s.title,
      creates: s.creates,
      status: view.manual ? "done" : s.status,
    })),
    teams: [
      {
        id: "package",
        title: "App package",
        creates: "Jig writes it and shows it in your files",
        status: done(Boolean(view.packagePath)),
      },
      {
        id: "upload",
        title: "Upload it for yourself",
        creates: "The 1:1 chat with the bot",
        status: done(view.installs.app),
      },
      {
        id: "team",
        title: "A private team named Jig",
        creates: "Where projects get channels",
        status: done(view.installs.team),
      },
      {
        id: "teamApp",
        title: "Add the app to the team",
        creates: "And allow its channel permissions",
        status: done(view.installs.team),
      },
    ],
    pair: {
      id: "pair",
      title: "Send the code",
      creates: "Only your account can talk to the bot",
      status:
        phone.status === "connected" ? "done" : phone.status === "pairing" && created ? "running" : "todo",
    },
  };
}

/** Which row to show first: what's running, what failed, else the first that isn't done. */
function currentRow(view: TeamsSetupView, phone: PhoneState): RowId {
  const rows = rowsOf(view, phone);
  const all = [rows.where, ...rows.create, ...rows.teams, rows.pair];
  return (
    all.find((r) => r.status === "running" && r.id !== "pair")?.id ??
    all.find((r) => r.status === "failed")?.id ??
    all.find((r) => r.status !== "done")?.id ??
    "pair"
  );
}

/**
 * Settings → Phone → Set up Teams (D-370, D-381): a fixed list of steps on the left
 * (status at the far right), the picked step's details on the right. Create runs the listed `az`
 * commands only when you press it.
 */
export function TeamsSetupDialog({
  open,
  phone,
  onClose,
}: {
  open: boolean;
  phone: PhoneState;
  onClose: () => void;
}) {
  const [view, setView] = useState<TeamsSetupView>();
  const [picked, setPicked] = useState<RowId>();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!open) return;
    const off = window.jig.on("phone.teamsSetupChanged", setView);
    void call("phone.teamsSetup", { load: true, installs: true })
      .then(setView)
      .catch((error) =>
        notify({ tone: "danger", title: "Couldn't open Teams setup", message: errorMessage(error) }),
      );
    return off;
  }, [open]);

  // While the app isn't in Teams yet, ask the relay every few seconds whether it sees it.
  const waitingForTeams = Boolean(view?.created && !(view.installs.app && view.installs.team));
  useEffect(() => {
    if (!open || !waitingForTeams) return;
    const timer = setInterval(
      () =>
        void call("phone.teamsSetup", { installs: true })
          .then(setView)
          .catch(() => undefined),
      5000,
    );
    return () => clearInterval(timer);
  }, [open, waitingForTeams]);

  const close = () => {
    setPicked(undefined);
    onClose();
  };
  if (!view) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title="Set up Teams"
        width="xl"
        column
        testId="teams-setup-dialog"
        footer={
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
        }
      >
        {/* As tall as the steps and the detail below, so nothing moves when they arrive. */}
        <div className="@container flex min-h-0 flex-1">
          <div className="w-full @max-2xl:h-147 @2xl:h-128">
            <Spinner center />
          </div>
        </div>
      </Dialog>
    );
  }

  const rows = rowsOf(view, phone);
  const auto = currentRow(view, phone);
  // Follow Create while it runs; otherwise what you picked.
  const selected = view.running ? auto : (picked ?? auto);
  const failed = view.steps.some((s) => s.status === "failed");

  const run = async (method: "phone.teamsSetupCreate" | "phone.teamsPackage") => {
    setBusy(true);
    try {
      setView(await call(method));
      setPicked(undefined);
    } catch (error) {
      notify({
        tone: "danger",
        title: method === "phone.teamsPackage" ? "Couldn't write the app package" : "Couldn't start",
        message: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };
  const startOver = async () => {
    const ok = await confirmDialog({
      title: "Start over?",
      message: (
        <div className="flex flex-col gap-2">
          <span>Jig forgets this setup. What Create already made stays in Azure; delete it yourself:</span>
          {view.resources && <TeamsResources resources={view.resources} />}
        </div>
      ),
      confirmLabel: "Start over",
      danger: true,
    });
    if (ok) setView(await call("phone.teamsSetupForget"));
  };

  const row = (r: Row, n?: number) => (
    <button
      key={r.id}
      type="button"
      onClick={() => setPicked(r.id)}
      aria-current={selected === r.id}
      data-testid={`teams-step-${r.id}`}
      className={cn(
        "flex h-11 w-full shrink-0 items-center gap-2 rounded-md px-2 text-left focus-visible:outline-2 focus-visible:outline-accent",
        selected === r.id ? "bg-active" : "hover:bg-hover",
      )}
    >
      <span className="w-4 shrink-0 text-right text-xs text-hint tabular-nums">{n ?? ""}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">{r.title}</span>
        <span className="block truncate text-xs text-muted">{r.creates}</span>
      </span>
      <StatusMark status={r.status} />
    </button>
  );

  const primary = view.created ? (
    phone.status === "connected" && view.installs.team ? (
      <Button variant="primary" onClick={close}>
        Done
      </Button>
    ) : (
      <Button
        variant={view.packagePath ? "secondary" : "primary"}
        icon={view.packagePath ? FolderOpen : Package}
        busy={busy}
        onClick={() => void run("phone.teamsPackage")}
        data-testid="teams-package"
      >
        {view.packagePath ? "Show the app package" : "Make the app package"}
      </Button>
    )
  ) : (
    <Button
      variant="primary"
      icon={failed ? RotateCcw : Play}
      busy={busy || view.running}
      disabled={
        view.running || (!view.started && !(view.tenant && view.choice.subscription && view.choice.region))
      }
      onClick={() => void run("phone.teamsSetupCreate")}
      data-testid="teams-create"
    >
      {failed ? "Retry" : view.started ? "Continue" : "Create"}
    </Button>
  );

  return (
    <>
      <Dialog
        open={open && !manual}
        onClose={close}
        title="Set up Teams"
        width="xl"
        column
        testId="teams-setup-dialog"
        footer={
          <>
            <Button
              variant="ghost"
              icon={BookOpen}
              onClick={() => void call("app.openExternal", { url: TEAMS_GUIDE_URL })}
            >
              Portal guide
            </Button>
            {view.started && !view.created && !view.running ? (
              <Button
                variant="ghost"
                icon={RotateCcw}
                onClick={() => void startOver()}
                data-testid="teams-start-over"
              >
                Start over…
              </Button>
            ) : (!view.started && !view.created) || (view.created && phone.status === "off") ? (
              <Button
                variant="ghost"
                icon={Wrench}
                onClick={() => setManual(true)}
                data-testid="teams-manual"
              >
                Made it in the portal…
              </Button>
            ) : null}
            <span className="flex-1" />
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            {primary}
          </>
        }
      >
        <div className="@container flex min-h-0 flex-1">
          <div className="flex min-h-0 w-full gap-3 @max-2xl:flex-col @2xl:flex-row">
            <nav
              aria-label="Setup steps"
              className="flex shrink-0 flex-col overflow-y-auto rounded-md border border-line bg-surface p-1 @max-2xl:h-64 @2xl:h-128 @2xl:w-72"
            >
              <Group title="1 · Where">{row(rows.where)}</Group>
              <Group title="2 · Create">{rows.create.map((r, i) => row(r, i + 1))}</Group>
              <Group title="3 · Add to Teams">{rows.teams.map((r, i) => row(r, i + 1))}</Group>
              <Group title="4 · Pair">{row(rows.pair)}</Group>
            </nav>
            <section
              className="flex min-w-0 flex-col rounded-md border border-line p-4 @max-2xl:h-80 @max-2xl:shrink-0 @2xl:h-128 @2xl:flex-1"
              data-testid="teams-detail"
            >
              <Detail id={selected} view={view} phone={phone} />
            </section>
          </div>
        </div>
      </Dialog>
      <ManualDialog open={open && manual} onClose={() => setManual(false)} onDone={setView} />
    </>
  );
}

/** One fixed line at the bottom of the detail: a hint, or what went wrong (never pushes the rest). */
function Footnote({ error, children }: { error?: string; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "mt-3 flex h-16 shrink-0 items-center rounded-md border px-3 text-xs",
        error ? "border-danger/40 bg-danger-soft text-danger" : "border-line bg-surface text-muted",
      )}
      aria-live="polite"
      data-testid="teams-footnote"
    >
      <span className="line-clamp-3 select-text">{error ?? children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-9 items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center">{children}</span>
    </div>
  );
}

function Detail({ id, view, phone }: { id: RowId; view: TeamsSetupView; phone: PhoneState }) {
  if (id === "where") return <WhereDetail view={view} />;
  const step = view.steps.find((s) => s.id === id);
  if (step)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <h3 className="text-sm font-medium text-fg">{step.title}</h3>
        <p className="mt-0.5 text-xs text-muted">{step.creates}</p>
        <ol className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" data-testid="teams-commands">
          {step.commands.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <code className="min-w-0 flex-1 rounded-sm bg-code px-2 py-1 font-mono text-xs break-all text-fg select-text">
                {c.text}
              </code>
              <span className="pt-1">
                <StatusMark status={view.manual ? "done" : c.status} />
              </span>
            </li>
          ))}
        </ol>
        <Footnote error={step.error}>
          {view.manual
            ? "You made this in the Azure portal."
            : `Runs with Jig's az for the tenant in the top bar${view.tenant?.name ? ` (${view.tenant.name})` : ""}, in order, when you press Create. A failure stops there; Retry goes on from it.`}
        </Footnote>
      </div>
    );
  const teams: Record<string, { title: string; body: ReactNode; seen?: boolean }> = {
    package: {
      title: "The app package",
      body: (
        <p>
          Jig writes a Teams app for your bot: the 1:1 chat and the team, its command list, Jig's icons, and
          the permissions a team's owner grants it (make and rename channels, read its threads without an
          @mention). Press <b>Make the app package</b>: it opens in your files, ready to upload.
        </p>
      ),
    },
    upload: {
      title: "Upload it for yourself",
      body: (
        <ol className="list-decimal pl-5">
          <li>In Teams, open Apps → Manage your apps.</li>
          <li>Upload an app → Upload a custom app, and pick jig-teams-app.zip.</li>
          <li>Press Add. The 1:1 chat with Jig opens.</li>
        </ol>
      ),
      seen: view.installs.app,
    },
    team: {
      title: "A private team named Jig",
      body: (
        <ol className="list-decimal pl-5">
          <li>In Teams, open Teams → Join or create a team (the + at the top).</li>
          <li>Create team → From scratch → Private, and name it Jig.</li>
          <li>Skip adding members: it's yours alone.</li>
        </ol>
      ),
      seen: view.installs.team,
    },
    teamApp: {
      title: "Add the app to the team",
      body: (
        <ol className="list-decimal pl-5">
          <li>Apps → Manage your apps → Jig → Add to a team, and pick Jig.</li>
          <li>Allow what it asks for the team: creating and renaming channels, reading its messages.</li>
          <li>Without that permission chats still work, in threads of General.</li>
        </ol>
      ),
      seen: view.installs.team,
    },
  };
  const t = teams[id];
  if (t)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <h3 className="text-sm font-medium text-fg">{t.title}</h3>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto text-sm leading-6 text-muted">{t.body}</div>
        <Footnote>
          {!view.created
            ? "After Create."
            : id === "package"
              ? view.packagePath
                ? `Written to ${view.packagePath}`
                : "Not written yet."
              : t.seen
                ? "The relay saw it. ✓"
                : "Ticks by itself when the relay sees it (Jig asks every few seconds)."}
        </Footnote>
      </div>
    );
  // Pair
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h3 className="text-sm font-medium text-fg">Send the code</h3>
      <p className="mt-0.5 text-xs text-muted">From then on the bot only talks to your account.</p>
      <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
        {phone.status === "connected" ? (
          <span className="text-fg" data-testid="teams-paired">
            Connected to {phone.owner}. Jig will message you in Teams.
          </span>
        ) : phone.status === "pairing" && view.created ? (
          <>
            <span>In the 1:1 chat with Jig in Teams, send</span>
            <span
              className="font-mono text-2xl font-semibold tracking-widest text-fg"
              data-testid="teams-code"
            >
              {phone.code}
            </span>
          </>
        ) : (
          <span>After Create, Jig shows a 6-digit code here.</span>
        )}
      </div>
      <Footnote>
        Jig keeps the relay's key encrypted on this computer; the bot's secret stays in Azure.
      </Footnote>
    </div>
  );
}

function WhereDetail({ view }: { view: TeamsSetupView }) {
  const locked = view.started || view.manual;
  const set = (args: { subscription?: string; region?: string; group?: string }) =>
    void call("phone.teamsSetupWhere", args).catch((error) =>
      notify({ tone: "danger", title: "Couldn't change that", message: errorMessage(error) }),
    );
  const [group, setGroup] = useState(view.choice.group);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h3 className="text-sm font-medium text-fg">Where</h3>
      <p className="mt-0.5 text-xs text-muted">
        Everything goes into one resource group you can delete in one go.
      </p>
      <div className="mt-3 flex flex-col">
        <Field label="Tenant">
          <span className="flex h-7 min-w-0 items-center gap-2 text-sm text-fg" data-testid="teams-tenant">
            {view.loading === "where" ? (
              <Spinner size="sm" />
            ) : view.tenant ? (
              <span className="truncate">
                {view.tenant.name ?? view.tenant.id}
                {view.tenant.user && <span className="text-muted"> · {view.tenant.user}</span>}
              </span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </span>
        </Field>
        <Field label="Subscription">
          <Select
            className="w-full"
            aria-label="Subscription"
            value={view.choice.subscription ?? ""}
            disabled={locked || !view.subscriptions.length}
            onChange={(e) => set({ subscription: e.target.value })}
            data-testid="teams-subscription"
          >
            {!view.choice.subscription && <option value="">—</option>}
            {view.subscriptions.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.inTenant}>
                {s.inTenant ? s.name : `${s.name} (another tenant)`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Region">
          <Select
            className="w-full"
            aria-label="Region"
            value={view.choice.region ?? ""}
            disabled={locked || view.loading === "regions" || !view.regions.length}
            onChange={(e) => set({ region: e.target.value })}
            data-testid="teams-region"
          >
            {!view.choice.region && <option value="">—</option>}
            {view.regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Resource group">
          <Input
            className="w-full"
            aria-label="Resource group"
            value={locked ? view.choice.group : group}
            disabled={locked}
            onChange={(e) => setGroup(e.target.value)}
            onBlur={() => group !== view.choice.group && set({ group })}
            data-testid="teams-group"
          />
        </Field>
      </div>
      <span className="flex-1" />
      <Footnote error={view.whereError}>
        {view.manual
          ? "You made the Azure pieces in the portal."
          : "The tenant is the one picked in the top bar: the tenant where your Teams is. Switch it there if it's another one. Only its subscriptions can hold the bot."}
      </Footnote>
    </div>
  );
}

/** Made in the Azure portal by hand (docs/guides/teams-phone.md): the app id and the relay's address and key. */
function ManualDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (view: TeamsSetupView) => void;
}) {
  const [appId, setAppId] = useState("");
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const valid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId.trim()) &&
    isTeamsCredential(credential);
  const close = () => {
    setCredential("");
    setError(undefined);
    onClose();
  };
  const connect = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onDone(await call("phone.teamsSetupManual", { appId: appId.trim(), credential: credential.trim() }));
      setCredential("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Made it in the Azure portal"
      testId="teams-manual-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Link2}
            busy={busy}
            disabled={!valid}
            onClick={() => void connect()}
            data-testid="teams-manual-connect"
          >
            Connect
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          For a tenant where Jig's az can't make the pieces: follow the portal guide, then give Jig the bot's
          app id and the relay's address with the key you put in its JIG_RELAY_KEY setting, as
          https://&lt;relay&gt;#&lt;key&gt;.
        </p>
        <Input
          placeholder="Application (client) ID"
          aria-label="App id"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          data-testid="teams-manual-app"
        />
        <Input
          type="password"
          placeholder="https://<relay>.azurewebsites.net#<relay key>"
          aria-label="Relay address and key"
          value={credential}
          onChange={(e) => setCredential(e.target.value)}
          data-testid="teams-manual-credential"
        />
        <div
          className={cn(
            "flex h-12 items-center rounded-md border px-3 text-xs",
            error ? "border-danger/40 bg-danger-soft text-danger" : "border-line bg-surface text-muted",
          )}
          aria-live="polite"
        >
          <span className="line-clamp-2">{error ?? "Jig keeps the key encrypted on this computer."}</span>
        </div>
      </div>
    </Dialog>
  );
}
