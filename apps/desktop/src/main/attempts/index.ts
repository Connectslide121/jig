import { providerName } from "../../shared/aiFeatures";
import { getConfig } from "../config";
import { emit, handle } from "../ipc/router";
import { featureOneShot } from "../providers";
import { sessionManager } from "../sessions";
import { paths } from "../state/paths";
import { AttemptService } from "./service";

let service: AttemptService | undefined;

export function attemptService(): AttemptService {
  if (!service) throw new Error("Attempts not started");
  return service;
}

const JUDGE_INSTRUCTIONS =
  "You compare several attempts at the same coding task and recommend one. Be concrete and brief. Reply with only the JSON asked for.";

export function startAttempts(): void {
  const s = new AttemptService({
    dir: paths.attempts(),
    createSession: ({ projectId, cwd, title }) =>
      sessionManager().create({
        projectId,
        cwd,
        title,
        model: getConfig().engine.defaultModel,
        // Each attempt edits its own copy of the repository: no prompt for every edit.
        permissionMode: "acceptEdits",
      }),
    send: (id, text) => sessionManager().send(id, text),
    stop: (id) => sessionManager().stopProcess(id),
    ask: async (prompt, cwd) => {
      const r = await featureOneShot("attemptsJudge", prompt, {
        cwd,
        system: JUDGE_INSTRUCTIONS,
        timeoutMs: 300_000,
      });
      return { text: r.text, provider: providerName(r.provider) };
    },
    onChange: (run) => emit("attempts.changed", run),
  });
  service = s;
  handle("attempts.start", (input) => s.start(input));
  handle("attempts.list", () => s.list());
  handle("attempts.get", ({ id }) => s.get(id));
  handle("attempts.changes", ({ id }) => s.changes(id));
  handle("attempts.diff", ({ id, index, path }) => s.diff(id, index, path));
  handle("attempts.judge", ({ id }) => s.judge(id));
  handle("attempts.keep", ({ id, index }) => s.keep(id, index));
  handle("attempts.discard", ({ id }) => s.discard(id));
  handle("attempts.repoDirty", ({ id }) => s.repoDirty(id));
}
