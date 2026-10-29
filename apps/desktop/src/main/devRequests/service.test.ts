import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { BuildJob } from "../../shared/builds";
import { DevRequestService } from "./service";

const job = {
  id: "build123456",
  goal: "Show my build status in the title bar",
  kind: "app",
  proposal: {
    title: "Title bar items",
    reason: "No slot draws in the title bar.",
    proposal: "Add a `titlebar.item` slot.",
    acceptance: ["It works"],
    mockupHtml: "<!doctype html><p>mock</p>",
  },
} as unknown as BuildJob;

describe("DevRequestService", () => {
  it("packs a build's request into a zip and emails it to the developers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-devreq-"));
    const opened: Array<{ to: string; subject: string; attachment: string }> = [];
    const s = new DevRequestService({
      dir,
      job: (id) => (id === job.id ? job : ({ id, kind: "new-addon" } as BuildJob)),
      context: () => ({
        jigVersion: "0.1.0",
        os: "linux",
        addons: ["git"],
        createdAt: "2026-10-29T10:00:00Z",
      }),
      recipient: () => "support@sprinta.se",
      openMail: async (mail, attachment) => {
        opened.push({ to: mail.to, subject: mail.subject, attachment });
        return "test";
      },
    });
    const info = await s.create(job.id);
    expect(info.title).toBe("Title bar items");
    expect(info.hasMockup).toBe(true);
    const files = Object.fromEntries(
      Object.entries(unzipSync(new Uint8Array(await readFile(info.zipPath)))).map(([k, v]) => [
        k,
        strFromU8(v),
      ]),
    );
    const top = "jig-request-title-bar-items-build1";
    expect(Object.keys(files).sort()).toEqual(
      ["PROMPT.md", "README.md", "SPEC.md", "context.json", "mockup.html"].map((f) => `${top}/${f}`),
    );
    expect(files[`${top}/PROMPT.md`]).toContain("Add a `titlebar.item` slot.");
    expect(JSON.parse(files[`${top}/context.json`]!)).toMatchObject({ buildId: job.id, addons: ["git"] });

    const sent = await s.email(job.id);
    expect(sent).toMatchObject({ method: "test", to: "support@sprinta.se" });
    expect(sent.info.emailedAt).toBeTruthy();
    expect(opened).toEqual([
      {
        to: "support@sprinta.se",
        subject: "Jig development request: Title bar items",
        attachment: info.zipPath,
      },
    ]);
    expect(await s.prompt(job.id)).toContain("Read AGENTS.md");
    await expect(s.create("other")).rejects.toMatchObject({ code: "not_found" });
  });
});
