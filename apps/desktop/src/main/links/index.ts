import { AzError } from "@jig/azure";
import { JigError } from "../../shared/ipc";
import { type AzureItem, azureItems, azureSubscriptions, tenantSubscriptions } from "../../shared/links";
import { azureContext } from "../azure/env";
import { runAz } from "../azure/run";
import { handle } from "../ipc/router";

/** `az` with the active tenant (D-284); its failures become `az_missing`, `az_login` or `az_failed`. */
async function az(args: string[]): Promise<unknown> {
  const { env, tenant } = azureContext();
  try {
    return await runAz(args, { env, tenant, timeoutMs: 90_000 });
  } catch (error) {
    if (!(error instanceof AzError)) throw error;
    const code =
      error.problem === "missing"
        ? "az_missing"
        : error.problem === "signedOut" || error.problem === "expired"
          ? "az_login"
          : "az_failed";
    throw new JigError(code, error.message);
  }
}

/**
 * Project links from Azure through your `az` login (Jig stores no tokens): the resource groups of
 * every enabled subscription of the active tenant (D-282), each marked with its subscription; or one
 * group's resources. Your own az login keeps every directory it is signed in to. A subscription that
 * can't be read (a directory that needs its own sign-in) is named in `problems` instead of failing the
 * rest. `tenant` says which tenant, for the dialog to say where the list comes from.
 */
export async function azureLinks(
  group?: string,
  subscription?: string,
): Promise<{ items: AzureItem[]; problems: string[]; tenant: { label: string; isDefault: boolean } }> {
  const { tenant } = azureContext();
  const label = { label: tenant.label, isDefault: tenant.isDefault };
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
      tenant: label,
    };
  const subscriptions = tenantSubscriptions(
    azureSubscriptions(await az(["account", "list", "--all"])),
    tenant.isDefault ? undefined : tenant.tenantId,
  );
  if (subscriptions.length === 0)
    return { items: azureItems(await az(["group", "list"])), problems: [], tenant: label };
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
  return { items: lists.flat(), problems, tenant: label };
}

export function registerLinkHandlers(): void {
  handle("links.azure", ({ group, subscription }) => azureLinks(group, subscription));
}
