/** Base64 lines of at most 76 characters (MIME). */
const wrap76 = (s: string) => s.replace(/.{76}/g, "$&\r\n");
const encodeWord = (s: string) =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

/**
 * An unsent email (`.eml` with `X-Unsent: 1`): Outlook opens it as a new message ready to send, with
 * the attachment; other mail apps open it as a message they can forward.
 */
export function buildEml(mail: {
  to: string;
  subject: string;
  body: string;
  attachment: { name: string; bytes: Uint8Array; type?: string };
  boundary?: string;
}): string {
  const boundary = mail.boundary ?? `jig-${Math.random().toString(36).slice(2)}`;
  const text = Buffer.from(mail.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64");
  return [
    `To: ${mail.to}`,
    `Subject: ${encodeWord(mail.subject)}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(text),
    `--${boundary}`,
    `Content-Type: ${mail.attachment.type ?? "application/zip"}; name="${mail.attachment.name}"`,
    `Content-Disposition: attachment; filename="${mail.attachment.name}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(mail.attachment.bytes).toString("base64")),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
