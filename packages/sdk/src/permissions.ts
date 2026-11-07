/**
 * Permissions an add-on declares in its manifest. They are shown to you before an add-on is accepted
 * and checked by the host API. Host code is trusted code you accepted (D-007): permissions make
 * intent visible and keep honest code honest; they are not a sandbox.
 */
export const PERMISSIONS = {
  exec: "Run any program (git, az, …).",
  "exec:<command>": "Run only this program, e.g. exec:git or exec:az.",
  "fs:read": "Read files on your computer.",
  "fs:write": "Create and change files on your computer.",
  net: "Make network requests.",
  terminal: "Open terminals and run commands in them.",
  chat: "Start chats, send them messages and read their answers.",
  "chat:read":
    "Read your chats' list and timelines: when each turn and tool call ran, and what it ran (D-423).",
  ai: "Ask Jig's AI questions (uses your plan; answers only, no tools).",
  "meetings:read": "Read your meeting history: titles, notes and the end of each transcript (D-460).",
  speech: "Speak text with the natural voice on this computer, into audio files (D-464).",
  capture: "Record web pages in a hidden window, step by step, into video frames (D-464).",
  phone: "Send cards with buttons to your phone (Telegram or Teams), and hear your taps (D-468).",
} as const;

const PATTERN =
  /^(exec|exec:[\w.+-]+|fs:read|fs:write|net|terminal|chat|chat:read|ai|meetings:read|speech|capture|phone)$/;

export function isPermission(value: string): boolean {
  return PATTERN.test(value);
}

/** Whether `granted` allows running `command` (a program name or path). */
export function allowsExec(granted: readonly string[], command: string): boolean {
  if (granted.includes("exec")) return true;
  const name = command
    .replaceAll("\\", "/")
    .split("/")
    .pop()!
    .toLowerCase()
    .replace(/\.(exe|cmd|bat)$/, "");
  return granted.some((p) => p.startsWith("exec:") && p.slice(5).toLowerCase() === name);
}

export function describePermission(permission: string): string {
  if (permission.startsWith("exec:")) return `Run ${permission.slice(5)}.`;
  return PERMISSIONS[permission as keyof typeof PERMISSIONS] ?? permission;
}
