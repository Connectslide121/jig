import { type Layout, LayoutSchema } from "../../shared/layout";
import { emit, handle } from "../ipc/router";
import { readJson, writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";

/**
 * `~/.jig/layout.json`. The renderer owns layout edits (pure functions in shared/layout.ts) and saves
 * the whole document; host modules (the builder, level 1) use `setLayout` and the renderer follows
 * the `layout.changed` event.
 */
let current: Layout | undefined;

export async function getLayout(): Promise<Layout> {
  current ??= await readJson(paths.layout(), LayoutSchema);
  return current;
}

export async function setLayout(layout: Layout, origin: "renderer" | "host" = "host"): Promise<Layout> {
  current = LayoutSchema.parse(layout);
  await writeJson(paths.layout(), current);
  if (origin === "host") emit("layout.changed", current);
  return current;
}

export function registerLayoutHandlers(): void {
  handle("layout.get", () => getLayout());
  handle("layout.set", (layout) => setLayout(layout, "renderer"));
}
