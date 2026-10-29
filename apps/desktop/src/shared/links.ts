import { z } from "zod";

/**
 * A project's links (phase 18, item 7): its Azure resources, sites and other places, in groups you name
 * (Stage, Prod…). Each link has a type, which gives its icon and a default label. Pure, tested.
 */
export const LINK_TYPES = {
  "resource-group": { label: "Resource group", icon: "boxes" },
  website: { label: "Website", icon: "globe" },
  "app-service": { label: "App Service", icon: "app-window" },
  "function-app": { label: "Function app", icon: "zap" },
  database: { label: "Database", icon: "database" },
  storage: { label: "Storage", icon: "hard-drive" },
  "key-vault": { label: "Key vault", icon: "key-round" },
  monitoring: { label: "Monitoring", icon: "activity" },
  containers: { label: "Containers", icon: "container" },
  "devops-repo": { label: "Repository", icon: "git-branch" },
  "devops-pipeline": { label: "Pipeline", icon: "rocket" },
  "devops-board": { label: "Board", icon: "kanban" },
  api: { label: "API", icon: "plug" },
  docs: { label: "Docs", icon: "book-open" },
  dashboard: { label: "Dashboard", icon: "layout-dashboard" },
  other: { label: "Link", icon: "link" },
} as const;
export type LinkType = keyof typeof LINK_TYPES;
export const LINK_TYPE_IDS = Object.keys(LINK_TYPES) as LinkType[];

export const LinkSchema = z.object({
  id: z.string(),
  url: z
    .string()
    .regex(/^https?:\/\//i, "Links are http(s) addresses")
    .max(4096),
  /** Empty: the label is taken from the address. */
  label: z.string().max(200).optional(),
  type: z.enum(LINK_TYPE_IDS as [LinkType, ...LinkType[]]).default("other"),
});
export type ProjectLink = z.infer<typeof LinkSchema>;

export const LinkGroupSchema = z.object({
  id: z.string(),
  /** "Stage", "Prod", "Monitoring"… */
  title: z.string().max(100),
  links: z.array(LinkSchema).max(200).default([]),
});
export type LinkGroup = z.infer<typeof LinkGroupSchema>;

/** The Azure portal path of a resource id, e.g. /subscriptions/…/resourceGroups/shop-stage/providers/Microsoft.Web/sites/shop. */
const AZURE_ID =
  /\/subscriptions\/[^/]+\/resourcegroups\/([^/]+)(?:\/providers\/([^/]+\/[^/]+)(?:\/[^/]+)*\/([^/?#]+))?/i;

/** The type a link probably is, from its address. */
export function guessLinkType(url: string): LinkType {
  const u = url.toLowerCase();
  const azure = AZURE_ID.exec(decodeURIComponent(u));
  if (azure) {
    const provider = azure[2] ?? "";
    if (!provider) return "resource-group";
    if (provider.startsWith("microsoft.web/sites"))
      return u.includes("functionapp") || u.includes("/functions") ? "function-app" : "app-service";
    if (
      provider.startsWith("microsoft.sql") ||
      provider.includes("dbfor") ||
      provider.startsWith("microsoft.documentdb")
    )
      return "database";
    if (provider.startsWith("microsoft.storage")) return "storage";
    if (provider.startsWith("microsoft.keyvault")) return "key-vault";
    if (provider.startsWith("microsoft.insights") || provider.startsWith("microsoft.operationalinsights"))
      return "monitoring";
    if (
      provider.startsWith("microsoft.containerservice") ||
      provider.startsWith("microsoft.app") ||
      provider.startsWith("microsoft.containerregistry")
    )
      return "containers";
    return "other";
  }
  if (/dev\.azure\.com|visualstudio\.com/.test(u)) {
    if (u.includes("/_git/")) return "devops-repo";
    if (u.includes("/_build") || u.includes("/_release")) return "devops-pipeline";
    if (u.includes("/_boards") || u.includes("/_workitems") || u.includes("/_backlogs"))
      return "devops-board";
    return "other";
  }
  if (/swagger|openapi|\/api-docs/.test(u)) return "api";
  if (/grafana|dashboard|portal\.azure\.com\/#dashboard/.test(u)) return "dashboard";
  if (/docs?\.|\/docs\/|wiki|confluence|notion\.so/.test(u)) return "docs";
  return "website";
}

/** A label from the address: the Azure resource's name, the repository, else the host. */
export function defaultLinkLabel(url: string): string {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // keep it as it is
  }
  const azure = AZURE_ID.exec(decoded);
  if (azure) return azure[3] ?? azure[1]!;
  const repo = /\/_git\/([^/?#]+)/.exec(decoded);
  if (repo) return repo[1]!;
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname.replace(/\/$/, "") : "");
  } catch {
    return url;
  }
}

/** What a link shows: its label, else one from the address. */
export function linkLabel(link: Pick<ProjectLink, "url" | "label">): string {
  return link.label?.trim() || defaultLinkLabel(link.url);
}

/** The portal address of an Azure resource id. */
export function azurePortalUrl(resourceId: string): string {
  return `https://portal.azure.com/#@/resource${resourceId.startsWith("/") ? "" : "/"}${resourceId}`;
}

/** An Azure resource group or resource, offered as a link. */
export interface AzureItem {
  name: string;
  /** Azure resource id. */
  id: string;
  /** Azure's type, e.g. `Microsoft.Web/sites`; `resourceGroup` for a group. */
  azureType: string;
  group: string;
  url: string;
  type: LinkType;
}

/** `az group list` / `az resource list` output → items to pick (pure). */
export function azureItems(json: unknown): AzureItem[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((r): r is { id: string; name: string; type?: string; resourceGroup?: string } =>
      Boolean(r && typeof r.id === "string" && typeof r.name === "string"),
    )
    .map((r) => {
      const url = azurePortalUrl(r.id);
      const isGroup = !r.type || r.type === "Microsoft.Resources/resourceGroups";
      return {
        name: r.name,
        id: r.id,
        azureType: isGroup ? "resourceGroup" : r.type!,
        group: r.resourceGroup ?? (isGroup ? r.name : ""),
        url,
        type: isGroup ? ("resource-group" as const) : guessLinkType(url),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
