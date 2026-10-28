import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ChatArtifact,
  chatArtifacts,
  isArtifactUrl,
  parseArtifactList,
  type RemoteArtifact,
  readArtifactPage,
} from "../../shared/artifacts";
import { JigError } from "../../shared/ipc";
import { callClaudeTool } from "../engine/claudeTools";
import { handle } from "../ipc/router";
import { sessionManager } from "../sessions";
import { paths } from "../state/paths";

const CACHE_MS = 5 * 60_000;
let listCache: { at: string; artifacts: RemoteArtifact[] } | undefined;

/** Artifacts your Jig chats published (no model call: read from the transcripts). */
export async function artifactsFromChats(): Promise<ChatArtifact[]> {
  const m = sessionManager();
  const chats = await Promise.all(
    (await m.list())
      .filter((meta) => meta.kind !== "builder")
      .map(async (meta) => ({ id: meta.id, title: meta.title, items: (await m.snapshot(meta.id)).items })),
  );
  return chatArtifacts(chats);
}

/**
 * Artifacts in the chats, on your claude.ai account (through Claude Code's Artifact tool: a small model
 * call, D-092), and opening one of those in Jig: Claude Code reads the page back and Jig keeps a copy
 * in `~/.jig/cache/artifacts/` for the Preview tab.
 */
export function registerArtifactHandlers(): void {
  handle("artifacts.fromChats", () => artifactsFromChats());
  handle("artifacts.list", async ({ refresh }) => {
    if (listCache && !refresh && Date.now() - new Date(listCache.at).getTime() < CACHE_MS) return listCache;
    const result = await callClaudeTool({
      tool: "Artifact",
      input: { action: "list", scope: "all", limit: 100 },
    });
    if (!result.ok)
      throw new JigError("unavailable", result.text.slice(0, 300) || "Claude Code couldn't list them");
    listCache = { at: new Date().toISOString(), artifacts: parseArtifactList(result.structured) };
    return listCache;
  });
  handle("artifacts.fetch", async ({ url }) => {
    if (!isArtifactUrl(url)) throw new JigError("invalid_args", "That isn't a claude.ai artifact link");
    const result = await callClaudeTool({ tool: "Artifact", input: { action: "read", url } });
    if (!result.ok)
      throw new JigError("unavailable", result.text.slice(0, 300) || "Claude Code couldn't read it");
    const page = readArtifactPage(result.structured, result.text);
    const dir = join(paths.cache(), "artifacts");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${url.split("/").pop()}.html`);
    await writeFile(path, page);
    return { path };
  });
}
