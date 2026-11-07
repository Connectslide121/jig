# Motion

Videos made from HTML (phase 28, sessions M1–M3, [docs/plan/28-factory/motion.md](../../docs/plan/28-factory/motion.md),
D-453…D-458, D-463). A video is a storyboard of scenes on a template and a style; the composition
is plain HTML with CSS animations, previewed live in Jig and rendered to MP4 on this computer by a
pinned HyperFrames with FFmpeg. Rendering uses no AI and costs nothing.

- **Open it:** the **clapperboard** button in the top bar → New video… or Videos; or View → Views →
  **Motion**. The Videos view shows the project's videos as cards (poster, name, template, format,
  length, status); a card opens the video's tab.
- **New video…** (modal): a name, a template (**Teaser**, **What's new**, **Walkthrough**) and a
  format (16:9, 9:16, 1:1). The template fills a first storyboard you edit.
- **Video tab:** the live preview with play and a scrubber (the composition itself, in a sandboxed
  frame), the storyboard as rows (a scene's row opens its sheet: type, text, media, length, the
  template's inputs), and the settings (style, format, resolution, frame rate). **Render** makes a
  new version; the versions list keeps each MP4 with its poster. Wide: preview beside the tabs;
  narrow: preview above them.
- **Render:** one video at a time across projects, with progress and Cancel; a render interrupted by
  a restart is marked failed, not left running. The first render asks to install what is missing:
  HyperFrames (npm, a fixed version checked against its integrity) and FFmpeg when it isn't found
  (`motion.ffmpegPath`, then PATH; a fixed build checked by its SHA-256). Both go into Motion's data
  folder.
- **Voice (M2, D-455, D-464):** a scene's **Voice script** is spoken by a natural voice on this
  computer (`api.speech.say`, the voices of Read aloud); Sound → **Voice** and **Speed**, **Speak**
  speaks the scenes not spoken yet (Render speaks them first). A scene lasts its voice plus a pause;
  the spoken file is named after the voice, speed and text, so an edit speaks it again.
- **Captions:** the scripts as burned-in captions (bottom or top, three sizes, a background or not),
  and `captions.srt` / `captions.vtt` beside every render (`lib/captions.ts`).
- **Music (D-456):** a track from the music folder or **Choose a file…**, copied into the video;
  volume, the source address you keep with it, and 🔍 **Find music** (Pixabay Music in your browser).
  The render mixes it under the voice with FFmpeg: ducking, fades in and out (`lib/audio.ts`).
- **Record a capture (D-457, D-464):** + Scene → **Record a capture…**: an address and steps (click,
  type, hover, highlight, scroll, wait, go to), recorded in a hidden window at the video's shape,
  with a cursor, at most 60 s (`api.capture.record`). Watch the take; when the page seems to show
  real data (emails, phone numbers, names in the kit's `real-names.txt`), Keep waits until you say
  it's sample data. **Keep as a scene** adds a capture scene with marks where the steps acted: a zoom
  on clicks and typing, a highlight, an arrow on hovers (`lib/marks.ts`); a scene's sheet edits them.
- **From chats (M3, D-465):** tools `addon_motion_create`, `addon_motion_update` (merges scenes by
  id, keeping media, marks and spoken voice), `addon_motion_render` and the read-only
  `addon_motion_list` (with an `id`, a storyboard as JSON); a video card draws them in the chat. A
  reply's ⋯ → **Make a video from this** asks that chat; **Write with Jig** in a video keeps its
  brief and asks a new chat.
- **Styles** come from Motion's own, the product kit's `tokens.json`, styles a chat gave
  (`own-<hash>`), `DESIGN.md` files in Jig factory's design sources (local paths) and the bundled
  theme-factory themes (`lib/styleSources.ts`).
- **Exports** for other add-ons: `createVideo`, `render`, `get`.
- **Settings → Motion:** the FFmpeg folder (protected: it runs programs), the music folder, the
  format and the voice new videos start with.
- **Templates** live in `templates/<id>/template.json` (scene types, inputs, default lengths,
  licence); **styles** in `styles/<id>.json` (colours, fonts, motion). Inter is bundled
  (`fonts/inter.woff2`, SIL Open Font License, `fonts/LICENSE-Inter.txt`) and embedded in the
  composition, so nothing loads from the network.
- **Tests:** `lib/*.test.ts` and `host.test.ts`; `e2e/motion.spec.ts` with `JIG_ENGINE=fake`, where
  a fake renderer writes a tiny MP4 and poster (`[hold]` in a video's text holds its render).
