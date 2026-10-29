/** Which Azure DevOps organisations and projects Pipelines shows. Pure (tested in orgs.test.ts). */

export interface OrgSettings {
  /** `https://dev.azure.com/<name>`. */
  org: string;
  /** The projects to show; none listed = every project of the organisation. */
  projects?: string[];
}

export interface Settings {
  /** Every organisation your `az` login belongs to, besides the ones listed in `orgs`. */
  allOrgs: boolean;
  /** Organisations added by hand, and the project choice per organisation. */
  orgs: OrgSettings[];
}

export const DEFAULT_SETTINGS: Settings = { allOrgs: true, orgs: [] };

/** An organisation's URL from a name or any of its URLs (`contoso`, `https://contoso.visualstudio.com`…). */
export function orgUrl(input: string): string {
  const s = input.trim().replace(/\/+$/, "");
  const dev = /^https?:\/\/(?:vssps\.)?dev\.azure\.com(?::\d+)?\/([^/]+)/i.exec(s);
  if (dev) return `https://dev.azure.com/${dev[1]}`;
  const vs = /^https?:\/\/([^./]+)\.(?:vssps\.)?visualstudio\.com/i.exec(s);
  if (vs) return `https://dev.azure.com/${vs[1]}`;
  return s ? `https://dev.azure.com/${s.replace(/^https?:\/\//, "")}` : "";
}

/** The organisation's name, for headings and keys. */
export function orgName(url: string): string {
  return orgUrl(url).replace(/^https:\/\/dev\.azure\.com\//, "");
}

/** Settings as stored, including the first version (`{ org, projects }`: one organisation). */
export function readSettings(stored: unknown): Settings {
  if (!stored || typeof stored !== "object") return DEFAULT_SETTINGS;
  const s = stored as Partial<Settings> & { org?: string; projects?: string[] };
  if (Array.isArray(s.orgs))
    return {
      allOrgs: s.allOrgs !== false,
      orgs: s.orgs
        .filter((o) => o?.org)
        .map((o) => ({
          org: orgUrl(o.org),
          projects: o.projects?.length ? o.projects.map((p) => p.trim()).filter(Boolean) : undefined,
        })),
    };
  // The first version: one organisation and the projects picked for it.
  return {
    allOrgs: !s.org,
    orgs: s.org ? [{ org: orgUrl(s.org), projects: s.projects?.length ? s.projects : undefined }] : [],
  };
}

/** The organisations to show, each once: the listed ones, plus every one you belong to with `allOrgs`. */
export function effectiveOrgs(settings: Settings, belongTo: string[]): OrgSettings[] {
  const byUrl = new Map<string, OrgSettings>();
  for (const o of settings.orgs) byUrl.set(orgUrl(o.org).toLowerCase(), { ...o, org: orgUrl(o.org) });
  if (settings.allOrgs)
    for (const url of belongTo.map(orgUrl))
      if (!byUrl.has(url.toLowerCase())) byUrl.set(url.toLowerCase(), { org: url });
  return [...byUrl.values()].sort((a, b) => orgName(a.org).localeCompare(orgName(b.org)));
}

/** Runs `work` over `items`, at most `limit` at a time, keeping the order of the results. */
export async function inBatches<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]!);
    }
  });
  await Promise.all(lanes);
  return results;
}
