import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./state/paths";

type Level = "debug" | "info" | "warn" | "error";

let file: string | undefined;

function target(): string {
  if (!file) {
    mkdirSync(paths.logs(), { recursive: true });
    file = join(paths.logs(), "main.log");
  }
  return file;
}

function write(level: Level, scope: string, message: string, detail?: unknown) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${
    detail === undefined
      ? ""
      : ` ${detail instanceof Error ? (detail.stack ?? detail.message) : JSON.stringify(detail)}`
  }`;
  if (level !== "debug" || process.env.JIG_DEV) console[level === "debug" ? "log" : level](line);
  try {
    appendFileSync(target(), `${line}\n`);
  } catch {
    // Logging must never crash the host.
  }
}

/** Scoped logger. Never log secrets, prompts' file contents or add-on source code. */
export function logger(scope: string) {
  return {
    debug: (message: string, detail?: unknown) => write("debug", scope, message, detail),
    info: (message: string, detail?: unknown) => write("info", scope, message, detail),
    warn: (message: string, detail?: unknown) => write("warn", scope, message, detail),
    error: (message: string, detail?: unknown) => write("error", scope, message, detail),
  };
}
