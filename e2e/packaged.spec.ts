import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";
import { expect, test } from "./fixtures";

const release = fileURLToPath(new URL("../apps/desktop/release", import.meta.url));
const executable = {
  linux: join(release, "linux-unpacked", "Jig"),
  win32: join(release, "win-unpacked", "Jig.exe"),
  darwin: join(release, "mac", "Jig.app", "Contents", "MacOS", "Jig"),
}[process.platform as "linux" | "win32" | "darwin"];

// Runs after `npm run dist`; skipped otherwise.
test.skip(!executable || !existsSync(executable), "no packaged build (run npm run dist)");

test("the packaged app starts, loads the built-in add-ons and opens Get started", async () => {
  const home = await mkdtemp(join(tmpdir(), "jig-e2e-"));
  const app = await electron.launch({
    executablePath: executable!,
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    env: { ...process.env, JIG_HOME: home, JIG_ENGINE: "fake" } as Record<string, string>,
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await expect(page.getByTestId("setup-tab")).toBeVisible({ timeout: 20000 });
    // The Git add-on comes from resources/addons and bundles its host code with the packaged esbuild.
    await expect(page.getByTestId("view-tab-addon.git.git")).toHaveCount(1, { timeout: 20000 });
    await page.getByTestId("setup-done").click();
    await expect(page.getByTestId("setup-tab")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});
