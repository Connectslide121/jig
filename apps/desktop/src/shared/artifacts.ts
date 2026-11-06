import type { ChatItem } from "./engine";

/**
 * Artifacts: pages published to claude.ai with Claude Code's Artifact tool, which Claude Code offers only
 * inside the Claude desktop app, never in Jig's chats (D-404). A chat resumed from the desktop app can
 * still hold old calls; their local page opens in Jig's Preview tab.
 */
export const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+/;

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
