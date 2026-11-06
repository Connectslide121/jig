/**
 * Chats with measured turns for the Chat time add-on (D-419), written straight into JIG_HOME/sessions:
 * the add-on reads those files, so the view has a week of realistic data without running turns.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Step = [tool: string, input: Record<string, unknown>, seconds: number];

const RECIPES: Array<{ title: string; steps: Step[] }> = [
  {
    title: "Checkout: faster payment step",
    steps: [
      ["Read", { file_path: "src/checkout/pay.ts" }, 2],
      ["Edit", { file_path: "src/checkout/pay.ts" }, 1],
      ["Bash", { command: "npm run verify 2>&1 | tail -5" }, 70],
      ["mcp__jig__addon_tests_run", { suite: "npm:e2e:changed" }, 100],
      ["mcp__jig__addon_tests_wait", { id: "r1" }, 160],
    ],
  },
  {
    title: "Cart: show the discount line",
    steps: [
      ["Agent", { subagent_type: "jig-tester", prompt: "Open the cart and check the discount line" }, 140],
      ["mcp__jig__jig_browser_screenshot", { size: "desktop" }, 6],
      ["Bash", { command: "git status --short" }, 1],
    ],
  },
  {
    title: "Docs: refresh the readme",
    steps: [
      ["Grep", { pattern: "install" }, 1],
      ["Write", { file_path: "README.md" }, 1],
      ["AskUserQuestion", { questions: [] }, 90],
    ],
  },
  {
    title: "Search that forgives typos",
    steps: [
      ["Agent", { subagent_type: "jig-search", prompt: "Where is search ranked?" }, 45],
      ["Bash", { command: "npx vitest run src/search" }, 25],
      ["Bash", { command: "npm run build > .tmp/build.log 2>&1" }, 55],
    ],
  },
];

/**
 * Writes `count` chats per project over the last `days` days: a few turns each, some days with
 * chats working at the same time. Returns the chat ids.
 */
export async function seedChatTime(
  jigHome: string,
  projectIds: string[],
  { days = 7, count = 4 }: { days?: number; count?: number } = {},
): Promise<string[]> {
  const dir = join(jigHome, "sessions");
  await mkdir(dir, { recursive: true });
  const ids: string[] = [];
  const now = Date.now();
  let n = 0;
  for (const projectId of projectIds) {
    for (let c = 0; c < count; c++, n++) {
      const recipe = RECIPES[n % RECIPES.length]!;
      const id = `ct-${n}-${projectId.slice(0, 8)}`;
      const items: Array<Record<string, unknown>> = [];
      // Each chat works on a few days; chats share their working hours on some days.
      for (let d = 0; d < days; d += 1 + ((n + d) % 3)) {
        const turnStart = now - (days - 1 - d) * 86_400_000 - (2 + (n % 3)) * 3_600_000 - c * 600_000;
        if (turnStart > now - 60_000) continue;
        let t = turnStart;
        items.push({ kind: "user", id: `${id}-u${d}`, at: iso(t), text: recipe.title });
        t += 8_000;
        recipe.steps.forEach(([name, input, seconds], i) => {
          items.push({ kind: "tool", id: `${id}-t${d}-${i}`, at: iso(t), name, input, status: "done" });
          t += seconds * 1000;
          items.push({ kind: "assistant", id: `${id}-a${d}-${i}`, at: iso(t), text: "…" });
          t += 12_000 + ((n * 7 + d * 3 + i) % 5) * 9_000;
        });
        if (t > now) t = now;
        items.push({ kind: "result", id: `${id}-r${d}`, at: iso(t), durationMs: t - turnStart });
      }
      const session = {
        meta: {
          id,
          title: recipe.title,
          projectId,
          provider: "claude",
          cwd: jigHome,
          createdAt: items[0]?.at ?? iso(now),
          updatedAt: items.at(-1)?.at ?? iso(now),
        },
        items,
      };
      await writeFile(join(dir, `${id}.json`), JSON.stringify(session));
      ids.push(id);
    }
  }
  return ids;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
