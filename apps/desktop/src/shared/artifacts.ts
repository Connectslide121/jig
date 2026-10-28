import type { ChatItem } from "./engine";

/**
 * Artifacts: pages Claude publishes to claude.ai with Claude Code's Artifact tool. Jig opens them in
 * its Preview tab: from the local file Claude published, or, for ones made elsewhere, from the page
 * Claude Code reads back (D-092).
 */
export const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+/;

export const isArtifactUrl = (url: string) => new RegExp(`^${ARTIFACT_URL.source}$`).test(url);

/** An artifact one of your Jig chats published. */
export interface ChatArtifact {
  url: string;
  /** The local page Claude published (opens in Preview). */
  path?: string;
  title: string;
  sessionId: string;
  chatTitle: string;
  at: string;
}

/** An artifact on your claude.ai account (`Artifact` tool, action `list`). */
export interface RemoteArtifact {
  url: string;
  title: string;
  updatedAt?: string;
  shared?: boolean;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** The artifact a finished Artifact tool call published, if it was a publish. */
export function artifactFromTool(item: ChatItem): { url: string; path?: string; title: string } | undefined {
  if (item.kind !== "tool" || item.name !== "Artifact" || item.status !== "done") return undefined;
  const action = str(item.input.action) ?? "publish";
  if (action !== "publish") return undefined;
  const url = ARTIFACT_URL.exec(item.output ?? "")?.[0] ?? str(item.input.url);
  if (!url) return undefined;
  const path = str(item.input.file_path);
  const title = str(item.input.title) ?? (path ? basename(path).replace(/\.(html?|md)$/i, "") : url);
  return { url, path, title };
}

/** Every artifact published in these chats, newest first, one per link. */
export function chatArtifacts(
  chats: Array<{ id: string; title: string; items: ChatItem[] }>,
): ChatArtifact[] {
  const byUrl = new Map<string, ChatArtifact>();
  for (const chat of chats)
    for (const item of chat.items) {
      const found = artifactFromTool(item);
      if (!found) continue;
      const entry = { ...found, sessionId: chat.id, chatTitle: chat.title, at: item.at };
      const previous = byUrl.get(found.url);
      if (!previous || previous.at < entry.at) byUrl.set(found.url, entry);
    }
  return [...byUrl.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** The `Artifact` tool's list answer. */
export function parseArtifactList(structured: unknown): RemoteArtifact[] {
  const list = (structured as { artifacts?: unknown })?.artifacts;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => {
    const url = str(a?.url);
    if (!url) return [];
    return [{ url, title: str(a.title) ?? url, updatedAt: str(a.updatedAt), shared: a.rel === "shared" }];
  });
}

/** The page the `Artifact` tool's read returned, made a complete document for the Preview tab. */
export function readArtifactPage(structured: unknown, text: string): string {
  const read = (structured as { read?: { result?: unknown; code?: unknown } })?.read;
  const html = typeof read?.result === "string" ? read.result : text;
  if (typeof read?.code === "number" && read.code >= 400) throw new Error(`claude.ai answered ${read.code}`);
  if (!html.trim()) throw new Error("The artifact came back empty");
  // Published pages are wrapped in a document skeleton on claude.ai; do the same here.
  return /<html[\s>]/i.test(html)
    ? html
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n${html}\n</body></html>`;
}
