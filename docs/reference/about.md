# "What Jig can do" page

An in-app tab (`jig.about`, `renderer/features/about/`) that explains Jig with screenshots and live
data. Open it from the "Jig" menu (top left), the `?` in the top bar, Search → What Jig can do or
Settings → About. With no tab open and no project yet, the main area shows the same page
(`AboutPage welcome`, with Add project…). Once there is a project, the main area shows the project's
Home instead (`docs/reference/layout.md`), which links here. `workbench.openTab("jig.about", { section: "slots" })` opens it at a section.

## Live data

| What | From |
| --- | --- |
| Extension slots and their manifest keys | `SLOTS`, `MANIFEST_KEY` in `@jig/sdk` (so new slots appear by themselves; add an example to `SLOT_EXAMPLES` in `features/about/content.ts`) |
| Which add-ons use a slot | the loaded add-ons' manifests (`slotsUsed`) |
| Skills | `about.skills` (host): `name`/`description` from the front matter of `~/.claude/skills/*/SKILL.md` and `<active project>/.claude/skills/*/SKILL.md`; nothing else is read |
| Shortcuts | registered actions with a `shortcut` |
| Projects, repos, add-ons | the renderer stores |

The configure tools listed on the page are in `CONFIGURE_TOOLS` (`content.ts`); keep them in step with
`main/configure/tools.ts` and `main/engine/jigTools.ts`.

## Actions on the page

- **Try in a chat** opens a new chat in the active project with the example in the composer, not sent
  (`newSession(projectId, cwd, draft)` → `features/sessions/drafts.ts`).
- Build examples and **Build something here** open the Build dialog with the goal filled in.

## Screenshots

`features/about/shots/*.jpg` are bundled with the renderer. Regenerate them (Linux, after `npm run
build`) with:

```bash
JIG_SCREENSHOTS=1 xvfb-run -a npx playwright test e2e/screenshots.spec.ts
# optional: JIG_SCREENSHOT_ICONS=<an unpacked Material Icon Theme extension folder> for VS Code file icons
npm run build   # bundle the new screenshots
# about.jpg shows the page with the screenshots bundled at the last build: when they changed a lot,
# run the spec once more after this build
```

GitHub and browsers cache README images by address: after regenerating the screenshots (or the icon),
bump the `?v=` number on the README's image links so the new pictures show.

`about.jpg`, `slots.jpg`, `preview.jpg`, `tour.jpg`, `attempts.jpg` and `chat-tools.jpg` are only used by the repository's `README.md`; `files.jpg`, `releases.jpg`, `workflows.jpg` and `knowledge.jpg` (phase 18) are on both. The README
shows the same screenshots as the project's landing page.

The spec builds a demo workspace (`<tmp>/jig-demo`) with four repositories and uses the fake engine.

Extension slots use one card per row with independent animated disclosures; opening a slot never moves its header into another column. Motion respects reduced-motion preferences (D-200).

About screenshots reserve their 1440×900 aspect ratio before lazy loading, so navigation and slot headers do not move as screenshots arrive.

The screenshot scenario returns About to one main pane and hides the bottom panel before capturing the overview and slot cards.

The Skills section also shows the bundled library and its global/project controls (D-205), with `shots/skills.png` captured from the real app. Personal/project skill discovery remains separate.

The Teams meetings section (D-217) uses `shots/meetings.png`, captured by `e2e/meetings.spec.ts`
under `.jig-test-home-meeting-screenshots/meetings.png`; copy it into shots after reviewing the image.
It uses the real Electron UI and isolated fake media/Claude services, with neutral sample participants.
