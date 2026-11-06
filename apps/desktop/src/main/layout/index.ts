import { closeTabsWhere, type Layout, LayoutSchema } from "../../shared/layout";
import { emit, handle } from "../ipc/router";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";

/**
 * `~/.jig/layout.json`. The renderer owns layout edits (pure functions in shared/layout.ts) and saves
 * the whole document; host modules (the builder, level 1) use `setLayout` and the renderer follows
 * the `layout.changed` event.
 */
let current: Layout | undefined;
let persistentChats: (() => Promise<Set<string>>) | undefined;

async function savedLayout(layout: Layout): Promise<Layout> {
  if (!persistentChats) return layout;
  const ids = await persistentChats();
  return closeTabsWhere(
    layout,
    (tab) => tab.type === "jig.chat" && !ids.has(String(tab.params.sessionId)),
    true,
  );
}

export async function getLayout(): Promise<Layout> {
  current ??= await savedLayout(await readJson(paths.layout(), LayoutSchema));
  return current;
}

export async function setLayout(layout: Layout, origin: "renderer" | "host" = "host"): Promise<Layout> {
  current = LayoutSchema.parse(layout);
  await writeJson(paths.layout(), await savedLayout(current));
  if (origin === "host") emit("layout.changed", current);
  return current;
}

/** A draft received its first prompt: include its existing open tab in the saved layout. */
export async function persistCurrentLayout(): Promise<void> {
  if (current) await writeJson(paths.layout(), await savedLayout(current));
}

export function registerLayoutHandlers(chatIds?: () => Promise<Set<string>>): void {
  persistentChats = chatIds;
  handle("layout.get", () => getLayout());
  handle("layout.set", (layout) => setLayout(layout, "renderer"));
}
