// npm run check -- <demo folder | built folder> [--out <folder>] [--names <real-names.txt>] [--no-build]
// The quality gate (docs: README → "The quality gate"). Builds the demo, opens it from disk with the
// network blocked, walks every route at four widths and the story, and writes check.json and
// screenshots. Exits 1 when a check fails.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, chromium, type Page } from "@playwright/test";
import { buildDemo } from "./build.ts";
import { demoFolder, outFolder, parseArgs } from "./lib/args.ts";
import {
  type CheckResult,
  fromProblems,
  MAX_BYTES,
  MAX_CLS,
  misaligned,
  nonLocalRefs,
  parseNames,
  report,
  scanRealData,
  VIEWPORTS,
} from "./lib/checks.ts";
import { horizontalOverflow, measureLists, observeShifts, readTemplate, readText } from "./lib/measure.ts";

const { target, options } = parseArgs(process.argv.slice(2));
const folder = demoFolder(target);
const isSource = fs.existsSync(path.join(folder, "demo.tsx"));
const dist = isSource ? outFolder(folder) : folder;
const outDir = typeof options.out === "string" ? path.resolve(process.env.INIT_CWD ?? process.cwd(), options.out) : path.join(isSource ? folder : path.dirname(folder), "check");
const shotsDir = path.join(outDir, "screenshots");

const checks: CheckResult[] = [];
const screenshots: string[] = [];
const started = Date.now();
const log = (s: string) => console.log(`  ${s}`);

// 1. Build.
if (isSource && options["no-build"] !== true) {
  try {
    await buildDemo(folder, dist);
    checks.push({ id: "build", pass: true, detail: `built ${path.relative(process.cwd(), dist) || dist}` });
  } catch (e) {
    checks.push({ id: "build", pass: false, detail: String(e instanceof Error ? e.message : e) });
    finish();
  }
}
const indexFile = path.join(dist, "index.html");
if (!fs.existsSync(indexFile)) {
  checks.push({ id: "build", pass: false, detail: `no index.html in ${dist}` });
  finish();
}

// 2. Size and local references.
const bytes = folderSize(dist);
const refs = nonLocalRefs(fs.readFileSync(indexFile, "utf8"));
checks.push({
  id: "size",
  pass: bytes <= MAX_BYTES && refs.length === 0,
  detail: `${(bytes / 1024 / 1024).toFixed(2)} MB of 2 MB${refs.length ? `; not local: ${refs.slice(0, 5).join(", ")}` : ", everything local"}`,
});

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(shotsDir, { recursive: true });
const realNames = loadNames();

const browser: Browser = await chromium.launch();
try {
  await run(browser);
} finally {
  await browser.close();
}
finish();

async function run(browser: Browser) {
  const url = pathToFileURL(indexFile).href;
  const blocked: string[] = [];
  const consoleProblems: string[] = [];
  const overflow: string[] = [];
  const shifts: string[] = [];
  const axeProblems: string[] = [];
  const alignment: string[] = [];
  const realData: string[] = [];

  const open = async (width: number, height: number, theme: "light" | "dark", where: { name: string; version: number } | null) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await context.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
      blocked.push(u);
      return route.abort();
    });
    await context.addInitScript(observeShifts);
    await context.addInitScript(
      ([t, key]) => {
        localStorage.setItem("kit:theme", t);
        if (key) localStorage.setItem(key, "1");
      },
      [theme, where ? `kit:welcomed:${where.name}:v${where.version}` : ""] as const,
    );
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") consoleProblems.push(`${m.type()}: ${m.text().slice(0, 160)}`);
    });
    page.on("pageerror", (e) => consoleProblems.push(`uncaught: ${e.message.slice(0, 160)}`));
    return page;
  };
  const settle = async (page: Page) => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(350);
  };

  // First load: what the demo is (name, version, routes, story) and the template markers.
  const first = await open(1440, 900, "light", null);
  await first.goto(url);
  await settle(first);
  const welcome = await first.locator("[data-kit=welcome]").count();
  const tpl = await first.evaluate(readTemplate);
  await first.context().close();
  if (!tpl.demo) {
    checks.push({ id: "template", pass: false, detail: "the page didn't start the kit (no window.__demo): see the console check" });
    checks.push(fromProblems("console", consoleProblems, ""));
    return;
  }
  const demo = tpl.demo;
  const missing = [
    !tpl.banner && "the PROTOTYPE · sample data banner",
    !/^v\d+/.test(tpl.version) && "the version label",
    !tpl.story && "the What to try button",
    !tpl.present && "the Present button",
    !demo.story.length && "story steps",
    !welcome && "the scenario on first open",
  ].filter(Boolean) as string[];
  checks.push(fromProblems("template", missing.map((m) => `missing ${m}`), `banner, ${tpl.version}, story mode (${demo.story.length} steps), presenter mode, scenario`));

  // Every route at every width (light), and at the widest in dark.
  const runs = [...VIEWPORTS.map((v) => ({ ...v, theme: "light" as const })), { ...VIEWPORTS[0], name: "1440-dark", theme: "dark" as const }];
  for (const vp of runs) {
    const page = await open(vp.width, vp.height, vp.theme, demo);
    for (const route of demo.routes) {
      const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/[^\w-]+/g, "-");
      await page.goto(`${url}#${route}`);
      await page.reload();
      await settle(page);
      const where = `${route} @ ${vp.name}`;
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      if (cls > MAX_CLS) shifts.push(`${where}: CLS ${cls.toFixed(3)}`);
      const over = await page.evaluate(horizontalOverflow);
      if (over > 1) overflow.push(`${where}: ${over} px wider than the window`);
      if (vp.theme === "light") {
        for (const bad of misaligned(await page.evaluate(measureLists))) alignment.push(`${where} ${bad}`);
        for (const hit of scanRealData(await page.evaluate(readText), { allowDomains: demo.allowDomains, realNames })) {
          realData.push(`${route}: ${hit.kind} "${hit.value}"`);
        }
      }
      if (vp.name === "1440" || vp.name === "390" || vp.theme === "dark") {
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        for (const v of axe.violations) {
          if (v.impact === "serious" || v.impact === "critical") axeProblems.push(`${where}: ${v.id} on ${v.nodes.length} (${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}) ${v.help}`);
        }
      }
      const file = path.join(shotsDir, `${slug}@${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      screenshots.push(path.relative(outDir, file).split(path.sep).join("/"));
    }
    log(`${vp.name}: ${demo.routes.length} routes`);
    await page.context().close();
  }

  // The story, in presenter mode: every step's screen and target, with no layout shift.
  const storyProblems: string[] = [];
  const page = await open(1440, 900, "light", demo);
  await page.goto(url);
  await settle(page);
  await page.keyboard.press("p");
  for (let i = 0; i < demo.story.length; i++) {
    const step = demo.story[i] as { route: string; target?: string };
    if (i > 0) await page.keyboard.press("ArrowRight");
    await page.evaluate(() => {
      (window as unknown as { __cls: number }).__cls = 0;
    });
    await settle(page);
    const hash = await page.evaluate(() => location.hash.replace(/^#/, "") || "/");
    if (hash !== step.route) storyProblems.push(`step ${i + 1}: on ${hash}, expected ${step.route}`);
    if (step.target && !(await page.locator(`[data-demo="${step.target}"]`).count())) storyProblems.push(`step ${i + 1}: no [data-demo="${step.target}"]`);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    if (cls > MAX_CLS) shifts.push(`story step ${i + 1}: CLS ${cls.toFixed(3)}`);
    const file = path.join(shotsDir, `story-${i + 1}.png`);
    await page.screenshot({ path: file });
    screenshots.push(path.relative(outDir, file).split(path.sep).join("/"));
  }
  if (!(await page.locator("[data-kit=presenter]").count())) storyProblems.push("presenter mode didn't open with P");
  await page.context().close();
  log(`story: ${demo.story.length} steps`);

  checks.push(fromProblems("offline", [...new Set(blocked)].map((u) => `tried to load ${u}`), "opened from disk, no network requests"));
  checks.push(fromProblems("console", [...new Set(consoleProblems)], "no errors or warnings"));
  checks.push(fromProblems("viewports", overflow, `${demo.routes.length} routes at ${VIEWPORTS.map((v) => v.name).join(", ")} px and dark, no horizontal scroll`));
  checks.push(fromProblems("accessibility", [...new Set(axeProblems)], "axe: 0 serious or critical (light and dark)"));
  checks.push(fromProblems("layout-shift", shifts, `CLS ≤ ${MAX_CLS} on every route and story step`));
  checks.push(fromProblems("alignment", [...new Set(alignment)], "list and table columns line up"));
  checks.push(fromProblems("story", storyProblems, `${demo.story.length} steps reach their screens and targets`));
  checks.push(fromProblems("real-data", [...new Set(realData)], `no real-looking e-mail, phone or listed names${realNames.length ? ` (${realNames.length} names checked)` : ""}`));
}

function finish(): never {
  const result = report(checks, screenshots);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "check.json"), `${JSON.stringify(result, null, 2)}\n`);
  for (const c of checks) console.log(`${c.pass ? "✓" : "✗"} ${c.id.padEnd(14)} ${c.detail}`);
  console.log(`\n${result.pass ? "PASS" : "FAIL"} in ${((Date.now() - started) / 1000).toFixed(1)} s → ${path.join(outDir, "check.json")}`);
  process.exit(result.pass ? 0 : 1);
}

function folderSize(dir: string): number {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? folderSize(p) : fs.statSync(p).size;
  }
  return total;
}

function loadNames(): string[] {
  const candidates = [typeof options.names === "string" ? path.resolve(process.env.INIT_CWD ?? process.cwd(), options.names) : "", path.join(folder, "kit/real-names.txt"), path.join(folder, "real-names.txt")];
  const file = candidates.find((f) => f && fs.existsSync(f));
  return file ? parseNames(fs.readFileSync(file, "utf8")) : [];
}
