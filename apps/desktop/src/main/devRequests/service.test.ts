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
    const downloads = join(dir, "Downloads");
    const opened: string[] = [];
    const shown: string[] = [];
    const s = new DevRequestService({
      dir,
      job: (id) => (id === job.id ? job : ({ id, kind: "new-addon" } as BuildJob)),
      context: () => ({
        jigVersion: "0.1.0",
        os: "linux",
        addons: ["git"],
        createdAt: "2026-10-29T10:00:00Z",
      }),
      downloads: () => downloads,
      openEmail: async (url) => {
        opened.push(url);
      },
      showFile: (path) => shown.push(path),
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

    // Sending needs the version you tried to be confirmed; a revision needs confirming again.
    expect(await s.status(job.id)).toEqual({
      approved: false,
      emailedAt: undefined,
      to: "support@sprinta.se",
    });
    await expect(s.email(job.id)).rejects.toMatchObject({ code: "not_approved" });
    expect((await s.approve(job.id)).approved).toBe(true);
    const original = job.proposal;
    job.proposal = { ...original!, acceptance: ["It works", "It is green"] };
    expect((await s.status(job.id)).approved).toBe(false);
    job.proposal = original;
    expect((await s.status(job.id)).approved).toBe(true);

    const sent = await s.email(job.id);
    // Saved in Downloads (and shown there), and a new email that says to attach it.
    const zipName = `${top}.zip`;
    expect(sent).toMatchObject({ savedTo: join(downloads, zipName), to: "support@sprinta.se" });
    expect(await readFile(sent.savedTo)).toEqual(await readFile(info.zipPath));
    expect(shown).toEqual([sent.savedTo]);
    expect(sent.info.emailedAt).toBeTruthy();
    expect((await s.status(job.id)).emailedAt).toBe(sent.info.emailedAt);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(
      /^mailto:support@sprinta\.se\?subject=Jig%20development%20request%3A%20Title%20bar%20items&body=/,
    );
    expect(decodeURIComponent(opened[0]!)).toContain(`[Before sending: attach ${zipName}.`);
    expect(await s.prompt(job.id)).toContain("Read AGENTS.md");
    await expect(s.create("other")).rejects.toMatchObject({ code: "not_found" });
  });
});
