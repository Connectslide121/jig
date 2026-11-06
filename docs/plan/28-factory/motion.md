# Motion — videos made from HTML

Part of [phase 28](../28-factory.md): sessions M1–M3, decisions D-453 … D-458. A built-in add-on,
`addons/motion`, useful on its own; Jig factory's teasers are made with it (D-458). Jig's UI rules
apply to every screen (AGENTS.md).

## How it works

A video is a **storyboard** (scenes, each with text, media, a voice script and a duration) plus the
video's **settings** (format, style, motion, captions, music). Motion turns the storyboard into an
**HTML composition**: one page per video, every scene a block on a paused GSAP timeline, styled with
the chosen style's tokens. **HyperFrames** (D-454) opens that page in a headless Chrome, seeks the
timeline frame by frame, and FFmpeg encodes the frames, the voiceover and the music into an MP4. The
same storyboard always gives the same video; rendering uses no AI and costs nothing.

```
chat or you ─► storyboard.json + settings ─► composition (HTML + GSAP, style tokens) ─► HyperFrames
            ─► frames ─► FFmpeg (+ voice WAVs, music, ducking) ─► video.mp4 · poster.png · .srt · .vtt
```

AI only writes: a chat (Claude or ChatGPT, whichever it runs on) creates or changes a video's
storyboard and settings through Motion's tools. You can also make a video from a template without AI.

## What it makes (first version)

| Kind | Scenes it starts with | Typical length |
|---|---|---|
| **Teaser / launch clip** | title · problem · 3 value scenes from screens or captures · logo outro | 35–50 s |
| **What's new** | version title · one scene per change (screenshot or capture + one line) · outro | 30–90 s |
| **Walkthrough** | captures of an app or demo with zooms, arrows, highlights and captions per step | 1–3 min |

Later kinds are only templates (data video, social clip, course intro, recap); the engine and editor
stay the same.

## How you use it

1. **New video**: from the top bar's Motion menu, a chat ("make a 40 s teaser for this release"), a
   factory run (the teaser stage) or Releases ("What's new video" on a release, later). The New video
   modal: kind, format, style, language, voice, "Write it with Jig" or "Start from the template".
2. **The Video tab** opens: the storyboard on the left, the preview in the middle, the settings on
   the right. You edit a scene's text, swap a screenshot, record a capture, change the voice script,
   drag scenes to reorder. The preview plays the composition live (the same HTML that is rendered)
   with a scrubber; no render needed to see it.
3. **Render**: progress with frames done and time left, cancellable. The first render asks to
   install what's missing (renderer, FFmpeg; D-454).
4. **The result**: the MP4 plays in the tab and in Jig's Preview; **Export** (save as, copy to a
   folder), poster image, subtitles. Each render is a version; older ones are kept until you delete
   them.

## Screens

### Videos (view and tab)

The project's videos as cards: poster, title, kind, length, last render, status at the right edge
(draft, rendering with progress, rendered, failed). Whole card opens the Video tab. Empty: "No
videos yet" + **New video**. Listed in View → Views → Motion; top bar menu: New video…, Videos.

### Video tab

```
┌ ■ Release 2.4 · What's new · 16:9 · 0:48                  [Write with Jig] [Render] [⋯] ┐
├──────────────────────┬─────────────────────────────────────────┬────────────────────────┤
│ Storyboard           │                                         │ Settings               │
│ ┌──────────────────┐ │                                         │ Format  16:9 · 1080p   │
│ │1 ▸ Title    0:04 │ │            preview (16:9)               │ Style   Product kit ▾  │
│ └──────────────────┘ │                                         │ Motion  Calm ▾         │
│ ┌──────────────────┐ │                                         │ Type    Large · 2.5 s  │
│ │2 ▸ Bulk edit 0:09│ │                                         │ Captions On · Bottom ▾ │
│ └──────────────────┘ │                                         │ Voice   Heart (en) ▾   │
│ ┌──────────────────┐ │  ▶ ━━━━━━━━━━●──────────── 0:12 / 0:48  │ Music   calm-01.mp3 ▾  │
│ │3 ▸ Capture  0:12 │ │                                         │ Logo    End only ▾     │
│ └──────────────────┘ │                                         │                        │
│ [+ Scene]            │                                         │                        │
```

- Scene rows have fixed slots: number, kind icon, title, duration right-aligned; selected scene
  opens its editor in a side sheet (text, media, voice script, transitions), never inline.
- The preview keeps its aspect ratio and size while things load (no layout shift); a render's
  progress replaces the Render button's icon with a spinner, the bar sits in a fixed slot.
- Narrow (sidebar, panel): storyboard and settings become tabs above the preview.

### New video (modal), Record capture (modal), Install renderer (modal)

- **New video**: kind, format, style, language, voice, start mode; Create.
- **Record capture**: URL or demo, size from the video, steps (go to, click, type, scroll, wait,
  highlight) as a list you edit, **Record**; the recording plays back before you keep it.
- **Install renderer / FFmpeg**: what, from where, size, where it goes; Install / Cancel.

## Configuring the look

| Setting | Values |
|---|---|
| Format | 16:9, 1:1, 9:16, 4:5; 720p, 1080p, 4K; 30 or 60 fps |
| Style | a product kit's tokens (`.jig/factory/kit/` of a product), a `DESIGN.md` reference from `factory.designSources` (D-444), a `theme-factory` theme, or a style of your own (colours, fonts, radius, logo) |
| Motion | calm, normal, energetic: speeds, easing, entrances, transitions between scenes |
| Type | headline size, minimum time on screen per word (readable without sound) |
| Captions | on/off, position, size, background |
| Voice | a natural voice (D-455), speed; or none |
| Music | a track from the music folder (D-456), volume, ducking under the voice |
| Brand | logo always / at the end / never, end card text and link |

Styles and templates are data (`addons/motion/templates/<id>/` with `template.json`: kinds, scene
types, inputs schema, durations, licence; `styles/<id>.json`), so new ones are added without code.

## Architecture

```
addons/motion/
  addon.json          id motion, name Motion, icon clapperboard, storage.scope project,
                      permissions fs:read fs:write exec chat speech capture
  host.ts             videos, renders (queue, one at a time), installs, tools, exports
  ui.tsx              Videos view, Video tab, modals, tool renderers
  lib/storyboard.ts   types + validation + timing (voice length, min reading time)
  lib/compose.ts      storyboard + style + template → composition HTML (pure, tested)
  lib/captions.ts     scenes → SRT / VTT (pure, tested)
  lib/install.ts      pinned renderer and FFmpeg sources, checksums
  templates/          teaser, whats-new, walkthrough (+ adapted HyperFrames blocks, licences kept)
  styles/             neutral, plus styles from a product kit at run time
```

- **Data** (project scope): `videos/<id>/storyboard.json`, `settings.json`, `media/` (screenshots,
  captures, voice WAVs), `renders/<n>/video.mp4`, `poster.png`, `captions.srt`, `captions.vtt`.
- **Tools for chats** (engine-neutral, `ChatTool`): `motion_create` (kind, brief, sources →
  storyboard), `motion_update` (scene edits), `motion_render`, `motion_list` (read-only). A tool
  renderer shows the video card in the chat. `jigContext` says when to use them.
- **Exports** (D-215): `createVideo({ projectId, kind, storyboard?, brief?, style, output })` and
  `render(id)` for Jig factory (D-458) and, later, Releases.
- **Core additions:** `api.speech.say` (D-455) and `api.capture.record` (D-457), both documented in
  `addon-api.md`, with schemas in `main/ipc/validate.ts` where they take paths or URLs. Add-ons
  can't speak or record today, so these come first in M2.
- **No npm packages in the add-on:** built-in add-ons ship as their folder and import only from
  `addons/` and packages by name (D-415), so HyperFrames, its headless Chrome and FFmpeg are not
  dependencies. Motion installs a pinned HyperFrames into its data folder on the first render, after
  the install modal (D-454), and runs it as a program (`exec`); FFmpeg is looked for first.
- **Real renders and the real voice are Jon's check** on his machine; tests use a fake renderer
  and the fake engine.
- **Settings** (Settings → Motion): `motion.ffmpegPath`, `motion.musicFolder`, default format,
  default voice. `motion.ffmpegPath` is protected (it runs a program, D-077).

## Testing

- Unit: storyboard validation and timing, composition output (snapshot of the HTML for each
  template), captions, install source pinning.
- Host: render queue, cancel, install-needed state, restart during a render, with a fake renderer.
- e2e: create a video from a template with the fake engine and a fake renderer (writes a tiny MP4),
  the Video tab at sidebar, panel and tab widths, Dark and Light; a chat's `motion_create` call shows
  the video card. A real render is Jon's check on his machine.
