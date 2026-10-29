import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { shell } from "electron";
import { type MailMethod, mailtoUrl } from "../../shared/devRequest";
import { logger } from "../log";
import { buildEml } from "./eml";

const log = logger("mail");

export interface Mail {
  to: string;
  subject: string;
  body: string;
}

const run = (file: string, args: string[], timeout = 10_000) =>
  new Promise<string>((resolve, reject) =>
    execFile(file, args, { timeout, windowsHide: true }, (error, stdout) =>
      error ? reject(error) : resolve(String(stdout)),
    ),
  );

/** Classic Outlook's path on Windows, from its App Paths entry (`reg query … /ve`). */
export function parseRegDefault(output: string): string | undefined {
  const m = /\(Default\)\s+REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(output);
  return m?.[1]?.trim().replace(/^"|"$/g, "") || undefined;
}

/** The macOS app that handles mailto: links (from LaunchServices' handlers), e.g. `com.microsoft.outlook`. */
export function parseMacMailHandler(defaultsOutput: string): string | undefined {
  for (const block of defaultsOutput.split("}")) {
    if (!/LSHandlerURLScheme\s*=\s*mailto;/.test(block)) continue;
    return /LSHandlerRoleAll\s*=\s*"?([\w.-]+)"?;/.exec(block)?.[1]?.toLowerCase();
  }
  return undefined;
}

/** `outlook.exe /m` takes the address and the rest like a mailto query, joined with `&`. */
export function outlookArgs(mail: Mail, attachment: string): string[] {
  const q = (s: string) => encodeURIComponent(s);
  return [
    "/c",
    "ipm.note",
    "/m",
    `${mail.to}&subject=${q(mail.subject)}&body=${q(mail.body)}`,
    "/a",
    attachment,
  ];
}

const appleString = (s: string) => `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

/** AppleScript that opens a new message with the attachment in Outlook or Mail (macOS). */
export function appleScript(app: "outlook" | "mail", mail: Mail, attachment: string): string {
  if (app === "outlook")
    return [
      'tell application "Microsoft Outlook"',
      `set m to make new outgoing message with properties {subject:${appleString(mail.subject)}, plain text content:${appleString(mail.body)}}`,
      `make new recipient at m with properties {email address:{address:${appleString(mail.to)}}}`,
      `make new attachment at m with properties {file:POSIX file ${appleString(attachment)}}`,
      "open m",
      "activate",
      "end tell",
    ].join("\n");
  return [
    'tell application "Mail"',
    `set m to make new outgoing message with properties {subject:${appleString(mail.subject)}, content:${appleString(mail.body)}, visible:true}`,
    `tell m to make new to recipient at end of to recipients with properties {address:${appleString(mail.to)}}`,
    `tell content of m to make new attachment with properties {file name:POSIX file ${appleString(attachment)}} at after last paragraph`,
    "activate",
    "end tell",
  ].join("\n");
}

async function windowsOutlook(mail: Mail, attachment: string): Promise<boolean> {
  const key = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\OUTLOOK.EXE";
  const path = parseRegDefault(await run("reg", ["query", key, "/ve"]).catch(() => ""));
  if (!path || !existsSync(path)) return false;
  const child = spawn(path, outlookArgs(mail, attachment), { detached: true, stdio: "ignore" });
  child.on("error", (e) => log.warn("Outlook didn't start", e));
  child.unref();
  return true;
}

async function macMail(mail: Mail, attachment: string): Promise<MailMethod | undefined> {
  const handlers = await run("defaults", [
    "read",
    "com.apple.LaunchServices/com.apple.launchservices.secure",
    "LSHandlers",
  ]).catch(() => "");
  const handler = parseMacMailHandler(handlers);
  const app = handler?.includes("outlook")
    ? "outlook"
    : !handler || handler === "com.apple.mail"
      ? "mail"
      : undefined;
  if (!app) return undefined;
  try {
    await run("osascript", ["-e", appleScript(app, mail, attachment)], 30_000);
    return app === "outlook" ? "outlook" : "apple-mail";
  } catch (error) {
    log.warn(`Couldn't open a message in ${app}`, error);
    return undefined;
  }
}

/**
 * Opens a new email with the attachment in the user's mail app (D-119), trying in order:
 * - Windows: classic Outlook's command line (`/m … /a file`);
 * - macOS: the default mail app (Outlook or Mail) through AppleScript;
 * - Linux: `xdg-email --attach` (Thunderbird and others);
 * - anywhere: an unsent `.eml` with the attachment, opened by the default app for .eml (Outlook
 *   opens it as a new message);
 * - last: a `mailto:` link without the attachment, and the zip shown in its folder.
 * `JIG_MAIL_OUT` (tests): the `.eml` is written to that folder and nothing opens.
 */
export async function openMail(mail: Mail, attachment: string, draftsDir: string): Promise<MailMethod> {
  const eml = async (dir: string) => {
    const file = join(dir, `${basename(attachment).replace(/\.zip$/, "")}.eml`);
    await writeFile(
      file,
      buildEml({ ...mail, attachment: { name: basename(attachment), bytes: await readFile(attachment) } }),
    );
    return file;
  };
  if (process.env.JIG_MAIL_OUT) {
    await eml(process.env.JIG_MAIL_OUT);
    return "test";
  }
  if (process.platform === "win32" && (await windowsOutlook(mail, attachment).catch(() => false)))
    return "outlook";
  if (process.platform === "darwin") {
    const method = await macMail(mail, attachment);
    if (method) return method;
  }
  if (process.platform === "linux") {
    const ok = await run("xdg-email", [
      "--subject",
      mail.subject,
      "--body",
      mail.body,
      "--attach",
      attachment,
      mail.to,
    ])
      .then(() => true)
      .catch(() => false);
    if (ok) return "xdg-email";
  }
  try {
    const file = await eml(draftsDir);
    if ((await shell.openPath(file)) === "") return "eml";
  } catch (error) {
    log.warn("Couldn't open the email draft", error);
  }
  await shell.openExternal(mailtoUrl(mail));
  shell.showItemInFolder(attachment);
  return "mailto";
}
