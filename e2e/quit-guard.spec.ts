import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

/** An add-on whose quit guard always asks; its action writes `marker`, then Jig quits (D-343). */
async function installGuard(jigHome: string, marker: string) {
  const dir = join(jigHome, "addons", "guard");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "addon.json"),
    JSON.stringify({
      id: "guard",
      name: "Shop sync",
      description: "A test add-on that asks before Jig quits",
      icon: "refresh-cw",
      permissions: [],
      contributes: { quitGuards: [{ id: "sync", run: "beforeQuit" }] },
    }),
  );
  await writeFile(
    join(dir, "host.ts"),
    `import { writeFile } from "node:fs/promises";
export function beforeQuit() {
  return {
    message: "A sync to Contoso is running",
    detail: "Quitting stops it halfway.",
    actions: [{ id: "save", label: "Finish and quit", run: "finish", args: { file: ${JSON.stringify(marker)} } }],
  };
}
export async function finish(args: { file: string }) {
  await writeFile(args.file, "finished");
}
`,
  );
}

test("an add-on's quit guard asks before Jig closes; Cancel keeps it open, an action runs and quits", async () => {
  const jigHome = await mkdtemp(join(tmpdir(), "jig-e2e-"));
  const marker = join(jigHome, "finished.txt");
  await installGuard(jigHome, marker);
  // Hidden Jig never asks before quitting, unless a test opts in.
  const app = await launchJig(jigHome, { JIG_ASK_BEFORE_QUIT: "1" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await expect
      .poll(async () => {
        const list = (await hostCall(page, "addons.list")) as {
          value: Array<{ id: string; hasHost: boolean }>;
        };
        return list.value.some((a) => a.id === "guard" && a.hasHost);
      })
      .toBe(true);

    // Closing the last window (Alt+F4, the window's ×) asks in Jig's own modal.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("meeting"))
        ?.close();
    });
    const dialog = page.getByTestId("quit-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("quit-reason")).toContainText("A sync to Contoso is running");
    await expect(dialog.getByTestId("quit-reason")).toContainText("Shop sync");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("app-root")).toBeVisible();

    // Quitting from the menu asks again; the reason's action runs, then Jig quits.
    const closed = app.waitForEvent("close");
    await app.evaluate(({ app: electronApp }) => electronApp.quit());
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Finish and quit" }).click();
    await closed;
    expect(existsSync(marker)).toBe(true);
    expect(await readFile(marker, "utf8")).toBe("finished");
  } finally {
    await app.close().catch(() => undefined);
    await rm(jigHome, { recursive: true, force: true });
  }
});
