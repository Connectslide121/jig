import { randomBytes } from "node:crypto";
import { JigError } from "../../shared/ipc";
import type { Tour } from "../../shared/tour";
import { git } from "../addons/repo";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { handle } from "../ipc/router";
import { parseTour, splitDiff, TOUR_DIFF_LIMIT, tourPrompt } from "./tour";

/** Tours of this run of Jig (they're cheap to make again). */
const tours = new Map<string, Tour>();

/** New files Claude or you added, as diffs (at most 40, each cut at 20 000 characters). */
async function untrackedDiffs(root: string): Promise<string> {
  const list = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).stdout
    .split("\0")
    .filter(Boolean)
    .slice(0, 40);
  const parts: string[] = [];
  for (const file of list) {
    const r = await git(root, ["diff", "--no-index", "--no-color", "--", "/dev/null", file]);
    if (r.stdout && !r.stdout.includes("Binary files")) parts.push(r.stdout.slice(0, 20_000));
  }
  return parts.join("\n");
}

/** The uncommitted changes of the repository `cwd` is in: tracked against HEAD, plus new files. */
export async function changesOf(cwd: string): Promise<{ root: string; diff: string }> {
  const top = await git(cwd, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) throw new JigError("invalid_args", "This folder isn't in a git repository");
  const root = top.stdout.trim();
  const tracked = await git(root, ["diff", "--no-color", "--no-ext-diff", "HEAD"]);
  const diff = `${tracked.code === 0 ? tracked.stdout : ""}\n${await untrackedDiffs(root)}`.trim();
  return { root, diff };
}

export function registerTourHandlers(): void {
  handle("tour.create", async ({ cwd, focus }) => {
    const { root, diff } = await changesOf(cwd);
    if (!diff) throw new JigError("invalid_args", "There are no uncommitted changes to walk through");
    const diffs = splitDiff(diff);
    const { engine } = getConfig();
    const answer = await getEngine().oneShot(tourPrompt(diff.slice(0, TOUR_DIFF_LIMIT), focus), {
      cwd: root,
      model: engine.defaultModel,
      appendSystemPrompt: "You explain code changes clearly and briefly. Reply with only the JSON asked for.",
      env: sessionEnv(process.env, engine.allowApiKey),
      claudePath: engine.claudePath,
      timeoutMs: 300_000,
    });
    const parsed = parseTour(answer, Object.keys(diffs));
    const tour: Tour = {
      id: randomBytes(6).toString("hex"),
      cwd: root,
      ...parsed,
      diffs,
      createdAt: new Date().toISOString(),
    };
    tours.set(tour.id, tour);
    return tour;
  });
  handle("tour.get", ({ id }) => {
    const tour = tours.get(id);
    if (!tour) throw new JigError("not_found", "This tour is gone (Jig was restarted): start it again");
    return tour;
  });
}
