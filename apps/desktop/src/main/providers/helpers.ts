import { z } from "zod";
import type { SessionMeta } from "../../shared/engine";
import { JigError } from "../../shared/ipc";
import { type ChatGptHelperRole, chatGptHelperChoice } from "../../shared/providers";
import {
  codexSearchPrompt,
  SEARCH_THOROUGHNESS,
  SEARCH_TOOL,
  type SearchThoroughness,
} from "../../shared/searcher";
import { BROWSER_TOOLS, codexTesterPrompt, TEST_TOOL } from "../../shared/tester";
import { getConfig } from "../config";
import { getEngine } from "../engine";
import { jigToolServer } from "../engine/jigTools";
import { newMcpToken, startLocalMcp } from "../engine/localMcp";
import type { ChatTool, ToolOutput } from "../engine/types";
import { codexSearchArgs, codexTesterArgs, HELPER_TOKEN_ENV } from "./codex";
import { codexBinary, resolveCodexModel, runCodexExec } from "./index";

/**
 * ChatGPT chats' helpers (D-337): Codex has no subagents, so the roles Claude chats hand to jig-search
 * and jig-tester are tools here, each running a separate, scoped `codex exec` on its own model
 * (Settings → Chats → ChatGPT chats). Documented in docs/reference/engine.md → Helpers.
 */

const SEARCH_TIMEOUT = 10 * 60_000;
const TEST_TIMEOUT = 20 * 60_000;
/** At most this many screenshots come back with a test report (the newest). */
const MAX_IMAGES = 6;

/** The helper's model now: its own choice, else the fallback, resolved to an exact slug (D-310). */
async function helperModel(role: ChatGptHelperRole): Promise<string> {
  return (await resolveCodexModel(chatGptHelperChoice(role, getConfig().engine))).model;
}

function binaryOrThrow(): string {
  const binary = codexBinary();
  if (!binary)
    throw new JigError("codex_missing", "The Codex CLI isn't installed. See Get started → ChatGPT (Codex).");
  return binary;
}

/** The fake engine's helpers answer at once, naming what they were given (docs/guides/testing.md). */
const isFake = () => getEngine().kind === "fake";

/** Searches the chat's folder with a read-only Codex on the search model. */
async function searchCode(
  meta: SessionMeta,
  question: string,
  thoroughness: SearchThoroughness,
  signal?: AbortSignal,
): Promise<string> {
  if (!question.trim()) throw new Error("Ask a question: what to find in the code.");
  const model = await helperModel("search");
  if (isFake()) return `Fake search (${model || "Codex's default"}, ${thoroughness}): ${question.trim()}`;
  return runCodexExec({
    binary: binaryOrThrow(),
    args: codexSearchArgs(model, meta.cwd),
    prompt: codexSearchPrompt(question, thoroughness),
    timeoutMs: SEARCH_TIMEOUT,
    cwd: meta.cwd,
    signal,
  });
}

/**
 * Tests a page with a Codex whose only tools are the chat's own browser tools: a local MCP server of
 * their own, with its own token, for this call only. Screenshots it takes come back with the report.
 */
async function testPage(
  meta: SessionMeta,
  url: string,
  steps: string,
  signal?: AbortSignal,
): Promise<ToolOutput> {
  if (!url.trim()) throw new Error("Give the page's URL (start the dev server first).");
  if (!steps.trim()) throw new Error("Say what to check, step by step.");
  const model = await helperModel("tester");
  if (isFake())
    return `Fake test (${model || "Codex's default"}) of ${url.trim()}:\n- PASS: ${steps.trim().split(/\r?\n/)[0]}`;
  const binary = binaryOrThrow();
  const images: Array<{ mime: string; data: string }> = [];
  const browser = jigToolServer(meta).tools.filter((t) => BROWSER_TOOLS.includes(t.name));
  const tools: ChatTool[] = browser.map((t) => ({
    ...t,
    handler: async (args, callSignal) => {
      const out = await t.handler(
        args,
        callSignal && signal ? AbortSignal.any([callSignal, signal]) : (callSignal ?? signal),
      );
      if (typeof out !== "string" && out.images?.length) images.push(...out.images);
      return out;
    },
  }));
  const token = newMcpToken();
  const mcp = await startLocalMcp({ jig: { tools } }, token);
  try {
    const report = await runCodexExec({
      binary,
      args: codexTesterArgs(
        model,
        meta.cwd,
        mcp.url("jig"),
        tools.map((t) => t.name),
      ),
      prompt: codexTesterPrompt(url, steps),
      timeoutMs: TEST_TIMEOUT,
      cwd: meta.cwd,
      env: { [HELPER_TOKEN_ENV]: token },
      signal,
    });
    return images.length ? { text: report, images: images.slice(-MAX_IMAGES) } : report;
  } finally {
    await mcp.close();
  }
}

/** The helper tools for one ChatGPT chat, on its `jig` server. */
export function codexHelperTools(meta: SessionMeta): ChatTool[] {
  return [
    {
      name: SEARCH_TOOL,
      description:
        "Finds things in the code on a small, cheap model: where something is defined or used, which files handle a feature, how a flow goes from A to B. A separate, read-only Codex searches this chat's folder and answers with file paths, line numbers and short excerpts; it never changes files. Use it instead of searching yourself whenever finding the answer takes more than two or three searches or reads.",
      shape: {
        question: z.string().describe("One precise question about the code"),
        thoroughness: z
          .enum(SEARCH_THOROUGHNESS)
          .optional()
          .describe("quick (first good answer), medium (default) or very thorough"),
      },
      readOnly: true,
      handler: (args, signal) =>
        searchCode(
          meta,
          String(args.question ?? ""),
          (args.thoroughness as SearchThoroughness | undefined) ?? "medium",
          signal,
        ),
    },
    {
      name: TEST_TOOL,
      description:
        "Tests web UI in Claude's browser on a small, cheap model: give it the URL (the dev server must already run) and exactly what to check, step by step. A separate Codex with only the browser tools reports PASS/FAIL per check with screenshots and never changes code. Use it for checking pages after a change, instead of clicking through them yourself.",
      shape: {
        url: z.string().describe("The page to test, on a dev server that already runs"),
        steps: z.string().describe("What to do and check, step by step"),
      },
      handler: (args, signal) => testPage(meta, String(args.url ?? ""), String(args.steps ?? ""), signal),
    },
  ];
}
