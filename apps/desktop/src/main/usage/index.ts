import { app } from "electron";
import type { ChatProvider } from "../../shared/engine";
import {
  codexUsageFrom,
  type PlanUsage,
  planUsageFrom,
  type UsageByProvider,
  usageReport,
} from "../../shared/usage";
import { getConfig } from "../config";
import { getEngine } from "../engine";
import { registerJigTools } from "../engine/jigTools";
import { sessionEnv } from "../engine/types";
import { emit, handle } from "../ipc/router";
import { onChatGptCall, readChatGptUsage } from "../providers";
import { UsageService } from "./service";

let claude: UsageService | undefined;
let chatgpt: UsageService | undefined;

/** Claude's plan usage (chats refresh it and report rate-limit warnings). */
export function usageService(): UsageService {
  if (!claude) throw new Error("Usage not started");
  return claude;
}

/** A chat provider's plan usage as last known (Codex chats run on the ChatGPT plan), for limit handoffs (D-338). */
export function planUsageOf(provider: ChatProvider): PlanUsage | undefined {
  return (provider === "codex" ? chatgpt : claude)?.current();
}

/** A Codex chat used some of the ChatGPT plan: ask Codex again (a burst of turns asks once). */
export function chatGptChatUsed(): void {
  chatgpt?.refreshIfOlder(15_000);
}

/** Asks Codex again soon (after its sign-in ended, say). */
export function refreshChatGptUsage(): void {
  void chatgpt?.refresh();
}

const both = (): UsageByProvider => ({
  claude: claude!.current(),
  chatgpt: chatgpt!.current(),
});

/**
 * Plan usage for the meter in the status bar (docs/reference/usage.md): Claude's from Claude Code,
 * ChatGPT's from the Codex CLI (D-298). One service each; the renderer always gets both.
 */
export function startUsage(): void {
  const changed = () => emit("usage.changed", both());
  claude = new UsageService({
    read: async () => {
      const { engine } = getConfig();
      return planUsageFrom(
        await getEngine().planUsage({
          env: sessionEnv(process.env, engine.allowApiKey),
          claudePath: engine.claudePath,
        }),
      );
    },
    onChange: changed,
  });
  chatgpt = new UsageService({
    source: "Codex",
    read: async () => codexUsageFrom(await readChatGptUsage(app.getVersion())),
    onChange: changed,
  });
  const c = claude;
  const g = chatgpt;
  c.start();
  g.start(4_000);
  // Each ChatGPT answer uses the plan; a burst of them asks Codex once.
  onChatGptCall(() => g.refreshIfOlder(15_000));
  handle("usage.get", () => {
    c.refreshIfOlder(2 * 60_000);
    g.refreshIfOlder(2 * 60_000);
    return both();
  });
  handle("usage.refresh", async () => {
    await Promise.all([c.refresh(), g.refresh()]);
    return both();
  });
  // The footer's numbers as a tool for every chat and the phone bot: asked again when older than a minute.
  registerJigTools([
    {
      name: "jig_usage_limits",
      description:
        "The user's plan usage limits for both providers, Claude (Claude Code's /usage) and ChatGPT (OpenAI's Codex CLI), as Jig's footer shows them: per window (the 5-hour session, the week…) how much is used, what is left and when it resets. A provider with no limit data says so.",
      shape: {},
      readOnly: true,
      handler: async () => {
        await Promise.all([c.fresh(60_000), g.fresh(60_000)]);
        return usageReport(both());
      },
    },
  ]);
}

export function stopUsage(): void {
  claude?.stop();
  chatgpt?.stop();
}
