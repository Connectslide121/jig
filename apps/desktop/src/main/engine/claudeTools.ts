import { homedir } from "node:os";
import { getConfig } from "../config";
import { getEngine } from "./index";
import type { ToolCallRequest, ToolCallResult } from "./toolCall";
import { sessionEnv } from "./types";

/**
 * Has Claude Code call one of its own tools for Jig (routines, artifacts), with the user's Claude Code
 * settings and environment. One small model call each time (D-092).
 */
export function callClaudeTool(request: ToolCallRequest): Promise<ToolCallResult> {
  const { engine } = getConfig();
  return getEngine().callTool(request, {
    cwd: homedir(),
    env: sessionEnv(process.env, engine.allowApiKey),
    claudePath: engine.claudePath,
  });
}
