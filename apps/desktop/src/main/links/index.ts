import { execFile } from "node:child_process";
import { JigError } from "../../shared/ipc";
import { type AzureItem, azureItems, azureSubscriptions } from "../../shared/links";
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

/**
 * Project links from Azure through your `az` login (Jig stores no tokens): the resource groups of
 * every enabled subscription you can see, in every tenant, each marked with its subscription; or
 * one group's resources. A subscription that can't be read (a tenant that needs its own sign-in)
 * is named in `problems` instead of failing the rest.
 */
export async function azureLinks(
  group?: string,
  subscription?: string,
): Promise<{ items: AzureItem[]; problems: string[] }> {
  if (group)
    return {
      items: azureItems(
        await az([
          "resource",
          "list",
          "--resource-group",
          group,
          ...(subscription ? ["--subscription", subscription] : []),
        ]),
      ),
      problems: [],
    };
  const subscriptions = azureSubscriptions(await az(["account", "list", "--all"]));
  if (subscriptions.length === 0) return { items: azureItems(await az(["group", "list"])), problems: [] };
  const problems: string[] = [];
  const lists: AzureItem[][] = new Array(subscriptions.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, subscriptions.length) }, async () => {
      while (next < subscriptions.length) {
        const i = next++;
        const sub = subscriptions[i]!;
        try {
          lists[i] = azureItems(await az(["group", "list", "--subscription", sub.id])).map((item) => ({
            ...item,
            subscriptionId: sub.id,
            subscription: sub.name,
          }));
        } catch (error) {
          lists[i] = [];
          problems.push(`${sub.name}: ${(error as Error).message.split("\n")[0]}`);
        }
      }
    }),
  );
  return { items: lists.flat(), problems };
}

export function registerLinkHandlers(): void {
  handle("links.azure", ({ group, subscription }) => azureLinks(group, subscription));
}
