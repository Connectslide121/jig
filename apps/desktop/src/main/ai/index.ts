import { JigError } from "../../shared/ipc";
import { addonService } from "../addons";
import { handle } from "../ipc/router";
import { featureOneShot } from "../providers";
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
    throw new JigError("invalid_args", `${id} needs the "ai" permission to ask Jig`);
}

/**
 * `ctx.ai.ask` for add-ons: a one-shot question to Claude through the user's Claude Code (no tools, one
 * turn: it can only answer, never change anything). Counts against the user's plan like a chat.
 */
export function registerAiHandlers(): void {
  handle("ai.ask", async ({ addonId, prompt, cwd, quick, feature }) => {
    const addon = addonService()
      .list()
      .find((a) => a.id === addonId);
    checkAiAccess(addon, addonId);
    if (!prompt.trim()) throw new JigError("invalid_args", "Empty prompt");
    if (prompt.length > MAX_AI_PROMPT) throw new JigError("invalid_args", "The prompt is too long");
    // The add-on's own row in Settings → AI features (built-in add-ons), else the add-ons' rows (D-297).
    const answer = await featureOneShot(feature ?? (quick ? "addonQuick" : "addonHelper"), prompt, {
      cwd: cwd || jigHome(),
      // A run report reads a whole run's reports and can take a while on a large model.
      ...(feature === "taskRunReport" ? { timeoutMs: 10 * 60_000 } : {}),
      system: `You are answering a request from "${addon!.name}", a tool inside Jig (a desktop workbench). Answer with exactly what was asked, without preamble.`,
    });
    return { text: answer.text.trim(), provider: answer.provider, model: answer.model };
  });
}
