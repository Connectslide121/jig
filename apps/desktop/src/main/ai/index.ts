import { JigError } from "../../shared/ipc";
import { addonService } from "../addons";
import { getConfig } from "../config";
import { getEngine, sessionEnv } from "../engine";
import { handle } from "../ipc/router";
import { jigHome } from "../state/paths";

/** Longest prompt an add-on may send (about 50k tokens): diffs are cut before this. */
export const MAX_AI_PROMPT = 200_000;

/** Checks that an add-on may ask Claude: it exists, is on and declared the `ai` permission. */
export function checkAiAccess(
  addon: { enabled: boolean; manifest?: { permissions: string[] } } | undefined,
  id: string,
): void {
  if (!addon) throw new JigError("not_found", `Add-on ${id} not found`);
  if (!addon.enabled) throw new JigError("invalid_args", `${id} is turned off`);
  if (!addon.manifest?.permissions.includes("ai"))
    throw new JigError("invalid_args", `${id} needs the "ai" permission to ask Claude`);
}

/**
 * `ctx.ai.ask` for add-ons: a one-shot question to Claude through the user's Claude Code (no tools, one
 * turn: it can only answer, never change anything). Counts against the user's plan like a chat.
 */
export function registerAiHandlers(): void {
  handle("ai.ask", async ({ addonId, prompt, cwd, quick }) => {
    const addon = addonService()
      .list()
      .find((a) => a.id === addonId);
    checkAiAccess(addon, addonId);
    if (!prompt.trim()) throw new JigError("invalid_args", "Empty prompt");
    if (prompt.length > MAX_AI_PROMPT) throw new JigError("invalid_args", "The prompt is too long");
    const { engine } = getConfig();
    const answer = await getEngine().oneShot(prompt, {
      cwd: cwd || jigHome(),
      model: quick ? engine.quickModel : engine.helperModel,
      appendSystemPrompt: `You are answering a request from "${addon!.name}", a tool inside Jig (a desktop workbench around Claude Code). Answer with exactly what was asked, without preamble.`,
      env: sessionEnv(process.env, engine.allowApiKey),
      claudePath: engine.claudePath,
    });
    return answer.trim();
  });
}
