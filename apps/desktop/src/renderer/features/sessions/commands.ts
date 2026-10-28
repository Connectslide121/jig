import type { SlashCommandInfo } from "../../../shared/engine";
import { call } from "../../lib/host";

const cache = new Map<string, Promise<SlashCommandInfo[]>>();

/**
 * Claude Code's commands and skills for a chat. Asking starts Claude Code for the chat if it isn't
 * running, so this is only called when you open the `/` menu.
 */
export function chatCommands(sessionId: string): Promise<SlashCommandInfo[]> {
  let pending = cache.get(sessionId);
  if (!pending) {
    pending = call("sessions.commands", { id: sessionId }).catch((error) => {
      cache.delete(sessionId);
      throw error;
    });
    cache.set(sessionId, pending);
  }
  return pending;
}

/** Commands that only make sense in Claude Code's terminal UI; Jig has its own menus for them. */
export const TERMINAL_ONLY = new Set([
  "exit",
  "quit",
  "login",
  "logout",
  "config",
  "theme",
  "vim",
  "terminal-setup",
  "ide",
  "resume",
  "doctor",
  "statusline",
  "keybindings",
  "upgrade",
  "install-github-app",
  "clear",
  "rewind",
  "model",
  "permissions",
  "add-dir",
  "export",
]);
