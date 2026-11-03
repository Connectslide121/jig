import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

const out = process.env.SHOTS_DIR!;
for (const theme of ["jig-dark", "jig-light"]) {
  for (const width of [1400, 760]) {
    test(`voice page ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await hostCall(page, "config.update", { appearance: { themeId: theme } });
      await page.getByTestId("jig-menu").click();
      await page.getByRole("menuitem", { name: "Voice commands" }).click();
      await expect(page.getByTestId("voice-commands")).toBeVisible();
      await page.waitForTimeout(800);
      console.log("LI", await page.evaluate(() => { const li = document.querySelector('[data-testid="voice-commands"] li')!; const c = li.closest("[data-testid=voice-commands]")!; const cs = getComputedStyle(li); return [cs.display, cs.flexDirection, cs.alignItems, li.className, getComputedStyle(c).containerType, c.getBoundingClientRect().width].join(" | "); }));
      await page.screenshot({ path: join(out, `${theme}-${width}-a.png`) });
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, `${theme}-${width}-b.png`) });
    });
  }
}
