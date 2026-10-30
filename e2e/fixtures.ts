import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, type ElectronApplication, _electron as electron, type Page } from "@playwright/test";

const appDir = fileURLToPath(new URL("../apps/desktop", import.meta.url));

export interface JigFixtures {
  jigHome: string;
  app: ElectronApplication;
  page: Page;
}

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
    await page.waitForSelector("[data-testid=app-root]");
    await use(page);
  },
});

/** Calls a host method from the page and returns the raw `{ ok, value | error }` envelope. */
export function hostCall(page: Page, method: string, args?: unknown) {
  return page.evaluate(([m, a]) => window.jig.invoke(m as string, a), [method, args] as const);
}

export { expect } from "@playwright/test";
