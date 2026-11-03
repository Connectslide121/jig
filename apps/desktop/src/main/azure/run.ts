import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AZ_PLAIN_ENV,
  AZ_PYTHON_ARGS,
  AzError,
  azArgsViaFiles,
  azFailure,
  azJsonArgs,
  azPythonFor,
  decodeAzOutput,
  parseAzJson,
  type TenantRef,
} from "@jig/azure";
import { findOnPath, resolveCommand } from "../addons/winCommand";

/** How to start one `az` run; `done` removes what it needed (argument files) once it ended. */
export interface AzCommand {
  file: string;
  args: string[];
  verbatim: boolean;
  env: Record<string, string>;
  done: () => void;
}

/**
 * Starts az with no shell anywhere (D-290). On Windows, the installed az.cmd's Python runs directly
 * with `-X utf8`, so arguments arrive as written and output is UTF-8. An az that only runs through
 * cmd.exe gets free text (quotes, line breaks, non-ASCII) as `@file` arguments instead of cmd quoting.
 */
export function azCommand(args: string[]): AzCommand {
  const none = () => {};
  if (process.platform !== "win32") return { file: "az", args, verbatim: false, env: {}, done: none };
  const found = findOnPath("az", process.env);
  const python = found && azPythonFor(found, existsSync);
  if (python)
    return {
      file: python,
      args: [...AZ_PYTHON_ARGS, ...args],
      verbatim: false,
      env: { AZ_INSTALLER: "MSI" },
      done: none,
    };
  let dir: string | undefined;
  const safe = azArgsViaFiles(args, (text) => {
    dir ??= mkdtempSync(join(tmpdir(), "jig-az-"));
    const path = join(dir, `arg${Math.random().toString(36).slice(2)}.txt`);
    writeFileSync(path, text, "utf8");
    return path;
  });
  const r = resolveCommand("az", safe, process.platform, process.env);
  const done = () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  };
  return { file: r.file, args: r.args, verbatim: r.verbatim, env: {}, done };
}

/**
 * The one way Jig runs `az` for an answer (D-284): no shell (`azCommand`), JSON out, decoded from
 * the code page az prints in, and a failure mapped by `azFailure` into an `AzError` that names the
 * tenant. Used by core (project links) and by add-ons' `api.azure.az` (it runs in their host
 * process, so the environment and tenant are passed in, never read from main's state here).
 */
export function runAz<T = unknown>(
  args: string[],
  options: { env: Record<string, string>; tenant: TenantRef; timeoutMs?: number },
): Promise<T> {
  const c = azCommand(azJsonArgs(args));
  return new Promise((resolve, reject) => {
    execFile(
      c.file,
      c.args,
      {
        timeout: options.timeoutMs ?? 60_000,
        windowsHide: true,
        windowsVerbatimArguments: c.verbatim,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...options.env, ...AZ_PLAIN_ENV, ...c.env },
        encoding: "buffer",
      },
      (error, stdout, stderr) => {
        c.done();
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
