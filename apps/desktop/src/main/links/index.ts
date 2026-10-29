import { execFile } from "node:child_process";
import { JigError } from "../../shared/ipc";
import { type AzureItem, azureItems } from "../../shared/links";
import { resolveCommand } from "../addons/winCommand";
import { handle } from "../ipc/router";

/** Runs the user's `az` (no shell; `.cmd` through cmd.exe on Windows), JSON out. */
function az(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const r = resolveCommand(
      "az",
      [...args, "-o", "json", "--only-show-errors"],
      process.platform,
      process.env,
    );
    execFile(
      r.file,
      r.args,
      {
        timeout: 90_000,
        windowsHide: true,
        windowsVerbatimArguments: r.verbatim,
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const text = String(stderr || error.message);
          if ((error as NodeJS.ErrnoException).code === "ENOENT" || /not recognized|not found/i.test(text))
            return reject(new JigError("az_missing", "The Azure CLI (az) is not installed or not on PATH."));
          if (/az login/i.test(text))
            return reject(
              new JigError(
                "az_login",
                "You're not signed in to the Azure CLI. Run `az login` in a terminal.",
              ),
            );
          return reject(new JigError("az_failed", text.trim().split("\n").slice(-3).join("\n")));
        }
        try {
          resolve(JSON.parse(String(stdout) || "[]"));
        } catch {
          reject(new JigError("az_failed", "The Azure CLI's answer wasn't JSON"));
        }
      },
    );
  });
}

/** Project links from Azure: resource groups, or one group's resources. Jig stores no tokens. */
export async function azureLinks(group?: string): Promise<AzureItem[]> {
  return azureItems(await az(group ? ["resource", "list", "--resource-group", group] : ["group", "list"]));
}

export function registerLinkHandlers(): void {
  handle("links.azure", ({ group }) => azureLinks(group));
}
