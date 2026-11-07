import { cues } from "./captions";
import {
  dimensions,
  ENTRANCE,
  freshVoice,
  type Mark,
  type MotionPace,
  type Scene,
  type Slot,
  type Storyboard,
  timeline,
  type VideoSettings,
  VOICE_LEAD,
  voiceLength,
} from "./storyboard";

/**
 * Storyboard + settings + style → one HTML composition (D-463). Every scene is a `.clip` with
 * HyperFrames' `data-start` / `data-duration`; its motion is CSS animations whose delays count from
 * the start of their closest `[data-start]` element (the scene, or a video), which is how HyperFrames
 * seeks them when it renders; the preview runtime in Jig seeks them the same way. No scripts in the rendered page, no network, no fonts fetched.
 */

export interface MotionStyle {
  id: string;
  name: string;
  colors: { bg: string; surface: string; fg: string; muted: string; accent: string; onAccent: string };
  fonts: { headline: string; body: string };
  /** Corner radius at 1080p, in pixels. */
  radius: number;
  headlineWeight?: number;
  /** Uppercase small labels (eyebrows). */
  eyebrowCase?: "upper" | "none";
}

export interface ComposeInput {
  board: Storyboard;
  settings: VideoSettings;
  style: MotionStyle;
  /** Adds the preview runtime: fits the frame to the window and seeks / plays on messages. */
  preview?: boolean;
  /**
   * Where Inter comes from: a `data:` URL keeps the page self-contained (a sandboxed preview frame
   * can't load a font file, and a render never misses one). Default: `FONT_FILE` beside the page.
   */
  font?: string;
}

const PACE: Record<MotionPace, { stagger: number; ease: string; out: number }> = {
  calm: { stagger: 0.18, ease: "cubic-bezier(.22,1,.36,1)", out: 0.45 },
  normal: { stagger: 0.12, ease: "cubic-bezier(.2,.9,.25,1)", out: 0.35 },
  energetic: { stagger: 0.08, ease: "cubic-bezier(.16,1,.3,1)", out: 0.25 },
};

/** Inter (OFL), bundled in the add-on's `fonts/`; the host passes it in as a `data:` URL. */
export const FONT_FILE = "fonts/inter.woff2";

const HEADLINE = { medium: 0.062, large: 0.078, huge: 0.098 };
const CAPTION_SIZE = { small: 34, medium: 42, large: 52 };

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A CSS value from a style: colours and font stacks only, nothing that closes the rule. */
function cssValue(value: string): string {
  return value.replace(/[;{}<>\\]/g, "");
}

/** A woff2 `data:` URL as given, else the bundled file's relative path. */
function fontUrl(font: string | undefined): string {
  return font && /^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/.test(font) ? font : FONT_FILE;
}

const sec = (n: number) => `${Math.round(n * 1000) / 1000}s`;

function anim(name: string, at: number, length: number, ease = "var(--ease)", fill = "both"): string {
  return `animation:${name} ${sec(length)} ${ease} ${sec(at)} ${fill}`;
}

const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Zooms in one keyframes rule per scene: in, hold, out; a zoom that overlaps the one before is dropped. */
export function zoomKeyframes(name: string, marks: Mark[], duration: number): string {
  const stops: string[] = ["0%{transform:none}"];
  let free = 0;
  const at = (t: number) => pct(clamp(t / duration, 0, 1));
  for (const m of [...marks].filter((x) => x.kind === "zoom").sort((a, b) => a.at - b.at)) {
    const start = m.at;
    const ramp = 0.6;
    const end = Math.min(duration, start + ramp + (m.hold ?? 2) + ramp);
    if (start < free || start + 2 * ramp > duration) continue;
    const w = m.w ?? 0;
    const h = m.h ?? 0;
    const s = Math.round(clamp(w || h ? 0.7 / Math.max(w, h) : 1.8, 1.2, 2.5) * 100) / 100;
    const cx = m.x + w / 2;
    const cy = m.y + h / 2;
    const tx = clamp((0.5 - cx * s) * 100, (1 - s) * 100, 0);
    const ty = clamp((0.5 - cy * s) * 100, (1 - s) * 100, 0);
    const z = `transform:translate(${Math.round(tx * 100) / 100}%,${Math.round(ty * 100) / 100}%) scale(${s})`;
    stops.push(
      `${at(start)}{transform:none;animation-timing-function:var(--ease)}`,
      `${at(start + ramp)}{${z}}`,
      `${at(end - ramp)}{${z};animation-timing-function:var(--ease)}`,
      `${at(end)}{transform:none}`,
    );
    free = end;
  }
  if (stops.length === 1) return "";
  stops.push("100%{transform:none}");
  return `@keyframes ${name}{${stops.join("")}}`;
}

const ARROW = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M12 88 L84 16 M84 16 L52 18 M84 16 L82 48" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Highlights and arrows over the media, each shown from `at` for `hold` seconds. */
function overlays(marks: Mark[]): string {
  return marks
    .filter((m) => m.kind !== "zoom")
    .map((m) => {
      const show = anim("m-show", m.at, m.hold ?? 2, "ease");
      const tag = m.label ? `<span class="tag">${esc(m.label)}</span>` : "";
      if (m.kind === "highlight") {
        const w = Math.max(m.w ?? 0, 0.04);
        const h = Math.max(m.h ?? 0, 0.04);
        return `<div class="hl" style="left:${pct(m.x)};top:${pct(m.y)};width:${pct(w)};height:${pct(h)};${show}">${tag}</div>`;
      }
      const x = m.x + (m.w ?? 0) / 2;
      const y = m.y + (m.h ?? 0) / 2;
      return `<div class="arrow${x < 0.3 ? " flip" : ""}" style="left:${pct(x)};top:${pct(y)};${show}">${ARROW}${tag}</div>`;
    })
    .join("");
}

function media(scene: Scene, slot: Slot, cls: string, extra: string[]): string {
  if (!scene.media) return "";
  const src = esc(encodeURI(scene.media.path));
  const drift = anim("m-drift", 0, slot.duration, "linear");
  const marks = scene.marks ?? [];
  const inner =
    scene.media.kind === "video"
      ? `<video id="v-${esc(scene.id)}" src="${src}" muted playsinline preload="auto" data-start="${slot.start}" data-duration="${slot.duration}"${marks.length ? "" : ` style="${drift}"`}></video>`
      : `<img src="${src}" alt="" style="${drift}">`;
  if (!marks.length) return `<div class="${cls}">${inner}</div>`;
  const zoom = zoomKeyframes(`z-${scene.id}`, marks, slot.duration);
  if (zoom) extra.push(zoom);
  const zoomStyle = zoom ? ` style="animation:z-${esc(scene.id)} ${sec(slot.duration)} linear 0s both"` : "";
  return `<div class="${cls}"><div class="zoom"${zoomStyle}>${inner}${overlays(marks)}</div></div>`;
}

function sceneHtml(slot: Slot, input: ComposeInput, last: boolean, extra: string[]): string {
  const { scene, duration } = slot;
  const pace = PACE[input.settings.motion];
  const enter = ENTRANCE[input.settings.motion];
  let n = 0;
  const rise = () => anim("m-rise", 0.15 + pace.stagger * n++, enter);
  const line = (tag: string, cls: string, text: string | undefined) =>
    text ? `<${tag} class="${cls}" style="${rise()}">${esc(text)}</${tag}>` : "";
  const brand = input.settings.brand;
  let body: string;
  switch (scene.type) {
    case "title":
      body = `<div class="center">${line("div", "eyebrow", scene.text)}${line("h1", "headline", scene.title)}<div class="bar" style="${anim("m-grow", 0.3, enter * 1.2)}"></div></div>`;
      break;
    case "statement":
      body = `<div class="stack">${line("div", "eyebrow", scene.title)}${line("p", "statement", scene.text ?? scene.title)}</div>`;
      break;
    case "bullets":
      body = `<div class="stack">${line("h2", "title", scene.title)}<ul class="bullets">${(
        scene.bullets ?? []
      )
        .map((b) => `<li style="${rise()}"><span class="dot"></span>${esc(b)}</li>`)
        .join("")}</ul></div>`;
      break;
    case "feature":
      body = scene.media
        ? `<div class="split"><div class="copy">${line("h2", "title", scene.title)}${line("p", "text", scene.text)}</div><div class="shot-wrap" style="${anim("m-in", 0.2, enter * 1.3)}">${media(scene, slot, "shot", extra)}</div></div>`
        : `<div class="stack">${line("h2", "title", scene.title)}${line("p", "text", scene.text)}</div>`;
      break;
    case "capture":
      body = `<div class="capture"><div class="shot-wrap wide" style="${anim("m-in", 0.1, enter)}">${media(scene, slot, "shot", extra)}</div>${scene.title ? `<div class="label" style="${rise()}">${esc(scene.title)}</div>` : ""}</div>`;
      break;
    default: {
      const end = brand.logo !== "never" ? brand.endText : "";
      body = `<div class="center">${line("h1", "headline", scene.title)}${line("p", "text", scene.text)}${line("div", "end", end)}${brand.link && brand.logo !== "never" ? line("div", "link", brand.link) : ""}</div>`;
    }
  }
  const fade = `${anim("m-fade", 0, 0.25, "ease-out")},${last ? "" : `m-out ${sec(pace.out)} ease-in ${sec(duration - pace.out)} forwards`}`;
  return `<section id="s-${esc(scene.id)}" class="clip scene ${scene.type}" data-start="${slot.start}" data-duration="${duration}" data-track-index="0" style="${fade.replace(/,$/, "")}">${body}</section>`;
}

function css(input: ComposeInput, width: number, height: number): string {
  const { style, settings } = input;
  const c = style.colors;
  const short = Math.min(width, height);
  const portrait = height > width;
  const u = short / 1080;
  const px = (n: number) => `${Math.round(n * u)}px`;
  const head = Math.round(short * HEADLINE[settings.type.headline]);
  return `
@font-face{font-family:"Inter Variable";src:url("${fontUrl(input.font)}") format("woff2");font-weight:100 900;font-display:block}
:root{--bg:${cssValue(c.bg)};--surface:${cssValue(c.surface)};--fg:${cssValue(c.fg)};--muted:${cssValue(c.muted)};--accent:${cssValue(c.accent)};--on-accent:${cssValue(c.onAccent)};--ease:${PACE[settings.motion].ease};--rise:${px(36)}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--bg);overflow:hidden}
#root{position:relative;width:${width}px;height:${height}px;overflow:hidden;isolation:isolate;background:var(--bg);color:var(--fg);font-family:${cssValue(style.fonts.body)};-webkit-font-smoothing:antialiased}
#root::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 85% 10%,color-mix(in oklab,var(--accent) 18%,transparent),transparent 70%);z-index:0}
.clip{position:absolute;inset:0;z-index:1}
.scene{display:flex;align-items:center;justify-content:center;padding:${px(portrait ? 90 : 110)}}
h1,h2,.statement{font-family:${cssValue(style.fonts.headline)};font-weight:${style.headlineWeight ?? 700};letter-spacing:-0.02em;line-height:1.08;text-wrap:balance}
.headline{font-size:${head}px}
.title{font-size:${Math.round(head * 0.62)}px}
.statement{font-size:${Math.round(head * 0.72)}px;max-width:${px(1500)}}
.eyebrow{font-size:${px(30)};font-weight:600;color:var(--accent);letter-spacing:.08em;${style.eyebrowCase === "none" ? "" : "text-transform:uppercase;"}margin-bottom:${px(24)}}
.text{font-size:${px(36)};line-height:1.4;color:var(--muted);margin-top:${px(24)};max-width:${px(1100)};text-wrap:pretty}
.center{display:flex;flex-direction:column;align-items:center;text-align:center;max-width:90%}
.stack{display:flex;flex-direction:column;align-items:flex-start;width:100%;max-width:${px(1500)}}
.bar{width:${px(140)};height:${px(10)};border-radius:${px(5)};background:var(--accent);margin-top:${px(40)};transform-origin:center}
.bullets{list-style:none;margin-top:${px(40)};display:flex;flex-direction:column;gap:${px(26)}}
.bullets li{display:flex;align-items:center;gap:${px(26)};font-size:${px(44)};line-height:1.25}
.dot{width:${px(16)};height:${px(16)};border-radius:50%;background:var(--accent);flex:none}
.split{display:flex;${portrait ? "flex-direction:column;" : ""}align-items:center;gap:${px(80)};width:100%;height:100%}
.copy{flex:${portrait ? "none" : "0 0 34%"}}
.shot-wrap{flex:1;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.shot{border-radius:${px(style.radius)};overflow:hidden;background:var(--surface);box-shadow:0 ${px(30)} ${px(80)} color-mix(in oklab,var(--bg) 40%,transparent),0 0 0 ${px(2)} color-mix(in oklab,var(--fg) 10%,transparent);max-width:100%;max-height:100%;display:flex}
.shot img,.shot video{display:block;width:auto;max-width:100%;height:${Math.round(height * (portrait ? 0.5 : 0.72))}px;object-fit:contain;transform-origin:center}
.capture{display:flex;flex-direction:column;align-items:center;gap:${px(36)};width:100%;height:100%}
.wide .shot img,.wide .shot video{height:${Math.round(height * 0.62)}px}
.label{font-size:${px(38)};font-weight:600;background:var(--surface);padding:${px(14)} ${px(28)};border-radius:${px(999)}}
.end{font-size:${px(34)};margin-top:${px(40)};color:var(--fg);font-weight:600}
.link{font-size:${px(30)};margin-top:${px(12)};color:var(--accent)}
.mark{position:absolute;z-index:2;top:${px(48)};right:${px(56)};font-size:${px(26)};font-weight:700;color:var(--muted);letter-spacing:.02em}
@keyframes m-rise{from{opacity:0;transform:translateY(var(--rise))}to{opacity:1;transform:none}}
@keyframes m-fade{from{opacity:0}to{opacity:1}}
@keyframes m-out{from{opacity:1}to{opacity:0}}
@keyframes m-in{from{opacity:0;transform:translateY(var(--rise)) scale(.97)}to{opacity:1;transform:none}}
@keyframes m-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes m-drift{from{transform:scale(1)}to{transform:scale(1.045)}}
@keyframes m-show{0%{opacity:0}12%{opacity:1}88%{opacity:1}100%{opacity:0}}
.zoom{position:relative;display:block;transform-origin:0 0}
.hl{position:absolute;border:${px(4)} solid var(--accent);border-radius:${px(10)};box-shadow:0 0 0 ${px(4000)} color-mix(in oklab,var(--bg) 45%,transparent);pointer-events:none}
.arrow{position:absolute;width:${px(150)};height:${px(150)};margin-left:${px(-128)};margin-top:${px(-22)};color:var(--accent);filter:drop-shadow(0 ${px(4)} ${px(10)} color-mix(in oklab,var(--bg) 60%,transparent))}
.arrow.flip{margin-left:${px(-22)}}
.arrow.flip svg{transform:scaleX(-1)}
.arrow svg{display:block;width:100%;height:100%}
.tag{position:absolute;left:50%;top:100%;transform:translate(-50%,${px(10)});white-space:nowrap;font-size:${px(30)};font-weight:600;background:var(--accent);color:var(--on-accent);padding:${px(8)} ${px(18)};border-radius:${px(999)}}
.cap{display:flex;justify-content:center;align-items:flex-end;padding:0 ${px(120)} ${px(portrait ? 160 : 70)};z-index:3;pointer-events:none}
.cap.top{align-items:flex-start;padding-top:${px(portrait ? 160 : 70)};padding-bottom:0}
.cap span{max-width:${px(1500)};text-align:center;font-size:${px(CAPTION_SIZE[settings.captions.size])};font-weight:600;line-height:1.3;color:var(--fg);text-wrap:balance;${settings.captions.background ? `background:color-mix(in oklab,var(--bg) 80%,transparent);padding:${px(10)} ${px(24)};border-radius:${px(12)}` : `text-shadow:0 ${px(2)} ${px(12)} var(--bg),0 0 ${px(4)} var(--bg)`}}
`;
}

/**
 * Fits the frame into the window, seeks every animation on `{motion:"seek"}` (to `t` minus its closest
 * `[data-start]`, as HyperFrames does), plays, reports the time. At rest it shows the poster's moment
 * (as the render's poster); the first Play starts from 0. While it isn't playing, animations the page
 * starts later (a frame laid out late) are paused at the current time each frame.
 */
const RUNTIME = `(function(){
var root=document.getElementById("root"),W=+root.dataset.width,H=+root.dataset.height,T=+root.dataset.duration;
var clips=[].slice.call(root.querySelectorAll(".clip")),vids=[].slice.call(root.querySelectorAll("video"));
var auds=[].slice.call(document.querySelectorAll("audio.voice")),mus=document.querySelector("audio.music");
var t=0,playing=false,last=0,rest=true;
function sound(){var on=false;auds.forEach(function(a){var s=+a.dataset.start,d=+a.dataset.duration;if(playing&&t>=s&&t<s+d){on=true;if(a.paused){try{a.currentTime=t-s}catch(e){}a.play().catch(function(){})}}else if(!a.paused)a.pause()});if(!mus)return;if(!playing){if(!mus.paused)mus.pause();return}var f=Math.max(0,Math.min(1,t,(T-t)/2));mus.volume=Math.max(0,Math.min(1,+mus.dataset.volume*(on?0.3:1)*f));if(mus.paused){try{mus.currentTime=mus.duration?t%mus.duration:t}catch(e){}mus.play().catch(function(){})}}
function fitFrame(){var s=Math.min(innerWidth/W,innerHeight/H);root.style.transformOrigin="0 0";root.style.transform="scale("+s+")";root.style.position="absolute";root.style.left=(innerWidth-W*s)/2+"px";root.style.top=(innerHeight-H*s)/2+"px"}
function show(){clips.forEach(function(c){var s=+c.dataset.start,d=+c.dataset.duration;c.style.visibility=t>=s&&t<s+d||(t>=T&&s+d>=T)?"visible":"hidden"})}
function seek(x,quiet){t=Math.max(0,Math.min(T,x));document.getAnimations().forEach(function(a){var el=a.effect&&a.effect.target,h=el&&el.closest&&el.closest("[data-start]");a.pause();a.currentTime=Math.max(0,t-(h?+h.dataset.start:0))*1000});show();vids.forEach(function(v){var s=+v.dataset.start;if(!playing){v.pause();try{v.currentTime=Math.max(0,t-s)}catch(e){}}else if(t>=s&&v.paused){try{v.currentTime=Math.max(0,t-s)}catch(e){}v.play().catch(function(){})}});sound();if(!quiet)parent.postMessage({motion:"time",t:t,total:T,playing:playing},"*")}
function tick(now){if(!playing)return;t+=(now-last)/1000;last=now;if(t>=T){t=T;playing=false}seek(t);if(playing)requestAnimationFrame(tick)}
addEventListener("message",function(e){var m=e.data||{};if(m.motion==="seek"){rest=false;playing=false;seek(+m.t||0)}else if(m.motion==="play"){if(t>=T||rest)t=0;rest=false;playing=true;last=performance.now();seek(t);requestAnimationFrame(tick)}else if(m.motion==="pause"){playing=false;seek(t)}});
addEventListener("resize",fitFrame);fitFrame();seek(Math.min(1.5,T/2));function hold(){if(!playing&&document.getAnimations().some(function(a){return a.playState!=="paused"}))seek(t,true);requestAnimationFrame(hold)}requestAnimationFrame(hold);
})();`;

/** The composition's HTML. */
export function compose(input: ComposeInput): string {
  const { board, settings, preview } = input;
  const { width, height } = dimensions(settings);
  const { slots, total } = timeline(board, settings);
  const extra: string[] = [];
  const scenes = slots.map((slot, i) => sceneHtml(slot, input, i === slots.length - 1, extra)).join("\n");
  const captions = settings.captions.on
    ? cues(board, settings)
        .map(
          (c) =>
            `<div class="clip cap ${settings.captions.position}" data-start="${c.start}" data-duration="${Math.round((c.end - c.start) * 1000) / 1000}" data-track-index="1"><span style="${anim("m-fade", 0, 0.15, "ease-out")}">${esc(c.text)}</span></div>`,
        )
        .join("\n")
    : "";
  // Sound plays in the preview only; a render gets it from FFmpeg afterwards (lib/audio.ts).
  const sound = preview
    ? [
        ...slots.flatMap(({ scene, start }) => {
          const file = freshVoice(scene, settings);
          return file
            ? [
                `<audio class="voice" src="${esc(encodeURI(file))}" preload="auto" data-start="${Math.round((start + VOICE_LEAD) * 1000) / 1000}" data-duration="${voiceLength(scene)}"></audio>`,
              ]
            : [];
        }),
        settings.music.track
          ? `<audio class="music" src="${esc(encodeURI(settings.music.track))}" preload="auto" loop data-volume="${settings.music.volume}"></audio>`
          : "",
      ].join("")
    : "";
  const mark =
    settings.brand.logo === "always"
      ? `<div class="mark">${esc(settings.brand.endText || board.title)}</div>`
      : "";
  return `<!doctype html>
<html lang="${esc(board.language || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${width}, height=${height}">
<title>${esc(board.title)}</title>
<style>${css(input, width, height)}${extra.join("\n")}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}" data-fps="${settings.fps}">
${scenes}
${captions}
${mark}
</div>
${sound}
${preview ? `<script>${RUNTIME}</script>` : ""}
</body>
</html>
`;
}
