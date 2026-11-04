import { Copy, ExternalLink, Globe, KeyRound, LogIn, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TENANT_LABEL,
  deviceCodePrompt,
  isRenamedDefault,
  isTenantInput,
  type SignInMethod,
  type TenantView,
} from "../../../shared/azure";
import { copyText } from "../../lib/clipboard";
import { call, errorMessage, HostError, useHostEvent } from "../../lib/host";
import {
  Button,
  cn,
  confirmDialog,
  Dialog,
  IconButton,
  Input,
  openMenuAt,
  promptDialog,
  Spinner,
  Switch,
} from "../../ui";
import { SegmentedSwitch } from "../settings/parts";
import { needsSignIn, statusText, TenantAvatar, TenantMark } from "./parts";
import { closeTenantDialog, openAddTenant, switchTenant, useTenantDialog, useTenants } from "./store";

/** What a failed sign-in says in the modal (the host's codes, D-282). */
function signInError(error: unknown): string | undefined {
  if (error instanceof HostError) {
    if (error.code === "cancelled") return undefined;
    if (error.code === "az_missing")
      return "The Azure CLI (az) isn't installed or isn't on the PATH. Install it, then try again.";
    if (error.code === "busy") return "Another sign-in is still running. Finish or cancel it first.";
  }
  return errorMessage(error);
}

/**
 * The last lines of a running `az login`, in a box of a fixed height (reserved before anything
 * arrives, so the modal never grows while signing in).
 */
function SignInLog({
  busy,
  lines,
  error,
  idle,
  waiting = "Waiting for the sign-in in your browser…",
}: {
  busy: boolean;
  lines: string[];
  error?: string;
  idle: string;
  waiting?: string;
}) {
  const prompt = busy ? lines.map(deviceCodePrompt).findLast(Boolean) : undefined;
  return (
    <div
      className={cn(
        "flex h-24 flex-col gap-1 overflow-hidden rounded-md border px-3 py-2 text-xs",
        error ? "border-danger/40 bg-danger-soft text-danger" : "border-line bg-surface text-muted",
      )}
      aria-live="polite"
      data-testid="tenant-signin-log"
    >
      {error ? (
        <span className="line-clamp-4">{error}</span>
      ) : prompt ? (
        <DeviceCode {...prompt} />
      ) : busy ? (
        <>
          <span className="flex items-center gap-2 text-fg">
            <Spinner size="sm" />
            {waiting}
          </span>
          {lines.slice(-3).map((line, i) => (
            <span key={i} className="truncate font-mono text-2xs">
              {line}
            </span>
          ))}
        </>
      ) : (
        <span>{idle}</span>
      )}
    </div>
  );
}

/**
 * The code of a sign-in with a code (`az login --use-device-code`): the page to open and the code to
 * enter there, in any browser (a private window picks another account), with Copy and Open page.
 */
function DeviceCode({ url, code }: { url: string; code: string }) {
  return (
    <>
      <span className="flex items-center gap-2 text-fg">
        <Spinner size="sm" />
        <span className="truncate">
          Open <span className="font-medium">{url.replace(/^https:\/\//, "")}</span> and enter this code:
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span
          className="min-w-0 flex-1 truncate font-mono text-lg font-semibold tracking-widest text-fg select-all"
          data-testid="tenant-device-code"
        >
          {code}
        </span>
        <Button size="sm" icon={Copy} onClick={() => void copyText(code)}>
          Copy
        </Button>
        <Button size="sm" icon={ExternalLink} onClick={() => void call("app.openExternal", { url })}>
          Open page
        </Button>
      </span>
      <span className="truncate text-2xs">
        Signed in to another account there? Paste the link into a private window.
      </span>
    </>
  );
}

/** Follows `azure.signInProgress` while a sign-in runs (one at a time, so all lines are ours). */
function useSignInLines(): [string[], () => void] {
  const [lines, setLines] = useState<string[]>([]);
  useHostEvent("azure.signInProgress", ({ text }) => {
    if (text.trim()) setLines((l) => [...l.slice(-20), text.trim()]);
  });
  const clear = useCallback(() => setLines([]), []);
  return [lines, clear];
}

export function AddTenantDialog() {
  const open = useTenantDialog((s) => s.open === "add");
  const [tenant, setTenant] = useState("");
  const [label, setLabel] = useState("");
  const [switchTo, setSwitchTo] = useState(true);
  const [method, setMethod] = useState<SignInMethod>("browser");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [lines, clearLines] = useSignInLines();
  const valid = isTenantInput(tenant);

  // A fresh form each time it opens.
  useEffect(() => {
    if (!open) return;
    setTenant("");
    setLabel("");
    setSwitchTo(true);
    setMethod("browser");
    setError(undefined);
    clearLines();
  }, [open, clearLines]);

  const close = () => {
    if (busy) void call("azure.cancelSignIn");
    closeTenantDialog();
  };
  const signIn = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(undefined);
    clearLines();
    try {
      const before = new Set(useTenants.getState().state?.tenants.map((t) => t.key));
      const state = await call("azure.addTenant", {
        tenant: tenant.trim(),
        label: label.trim() || undefined,
        method,
      });
      const added = state.tenants.find((t) => !before.has(t.key));
      if (switchTo && added) await switchTenant(added.key);
      closeTenantDialog();
    } catch (e) {
      setError(signInError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add an Azure tenant"
      testId="tenant-add-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={LogIn}
            busy={busy}
            disabled={!valid || busy}
            onClick={() => void signIn()}
            data-testid="tenant-signin"
          >
            Sign in
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
        }}
      >
        <p className="text-muted">
          Signs in with the Azure CLI in a folder of its own, so it doesn't touch your own az login. You sign
          in at Microsoft, in your browser or with a code; Jig never sees the password or tokens.
        </p>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the child. */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Tenant id or domain (optional)</span>
          <Input
            value={tenant}
            disabled={busy}
            placeholder="contoso.onmicrosoft.com"
            aria-invalid={!valid}
            onChange={(e) => setTenant(e.target.value)}
            data-testid="tenant-input"
          />
          <span className={cn("h-4 text-xs", valid ? "text-hint" : "text-danger")}>
            {valid
              ? "Empty: pick the account and tenant when you sign in."
              : "A tenant id (GUID) or a domain."}
          </span>
        </label>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the child. */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Name in Jig (optional)</span>
          <Input
            value={label}
            disabled={busy}
            maxLength={80}
            placeholder="The tenant's name"
            onChange={(e) => setLabel(e.target.value)}
            data-testid="tenant-label"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Sign in</span>
          <SegmentedSwitch
            label="Sign in"
            value={method}
            onChange={busy ? () => undefined : setMethod}
            options={[
              { id: "browser", label: "In the browser", disabled: busy && method !== "browser" },
              { id: "code", label: "With a code", disabled: busy && method !== "code" },
            ]}
            testId="tenant-method"
          />
          <span className="h-4 truncate text-xs text-hint">
            {method === "browser"
              ? "Your default browser opens: pick the account there, or use another one."
              : "Enter a code in any browser, e.g. a private window for another account."}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Switch to it when signed in</span>
          <Switch
            checked={switchTo}
            onChange={setSwitchTo}
            disabled={busy}
            label="Switch to it when signed in"
          />
        </div>
        <SignInLog
          busy={busy}
          lines={lines}
          error={error}
          idle={
            method === "browser"
              ? "Sign in opens your browser. Cancel stops the sign-in."
              : "Sign in shows a code to enter at Microsoft. Cancel stops the sign-in."
          }
          waiting={method === "browser" ? undefined : "Getting a sign-in code…"}
        />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function ManageTenantsDialog() {
  const open = useTenantDialog((s) => s.open === "manage");
  const state = useTenants((s) => s.state);
  const [checking, setChecking] = useState(false);
  const [signingIn, setSigningIn] = useState<string>();
  const [error, setError] = useState<string>();
  const [lines, clearLines] = useSignInLines();
  const opened = useRef(false);

  // Each time it opens, ask every tenant's Azure CLI who is signed in (no prompt, D-282).
  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    setError(undefined);
    setChecking(true);
    void call("azure.tenants", { check: true })
      .then((s) => useTenants.setState({ state: s }))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setChecking(false));
  }, [open]);

  const [withCode, setWithCode] = useState<TenantView>();
  const signInAgain = async (t: TenantView, method: SignInMethod) => {
    setSigningIn(t.key);
    setError(undefined);
    clearLines();
    if (method === "code") setWithCode(t);
    try {
      await call("azure.signInAgain", { key: t.key, method });
    } catch (e) {
      setError(signInError(e));
    } finally {
      setSigningIn(undefined);
      setWithCode(undefined);
    }
  };
  const signInMenu = (t: TenantView, anchor: HTMLElement) =>
    openMenuAt(
      anchor,
      [
        { heading: needsSignIn(t) ? "Sign in again" : "Sign in again (another account)" },
        { label: "In the browser", icon: Globe, onSelect: () => void signInAgain(t, "browser") },
        { label: "With a code…", icon: KeyRound, onSelect: () => void signInAgain(t, "code") },
      ],
      true,
    );
  const rename = async (t: TenantView) => {
    const label = await promptDialog({
      title: t.isDefault ? "Rename your az login" : "Rename tenant",
      message: t.isDefault
        ? "Only the name Jig shows changes: it keeps using the Azure CLI as you left it."
        : undefined,
      initial: t.label,
      confirmLabel: "Rename",
    });
    if (label)
      await call("azure.renameTenant", { key: t.key, label }).catch((e) => setError(errorMessage(e)));
  };
  const resetName = (t: TenantView) =>
    void call("azure.renameTenant", { key: t.key }).catch((e) => setError(errorMessage(e)));
  const remove = async (t: TenantView) => {
    const ok = await confirmDialog({
      title: `Remove ${t.label}?`,
      message:
        "Jig forgets the tenant and deletes its Azure CLI folder, which signs it out on this computer. Your own az login isn't touched.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) await call("azure.removeTenant", { key: t.key }).catch((e) => setError(errorMessage(e)));
  };
  const close = () => {
    if (signingIn) void call("azure.cancelSignIn");
    closeTenantDialog();
  };

  const status = error
    ? error
    : signingIn
      ? withCode
        ? "Signing in with a code…"
        : (lines.at(-1) ?? "Waiting for the sign-in in your browser…")
      : checking
        ? "Checking the sign-ins…"
        : "Click a tenant to use it for Azure and Azure DevOps.";
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Azure tenants"
      width="lg"
      testId="tenant-manage-dialog"
      footer={
        <>
          <span
            className={cn(
              "mr-auto flex min-w-0 items-center gap-2 text-xs",
              error ? "text-danger" : "text-muted",
            )}
            aria-live="polite"
          >
            <span className="flex size-3.5 shrink-0 items-center">
              {(checking || signingIn) && !error && <Spinner size="sm" />}
            </span>
            <span className="truncate">{status}</span>
          </span>
          <Button icon={Plus} onClick={openAddTenant} data-testid="tenant-manage-add">
            Add tenant…
          </Button>
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-0.5" role="listbox" aria-label="Azure tenants">
        {state ? (
          state.tenants.map((t) => (
            <TenantRow
              key={t.key}
              tenant={t}
              active={t.key === state.active}
              signingIn={signingIn === t.key}
              busy={Boolean(signingIn)}
              onSwitch={() => void switchTenant(t.key).catch((e) => setError(errorMessage(e)))}
              onRename={() => void rename(t)}
              onResetName={() => resetName(t)}
              onSignIn={(anchor) => signInMenu(t, anchor)}
              onRemove={() => void remove(t)}
            />
          ))
        ) : (
          <Spinner center />
        )}
      </div>
      <Dialog
        open={Boolean(withCode)}
        onClose={() => void call("azure.cancelSignIn")}
        title={`Sign in to ${withCode?.label ?? ""}`}
        testId="tenant-code-dialog"
        footer={
          <Button variant="ghost" onClick={() => void call("azure.cancelSignIn")}>
            Cancel
          </Button>
        }
      >
        <SignInLog busy lines={lines} idle="" waiting="Getting a sign-in code…" />
      </Dialog>
    </Dialog>
  );
}

/**
 * One tenant: avatar, name, user and domain in fixed columns, the status mark at the far right of
 * the text, then the actions (always in their slots). Your az login can't be removed: its last slot
 * offers "Reset name" instead, once you renamed it.
 */
function TenantRow({
  tenant: t,
  active,
  signingIn,
  busy,
  onSwitch,
  onRename,
  onResetName,
  onSignIn,
  onRemove,
}: {
  tenant: TenantView;
  active: boolean;
  signingIn: boolean;
  busy: boolean;
  onSwitch: () => void;
  onRename: () => void;
  onResetName: () => void;
  onSignIn: (anchor: HTMLElement) => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      tabIndex={0}
      data-testid={`tenant-row-${t.key}`}
      title={[
        t.label,
        isRenamedDefault(t) && "Your own az login",
        t.user,
        t.domain,
        t.tenantId,
        statusText(t),
        t.problem,
      ]
        .filter(Boolean)
        .join("\n")}
      onClick={onSwitch}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSwitch();
        }
      }}
      className={cn(
        "flex h-10 cursor-default items-center gap-3 rounded-md px-2 outline-none focus-visible:ring-1 focus-visible:ring-accent",
        active ? "bg-active" : "hover:bg-hover",
      )}
    >
      <TenantAvatar tenant={t} className="size-6" />
      <span className="min-w-24 flex-1 truncate font-medium">{t.label}</span>
      <span className="w-48 min-w-0 shrink truncate text-xs text-muted">{t.user ?? ""}</span>
      <span className="w-48 min-w-0 shrink truncate text-xs text-muted">{t.domain ?? ""}</span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        <TenantMark tenant={t} active={active} />
      </span>
      <span className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
        <span className="flex size-7 items-center justify-center">
          {signingIn ? (
            <IconButton
              icon={X}
              size="sm"
              label="Cancel the sign-in"
              onClick={() => void call("azure.cancelSignIn")}
            />
          ) : (
            <IconButton
              icon={LogIn}
              size="sm"
              label={needsSignIn(t) ? "Sign in again" : "Sign in again (another account)"}
              disabled={busy}
              className={cn(needsSignIn(t) && "text-warning")}
              onClick={(e) => onSignIn(e.currentTarget)}
            />
          )}
        </span>
        <span className="flex size-7 items-center justify-center">
          <IconButton icon={Pencil} size="sm" label="Rename" onClick={onRename} />
        </span>
        <span className="flex size-7 items-center justify-center">
          {!t.isDefault ? (
            <IconButton icon={Trash2} size="sm" label="Remove" disabled={signingIn} onClick={onRemove} />
          ) : (
            isRenamedDefault(t) && (
              <IconButton
                icon={RotateCcw}
                size="sm"
                label={`Reset name (${DEFAULT_TENANT_LABEL})`}
                onClick={onResetName}
              />
            )
          )}
        </span>
      </span>
    </div>
  );
}
