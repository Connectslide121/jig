import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compose, esc, type MotionStyle, zoomKeyframes } from "./compose";
import { DEFAULT_SETTINGS, type Storyboard, timeline, voicePath } from "./storyboard";
import { fromTemplate, type Template } from "./templates";

const dir = join(__dirname, "..");
const style = JSON.parse(readFileSync(join(dir, "styles", "neutral.json"), "utf8")) as MotionStyle;
const template = (id: string) =>
  JSON.parse(readFileSync(join(dir, "templates", id, "template.json"), "utf8")) as Template;

describe("compose", () => {
  for (const id of ["teaser", "whats-new", "walkthrough"]) {
    it(`makes the ${id} template's composition`, () => {
      const t = template(id);
      const board = fromTemplate(t, t.sample ?? {});
      const html = compose({ board, settings: DEFAULT_SETTINGS, style });
      const { slots, total } = timeline(board, DEFAULT_SETTINGS);
      expect(html).toContain(
        `data-composition-id="main" data-no-timeline data-start="0" data-duration="${total}"`,
      );
      expect(html).toContain('data-width="1920" data-height="1080" data-fps="30"');
      for (const s of slots)
        expect(html).toContain(`data-start="${s.start}" data-duration="${s.duration}" data-track-index="0"`);
      // No network, no scripts in the rendered page.
      expect(html).not.toMatch(/https?:\/\//);
      expect(html).not.toContain("<script");
      expect(html).toMatchSnapshot();
    });
  }
  it("times animations from their scene's start, as HyperFrames seeks them", () => {
    const t = template("teaser");
    const html = compose({ board: fromTemplate(t, t.sample ?? {}), settings: DEFAULT_SETTINGS, style });
    const delays = [
      ...html.matchAll(/animation:m-(?:rise|fade|grow|in) [\d.]+s \S+(?: \S+)? ([\d.]+)s/g),
    ].map((m) => Number(m[1]));
    expect(delays.length).toBeGreaterThan(6);
    for (const d of delays) expect(d).toBeLessThan(2);
  });
  it("takes the font as a woff2 data: URL only", () => {
    const board = fromTemplate(template("teaser"), template("teaser").sample ?? {});
    const at = (font?: string) =>
      compose({ board, settings: DEFAULT_SETTINGS, style, font }).match(
        /@font-face\{[^}]*src:url\("([^"]*)"\)/,
      )?.[1];
    expect(at()).toBe("fonts/inter.woff2");
    expect(at("data:font/woff2;base64,AAEC+/==")).toBe("data:font/woff2;base64,AAEC+/==");
    expect(at('data:text/html,"){}<script>')).toBe("fonts/inter.woff2");
  });
  it("escapes text and media paths", () => {
    const html = compose({
      board: {
        version: 1,
        kind: "teaser",
        title: "<b>x</b>",
        language: "en",
        scenes: [
          {
            id: "a",
            type: "feature",
            title: '"><img src=x onerror=alert(1)>',
            media: { path: "media/a b.png", kind: "image" },
          },
        ],
      },
      settings: DEFAULT_SETTINGS,
      style: { ...style, colors: { ...style.colors, bg: "red;}</style><script>" } },
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain('src="media/a%20b.png"');
    expect(html).not.toContain("</style><script>");
    expect(esc(`<&"'>`)).toBe("&lt;&amp;&quot;&#39;&gt;");
  });
  it("adds the preview runtime only for the preview", () => {
    const board = fromTemplate(template("teaser"), template("teaser").sample ?? {});
    expect(compose({ board, settings: DEFAULT_SETTINGS, style, preview: true })).toContain('motion:"time"');
  });
  it("sizes a portrait video and shows the brand mark when asked", () => {
    const board = fromTemplate(template("teaser"), template("teaser").sample ?? {});
    const html = compose({
      board,
      settings: {
        ...DEFAULT_SETTINGS,
        aspect: "9:16",
        brand: { logo: "always", endText: "Contoso", link: "" },
      },
      style,
    });
    expect(html).toContain('data-width="1080" data-height="1920"');
    expect(html).toContain('<div class="mark">Contoso</div>');
  });

  const voiced: Storyboard = {
    version: 1,
    kind: "teaser",
    title: "Shop",
    language: "en",
    scenes: [
      { id: "a", type: "statement", title: "Hi", voice: "Meet Shop. It sells.", voiceSeconds: 2 },
      {
        id: "b",
        type: "capture",
        title: "Buy",
        media: { path: "media/capture-1.mp4", kind: "video" },
        marks: [
          { kind: "zoom", at: 1, x: 0.6, y: 0.1, w: 0.2, h: 0.1 },
          { kind: "highlight", at: 2, x: 0.6, y: 0.1, w: 0.2, h: 0.1, label: "Buy" },
          { kind: "arrow", at: 3, x: 0.1, y: 0.5 },
        ],
        duration: 8,
      },
    ],
  };

  it("burns in captions at the voice's time, at the chosen place", () => {
    const html = compose({ board: voiced, settings: DEFAULT_SETTINGS, style });
    expect(html).toContain('class="clip cap bottom" data-start="0.3"');
    expect(html).toContain(">Meet Shop.</span>");
    const top = compose({
      board: voiced,
      settings: { ...DEFAULT_SETTINGS, captions: { ...DEFAULT_SETTINGS.captions, position: "top" } },
      style,
    });
    expect(top).toContain('class="clip cap top"');
    const off = compose({
      board: voiced,
      settings: { ...DEFAULT_SETTINGS, captions: { ...DEFAULT_SETTINGS.captions, on: false } },
      style,
    });
    expect(off).not.toContain("clip cap");
  });

  it("plays the spoken voice and the music in the preview only", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      voice: "af_heart",
      music: { track: "media/music-calm.mp3", volume: 0.5, source: "" },
    };
    const file = voicePath(voiced.scenes[0]!, settings);
    const board = { ...voiced, scenes: [{ ...voiced.scenes[0]!, voiceFile: file }, voiced.scenes[1]!] };
    const preview = compose({ board, settings, style, preview: true });
    expect(preview).toContain(`<audio class="voice" src="${file}"`);
    expect(preview).toContain('<audio class="music" src="media/music-calm.mp3"');
    const render = compose({ board, settings, style });
    expect(render).not.toContain("<audio");
    // A stale file (other voice) isn't played.
    expect(
      compose({ board, settings: { ...settings, voice: "bf_emma" }, style, preview: true }),
    ).not.toContain('class="voice"');
  });

  it("zooms, highlights and points over captures", () => {
    const html = compose({ board: voiced, settings: DEFAULT_SETTINGS, style });
    expect(html).toContain("@keyframes z-b{");
    expect(html).toContain('<div class="zoom" style="animation:z-b 8s linear 0s both">');
    expect(html).toContain('class="hl" style="left:60%;top:10%;width:20%;height:10%;');
    expect(html).toContain('<span class="tag">Buy</span>');
    expect(html).toContain('class="arrow flip"');
  });

  it("keeps a zoom inside the frame and drops one that overlaps", () => {
    const k = zoomKeyframes(
      "z",
      [
        { kind: "zoom", at: 1, x: 0.95, y: 0.95 },
        { kind: "zoom", at: 1.5, x: 0.5, y: 0.5 },
      ],
      10,
    );
    expect(k).toContain("translate(-80%,-80%) scale(1.8)");
    expect(k.match(/scale\(/g)).toHaveLength(2);
    expect(zoomKeyframes("z", [{ kind: "arrow", at: 1, x: 0, y: 0 }], 5)).toBe("");
  });
});
