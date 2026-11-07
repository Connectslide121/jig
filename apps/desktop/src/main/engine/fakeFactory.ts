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
    const [, n, enough] = kind === "answers" ? (/round (\d+)( enough)?\]/.exec(head) ?? []) : [];
    const round = Number(n ?? 0);
    const idea = await readFile(join(folder, "input", "idea.md"), "utf8").catch(() => "An idea");
    const title =
      idea
        .split("\n")
        .find((l) => l.trim())
        ?.replace(/^#\s*/, "")
        .trim() ?? "An idea";
    if (round < 2 && !enough) {
      // After the first round the brief is half written (D-461): coverage shows it.
      if (round === 1) await write(folder, "brief.md", fakeBrief(title, idea, false));
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
    await write(folder, "brief.md", fakeBrief(title, idea, true, !!enough));
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
        `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${BOARD[n]}"/><text x="16" y="40" font-family="sans-serif" font-size="20" fill="#fff">${n}</text></svg>`,
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

const BOARD: Record<string, string> = { "1-calm": "#4b6584", "2-bold": "#c0392b", "3-warm": "#d68910" };

/** The fake critic's `quality/v<N>.json`: the rubric's axes, and two fixes while it fails (D-462). */
function fakeScorecard(fails: boolean) {
  const v = fails ? 3 : 4.3;
  return {
    pass: !fails,
    score: fails ? 62 : 86,
    axes: {
      hierarchy: v,
      spacing: fails ? 2.5 : 4,
      typography: v,
      colour: v,
      density: v,
      consistency: v,
      polish: fails ? 3 : 4.5,
      story: v,
    },
    fixes: fails
      ? [
          {
            screen: "My shifts",
            element: "Offer button",
            change: "Make the offer button the primary action",
          },
          { screen: "Open shifts", element: "Empty state", change: "Give the empty state a next step" },
        ]
      : [],
  };
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
      ? JSON.stringify(fakeScorecard(fails), null, 2)
      : JSON.stringify({ color: { accent: { $type: "color", $value: "#4f46e5" } } }, null, 2);
  if (path.endsWith("CHANGES.md"))
    return `# Changes in v${version}\n\n- ${version === 1 ? "First version" : "Fixed what the critic found"}\n`;
  if (recipe === "scout")
    return "# Scout\n\nThree similar products; none lets staff swap without the planner. Suggested level: L1.\n";
  return `# ${path}\n\nWritten by the fake ${recipe} (version ${version}).\n`;
}

/** The fake interviewer's brief: half of it after round 1, all of it (or what it has, on Good enough) at the end. */
function fakeBrief(title: string, idea: string, full: boolean, enough = false): string {
  const head = full
    ? `---\ntitle: ${title}\nstatus: draft\nlevel: L1\nlevelWhy: A go / no-go needs clickable screens, not working flows\nlanguages: docs: en, sales: sv, learning: en, marketing: sv\nproductExists: false\naudience: an internal go / no-go\n---\n`
    : `---\ntitle: ${title}\nstatus: draft\n---\n`;
  const parts = [
    `# ${title}`,
    `## Problem\n${idea.trim()}`,
    "## Value\nPeople get it done in two taps.",
    "## Users\nStaff on their phones; the planner approves.",
    "## Main flow\nOffer a shift → a colleague takes it → the planner approves.",
  ];
  if (full)
    parts.push(
      "## Key screens\nMy shifts, Offer a shift, Open shifts, Approvals.",
      "## Scope\nOffering, taking and approving swaps.",
      enough ? "## Out of scope\n" : "## Out of scope\nPay and overtime rules.",
      "## Data\nShifts and staff from the planning system.",
      "## Rules\nThe product's own words: shift, swap, planner.",
      enough
        ? "## Open points\n- What is out of scope\n- Who approves on weekends"
        : "## Open points\n- Who approves on weekends",
    );
  return `${head}${parts.join("\n\n")}\n`;
}
