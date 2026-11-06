import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { builtinAddonsDir } from "../addons";

/**
 * Jig factory's roles in the fake engine (tests, D-426): a stage chat's message starts with a marker
 * line, and this plays the stage's recipe without AI — writes the files the prompt lists, posts
 * question cards for the interview, fails the critic's first version, and reports with
 * `addon_factory_report`. Markers in the run's brief steer it, once each per run and recipe:
 * `[fail <recipe>]` reports the stage failed (tests the retry), `[noreport <recipe>]` ends the turn
 * without a report (tests the nudge), `[hold <recipe>]` waits until the test releases it, `[ask <recipe>]`
 * asks you a question with `addon_factory_ask` and ends the turn (the answer resumes it).
 */

export const FACTORY_MESSAGE = /^\[factory (stage|nudge|resume|answers) /;

export interface FakeFactoryHooks {
  /** Calls one of Jig's tools as the chat would (shows its card) and returns what it answered. */
  call: (tool: string, input: Record<string, unknown>) => Promise<string>;
  /** Streams a line of the chat's answer. */
  say: (text: string) => Promise<void>;
  /** Waits until the test releases this turn ("hold until released"). */
  hold: () => Promise<void>;
}

/** Steering markers already used: `<run>:<marker>:<recipe>`. */
const used = new Set<string>();

function once(runId: string, marker: string, recipe: string, brief: string): boolean {
  const key = `${runId}:${marker}:${recipe}`;
  if (used.has(key) || !brief.includes(`[${marker} ${recipe}]`)) return false;
  used.add(key);
  return true;
}

const listAfter = (text: string, heading: string): string[] =>
  (text.split(`${heading}\n`)[1] ?? "")
    .split("\n\n")[0]!
    .split("\n")
    .map((l) => l.replace(/^- /, "").trim())
    .filter((l) => l && !l.startsWith("("));

export async function runFakeFactory(text: string, hooks: FakeFactoryHooks): Promise<void> {
  const head = text.split("\n")[0] ?? "";
  const [, kind] = FACTORY_MESSAGE.exec(head) ?? [];
  const runId = /\brun (\S+?)[\s\]]/.exec(head)?.[1] ?? "";
  // The stage's own brief: where its files go, what it writes and the run's brief, in every case.
  const brief = await hooks.call("addon_factory_brief", {});
  const folder = /^Folder: (.+)$/m.exec(brief)?.[1]?.trim() ?? "";
  const stageId = /stage (\S+), version/.exec(brief)?.[1] ?? "";
  const version = Number(/version (\d+)\)/.exec(brief)?.[1] ?? 1);
  const briefText = brief.split("## The brief\n")[1] ?? "";
  const recipe =
    kind === "stage"
      ? (/^\[factory stage (\S+) /.exec(head)?.[1] ?? "")
      : stageId === "S1"
        ? "interview"
        : (stageId.split(":")[1] ?? "");
  const outputs = kind === "stage" ? listAfter(text, "## Write") : listAfter(brief, "## You write");
  if (!folder) {
    await hooks.say("This chat isn't a stage of a Jig factory run.");
    return;
  }

  if (kind === "stage" && once(runId, "hold", recipe, briefText)) {
    await hooks.say(`Working on ${recipe}…`);
    await hooks.hold();
  }

  if (recipe === "interview" && (kind === "stage" || kind === "answers")) {
    const round = kind === "answers" ? Number(/round (\d+)\]/.exec(head)?.[1] ?? 1) : 0;
    if (round < 2) {
      const cards =
        round === 0
          ? [
              { text: "Who is it for?", suggestion: "Staff on their phones", options: ["Staff", "Managers"] },
              { text: "What does a good day with it look like?", suggestion: "Nobody phones around" },
              { text: "Is there a product already?", suggestion: "No, it's new", options: ["Yes", "No"] },
            ]
          : [
              { text: "What must the demo show?", suggestion: "Offering a shift and taking one" },
              { text: "Who decides go / no-go?", suggestion: "The planner" },
            ];
      await hooks.call("addon_factory_questions", { questions: cards });
      await hooks.say(`Posted round ${round + 1} of the questions.`);
      return;
    }
    const idea = await readFile(join(folder, "input", "idea.md"), "utf8").catch(() => "An idea");
    const title =
      idea
        .split("\n")
        .find((l) => l.trim())
        ?.replace(/^#\s*/, "")
        .trim() ?? "An idea";
    await write(
      folder,
      "brief.md",
      `---\ntitle: ${title}\nlevel: L1\nproductExists: false\naudience: an internal go / no-go\n---\n# ${title}\n\n## Problem\n${idea.trim()}\n\n## Value\nPeople get it done in two taps.\n`,
    );
    await report(hooks, "Wrote the one-page brief from your answers.", ["brief.md"]);
    return;
  }

  if (kind === "stage" && once(runId, "noreport", recipe, briefText)) {
    await hooks.say("Still reading the brief.");
    return;
  }
  if (kind === "stage" && once(runId, "ask", recipe, briefText)) {
    await hooks.call("addon_factory_ask", { question: `Which shift types should ${recipe} cover?` });
    await hooks.say("Waiting for your answer.");
    return;
  }
  if (kind === "stage" && once(runId, "fail", recipe, briefText)) {
    await report(hooks, `Could not do ${recipe}.`, [], { failed: true });
    return;
  }

  const fails = recipe === "critique" && version === 1;
  const written: string[] = [];
  for (const path of outputs) {
    await write(folder, path, await contentOf(recipe, path, version, fails));
    written.push(path);
  }
  if (recipe === "directions")
    for (const n of ["1-calm", "2-bold", "3-warm"]) {
      const path = `directions/${n}.svg`;
      await write(
        folder,
        path,
        `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><text x="16" y="32">${n}</text></svg>`,
      );
      written.push(path);
    }
  if (recipe === "critique")
    await report(hooks, fails ? "v1 doesn't pass yet: two fixes." : "Passes the rubric.", written, {
      quality: { pass: !fails, score: fails ? 62 : 86 },
      notes: fails ? ["My shifts: the offer button is too small", "The empty state needs a next step"] : [],
    });
  else
    await report(
      hooks,
      `${recipe || "The stage"} done: ${written.join(", ") || "nothing to write"}.`,
      written,
    );
}

async function report(
  hooks: FakeFactoryHooks,
  summary: string,
  outputs: string[],
  extra: Record<string, unknown> = {},
): Promise<void> {
  const out = await hooks.call("addon_factory_report", { summary, outputs, notes: [], ...extra });
  await hooks.say(out.startsWith("Error") ? out : "Reported.");
}

async function write(folder: string, path: string, content: string): Promise<void> {
  const file = join(folder, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

async function contentOf(recipe: string, path: string, version: number, fails: boolean): Promise<string> {
  if (path.endsWith("index.html")) {
    const dir = builtinAddonsDir();
    const demo = dir
      ? await readFile(join(dir, "factory", "fixtures", "demo", "index.html"), "utf8").catch(() => "")
      : "";
    return demo || "<!doctype html><title>Demo</title><p>PROTOTYPE · sample data</p>";
  }
  if (path.endsWith(".json"))
    return recipe === "critique"
      ? JSON.stringify({ pass: !fails, score: fails ? 62 : 86 }, null, 2)
      : JSON.stringify({ color: { accent: { $type: "color", $value: "#4f46e5" } } }, null, 2);
  if (path.endsWith("CHANGES.md"))
    return `# Changes in v${version}\n\n- ${version === 1 ? "First version" : "Fixed what the critic found"}\n`;
  if (recipe === "scout")
    return "# Scout\n\nThree similar products; none lets staff swap without the planner. Suggested level: L1.\n";
  return `# ${path}\n\nWritten by the fake ${recipe} (version ${version}).\n`;
}
