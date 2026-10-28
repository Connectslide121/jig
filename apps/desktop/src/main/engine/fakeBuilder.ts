import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EngineEvent } from "../../shared/engine";

/**
 * A scripted builder for tests and `JIG_ENGINE=fake`: it calls the real `jig-builder` tools, so the
 * whole pipeline (staging, worktree, validation, preview, accept) runs without Claude Code.
 *
 * - goal mentions "move" / "layout" → level 1: moves Terminals to the right sidebar
 * - "compact" / "setting" → level 1: density compact
 * - "broken" → writes an add-on with a design-token problem first, then fixes it after validation
 * - "jig itself" / "source" → proposes a level-3 change
 * - a target add-on → changes that add-on (adds a line to its README and a label)
 * - anything else → a new add-on with a view and a Tools-menu action
 */
type Tools = Record<string, (args: Record<string, unknown>) => Promise<string>>;

export async function runFakeBuilder(
  text: string,
  tools: Tools,
  emit: (e: EngineEvent) => void,
): Promise<void> {
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const id = `tool-${randomUUID()}`;
    emit({ type: "tool_use", id, name: `mcp__jig-builder__${name}`, input: args });
    const output = await tools[name]!(args);
    emit({ type: "tool_result", toolUseId: id, output, isError: false });
    return output;
  };
  const say = (t: string) =>
    emit({ type: "block_end", id: `msg-${randomUUID()}:text:0`, block: "text", text: t });
  const goal = /The user asked: (.*)/.exec(text)?.[1]?.trim() ?? text;
  const target = /existing add-on "([^"]+)"/.exec(text)?.[1];
  const lower = goal.toLowerCase();

  await call("catalog");
  if (/\b(move|layout)\b/.test(lower)) {
    await call("stage_layout", { ops: [{ op: "move", view: "jig.terminals", region: "right" }] });
    await call("finish", { summary: "Terminals moved to the right sidebar.", kind: "layout" });
    return say("I staged a layout change: Terminals move to the right sidebar.");
  }
  if (/\b(compact|setting|settings)\b/.test(lower)) {
    await call("stage_settings", { patch: { appearance: { density: "compact" } } });
    await call("finish", { summary: "Compact density.", kind: "settings" });
    return say("I staged a settings change: compact density.");
  }
  if (/jig itself|source/.test(lower)) {
    await call("propose_app_change", {
      reason: "No slot can change the window frame.",
      plan: "Add a slot for window decorations.",
    });
    return say("This needs a change to Jig itself.");
  }
  if (target) {
    const started = await call("start_addon", { id: target, mode: "change" });
    const folder = /Work in this folder \(and only here\): (.*)/.exec(started)![1]!.trim();
    const readme = await readFile(join(folder, "README.md"), "utf8").catch(() => `# ${target}\n`);
    await writeFile(join(folder, "README.md"), `${readme.trimEnd()}\n\nChanged by the builder: ${goal}\n`);
    const ui = await readFile(join(folder, "ui.tsx"), "utf8").catch(() => "");
    if (ui.includes("Hello v1"))
      await writeFile(join(folder, "ui.tsx"), ui.replaceAll("Hello v1", "Hello from the builder"));
    await call("validate", { id: target });
    await call("finish", { summary: `Changed ${target}: ${goal}`, kind: "change-addon", addonId: target });
    return say(`I changed the existing add-on ${target}.`);
  }
  const id =
    `${
      lower
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .split("-")
        .slice(0, 3)
        .join("-") || "tool"
    }`.replace(/^[^a-z]+/, "") || "tool";
  const started = await call("start_addon", { id, mode: "new" });
  const folder = /Work in this folder \(and only here\): (.*)/.exec(started)![1]!.trim();
  await mkdir(folder, { recursive: true });
  const broken = lower.includes("broken");
  await writeFile(
    join(folder, "addon.json"),
    JSON.stringify(
      {
        id,
        name: goal.slice(0, 40) || "Tool",
        description: `Built for: ${goal}`,
        icon: "sparkles",
        contributes: {
          views: [{ id: "main", title: goal.slice(0, 24) || "Tool", region: "right", component: "MainView" }],
          actions: [{ id: "hello", title: `Hello from ${id}`, run: "hello" }],
        },
      },
      null,
      2,
    ),
  );
  const view = (style: string) => `import type { AddonComponentProps, AddonUiContext } from "@jig/sdk";
import { Button } from "@jig/sdk/ui";

export function MainView({ ctx }: AddonComponentProps) {
  return (
    <div className="flex flex-col gap-2 p-3 text-sm" data-testid="built-view">
      <span${style}>Built by the builder</span>
      <Button size="sm" onClick={() => ctx.notify({ title: "Hello!" })}>Say hello</Button>
    </div>
  );
}

export function hello(ctx: AddonUiContext) {
  ctx.notify({ title: "Hello from ${id}", tone: "success" });
}
`;
  await writeFile(
    join(folder, "ui.tsx"),
    view(broken ? ' style={{ color: "#ff0000" }}' : ' className="text-accent"'),
  );
  await writeFile(join(folder, "README.md"), `# ${id}\n\nBuilt for: ${goal}\n`);
  const first = await call("validate", { id });
  if (!first.startsWith("Valid")) {
    say("Validation found a problem; fixing it.");
    await writeFile(join(folder, "ui.tsx"), view(' className="text-accent"'));
    await call("validate", { id });
  }
  await call("finish", {
    summary: `A new add-on "${id}" with a view in the right sidebar and a Tools-menu action.`,
    kind: "new-addon",
    addonId: id,
  });
  say(`I built a new add-on: ${id}.`);
}
