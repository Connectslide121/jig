import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * The Claude Code binary: the user's own (`engine.claudePath`), else the one shipped with the Agent
 * SDK for this platform. Used to open a terminal where the user signs in (`/login`) — Jig only starts
 * the official binary; the sign-in itself is Anthropic's flow.
 */
export function claudeBinary(claudePath: string): string | undefined {
  if (claudePath.trim()) return claudePath.trim();
  const require = createRequire(import.meta.url);
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const base = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  for (const pkg of [base, `${base}-musl`]) {
    try {
      const file = join(dirname(require.resolve(`${pkg}/package.json`)), exe);
      if (existsSync(file)) return file;
    } catch {
      // Not installed for this platform.
    }
  }
  return undefined;
}
