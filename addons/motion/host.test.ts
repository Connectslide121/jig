import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addMedia,
  cancel,
  create,
  discardMedia,
  get,
  install,
  list,
  preview,
  type Renderer,
  record,
  remove,
  render,
  setMusic,
  setRenderer,
  speak,
  status,
  templates,
  update,
} from "./host";

let root: string;
let api: AddonHostApi;
let events: Array<{ topic: string; payload: unknown }>;
const P = "proj-1";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jig-motion-"));
  events = [];
  vi.stubEnv("JIG_ENGINE", "fake");
  api = {
    addon: { id: "motion", dir: join(__dirname), dataDir: join(root, "data") },
    emit: (topic: string, payload: unknown) => events.push({ topic, payload }),
    notify: () => undefined,
    log: () => undefined,
    config: async () => ({}),
  } as unknown as AddonHostApi;
});

afterEach(async () => {
  setRenderer(undefined);
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out");
};

/** A renderer the test finishes or fails by hand. */
function manual() {
  const jobs: Array<{ finish: () => Promise<void>; fail: (e: Error) => void; killed: boolean }> = [];
  const r: Renderer = (job) => {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const done = new Promise<void>((a, b) => {
      resolve = a;
      reject = b;
    });
    const entry = {
      killed: false,
      finish: async () => {
        await writeFile(job.out, "mp4");
        await writeFile(job.poster, "png");
        job.onProgress(1);
        resolve();
      },
      fail: (e: Error) => reject(e),
    };
    jobs.push(entry);
    return {
      done,
      kill: () => {
        entry.killed = true;
        reject(new Error("Cancelled"));
      },
    };
  };
  return { r, jobs };
}

describe("videos", () => {
  it("creates one from a template's sample and lists it as a draft", async () => {
    const video = await create({ projectId: P, template: "whats-new", title: "Shop 2.4" }, api);
    expect(video).toMatchObject({ title: "Shop 2.4", kind: "whats-new", status: "draft", projectId: P });
    expect(video.storyboard.scenes.length).toBeGreaterThan(2);
    expect((await list({ projectId: P }, api)).map((v) => v.id)).toEqual([video.id]);
    expect(await list({ projectId: "other" }, api)).toEqual([]);
  });
  it("updates the storyboard and settings, refusing a broken storyboard", async () => {
    const video = await create({ projectId: P, template: "teaser" }, api);
    const scenes = video.storyboard.scenes.slice(0, 2);
    const next = await update(
      {
        projectId: P,
        id: video.id,
        storyboard: { ...video.storyboard, title: "New", scenes },
        settings: { aspect: "9:16" },
      },
      api,
    );
    expect([next.title, next.storyboard.scenes.length, next.settings.aspect]).toEqual(["New", 2, "9:16"]);
    await expect(
      update({ projectId: P, id: video.id, storyboard: { ...video.storyboard, scenes: [] } }, api),
    ).rejects.toThrow("at least one scene");
  });
  it("refuses ids and project ids that could leave its folder", async () => {
    await expect(get({ projectId: P, id: "../x" }, api)).rejects.toThrow("isn't a video id");
    await expect(list({ projectId: "../.." }, api)).rejects.toThrow("Open a project first");
  });
  it("writes the preview page beside the media, with the runtime", async () => {
    const video = await create({ projectId: P, template: "teaser" }, api);
    const path = await preview({ projectId: P, id: video.id }, api);
    expect(path).toBe(join(video.dir, "preview.html"));
    const html = await readFile(path, "utf8");
    expect(html).toContain('motion:"time"');
    // The font travels inside the page: a sandboxed frame can't load a font file.
    expect(html).toContain('src:url("data:font/woff2;base64,');
  });
  it("copies picked media into media/ with a unique name", async () => {
    const video = await create({ projectId: P, template: "teaser" }, api);
    const src = join(root, "Screen Shot 1.PNG");
    await writeFile(src, "png");
    expect(await addMedia({ projectId: P, id: video.id, path: src }, api)).toBe("media/screen-shot-1.png");
    expect(await addMedia({ projectId: P, id: video.id, path: src }, api)).toBe("media/screen-shot-1-2.png");
    await expect(addMedia({ projectId: P, id: video.id, path: join(root, "x.exe") }, api)).rejects.toThrow();
  });
  it("reads only valid templates", async () => {
    expect((await templates(undefined, api)).map((t) => t.id)).toEqual([
      "teaser",
      "walkthrough",
      "whats-new",
    ]);
  });
});

describe("installs", () => {
  it("asks to install the renderer first, then renders after the install", async () => {
    const video = await create({ projectId: P, template: "teaser" }, api);
    const r = await render({ projectId: P, id: video.id }, api);
    expect("needs" in r && r.needs.missing).toEqual(["renderer"]);
    expect((await status(undefined, api)).renderer).toBe(false);
    expect((await install(undefined, api)).missing).toEqual([]);
    expect(await render({ projectId: P, id: video.id }, api)).toEqual({ queued: true });
    await until(async () => (await get({ projectId: P, id: video.id }, api)).status === "rendered");
    const done = await get({ projectId: P, id: video.id }, api);
    expect(done.renders).toMatchObject([{ n: 1, width: 1920, height: 1080 }]);
    expect(done.poster).toBe(join(done.dir, "renders", "1", "poster.png"));
    expect(events.some((e) => e.topic === "progress")).toBe(true);
  });
});

describe("render queue", () => {
  it("renders one at a time, in order, keeping each render as a version", async () => {
    const { r, jobs } = manual();
    setRenderer(r);
    const a = await create({ projectId: P, template: "teaser" }, api);
    const b = await create({ projectId: P, template: "teaser" }, api);
    await render({ projectId: P, id: a.id }, api);
    await render({ projectId: P, id: b.id }, api);
    await until(async () => jobs.length === 1);
    expect((await get({ projectId: P, id: a.id }, api)).status).toBe("rendering");
    expect((await get({ projectId: P, id: b.id }, api)).status).toBe("queued");
    await expect(update({ projectId: P, id: a.id, settings: { fps: 60 } }, api)).rejects.toThrow(
      "Wait for the render",
    );
    await jobs[0]!.finish();
    await until(async () => jobs.length === 2);
    await jobs[1]!.finish();
    await until(async () => (await get({ projectId: P, id: b.id }, api)).status === "rendered");
    await render({ projectId: P, id: a.id }, api);
    await until(async () => jobs.length === 3);
    await jobs[2]!.finish();
    await until(async () => (await get({ projectId: P, id: a.id }, api)).renders.length === 2);
  });
  it("cancels a running render without an error, and a queued one before it starts", async () => {
    const { r, jobs } = manual();
    setRenderer(r);
    const a = await create({ projectId: P, template: "teaser" }, api);
    const b = await create({ projectId: P, template: "teaser" }, api);
    await render({ projectId: P, id: a.id }, api);
    await render({ projectId: P, id: b.id }, api);
    await until(async () => jobs.length === 1);
    await cancel({ projectId: P, id: b.id }, api);
    expect((await get({ projectId: P, id: b.id }, api)).status).toBe("draft");
    await cancel({ projectId: P, id: a.id }, api);
    await until(async () => (await get({ projectId: P, id: a.id }, api)).status === "draft");
    expect(jobs[0]!.killed).toBe(true);
    expect(jobs.length).toBe(1);
  });
  it("marks a failed render with what the renderer said", async () => {
    const { r, jobs } = manual();
    setRenderer(r);
    const a = await create({ projectId: P, template: "teaser" }, api);
    await render({ projectId: P, id: a.id }, api);
    await until(async () => jobs.length === 1);
    jobs[0]!.fail(new Error("Chrome crashed"));
    await until(async () => (await get({ projectId: P, id: a.id }, api)).status === "failed");
    expect((await get({ projectId: P, id: a.id }, api)).error).toBe("Chrome crashed");
  });
  it("reports a render Jig was closed during as interrupted", async () => {
    const a = await create({ projectId: P, template: "teaser" }, api);
    const file = join(a.dir, "meta.json");
    const meta = JSON.parse(await readFile(file, "utf8"));
    await writeFile(
      file,
      JSON.stringify({ ...meta, job: { state: "rendering", at: meta.createdAt, progress: 0.4 } }),
    );
    const after = await get({ projectId: P, id: a.id }, api);
    expect(after.status).toBe("failed");
    expect(after.error).toContain("interrupted");
  });
  it("deletes a video with its renders", async () => {
    const a = await create({ projectId: P, template: "teaser" }, api);
    await remove({ projectId: P, id: a.id }, api);
    expect(await list({ projectId: P }, api)).toEqual([]);
  });
});

describe("voice, music and captures (M2)", () => {
  const withVoice = async () => {
    const video = await create({ projectId: P, template: "teaser" }, api);
    const scenes = video.storyboard.scenes.map((s, i) =>
      i === 0 ? { ...s, voice: "Swap shifts in one tap." } : s,
    );
    return update(
      {
        projectId: P,
        id: video.id,
        storyboard: { ...video.storyboard, scenes },
        settings: { voice: "af_heart" },
      },
      api,
    );
  };

  it("speaks each script once, keeps the measured length, and speaks again after an edit", async () => {
    const wav = join(root, "say.wav");
    await writeFile(wav, "RIFF");
    const say = vi.fn(async () => ({ path: wav, seconds: 1.234 }));
    (api as unknown as { speech: unknown }).speech = { say };
    const video = await withVoice();
    const spoken = await speak({ projectId: P, id: video.id }, api);
    const first = spoken.storyboard.scenes[0]!;
    expect(first).toMatchObject({ voiceSeconds: 1.23, voiceFile: expect.stringMatching(/^media\/voice-/) });
    expect(await readFile(join(spoken.dir, first.voiceFile!), "utf8")).toBe("RIFF");
    await speak({ projectId: P, id: video.id }, api);
    expect(say).toHaveBeenCalledTimes(1);
    const scenes = spoken.storyboard.scenes.map((s, i) =>
      i === 0 ? { ...s, voice: "Now in two taps." } : s,
    );
    const edited = await update(
      { projectId: P, id: video.id, storyboard: { ...spoken.storyboard, scenes } },
      api,
    );
    expect(edited.storyboard.scenes[0]!.voiceFile).toBeUndefined();
    await speak({ projectId: P, id: video.id }, api);
    expect(say).toHaveBeenCalledTimes(2);
  });

  it("copies a music track into the video and clears it again", async () => {
    const video = await create({ projectId: P, template: "teaser" }, api);
    const track = join(root, "Calm Morning.mp3");
    await writeFile(track, "ID3");
    const withMusic = await setMusic(
      { projectId: P, id: video.id, path: track, source: "https://example.com/t" },
      api,
    );
    expect(withMusic.settings.music).toMatchObject({
      track: "media/music-calm-morning.mp3",
      source: "https://example.com/t",
    });
    await expect(setMusic({ projectId: P, id: video.id, path: join(root, "x.exe") }, api)).rejects.toThrow(
      /MP3/,
    );
    expect((await setMusic({ projectId: P, id: video.id, path: "" }, api)).settings.music.track).toBe("");
  });

  it("records a take, flags real-looking data, and discards a take nobody kept", async () => {
    const frames = join(root, "frames");
    await import("node:fs/promises").then((fs) => fs.mkdir(frames));
    (api as unknown as { capture: unknown }).capture = {
      record: async () => ({
        dir: frames,
        frames: 3,
        fps: 30,
        width: 1280,
        height: 720,
        seconds: 4.04,
        cut: false,
        texts: ["Write to jane.doe@gmail.com", "sam@contoso.com", "Signed by Ada Lindqvist"],
        events: [{ step: 0, do: "click", at: 1, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } }],
      }),
    };
    (api as unknown as { projects: unknown }).projects = async () => [{ id: P, path: root }];
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(join(root, ".jig", "factory", "kit"), { recursive: true }),
    );
    await writeFile(join(root, ".jig", "factory", "kit", "real-names.txt"), "Ada Lindqvist\n");
    const video = await create({ projectId: P, template: "walkthrough" }, api);
    const take = await record({ projectId: P, id: video.id, url: "https://example.com", steps: [] }, api);
    if ("needs" in take) throw new Error("needs");
    expect(take).toMatchObject({ path: "media/capture-1.mp4", seconds: 4, events: [{ do: "click" }] });
    expect(take.findings).toEqual([
      { kind: "email", text: "jane.doe@gmail.com" },
      { kind: "name", text: "Ada Lindqvist" },
    ]);
    await expect(readFile(join(frames, "x"))).rejects.toThrow();
    await discardMedia({ projectId: P, id: video.id, path: take.path }, api);
    await expect(readFile(join(video.dir, take.path))).rejects.toThrow();
    await expect(discardMedia({ projectId: P, id: video.id, path: "../meta.json" }, api)).rejects.toThrow();
  });
});
