/**
 * Publishing a demo outside Jig (D-438, D-470): where it can go (`factory.publishTargets`), the
 * pre-publish scan for real data, and the page that is published (the demo with its end date in it
 * and, when asked, a bar for the customer to confirm). Pure: the host writes and deploys.
 */

/** An Azure Static Web Apps site demos are published to (Settings → Factory → Publish targets). */
export interface PublishTarget {
  name: string;
  /** The static web app's name in Azure. */
  app: string;
  resourceGroup: string;
  subscription?: string;
  /** The site's address, `https://…azurestaticapps.net` or its own domain. */
  url: string;
}

/** One published copy of a demo version (`Run.published`). */
export interface Published {
  id: string;
  version: number;
  /** `local` (a file on this computer to send yourself) or a target's name. */
  where: string;
  /** The address on a site, or the file on this computer. */
  url?: string;
  path?: string;
  at: string;
  until: string;
  /** Where the customer's answer goes (the confirm bar's e-mail). */
  confirmTo?: string;
  takenDown?: string;
}

export const LOCAL = "local";
export const PUBLISH_DAYS = [7, 30, 90] as const;

/** The targets in the setting that are complete; others are left out. */
export function targetsOf(value: unknown): PublishTarget[] {
  if (!Array.isArray(value)) return [];
  const out: PublishTarget[] = [];
  for (const v of value) {
    const t = v as Partial<PublishTarget> | null;
    const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
    if (!t || !s(t.name) || !s(t.app) || !s(t.resourceGroup) || !/^https:\/\/[^\s/]+/.test(s(t.url)))
      continue;
    if (s(t.name) === LOCAL || out.some((o) => o.name === s(t.name))) continue;
    out.push({
      name: s(t.name),
      app: s(t.app),
      resourceGroup: s(t.resourceGroup),
      ...(s(t.subscription) ? { subscription: s(t.subscription) } : {}),
      url: s(t.url).replace(/\/+$/, ""),
    });
  }
  return out;
}

// The same rules as the demo kit's quality gate (`scripts/lib/checks.ts`, demo-quality.md → real data).
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const PHONE = /(?<![\d:])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]\d{2,4}){1,4}(?![:\d])/g;
/** RFC 2606 names, and the invented companies Jig's examples use. */
const RESERVED = [".example", ".test", ".invalid", ".localhost"];
const INVENTED = [
  "example.com",
  "example.org",
  "example.net",
  "contoso.com",
  "fabrikam.com",
  "northwindtraders.com",
  "adventure-works.com",
  "tailspintoys.com",
  "wingtiptoys.com",
  "woodgrovebank.com",
];

export function domainAllowed(domain: string, allow: readonly string[] = []): boolean {
  const d = domain.toLowerCase();
  if (RESERVED.some((r) => d.endsWith(r))) return true;
  return [...INVENTED, ...allow].some((a) => d === a.toLowerCase() || d.endsWith(`.${a.toLowerCase()}`));
}

export interface RealDataHit {
  kind: "email" | "phone" | "name";
  value: string;
}

/**
 * The text a demo shows or can show: its markup's text and the words in its attributes and scripts'
 * strings (a built demo keeps its data in its script). Styles are left out.
 */
export function demoText(html: string): string {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? "");
  const strings = scripts.flatMap((s) =>
    [...s.matchAll(/"((?:[^"\\\n]|\\.){3,})"|'((?:[^'\\\n]|\\.){3,})'|`([^`]{3,})`/g)].map(
      (m) => m[1] ?? m[2] ?? m[3] ?? "",
    ),
  );
  const markup = html
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ");
  const attrs = [...markup.matchAll(/\b(?:alt|title|placeholder|value|aria-label|href)="([^"]*)"/gi)].map(
    (m) => m[1] ?? "",
  );
  const text = markup.replace(/<[^>]+>/g, " ");
  return [text, ...attrs, ...strings]
    .join("\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#64;|&commat;/g, "@");
}

/** Real-looking e-mail addresses and phone numbers, and names from the product's real-customer list. */
export function scanRealData(
  text: string,
  opts: { allowDomains?: readonly string[]; realNames?: readonly string[] } = {},
): RealDataHit[] {
  const hits: RealDataHit[] = [];
  for (const m of text.matchAll(EMAIL))
    if (!domainAllowed(m[1] ?? "", opts.allowDomains)) hits.push({ kind: "email", value: m[0] });
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) hits.push({ kind: "phone", value: m[0].trim() });
  }
  for (const name of opts.realNames ?? []) {
    const n = name.trim();
    if (!n || n.startsWith("#")) continue;
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`,
      "iu",
    );
    if (re.test(text)) hits.push({ kind: "name", value: n });
  }
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.kind}:${h.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** One name per line, `#` comments and blank lines ignored (`kit/real-names.txt`). */
export const parseNames = (file: string): string[] =>
  file
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/**
 * The published page: the demo, plus a script that replaces it with "This demo has ended" after its end
 * date (so a copy stops showing even where Jig can't take it down), and, with `confirmTo`, a bar at
 * the bottom where the customer says whether this is what they wanted (an e-mail to `confirmTo`).
 */
export function publishHtml(
  html: string,
  input: { title: string; until: string; confirmTo?: string },
): string {
  const until = new Date(input.until);
  const day = until.toISOString().slice(0, 10);
  const ended = `<div style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:20vh auto;text-align:center;color:#444">${esc(input.title)}: this demo was shared until ${day} and has ended.</div>`; // jig-tokens-ignore-line: the published page is outside Jig, no tokens there
  const expiry = `<script data-jig-factory="expiry">(function(){if(Date.now()>${until.getTime()}){document.documentElement.innerHTML=${JSON.stringify(`<body>${ended}</body>`)};}})();</script>`;
  let bar = "";
  if (input.confirmTo) {
    const mail = (subject: string, body: string) =>
      `mailto:${encodeURIComponent(input.confirmTo ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const yes = mail(`${input.title}: confirmed`, "Yes, this is what I wanted.");
    const no = mail(`${input.title}: not quite`, "Not quite. What I'm missing:\n\n");
    const btn =
      "display:inline-block;padding:6px 14px;border-radius:6px;text-decoration:none;font-weight:600;margin-left:8px";
    bar = `<div data-jig-factory="confirm" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:4px;padding:10px 16px;background:#1f2328;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 -2px 12px rgba(0,0,0,.2)"><span>Is this what you wanted?</span><a href="${esc(yes)}" style="${btn};background:#2da44e;color:#fff">Yes, this is it</a><a href="${esc(no)}" style="${btn};background:#fff;color:#1f2328">Not quite…</a></div><style>body{padding-bottom:56px!important}</style>`; // jig-tokens-ignore-line: the published page is outside Jig, no tokens there
  }
  const head = /<head\b[^>]*>/i.exec(html);
  let out = head ? html.replace(head[0], `${head[0]}${expiry}`) : `${expiry}${html}`;
  if (bar)
    out = /<\/body>/i.test(out)
      ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${bar}</body>`)
      : `${out}${bar}`;
  return out;
}

/** The end date `days` from `from`. */
export function untilOf(days: number, from = Date.now()): string {
  return new Date(from + days * 86_400_000).toISOString();
}

/** Where a version goes on a site: `<run>/v<n>/` (the site keeps every published demo, D-470). */
export const sitePath = (runId: string, version: number) => `${runId}/v${version}`;

/** The published copies still out: not taken down (ended ones included: they say so on the page). */
export const live = (list: readonly Published[] = []) => list.filter((p) => !p.takenDown);

/** `npx` arguments for deploying a site folder with the Static Web Apps CLI, signed in through az. */
export function deployArgs(folder: string, t: PublishTarget): string[] {
  return [
    "--yes",
    SWA_CLI,
    "deploy",
    folder,
    "--app-name",
    t.app,
    "--resource-group",
    t.resourceGroup,
    ...(t.subscription ? ["--subscription-id", t.subscription] : []),
    "--env",
    "production",
  ];
}

/** The Static Web Apps CLI, pinned. */
export const SWA_CLI = "@azure/static-web-apps-cli@2.1.0";
