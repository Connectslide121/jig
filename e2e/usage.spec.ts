import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

test("plan usage is always in the status bar and on the chat header, with a card on hover", async ({
  page,
  jigHome,
}) => {
  // The fake engine reports 42 % of the 5-hour window and 18 % of the week.
  const status = page.getByTestId("usage-status");
  await expect(status.getByTestId("usage-mini-five_hour")).toContainText(/5h\s*42%\s*2h 1[23]m/, {
    timeout: 15000,
  });
  await expect(status.getByTestId("usage-mini-seven_day")).toContainText("18%");
  await status.hover();
  const card = page.getByTestId("usage-card");
  await expect(card).toContainText("Current session (5 h)");
  await expect(card.getByTestId("usage-window-five_hour")).toContainText("42%");
  await expect(card.getByTestId("usage-window-five_hour")).toContainText(/Resets in 2 h 1[23] min/);
  await expect(card.getByTestId("usage-window-seven_day")).toContainText("This week (all models)");
  await expect(card.getByTestId("usage-window-model:Fable")).toContainText("This week (Fable)");
  await expect(card.getByTestId("usage-window-model:Fable")).toContainText("31%");
  await expect(card).toContainText("Max");
  await page.mouse.move(600, 300);
  await expect(card).toHaveCount(0);

  // The status bar is the one place it shows: no ring on the chat header.
  const dir = join(jigHome, "demo");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await expect(page.getByTestId("usage-ring")).toHaveCount(0);
});

test("usage says so when plan limits don't apply, and warns near the limit", async () => {
  for (const [env, expected] of [
    [{ JIG_FAKE_USAGE: "unavailable" }, "usage n/a"],
    [
      {
        JIG_FAKE_USAGE: JSON.stringify({
          subscription_type: "pro",
          rate_limits_available: true,
          rate_limits: {
            five_hour: { utilization: 93, resets_at: null },
            seven_day: { utilization: 60, resets_at: null },
          },
        }),
      },
      "5h93%wk60%",
    ],
  ] as const) {
    const home = await mkdtemp(join(tmpdir(), "jig-e2e-"));
    const app = await launchJig(home, env);
    try {
      const page = await app.firstWindow();
      const status = page.getByTestId("usage-status");
      await expect(status).toHaveText(expected, { timeout: 15000 });
      if (expected.startsWith("5h")) await expect(status).toHaveClass(/text-danger/);
      else {
        await status.hover();
        await expect(page.getByTestId("usage-card")).toContainText("isn't signed in with one");
      }
    } finally {
      await app.close();
      await rm(home, { recursive: true, force: true });
    }
  }
});
