/** Joins path parts (`node:path`'s `join`; passed in so this file stays free of Node imports). */
export type Join = (...parts: string[]) => string;

/** "Your az login": the Azure CLI as you left it, no override. Always the first tenant. */
export const DEFAULT_TENANT = "default";
export const DEFAULT_TENANT_LABEL = "Your az login";

/**
 * Whether a tenant's sign-in works: `ok`, `signedOut` (the CLI has no account there, `az login`
 * needed), `expired` (the account is there but its sign-in no longer works: expired, revoked, MFA).
 * `unknown` until it was checked.
 */
export type TenantStatus = "unknown" | "ok" | "signedOut" | "expired";

/** What Jig knows about one sign-in. Never a token: the Azure CLI keeps those in its own folder. */
export interface TenantInfo {
  /** The signed-in user (`az account show` → `user.name`), an email or an app id. */
  user?: string;
  /** Entra tenant id. */
  tenantId?: string;
  /** The tenant's display name and default domain (ARM `/tenants`). */
  displayName?: string;
  domain?: string;
  status: TenantStatus;
  /** The first line of the last check's error, when it failed. */
  problem?: string;
  /** ISO time of the last check. */
  checkedAt?: string;
}

/** A tenant Jig added: its own Azure CLI folder `<root>/<key>`. */
export interface Tenant extends TenantInfo {
  key: string;
  /** Shown in the top bar; editable. */
  label: string;
  /** What was asked for when it was added (tenant id or domain), for signing in again. */
  requested?: string;
  addedAt: string;
}

/** `~/.jig/azure/tenants.json`. */
export interface TenantsFile {
  version: 1;
  /** What the last check found about your own az login (no key: it isn't Jig's folder). */
  default: TenantInfo;
  tenants: Tenant[];
}

/** One entry of the list the UI shows: your az login first, then the added tenants. */
export interface TenantView extends TenantInfo {
  key: string;
  label: string;
  /** True for "Your az login". */
  isDefault: boolean;
}

export interface TenantsState {
  /** The key of the tenant in use (`default` when the setting names none or one that's gone). */
  active: string;
  tenants: TenantView[];
}

const STATUSES: TenantStatus[] = ["unknown", "ok", "signedOut", "expired"];
const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export const emptyTenantsFile = (): TenantsFile => ({
  version: 1,
  default: { status: "unknown" },
  tenants: [],
});

const str = (v: unknown, max = 500): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

function info(raw: unknown): TenantInfo {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const status = STATUSES.includes(r.status as TenantStatus) ? (r.status as TenantStatus) : "unknown";
  const out: TenantInfo = { status };
  for (const k of ["user", "tenantId", "displayName", "domain", "problem", "checkedAt"] as const) {
    const v = str(r[k]);
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Reads a tenants file leniently: entries with a bad or repeated key (or the reserved `default`) are
 * dropped, unknown fields are ignored, so a hand edit never stops Jig.
 */
export function parseTenantsFile(raw: unknown): TenantsFile {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const tenants: Tenant[] = [];
  for (const item of Array.isArray(r.tenants) ? r.tenants : []) {
    const t = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const key = typeof t.key === "string" ? t.key : "";
    if (!KEY.test(key) || key === DEFAULT_TENANT || seen.has(key)) continue;
    seen.add(key);
    const requested = str(t.requested, 253);
    tenants.push({
      ...info(t),
      key,
      label: str(t.label, 80) ?? key,
      ...(requested ? { requested } : {}),
      addedAt: str(t.addedAt) ?? new Date(0).toISOString(),
    });
  }
  return { version: 1, default: info(r.default), tenants };
}

/** A tenant id (GUID) or a domain (`contoso.onmicrosoft.com`); an empty string means "pick when signing in". */
export function isTenantInput(input: string): boolean {
  const s = input.trim();
  return s === "" || GUID.test(s) || DOMAIN.test(s);
}

/**
 * A new tenant's folder name, from what was asked for (`contoso.onmicrosoft.com` → `contoso`): lower
 * case letters, digits and dashes, unique among `taken`, never `default`.
 */
export function tenantKey(input: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  used.add(DEFAULT_TENANT);
  const s = input.trim().toLowerCase();
  const base =
    (GUID.test(s) ? `tenant-${s.slice(0, 8)}` : s.split(".")[0]!)
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "tenant";
  const start = KEY.test(base) ? base : `t-${base}`.slice(0, 30);
  if (!used.has(start)) return start;
  for (let i = 2; ; i++) if (!used.has(`${start}-${i}`)) return `${start}-${i}`;
}

/** The Azure CLI folder of a tenant Jig added; undefined for your own az login. */
export function tenantConfigDir(root: string, key: string, join: Join): string | undefined {
  return key === DEFAULT_TENANT || !KEY.test(key) ? undefined : join(root, key);
}

/**
 * What an `az` run needs to use a tenant: `AZURE_CONFIG_DIR` to its folder, and `AZURE_EXTENSION_DIR`
 * kept on your own extensions (they live in the config folder by default, so `azure-devops` would
 * be missing). Empty for your own az login, so nothing changes without extra tenants.
 * `env` is the environment Jig runs in (for your own `AZURE_CONFIG_DIR` / `AZURE_EXTENSION_DIR`).
 */
export function azEnv(
  key: string | undefined,
  options: { root: string; home: string; env: Record<string, string | undefined>; join: Join },
): Record<string, string> {
  const { join } = options;
  const dir = key ? tenantConfigDir(options.root, key, join) : undefined;
  if (!dir) return {};
  const extensions =
    options.env.AZURE_EXTENSION_DIR ||
    join(options.env.AZURE_CONFIG_DIR || join(options.home, ".azure"), "cliextensions");
  return { AZURE_CONFIG_DIR: dir, AZURE_EXTENSION_DIR: extensions };
}

/** The list the UI shows, your az login first, and which one is in use. */
export function tenantsState(file: TenantsFile, active: string | undefined): TenantsState {
  const tenants: TenantView[] = [
    { ...file.default, key: DEFAULT_TENANT, label: DEFAULT_TENANT_LABEL, isDefault: true },
    ...file.tenants.map(({ requested: _r, addedAt: _a, ...t }) => ({ ...t, isDefault: false })),
  ];
  return { active: activeKey(file, active), tenants };
}

/** The tenant in use: the setting's key when it names an added tenant, else your az login. */
export function activeKey(file: TenantsFile, active: string | undefined): string {
  return active && file.tenants.some((t) => t.key === active) ? active : DEFAULT_TENANT;
}

/** The arguments of a sign-in: in the system browser, to that tenant, also without subscriptions. */
export function loginArgs(requested: string | undefined): string[] {
  const tenant = requested?.trim();
  return ["login", ...(tenant ? ["--tenant", tenant] : []), "--allow-no-subscriptions", "--output", "none"];
}

/**
 * What a failed `az` says about the sign-in: `signedOut` (no account: "Please run 'az login'"),
 * `expired` (the refresh token expired or was revoked, MFA or consent is needed), or undefined
 * (something else: network, a missing extension, no permission).
 */
export function signInStatusFromError(text: string): "signedOut" | "expired" | undefined {
  if (
    /AADSTS(700082|70043|50173|50076|50078|50079|65001|50158|530003)\b/.test(text) ||
    /interaction[_ ]required|refresh token .*(expired|revoked)|token (has )?expired|credentials have expired|re-?authenticate/i.test(
      text,
    )
  )
    return "expired";
  if (/\baz login\b|not logged in|no subscriptions? found/i.test(text)) return "signedOut";
  return undefined;
}

/** The line of an `az` error worth showing (skips WARNING lines and blank ones). */
export function errorLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^warning:/i.test(l));
  return (lines.find((l) => /^error:/i.test(l)) ?? lines[0] ?? "").replace(/^error:\s*/i, "").slice(0, 300);
}

/**
 * What a check found: `account` is `az account show` (JSON), `tenants` the ARM `/tenants` answer
 * (`{ value: [...] }`, or undefined when it couldn't be asked). Keeps what was known when a field is
 * missing, and the tenant's display name and domain from ARM over the CLI's.
 */
export function mergeSignIn<T extends TenantInfo>(
  previous: T,
  account: unknown,
  tenants: unknown,
  now = new Date(),
): T {
  const a = (typeof account === "object" && account !== null ? account : {}) as Record<string, unknown>;
  const user = (typeof a.user === "object" && a.user !== null ? a.user : {}) as Record<string, unknown>;
  const tenantId = str(a.tenantId) ?? str(a.homeTenantId) ?? previous.tenantId;
  const list = (tenants as { value?: unknown } | undefined)?.value;
  const arm = (Array.isArray(list) ? list : [])
    .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
    .find((t) => tenantId && String(t.tenantId).toLowerCase() === tenantId.toLowerCase());
  const displayName = str(arm?.displayName) ?? str(a.tenantDisplayName) ?? previous.displayName;
  const domain = str(arm?.defaultDomain) ?? str(a.tenantDefaultDomain) ?? previous.domain;
  const signedIn = str(user.name) ?? previous.user;
  const { problem: _p, ...rest } = previous;
  return {
    ...rest,
    status: "ok",
    checkedAt: now.toISOString(),
    ...(signedIn ? { user: signedIn } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(displayName ? { displayName } : {}),
    ...(domain ? { domain } : {}),
  } as T;
}

/** A check that failed: the status the error means (or `unknown`), its line, the time. */
export function failedCheck<T extends TenantInfo>(previous: T, errorText: string, now = new Date()): T {
  return {
    ...previous,
    status: signInStatusFromError(errorText) ?? "unknown",
    problem: errorLine(errorText) || "The Azure CLI failed",
    checkedAt: now.toISOString(),
  };
}

/** A label for a newly added tenant: its display name, else its domain, else what was asked for. */
export function defaultLabel(t: TenantInfo, requested?: string): string {
  return (t.displayName ?? t.domain ?? requested?.trim() ?? t.user ?? "Tenant").slice(0, 80);
}

/**
 * One or two letters for a tenant's avatar: the label's words (`Contoso Dev` → `CD`), the first part of
 * a domain or email (`contoso.com` → `C`). Your az login is named after the tenant it signed in to,
 * since its label says nothing about it.
 */
export function tenantInitials(
  t: Pick<TenantView, "label" | "isDefault" | "displayName" | "domain" | "user">,
): string {
  const source = t.isDefault ? (t.displayName ?? t.domain ?? t.user?.split("@")[1] ?? "az") : t.label;
  // A domain or an email is one word: its first part.
  const name = /\s/.test(source.trim()) ? source : (source.split("@")[0] ?? "").split(".")[0]!;
  const words = name
    .split(/[\s_-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (!words.length) return "?";
  const first = words[0]!;
  const letters = words.length > 1 ? first[0]! + words.at(-1)![0]! : first.slice(0, 1);
  return letters.toUpperCase();
}
