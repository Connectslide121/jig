import { expect, test } from "./fixtures";

const update = (state: Record<string, unknown>) => ({
  mode: "release",
  current: "0.1.3",
  latest: "0.1.4",
  available: true,
  detail: "Jig 0.1.4 is available.",
  ...state,
});

test("updates: a found update is a toast to download, a downloaded one a toast to install", async ({
  app,
  page,
}) => {
  const send = (state: Record<string, unknown>) =>
    app.evaluate(({ BrowserWindow }, payload) => {
      for (const w of BrowserWindow.getAllWindows())
        w.webContents.send("jig:event", "updates.state", payload);
    }, update(state));

  // The check when Jig opens only tells: nothing downloads until the user presses Download.
  await send({});
  const available = page.getByText("Jig 0.1.4 is available").locator("xpath=ancestor::*[.//button][1]");
  await expect(available).toBeVisible();
  await expect(available.getByRole("button", { name: "Download", exact: true })).toBeVisible();
  await expect(available.getByRole("button", { name: "Details", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/update-available-toast.png" });
  // The same notice shows once per run.
  await send({});
  await expect(page.getByText("Jig 0.1.4 is available")).toHaveCount(1);
  await available.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByTestId("updates-card")).toBeVisible();

  await send({ download: "ready", percent: 100, detail: "Jig 0.1.4 is ready to install." });
  await expect(page.getByRole("button", { name: "Install and restart" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/update-ready-toast.png" });
});
