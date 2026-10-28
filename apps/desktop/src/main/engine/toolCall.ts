/**
 * Guarded tool calls: Jig asks a hidden Claude Code session to call one of Claude Code's own tools
 * (routines, artifacts) with an exact input, and allows the call only when it matches. Claude Code does
 * the work with its own sign-in, so Jig never handles credentials (D-092).
 */

export interface ToolCallRequest {
  /** Claude Code's tool name, e.g. `RemoteTrigger` or `Artifact`. */
  tool: string;
  /** The exact input to call it with. */
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  /** The tool ran and didn't report an error. */
  ok: boolean;
  /** The tool's text result (what Claude would read). */
  text: string;
  /** The tool's structured result (`tool_use_result`), when Claude Code gives one. */
  structured?: unknown;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * The call Claude makes must be the call Jig asked for: same tool, same input (keys left undefined
 * don't count). Anything else is refused.
 */
export function isRequestedCall(request: ToolCallRequest, tool: string, input: unknown): boolean {
  return tool === request.tool && same(request.input, input);
}

/** What the hidden session is told to do. */
export function toolCallPrompt(request: ToolCallRequest): string {
  return [
    `Call the ${request.tool} tool exactly once, with exactly this input and nothing added or changed:`,
    JSON.stringify(request.input),
    "Then reply with the single word: done.",
  ].join("\n");
}
