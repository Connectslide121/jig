import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ protocol: {}, session: {} }));

import { closeMeetingPage, isMeetingPage, meetingPage, meetingPageOrigin } from "./page";

it("serves bundled meeting UI on loopback with CSP and trusts only its owner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jig-meeting-page-"));
  try {
    await writeFile(join(directory, "index.html"), "<html>Meeting</html>");
    const page = await meetingPage(42, directory);
    const origin = meetingPageOrigin()!;
    expect(new URL(page).hostname).toBe("localhost");
    const response = await fetch(page);
    expect(await response.text()).toBe("<html>Meeting</html>");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(isMeetingPage(42, page)).toBe(true);
    expect(isMeetingPage(43, page)).toBe(false);
    expect(isMeetingPage(42, `${origin}/index.html`)).toBe(false);
    expect(isMeetingPage(42, `${origin}/other.html?meetingRoom=1`)).toBe(false);
    expect(isMeetingPage(42, "broken")).toBe(false);
    expect((await fetch(`${origin}/%2e%2e%5cprivate.txt`)).status).toBe(403);
    expect((await fetch(page, { method: "POST" })).status).toBe(403);
    const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
      get(page, { headers: { Host: "other.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", reject);
    });
    expect(wrongHost).toBe(403);
    expect((await fetch(`${origin}/missing.js`)).status).toBe(404);
    closeMeetingPage();
    expect(meetingPageOrigin()).toBeUndefined();
    expect(isMeetingPage(42, page)).toBe(false);
  } finally {
    closeMeetingPage();
    await rm(directory, { recursive: true, force: true });
  }
});
