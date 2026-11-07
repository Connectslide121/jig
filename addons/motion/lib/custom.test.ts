import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cues } from "./captions";
import type { MotionStyle } from "./compose";
import {
  type Composition,
  checkComposition,
  composeCustom,
  compositionRefs,
  compositionTiming,
  refProblem,
  renameRefs,
  unlinkedScenes,
  videoTimeline,
} from "./custom";
import { DEFAULT_SETTINGS, type Storyboard, timeline } from "./storyboard";

const style = JSON.parse(
  readFileSync(join(__dirname, "..", "styles", "neutral.json"), "utf8"),
) as MotionStyle;

const board: Storyboard = {
  version: 1,
  kind: "teaser",
  title: "Shop 2.0",
  language: "en",
  scenes: [
    { id: "s1", type: "title", title: "Shop 2.0", voice: "Meet Shop two." },
    { id: "s2", type: "statement", title: "Fast", voice: "Checkout in one step." },
    { id: "s3", type: "outro", title: "Out now" },
  ],
};

const good: Composition = {
  css: "@keyframes up{from{opacity:0;transform:translateY(40px)}to{opacity:1}} .big{font:800 160px var(--font-headline);color:var(--accent);animation:up .6s var(--ease) .2s both}",
  html: [
    '<section class="clip" data-start="0" data-duration="3" data-track-index="0" data-scene="s1"><h1 class="big">Shop 2.0</h1></section>',
    '<section class="clip" data-start="2.5" data-duration="4" data-track-index="1" data-scene="s2"><img src="shots/home.png" alt=""></section>',
    '<div class="clip" data-start="6" data-duration="1.5" data-track-index="0" style="background:url(\'media/bg.png\')"></div>',
  ].join(""),
};

describe("checkComposition", () => {
  it("keeps a composition that follows the contract", () => {
    expect(checkComposition(good, DEFAULT_SETTINGS)).toEqual([]);
  });

  it.each([
    [
      '<script>alert(1)</script><div class="clip" data-start="0" data-duration="1" data-track-index="0"></div>',
      "<script>",
    ],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0" onclick="x()"></div>',
      "event handlers",
    ],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0"><iframe src="a.html"></iframe></div>',
      "<iframe>",
    ],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0"><img src="https://x.test/a.png"></div>',
      "network",
    ],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0"><img src="//x.test/a.png"></div>',
      "network",
    ],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0"><img src="../secret.png"></div>',
      "inside the video",
    ],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0"><a href="java&#115;cript:x">a</a></div>',
      "network",
    ],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0" style="background:url(http://x.test)"></div>',
      "network",
    ],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0"><audio src="media/a.mp3"></audio></div>',
      "<audio>",
    ],
    [
      '<div id="root" class="clip" data-start="0" data-duration="1" data-track-index="0"></div>',
      "Motion's frame",
    ],
    ['<div data-start="0" data-duration="1" data-track-index="0"></div>', 'class="clip"'],
    ['<div class="clip" data-start="0" data-track-index="0"></div>', "data-duration"],
    ['<div class="clip" data-start="0" data-duration="1"></div>', "data-track-index"],
    ["<div>no clips</div>", "No clips"],
    [
      '<div class="clip" data-start="0" data-duration="1" data-track-index="0"><video src="media/a.mp4" data-start="0" data-duration="1"></video></div>',
      "muted",
    ],
  ])("rejects %s", (html, problem) => {
    expect(checkComposition({ css: "", html }, DEFAULT_SETTINGS).join(" | ")).toContain(problem);
  });

  it.each([
    ["@import 'x.css';", "@import"],
    ["</style><script>", "</"],
    [".a{background:url(https://x.test/a.png)}", "network"],
    [".a{width:expression(alert(1))}", "expression"],
  ])("rejects the css %s", (css, problem) => {
    expect(checkComposition({ css, html: good.html }, DEFAULT_SETTINGS).join(" | ")).toContain(problem);
  });

  it("caps the length and the size", () => {
    const long = '<div class="clip" data-start="0" data-duration="700" data-track-index="0"></div>';
    expect(checkComposition({ css: "", html: long }, DEFAULT_SETTINGS).join()).toContain("at most 600 s");
    const big = { css: "x".repeat(400_001), html: good.html };
    expect(checkComposition(big, DEFAULT_SETTINGS).join()).toContain("at most 400000");
  });
});

describe("refProblem", () => {
  it("allows data images, anchors and paths in the video", () => {
    expect(refProblem("data:image/png;base64,AAAA")).toBeUndefined();
    expect(refProblem("#grad")).toBeUndefined();
    expect(refProblem("media/a.png")).toBeUndefined();
    expect(refProblem("data:text/html,<script>")).toBeDefined();
    expect(refProblem("file:///etc/passwd")).toBeDefined();
    expect(refProblem("/abs.png")).toBeDefined();
  });
});

describe("timing", () => {
  it("reads the clips, the linked scenes and the length", () => {
    const t = compositionTiming(good);
    expect(t).toEqual({
      total: 7.5,
      clips: 3,
      scenes: { s1: { start: 0, duration: 3 }, s2: { start: 2.5, duration: 4 } },
    });
    expect(compositionTiming({ ...good, seconds: 9 }).total).toBe(9);
  });

  it("places the voice and captions of linked scenes only", () => {
    const { slots, total } = videoTimeline(board, DEFAULT_SETTINGS, good);
    expect(total).toBe(7.5);
    expect(slots.map((s) => [s.scene.id, s.index, s.start, s.duration])).toEqual([
      ["s1", 0, 0, 3],
      ["s2", 1, 2.5, 4],
    ]);
    const voiced = {
      scenes: board.scenes.map((s) => (s.voice ? { ...s, voiceSeconds: 1.5 } : s)),
    };
    expect(cues(voiced, DEFAULT_SETTINGS, slots)[1]?.start).toBe(2.8);
    expect(videoTimeline(board, DEFAULT_SETTINGS)).toEqual(timeline(board, DEFAULT_SETTINGS));
  });

  it("names scenes with a voice no clip links to", () => {
    const html = good.html.replace(' data-scene="s2"', "");
    expect(unlinkedScenes(board, { ...good, html })).toEqual(["s2"]);
  });
});

describe("files", () => {
  it("lists and renames the files it loads", () => {
    expect(compositionRefs(good)).toEqual(["shots/home.png", "media/bg.png"]);
    const renamed = renameRefs(good, { "shots/home.png": "media/home.png" });
    expect(renamed.html).toContain('src="media/home.png"');
    expect(compositionRefs(renamed)).toEqual(["media/home.png", "media/bg.png"]);
    const inCss = renameRefs({ css: ".a{background:url(a.png)}", html: "" }, { "a.png": "media/a.png" });
    expect(inCss.css).toBe('.a{background:url("media/a.png")}');
  });
});

describe("composeCustom", () => {
  it("wraps the clips in the frame with the style, captions, and the preview's runtime", () => {
    const voiced: Storyboard = {
      ...board,
      scenes: board.scenes.map((s) => (s.voice ? { ...s, voiceSeconds: 1.5 } : s)),
    };
    const html = composeCustom({ board: voiced, settings: DEFAULT_SETTINGS, style, composition: good });
    expect(html).toContain('data-composition-id="main" data-no-timeline data-start="0" data-duration="7.5"');
    expect(html).toContain("--font-headline:");
    expect(html).toContain(good.css);
    expect(html).toContain(good.html);
    expect(html).toContain('class="clip cap bottom" data-start="0.3"');
    expect(html).not.toContain("<script>");
    const preview = composeCustom({
      board: voiced,
      settings: DEFAULT_SETTINGS,
      style,
      composition: good,
      preview: true,
    });
    expect(preview).toContain("<script>");
  });
});
