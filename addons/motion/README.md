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
- **Settings → Motion:** the FFmpeg folder (protected: it runs programs), the music folder and the
  format new videos start in.
- **Templates** live in `templates/<id>/template.json` (scene types, inputs, default lengths,
  licence); **styles** in `styles/<id>.json` (colours, fonts, motion). Inter is bundled
  (`fonts/inter.woff2`, SIL Open Font License, `fonts/LICENSE-Inter.txt`) and embedded in the
  composition, so nothing loads from the network.
- **Tests:** `lib/*.test.ts` and `host.test.ts`; `e2e/motion.spec.ts` with `JIG_ENGINE=fake`, where
  a fake renderer writes a tiny MP4 and poster (`[hold]` in a video's text holds its render).
