import { describe, expect, it } from "vitest";
import { buildEml } from "./eml";
import { appleScript, outlookArgs, parseMacMailHandler, parseRegDefault } from "./mail";

describe("opening an email with an attachment", () => {
  it("writes an unsent .eml with the text and the attachment", () => {
    const eml = buildEml({
      to: "support@sprinta.se",
      subject: "Jig development request: Åtgärd",
      body: "Hi\nthere",
      attachment: { name: "r.zip", bytes: new Uint8Array([1, 2, 3]) },
      boundary: "B",
    });
    expect(eml).toContain("To: support@sprinta.se\r\n");
    expect(eml).toContain("X-Unsent: 1\r\n");
    expect(eml).toContain("Subject: =?UTF-8?B?");
    expect(eml).toContain('Content-Disposition: attachment; filename="r.zip"');
    expect(eml).toContain(Buffer.from("Hi\r\nthere").toString("base64"));
    expect(eml).toContain("AQID");
    expect(eml.trimEnd().endsWith("--B--")).toBe(true);
  });

  it("finds Outlook on Windows and the mail app on macOS", () => {
    expect(
      parseRegDefault(
        "\r\nHKEY_LOCAL_MACHINE\\...\\OUTLOOK.EXE\r\n    (Default)    REG_SZ    C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE\r\n",
      ),
    ).toBe("C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE");
    expect(parseRegDefault("ERROR: not found")).toBeUndefined();
    const handlers = `(
    {
        LSHandlerContentType = "public.html";
        LSHandlerRoleAll = "com.google.chrome";
    },
    {
        LSHandlerRoleAll = "com.microsoft.outlook";
        LSHandlerURLScheme = mailto;
    }
)`;
    expect(parseMacMailHandler(handlers)).toBe("com.microsoft.outlook");
    expect(parseMacMailHandler("()")).toBeUndefined();
  });

  it("passes the message to Outlook and AppleScript safely", () => {
    const mail = { to: "support@sprinta.se", subject: 'A "quoted" & odd', body: "Line 1\nLine 2" };
    expect(outlookArgs(mail, "C:\\r.zip")).toEqual([
      "/c",
      "ipm.note",
      "/m",
      "support@sprinta.se&subject=A%20%22quoted%22%20%26%20odd&body=Line%201%0ALine%202",
      "/a",
      "C:\\r.zip",
    ]);
    const script = appleScript("mail", mail, '/tmp/a "b".zip');
    expect(script).toContain('subject:"A \\"quoted\\" & odd"');
    expect(script).toContain('POSIX file "/tmp/a \\"b\\".zip"');
    expect(appleScript("outlook", mail, "/tmp/r.zip")).toContain('tell application "Microsoft Outlook"');
  });
});
