import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  activeKey,
  activeTenantRef,
  azEnv,
  DEFAULT_TENANT,
  defaultLabel,
  emptyTenantsFile,
  errorLine,
  failedCheck,
  loginArgs,
  mergeSignIn,
  parseTenantsFile,
  type Tenant,
  type TenantInfo,
  type TenantsFile,
  type TenantsState,
  tenantConfigDir,
  tenantKey,
  tenantsState,
} from "@jig/azure";
import { z } from "zod";
import { JigError } from "../../shared/ipc";
import { resolveCommand } from "../addons/winCommand";
import { getConfig, onConfigChange, updateConfig } from "../config";
import { type JigTool, registerJigTools } from "../engine/jigTools";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";
import { killTree } from "../updates/run";
import { setAzureContext } from "./env";

/**
 * Azure tenants (D-282). A tenant is one Azure CLI sign-in in its own folder (`~/.jig/azure/<key>`);
 * Jig runs `az` with `AZURE_CONFIG_DIR` pointing at the active one. The Azure CLI keeps and refreshes
 * its tokens there: Jig never reads, copies or logs them, and never logs `az` output. "Your az
 * login" (no override) is always the first entry, so nothing changes without extra tenants.
 */
const log = logger("azure");

const FileSchema = z.unknown().transform(parseTenantsFile);
/** ARM's tenant list: display names and default domains of the tenants a sign-in can see. */
const TENANTS_URL = "https://management.azure.com/tenants?api-version=2022-12-01";
const LOGIN_TIMEOUT = 10 * 60_000;

let file: TenantsFile = emptyTenantsFile();
let active = DEFAULT_TENANT;
const listeners = new Set<(state: TenantsState) => void>();
/** The sign-in that is running (one at a time: each opens the browser). */
let signingIn: { key: string; child: ChildProcess; cancelled: boolean } | undefined;

const envFor = (key: string) => azEnv(key, { root: paths.azure(), home: homedir(), env: process.env, join });

const state = (): TenantsState => tenantsState(file, getConfig().azure.activeTenant);

async function save(next: TenantsFile): Promise<TenantsState> {
  file = next;
  await writeJson(paths.azureTenants(), file);
  return changed();
}

/** Follows the active tenant (the setting, or your az login when it names none that exists). */
function changed(): TenantsState {
  const s = state();
  const previous = active;
  active = s.active;
  setAzureContext({ env: envFor(active), tenant: activeTenantRef(s) });
  emit("azure.tenantChanged", s);
  if (previous !== active) for (const listener of listeners) listener(s);
  return s;
}

/** Called when another tenant becomes the active one (the add-on event `azure.tenant`). */
export function onActiveTenantChange(listener: (state: TenantsState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs `az` for a tenant, no shell; output stays here (it is parsed, never logged). */
function az(
  key: string,
  args: string[],
  timeout = 30_000,
): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    const r = resolveCommand("az", [...args, "--only-show-errors"], process.platform, process.env);
    execFile(
      r.file,
      r.args,
      {
        timeout,
        windowsHide: true,
        windowsVerbatimArguments: r.verbatim,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, ...envFor(key) },
      },
      (error, stdout, stderr) =>
        resolve({
          ok: !error,
          out: String(stdout),
          err:
            String(stderr) ||
            ((error as NodeJS.ErrnoException | null)?.code === "ENOENT"
              ? "The Azure CLI (az) is not installed or not on PATH."
              : (error?.message ?? "")),
        }),
    );
  });
}

const json = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Asks a tenant's Azure CLI who is signed in and to which tenant, without prompting. */
async function check<T extends TenantInfo>(key: string, previous: T): Promise<T> {
  const account = await az(key, ["account", "show", "--output", "json"]);
  if (!account.ok) return failedCheck(previous, account.err);
  const tenants = await az(key, ["rest", "--method", "get", "--url", TENANTS_URL, "--output", "json"]);
  if (!tenants.ok) {
    const failed = failedCheck(previous, tenants.err);
    // ARM refused the sign-in itself: report it. Anything else (network, policy): keep the account.
    if (failed.status !== "unknown") return failed;
  }
  return mergeSignIn(previous, json(account.out), tenants.ok ? json(tenants.out) : undefined);
}

async function checkAll(): Promise<TenantsState> {
  const [own, ...added] = await Promise.all([
    check(DEFAULT_TENANT, file.default),
    ...file.tenants.map((t) => check(t.key, t)),
  ]);
  // Tenants removed or renamed while checking keep that change.
  const byKey = new Map(added.map((t) => [t.key, t]));
  return save({
    ...file,
    default: own!,
    tenants: file.tenants.map((t) => ({ ...(byKey.get(t.key) ?? t), label: t.label })),
  });
}

/**
 * `az login` for a tenant's folder, its output streamed as `azure.signInProgress`. Resolves when it
 * ended well; rejects with `cancelled`, `az_missing` or `az_login_failed`.
 */
async function login(key: string, requested: string | undefined): Promise<void> {
  if (signingIn) throw new JigError("busy", "Another sign-in is running. Finish or cancel it first.");
  const dir = tenantConfigDir(paths.azure(), key, join);
  if (dir) await mkdir(dir, { recursive: true });
  const r = resolveCommand("az", loginArgs(requested), process.platform, process.env);
  const child = spawn(r.file, r.args, {
    windowsHide: true,
    windowsVerbatimArguments: r.verbatim,
    stdio: ["ignore", "pipe", "pipe"],
    // The newer login asks which subscription to use in the terminal; there is none here.
    env: { ...process.env, ...envFor(key), AZURE_CORE_LOGIN_EXPERIENCE_V2: "off" },
  });
  const run = { key, child, cancelled: false };
  signingIn = run;
  let output = "";
  const progress = (text: string) => {
    output = (output + text).slice(-8000);
    for (const line of text.split(/\r?\n/))
      if (line.trim() && !/^warning:/i.test(line.trim())) emit("azure.signInProgress", { key, text: line });
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", progress);
  child.stderr?.on("data", progress);
  const timer = setTimeout(() => stop(run), LOGIN_TIMEOUT);
  const code = await new Promise<number | "missing">((resolve) => {
    child.on("error", (error: NodeJS.ErrnoException) => resolve(error.code === "ENOENT" ? "missing" : 1));
    child.on("close", (c) => resolve(c ?? 1));
  });
  clearTimeout(timer);
  signingIn = undefined;
  emit("azure.signInProgress", { key, text: "", done: true });
  if (run.cancelled) throw new JigError("cancelled", "The sign-in was cancelled.");
  if (code === "missing")
    throw new JigError("az_missing", "The Azure CLI (az) is not installed or not on PATH.");
  if (code !== 0) throw new JigError("az_login_failed", errorLine(output) || "The sign-in didn't finish.");
}

function stop(run: NonNullable<typeof signingIn>): void {
  run.cancelled = true;
  if (process.platform === "win32") killTree(run.child.pid);
  else run.child.kill();
}

async function addTenant(input: { tenant: string; label?: string }): Promise<TenantsState> {
  const requested = input.tenant.trim() || undefined;
  const key = tenantKey(
    requested ?? "",
    file.tenants.map((t) => t.key),
  );
  try {
    await login(key, requested);
  } catch (error) {
    // A sign-in that didn't finish leaves nothing behind (another one may be running: keep it).
    if (!(error instanceof JigError && error.code === "busy"))
      await rm(join(paths.azure(), key), { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  const checked = await check(key, {
    key,
    label: "",
    status: "unknown",
    addedAt: new Date().toISOString(),
    ...(requested ? { requested } : {}),
  } satisfies Tenant);
  const tenant = { ...checked, label: input.label?.trim() || defaultLabel(checked, requested) };
  log.info(`Added Azure tenant ${key}`);
  return save({ ...file, tenants: [...file.tenants.filter((t) => t.key !== key), tenant] });
}

async function signInAgain(key: string): Promise<TenantsState> {
  if (key === DEFAULT_TENANT) {
    await login(key, undefined);
    return save({ ...file, default: await check(key, file.default) });
  }
  const tenant = find(key);
  await login(key, tenant.tenantId ?? tenant.requested);
  const checked = await check(key, tenant);
  return save({
    ...file,
    tenants: file.tenants.map((t) => (t.key === key ? { ...checked, label: t.label } : t)),
  });
}

function find(key: string): Tenant {
  const tenant = file.tenants.find((t) => t.key === key);
  if (!tenant) throw new JigError("not_found", "That tenant isn't in Jig (any more).");
  return tenant;
}

async function removeTenant(key: string): Promise<TenantsState> {
  if (key === DEFAULT_TENANT) throw new JigError("invalid_args", "Your own az login can't be removed.");
  find(key);
  if (signingIn?.key === key) stop(signingIn);
  if (getConfig().azure.activeTenant === key) await updateConfig({ azure: { activeTenant: "" } });
  const next = await save({ ...file, tenants: file.tenants.filter((t) => t.key !== key) });
  // Its folder holds that sign-in; deleting it signs out of that tenant on this computer.
  await rm(join(paths.azure(), key), { recursive: true, force: true }).catch((error: Error) =>
    log.warn(`Couldn't delete the folder of Azure tenant ${key}: ${error.message}`),
  );
  log.info(`Removed Azure tenant ${key}`);
  return next;
}

async function setActiveTenant(key: string): Promise<TenantsState> {
  if (key !== DEFAULT_TENANT) find(key);
  await updateConfig({ azure: { activeTenant: key === DEFAULT_TENANT ? "" : key } });
  return state();
}

/** Loads the tenants (before add-ons start, so their first `az` already uses the right one). */
export async function startAzure(): Promise<void> {
  file = await readJson(paths.azureTenants(), FileSchema).catch(() => emptyTenantsFile());
  active = activeKey(file, getConfig().azure.activeTenant);
  setAzureContext({ env: envFor(active), tenant: activeTenantRef(state()) });
  onConfigChange((config) => {
    if (activeKey(file, config.azure.activeTenant) !== active) changed();
  });

  handle("azure.tenants", (args) => (args?.check ? checkAll() : state()));
  handle("azure.addTenant", (args) => addTenant(args));
  handle("azure.signInAgain", ({ key }) => signInAgain(key));
  handle("azure.cancelSignIn", () => {
    if (signingIn) stop(signingIn);
  });
  handle("azure.renameTenant", ({ key, label }) => {
    if (key === DEFAULT_TENANT) throw new JigError("invalid_args", "Your own az login keeps its name.");
    find(key);
    return save({
      ...file,
      tenants: file.tenants.map((t) => (t.key === key ? { ...t, label: label.trim().slice(0, 80) } : t)),
    });
  });
  handle("azure.removeTenant", ({ key }) => removeTenant(key));
  handle("azure.setActiveTenant", ({ key }) => setActiveTenant(key));
  registerJigTools(azureTools());
}

/** What Claude sees of a tenant: who and where, never anything of the sign-in itself. */
const describe = (s: TenantsState) =>
  JSON.stringify(
    s.tenants.map((t) => ({
      key: t.key,
      label: t.label,
      active: t.key === s.active,
      ...(t.isDefault ? { yourOwnAzLogin: true } : {}),
      user: t.user,
      domain: t.domain,
      tenantId: t.tenantId,
      status: t.status,
      ...(t.problem ? { problem: t.problem } : {}),
    })),
  );

/** Picks a tenant by key, label, domain, tenant id or user (case-insensitive). */
function findTenant(s: TenantsState, wanted: string) {
  const w = wanted.trim().toLowerCase();
  return (
    s.tenants.find((t) => t.key === w) ??
    s.tenants.find((t) =>
      [t.label, t.domain, t.tenantId, t.displayName].some((v) => v?.toLowerCase() === w),
    ) ??
    s.tenants.find((t) => t.user?.toLowerCase() === w)
  );
}

/** Claude's tools for tenants (D-283): list them (reads) and switch (the user approves). */
function azureTools(): JigTool[] {
  return [
    {
      name: "jig_azure_tenants",
      description:
        "List the Azure tenants (Azure CLI sign-ins) Jig knows: your own az login first, then the ones added in Jig, with which one is active, the signed-in user, domain, tenant id and status (ok, expired, signedOut, unknown). check: true asks each tenant's Azure CLI first (slower, no prompt).",
      readOnly: true,
      shape: { check: z.boolean().optional() },
      handler: async (args: Record<string, unknown>) => describe(args.check ? await checkAll() : state()),
    },
    {
      name: "jig_azure_switch_tenant",
      description:
        'Switch the Azure tenant Jig uses for its Azure and Azure DevOps views (Pipelines, Boards, links) and the az it runs, like picking it in the top bar. tenant: its key, name, domain or tenant id from jig_azure_tenants ("default" = the user\'s own az login). The user approves.',
      shape: { tenant: z.string().min(1).max(253) },
      handler: async (args: Record<string, unknown>) => {
        const current = state();
        const tenant = findTenant(current, String(args.tenant));
        if (!tenant)
          throw new JigError(
            "not_found",
            `No tenant ${JSON.stringify(args.tenant)}. Jig has: ${current.tenants.map((t) => `${t.label} [${t.key}]`).join(", ")}`,
          );
        const next = await setActiveTenant(tenant.key);
        const now = next.tenants.find((t) => t.key === next.active);
        const signIn =
          now?.status === "expired" || now?.status === "signedOut"
            ? " Its sign-in needs renewing: ask the user to sign in again from the tenant menu in Jig's top bar (Manage tenants…)."
            : "";
        return `Jig now uses the Azure tenant ${now?.label ?? tenant.label}${now?.user ? ` (${now.user})` : ""}.${signIn}`;
      },
    },
  ];
}
