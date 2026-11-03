import { execFile } from "node:child_process";
import {
  AZ_PLAIN_ENV,
  AzError,
  azFailure,
  azJsonArgs,
  decodeAzOutput,
  parseAzJson,
  type TenantRef,
} from "@jig/azure";
import { resolveCommand } from "../addons/winCommand";

/**
 * The one way Jig runs `az` for an answer (D-284): no shell (`.cmd` through cmd.exe on Windows), JSON
 * out, decoded from the code page az prints in, and a failure mapped by `azFailure` into an `AzError`
 * that names the tenant. Used by core (project links) and by add-ons' `api.azure.az` (it runs in their
 * host process, so the environment and tenant are passed in, never read from main's state here).
 */
export function runAz<T = unknown>(
  args: string[],
  options: { env: Record<string, string>; tenant: TenantRef; timeoutMs?: number },
): Promise<T> {
  const r = resolveCommand("az", azJsonArgs(args), process.platform, process.env);
  return new Promise((resolve, reject) => {
    execFile(
      r.file,
      r.args,
      {
        timeout: options.timeoutMs ?? 60_000,
        windowsHide: true,
        windowsVerbatimArguments: r.verbatim,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...options.env, ...AZ_PLAIN_ENV },
        encoding: "buffer",
      },
      (error, stdout, stderr) => {
        if (error) {
          const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
          const text = decodeAzOutput(stderr ?? new Uint8Array()) || error.message;
          const { problem, message } = azFailure({
            code: missing ? 127 : 1,
            stderr: text,
            args,
            tenant: options.tenant,
          });
          return reject(new AzError(problem, message));
        }
        try {
          resolve(parseAzJson<T>(decodeAzOutput(stdout)));
        } catch {
          reject(new AzError("failed", "The Azure CLI's answer wasn't JSON."));
        }
      },
    );
  });
}
