/**
 * Screenshots of a UI state for a design check, the example to copy (docs/guides/testing.md → "Put the
 * UI in a state and screenshot it"). Skipped unless JIG_UI_SHOTS=1:
 *   npm run build && JIG_UI_SHOTS=1 npx playwright test e2e/ui-shots.spec.ts
 * The pictures land in .tmp/shots/ (<name>-sidebar.png, -bottom.png, -tab.png).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AZ_ARGV, expect, hostCall, test } from "./fixtures";
import { SHOTS_DIR, shootView } from "./shots";

test.skip(!process.env.JIG_UI_SHOTS, "set JIG_UI_SHOTS=1 to take the design-check screenshots");

test("Tasks queue with every kind of row and a parked pool, at all three widths", async ({
  page,
  jigHome,
}) => {
  test.setTimeout(120_000);
  await mkdir(join(jigHome, "shop"), { recursive: true });
  await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
  const projects = (await hostCall(page, "projects.list")) as {
    value: { projects: Array<{ id: string }> };
  };
  const projectId = projects.value.projects[0]!.id;
  await hostCall(page, "projects.setActive", { id: projectId });

  // The state: done, failed, running (held by the fake engine), up next, left out and two parked ideas.
  const tasks = (method: string, args: Record<string, unknown> = {}) =>
    hostCall(page, "addons.call", { id: "tasks", method, args: { projectId, ...args } });
  await tasks("add", {
    prompts: [
      "update the readme",
      "fail this task please",
      "hold until released while the checkout is rebuilt",
      "write the changelog",
      "tidy the styles",
    ],
    newChat: true,
  });
  await tasks("add", {
    prompts: ["try a dark theme for the shop", "a search that forgives typos"],
    newChat: true,
    parked: true,
  });
  await tasks("setStopOnFailure", { on: false });
  await tasks("select", { ids: ["t5"], on: false });
  await tasks("start");
  const status = async () =>
    ((await tasks("list")) as { value: { tasks: Array<{ id: string; status: string }> } }).value.tasks.map(
      (t) => `${t.id}:${t.status}`,
    );
  await expect.poll(status, { timeout: 30_000 }).toContain("t3:running");
  expect(await status()).toEqual(expect.arrayContaining(["t1:done", "t2:failed", "t4:queued"]));

  const shots = await shootView(page, "addon.tasks.tasks", "tasks-queue", {
    ready: (panel) => expect(panel.getByTestId("task-status-t3")).toContainText("Running"),
  });
  console.log(shots.join("\n"));
  // The parked pool at the end of the queue, in the tab (the last placement), scrolled into view.
  await page.getByTestId("tasks-pool").scrollIntoViewIfNeeded();
  const pool = join(SHOTS_DIR, "tasks-queue-pool-tab.png");
  await page.screenshot({ path: pool });
  console.log(pool);

  // Let the held turn finish, so the app closes without a turn in progress.
  expect(await hostCall(page, "fake.release", { match: "hold until released" })).toEqual({
    ok: true,
    value: 1,
  });
});

/** An `az` for the Teams setup shots: answers like the Azure CLI, and fails at the storage account. */
const SHOTS_AZ = `
const args = ${AZ_ARGV};
const line = args.join(" ");
const out = (v) => console.log(JSON.stringify(v));
const TENANT = "11111111-1111-4111-8111-111111111111";
if (line.startsWith("account show")) out({ tenantId: TENANT, user: "ann@contoso.example.com", tenant: "Contoso" });
else if (line.startsWith("account list")) out([{ id: "22222222-2222-4222-8222-222222222222", name: "Contoso dev", tenantId: TENANT, isDefault: true }, { id: "44444444-4444-4444-8444-444444444444", name: "Fabrikam prod", tenantId: "other", isDefault: false }]);
else if (line.startsWith("functionapp list-flexconsumption-locations")) out(["westeurope", "northeurope", "eastus"]);
else if (line.startsWith("ad app create")) out({ appId: "33333333-3333-4333-8333-333333333333" });
else if (line.startsWith("storage account create")) { console.error("ERROR: (StorageAccountAlreadyTaken) The storage account named jigphonexxxxxx is already taken."); process.exit(1); }
else if (line.startsWith("provider register")) process.exit(0);
else out({ id: "x" });
`;

test("Teams setup modal and Settings → Phone, in Dark, Light and an imported theme, narrow and wide", async ({
  page,
  app,
  jigHome,
}) => {
  test.setTimeout(180_000);
  const bin = join(jigHome, "fake-bin");
  await writeFile(join(bin, "az-signed-out.cjs"), SHOTS_AZ);
  await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${SHOTS_AZ}`);
  const themes = join(jigHome, "themes");
  await mkdir(themes, { recursive: true });
  // Like an imported VS Code theme: Solarized Light's colours.
  await writeFile(
    join(themes, "solarized.json"),
    JSON.stringify({
      label: "Solarized Light",
      appearance: "light",
      colors: { canvas: "#fdf6e3", surface: "#eee8d5", fg: "#586e75", accent: "#268bd2", line: "#d3cbb7" },
    }),
  );
  await hostCall(page, "config.update", { phone: { channel: "teams" } });
  await mkdir(SHOTS_DIR, { recursive: true });
  const size = (width: number, height: number) =>
    app.evaluate(
      ({ BrowserWindow }, [w, h]) => {
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().startsWith("jig-app:"))!
          .setContentSize(w!, h!);
      },
      [width, height],
    );

  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-phone").click();
  await page.getByTestId("phone-setup").click();
  const dialog = page.getByTestId("teams-setup-dialog");
  await expect(dialog.getByTestId("teams-tenant")).toContainText("Contoso");
  await expect(dialog.getByTestId("teams-region")).toHaveValue("westeurope");
  const shoot = async (name: string) => {
    for (const [label, w, h] of [
      ["wide", 1400, 900],
      ["narrow", 760, 720],
    ] as const) {
      await size(w, h);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(SHOTS_DIR, `teams-setup-${name}-${label}.png`) });
    }
  };
  await shoot("where-dark");
  await dialog.getByTestId("teams-create").click();
  await expect(dialog.getByTestId("teams-step-storage").locator("[data-status]")).toHaveAttribute(
    "data-status",
    "failed",
    { timeout: 30000 },
  );
  await shoot("failed-dark");
  await hostCall(page, "config.update", { appearance: { themeId: "jig-light" } });
  await shoot("failed-light");
  await expect
    .poll(async () =>
      ((await hostCall(page, "themes.list")) as { value: { id: string }[] }).value.map((t) => t.id),
    )
    .toContain("user:solarized");
  await hostCall(page, "config.update", { appearance: { themeId: "user:solarized" } });
  await dialog.getByTestId("teams-step-upload").click();
  await shoot("teams-imported");
  await page.keyboard.press("Escape");
  for (const theme of ["jig-dark", "jig-light", "user:solarized"]) {
    await hostCall(page, "config.update", { appearance: { themeId: theme } });
    await size(1400, 900);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, `phone-settings-${theme.replace(":", "-")}-wide.png`) });
    await size(760, 720);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS_DIR, `phone-settings-${theme.replace(":", "-")}-narrow.png`) });
  }
});
