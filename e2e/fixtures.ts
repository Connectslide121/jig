import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  test as base,
  type ElectronApplication,
  _electron as electron,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

const appDir = fileURLToPath(new URL("../apps/desktop", import.meta.url));

export interface JigFixtures {
  jigHome: string;
  app: ElectronApplication;
  page: Page;
}

/**
 * A fake az's arguments, as the real az reads them: `@<file>` is the file's text. On Windows Jig hands
 * free text to an az it can only start through cmd.exe that way (D-290), so fakes see the same values.
 */
export const AZ_ARGV =
  'process.argv.slice(2).map((a) => (a.startsWith("@") && require("node:fs").existsSync(a.slice(1)) ? require("node:fs").readFileSync(a.slice(1), "utf8") : a))';

/**
 * A folder with an `az` that says you're not signed in, first on PATH: tests never reach the real
 * Azure CLI and its login (Pipelines asks it for every organisation you belong to). Tests that need
 * az answers put their own fake first.
 */
async function signedOutAz(jigHome: string): Promise<string> {
  const bin = join(jigHome, "fake-bin");
  await mkdir(bin, { recursive: true });
  const script = `console.error("ERROR: Please run 'az login' to setup account."); process.exit(1);`;
  await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${script}\n`);
  await chmod(join(bin, "az"), 0o755);
  await writeFile(join(bin, "az-signed-out.cjs"), script);
  await writeFile(join(bin, "az.cmd"), '@node "%~dp0az-signed-out.cjs" %*\r\n');
  return bin;
}

/** Launches the built app with a throwaway JIG_HOME and the fake engine. */
export async function launchJig(
  jigHome: string,
  env: Record<string, string> = {},
): Promise<ElectronApplication> {
  const args = [appDir];
  if (process.platform === "linux") args.push("--no-sandbox");
  const PATH = `${await signedOutAz(jigHome)}${delimiter}${process.env.PATH ?? process.env.Path}`;
  // Tests check Claude's steps card by card: chats start in the Detailed view (D-159) unless a
  // test's JIG_HOME already has a config.
  await writeFile(join(jigHome, "config.json"), JSON.stringify({ chat: { view: "detailed" } }), {
    flag: "wx",
  }).catch(() => {});
  return electron.launch({
    args,
    // Hidden, so a test never fights the user's mouse and focus (JIG_HIDDEN= shows the windows).
    env: {
      JIG_HIDDEN: "1",
      ...process.env,
      PATH,
      Path: PATH,
      JIG_HOME: jigHome,
      JIG_ENGINE: "fake",
      ...env,
    } as Record<string, string>,
  });
}

export const test = base.extend<JigFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature.
  jigHome: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "jig-e2e-"));
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },
  app: async ({ jigHome }, use) => {
    const app = await launchJig(jigHome);
    await use(app);
    await app.close();
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    // The workbench with its layout loaded: a tab opened before that (Ctrl+N right away) is dropped.
    await page.waitForSelector("[data-testid=app-root] [data-testid=main-area]");
    await use(page);
  },
});

/** Calls a host method from the page and returns the raw `{ ok, value | error }` envelope. */
export function hostCall(page: Page, method: string, args?: unknown) {
  return page.evaluate(([m, a]) => window.jig.invoke(m as string, a), [method, args] as const);
}

/** The chat whose page of Claude's browser was used last (each chat has its own page, D-320). */
export async function browserPageChat(page: Page): Promise<string> {
  const pages = (await hostCall(page, "browser.pages")) as {
    value: Array<{ chatId: string; lastUsedAt: string }>;
  };
  return [...pages.value].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0]?.chatId ?? "";
}

/**
 * An element's box once it has stopped moving (two equal reads 100 ms apart): measure layout after
 * panels finish their opening motion (D-200), not in the middle of it. Finite animations are awaited
 * first: on a loaded machine frames can stall mid-animation long enough for two equal reads.
 */
export async function settledBox(locator: Locator): ReturnType<Locator["boundingBox"]> {
  await locator.page().evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  let last = "";
  let box: Awaited<ReturnType<Locator["boundingBox"]>> = null;
  await expect
    .poll(
      async () => {
        box = await locator.boundingBox();
        const now = JSON.stringify(box);
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [100] },
    )
    .toBe(true);
  return box;
}

/**
 * Opens a view from View → Views. Add-ons mount one after another after the window loads, and an open
 * menu lists only what was there when it opened, so it opens the menu again until the view is listed.
 */
export async function openViewFromMenu(page: Page, name: string): Promise<void> {
  await expect(async () => {
    await page.keyboard.press("Escape");
    await page.getByTestId("tools-group-View").click();
    await page.getByRole("menuitem", { name: "Views" }).hover();
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("menuitem", { name, exact: true }).click();
}

export { expect };
