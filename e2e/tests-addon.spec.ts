import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, settledBox, test } from "./fixtures";

/** A repository whose test scripts print what Vitest and Playwright print. */
async function shopWithTests(jigHome: string) {
  const dir = join(jigHome, "shop");
  await mkdir(join(dir, "tests"), { recursive: true });
  await writeFile(
    join(dir, "tests", "unit.cjs"),
    'console.log(" ✓ src/cart.test.ts (3 tests) 4ms");\nconsole.log("      Tests  3 passed (3)");\n',
  );
  await writeFile(
    join(dir, "tests", "e2e.cjs"),
    [
      'console.log("Running 2 tests using 2 workers");',
      'console.log("  ok   1 e2e\\\\cart.spec.ts:3:1 › adds to the cart (1.2s)");',
      'console.log("  x    2 e2e\\\\checkout.spec.ts:9:1 › pays with a discount code (2.0s)");',
      'console.log("");',
      'console.log("  1 failed");',
      'console.log("  1 passed (3.1s)");',
      "process.exit(1);",
    ].join("\n"),
  );
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "shop",
      scripts: {
        dev: "vite",
        test: "node tests/unit.cjs",
        "test:watch": "vitest",
        e2e: "node tests/e2e.cjs",
      },
    }),
  );
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  return dir;
}

test("Tests: finds a repository's suites, runs them, shows failures and history; Claude runs them too", async ({
  page,
  jigHome,
}) => {
  await shopWithTests(jigHome);
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show tests");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("tests-view");

  // npm scripts that run tests, unit before end-to-end; not dev or a watcher.
  const unit = view.getByTestId("tests-suite-npm:test");
  const e2e = view.getByTestId("tests-suite-npm:e2e");
  await expect(unit).toBeVisible();
  await expect(e2e).toBeVisible();
  await expect(view.locator("[data-testid^=tests-suite-]")).toHaveCount(2);
  const rowBefore = await settledBox(unit);

  // Run from the row's button: the result fills its columns; the row doesn't move or resize.
  await view.getByTestId("tests-run-npm:test").click();
  await expect(unit).toContainText("3 passed", { timeout: 20000 });
  expect(await unit.boundingBox()).toEqual(rowBefore);
  await expect(page.getByTestId("toast").filter({ hasText: "test: passed" })).toBeVisible();

  // A failing suite: the row says so; its details list the failing test and offer Ask Claude.
  await view.getByTestId("tests-run-npm:e2e").click();
  await expect(e2e).toContainText("1 failed", { timeout: 20000 });
  await e2e.click();
  const details = page.getByTestId("tests-details");
  await expect(details).toContainText("checkout.spec.ts › pays with a discount code");
  await expect(details.getByTestId("tests-output")).toContainText("1 failed");
  await expect(details.getByTestId("tests-ask-claude")).toBeVisible();
  await details.getByRole("tab", { name: /History/ }).click();
  await expect(details.getByTestId("tests-history-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);

  // Claude lists the suites and runs one with the add-on's tools.
  await page.keyboard.press("Control+N");
  await page.getByTestId("composer-input").fill("run the unit tests");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("turn-result")).toHaveCount(1, { timeout: 30000 });
  // It started the run without waiting and got the result from addon_tests_wait (D-359).
  await expect(page.getByTestId("chat")).toContainText(/The unit tests ran\. test: passed \(exit 0/);
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("show tests");
  await page.keyboard.press("Enter");
  await unit.click();
  await details.getByRole("tab", { name: /History/ }).click();
  await expect(details.getByTestId("tests-history-row")).toHaveCount(2);
  await expect(details.getByTestId("tests-history-row").first()).toContainText("Jig");
});
