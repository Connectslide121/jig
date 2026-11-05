import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

// D-374: nothing takes the keyboard focus from where you type, except something you just asked for.
test("typing in a chat stays in its message box while Claude starts a terminal", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "app");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.keyboard.press("Control+N");
  const input = page.getByTestId("composer-input");
  await input.fill("build it in a jig terminal");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("");

  // You keep typing your next message while the chat starts its terminal, which shows itself.
  const next = "and then check the cart page please";
  await page.keyboard.type(next, { delay: 60 });
  await expect(page.getByTestId("chat")).toContainText("I'll hear when it ends.", { timeout: 15000 });
  await expect(page.getByTestId("terminals-view")).toBeVisible();
  await page.keyboard.type(" too");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${next} too`);

  // A shortcut you press is a request: the new terminal takes the focus.
  await page.keyboard.press("Control+`");
  await expect(page.locator(".jig-xterm:visible .xterm-helper-textarea")).toBeFocused();
  await expect(input).toHaveValue(`${next} too`);
});
