import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compose, esc, type MotionStyle } from "./compose";
import { DEFAULT_SETTINGS, timeline } from "./storyboard";
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
});
