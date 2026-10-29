import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, type ElectronApplication, _electron as electron, type Page } from "@playwright/test";

const appDir = fileURLToPath(new URL("../apps/desktop", import.meta.url));

export interface JigFixtures {
  jigHome: string;
  app: ElectronApplication;
  page: Page;
}

/** Launches the built app with a throwaway JIG_HOME and the fake engine. */
export async function launchJig(
  jigHome: string,
  env: Record<string, string> = {},
): Promise<ElectronApplication> {
  const args = [appDir];
  if (process.platform === "linux") args.push("--no-sandbox");
  return electron.launch({
    args,
    // Hidden, so a test never fights the user's mouse and focus (JIG_HIDDEN= shows the windows).
    env: { JIG_HIDDEN: "1", ...process.env, JIG_HOME: jigHome, JIG_ENGINE: "fake", ...env } as Record<
      string,
      string
    >,
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
