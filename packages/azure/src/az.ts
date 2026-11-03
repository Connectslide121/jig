import {
  DEFAULT_TENANT_LABEL,
  errorLine,
  signInStatusFromError,
  type TenantsState,
  tenantInitials,
} from "./tenants";

/**
 * The tenant an `az` run used, as add-ons and error messages name it (the add-on event `azure.tenant`
 * carries the same fields).
 */
export interface TenantRef {
  /** `default` for your own az login. */
  key: string;
  label: string;
  isDefault: boolean;
  user?: string;
  tenantId?: string;
  displayName?: string;
  domain?: string;
  /** One or two letters for its avatar, as Jig's top bar shows it (`tenantInitials`). */
  initials?: string;
}

export const DEFAULT_TENANT_REF: TenantRef = { key: "default", label: DEFAULT_TENANT_LABEL, isDefault: true };

/** The active tenant of a tenants state (your az login when the list doesn't have it). */
export function activeTenantRef(state: TenantsState): TenantRef {
  const t = state.tenants.find((x) => x.key === state.active) ?? state.tenants.find((x) => x.isDefault);
  if (!t) return DEFAULT_TENANT_REF;
  const ref: TenantRef = { key: t.key, label: t.label, isDefault: t.isDefault };
  for (const k of ["user", "tenantId", "displayName", "domain"] as const) if (t[k]) ref[k] = t[k];
  ref.initials = tenantInitials(t);
  return ref;
}

/**
 * Why an `az` run failed: `missing` (no Azure CLI), `signedOut` / `expired` (the tenant's sign-in),
 * `extension` (azure-devops isn't installed), `failed` (anything else: what az said).
 */
export type AzProblem = "missing" | "signedOut" | "expired" | "extension" | "failed";

/**
 * The message for a failed `az` run (`code` 127: the program wasn't found). A tenant added in Jig is
 * named in every message, and its sign-in is fixed from the tenant avatar; with your own az login the
 * messages are what they always were (`az login` in a terminal), so nothing changes without tenants.
 */
export function azFailure(input: { code: number; stderr: string; args: string[]; tenant?: TenantRef }): {
  problem: AzProblem;
  message: string;
} {
  const t = input.tenant && !input.tenant.isDefault ? input.tenant : undefined;
  const text = input.stderr.trim();
  if (input.code === 127 || /is not recognized as an internal|az: (command )?not found/i.test(text))
    return { problem: "missing", message: "The Azure CLI (az) is not installed or not on PATH." };
  if (/extension.*azure-devops|is misspelled or not recognized/i.test(text))
    return {
      problem: "extension",
      message: "The azure-devops extension is missing. Run `az extension add --name azure-devops`.",
    };
  const signIn = signInStatusFromError(text);
  if (signIn === "expired")
    return {
      problem: "expired",
      message: t
        ? `The sign-in to tenant ${t.label} expired. Sign in again from the tenant avatar at the top right.`
        : "Your Azure CLI sign-in expired. Run `az login` in a terminal.",
    };
  if (signIn === "signedOut")
    return {
      problem: "signedOut",
      message: t
        ? `You're not signed in to tenant ${t.label}. Sign in again from the tenant avatar at the top right.`
        : "You're not signed in to the Azure CLI. Run `az login` in a terminal.",
    };
  const said =
    text
      .split(/\r?\n/)
      .filter((l) => l.trim() && !/^warning:/i.test(l.trim()))
      .slice(-4)
      .join("\n") ||
    errorLine(text) ||
    `az ${input.args.slice(0, 2).join(" ")} failed`;
  return { problem: "failed", message: t ? `In tenant ${t.label}: ${said}` : said };
}

/** An `az` failure: `problem` says why (see `azFailure`); the message is meant for the user. */
export class AzError extends Error {
  constructor(
    readonly problem: AzProblem,
    message: string,
  ) {
    super(message);
    this.name = "AzError";
  }
}

/** The arguments every JSON `az` run gets: JSON out, no warnings mixed into it. */
export const azJsonArgs = (args: string[]): string[] => [...args, "-o", "json", "--only-show-errors"];

/** Environment that keeps az's output plain UTF-8 text where it can (see `decodeAzOutput`). */
export const AZ_PLAIN_ENV: Record<string, string> = {
  AZURE_CORE_NO_COLOR: "1",
  PYTHONUTF8: "1",
  PYTHONIOENCODING: "utf-8",
};

/**
 * az's output as text. Windows' az.cmd runs Python isolated (-I), which ignores `AZ_PLAIN_ENV` and
 * prints in the ANSI code page: UTF-8 when it is, else Windows-1252. Jig runs that Python itself with
 * `-X utf8` where it can (`AZ_PYTHON_ARGS`); this is the fallback for an az it can't.
 */
export function decodeAzOutput(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * How Windows' installed az (az.cmd beside `..\python.exe`, MSI and winget) runs without cmd.exe:
 * Python started directly with az.cmd's own flags plus `-X utf8`, which -I doesn't ignore. Arguments
 * reach az as written (no cmd quoting, D-290) and it prints UTF-8 whatever the code page.
 */
export const AZ_PYTHON_ARGS = ["-X", "utf8", "-IBm", "azure.cli"];

/** The python.exe az.cmd starts (`<az.cmd folder>\..\python.exe`), when `azPath` is an az.cmd. */
export function azPythonFor(azPath: string, exists: (path: string) => boolean): string | undefined {
  const m = /^(.*)[\\/][^\\/]+[\\/]az\.cmd$/i.exec(azPath);
  const python = m ? `${m[1]}\\python.exe` : undefined;
  return python && exists(python) ? python : undefined;
}

/**
 * Whether an argument can't safely go through cmd.exe and a batch file's `%*`: quotes, cmd's
 * metacharacters, line breaks and anything outside printable ASCII. Free text always is.
 */
export const unsafeForCmd = (arg: string): boolean => !/^[\x20-\x7e]*$/.test(arg) || /["%!^<>&|]/.test(arg);

/**
 * For an az that only runs through cmd.exe: every unsafe argument goes in a UTF-8 file and az gets
 * `@<file>`, which it reads back as the value (az's own `@file` arguments). `write` saves the text and
 * returns the file's path.
 */
export function azArgsViaFiles(args: string[], write: (text: string) => string): string[] {
  return args.map((a) => (unsafeForCmd(a) ? `@${write(a)}` : a));
}

/** az's JSON answer (undefined for an empty one). Throws when it isn't JSON. */
export function parseAzJson<T>(stdout: string): T {
  const text = stdout.trim();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A label or name from a tenant as one plain line inside Claude's context (no quotes or newlines). */
const plain = (text: string) => text.replace(/["\s]+/g, " ").trim();

/**
 * What Claude is told about the tenant its `az` runs with: which tenant and who is signed in, never
 * anything secret (Jig never has the tokens).
 */
export function tenantContext(tenant: TenantRef): string {
  const who = tenant.user ? `, signed in as ${plain(tenant.user)}` : "";
  if (tenant.isDefault) {
    const named = tenant.label !== DEFAULT_TENANT_LABEL ? ` (named "${plain(tenant.label)}" in Jig)` : "";
    return `Every az in this chat runs with the user's own az login${named}${who}.`;
  }
  const entra = [tenant.displayName, tenant.domain, tenant.tenantId].filter(Boolean).map((x) => plain(x!));
  const where = entra.length ? ` (Entra tenant ${entra.join(", ")})` : "";
  return `Every az in this chat runs with the Azure tenant "${plain(tenant.label)}"${where}${who}.`;
}
