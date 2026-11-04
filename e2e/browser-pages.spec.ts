import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, hostCall, test } from "./fixtures";

const DONE = "I opened the page in my browser and took a screenshot.";
const page = (title: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><button>Go</button></body></html>`;

test("Claude's browser: two chats browse at once, each on its own page, one tab each", async ({
  page: window,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "a.html"), page("Cart A"));
  await writeFile(join(dir, "b.html"), page("Search B"));
  const project = (await hostCall(window, "projects.add", { path: dir })) as { value: { id: string } };
  const chat = async (title: string) =>
    (
      (await hostCall(window, "sessions.create", { projectId: project.value.id, cwd: dir, title })) as {
        value: { id: string };
      }
    ).value.id;
  const transcript = async (id: string) => JSON.stringify(await hostCall(window, "sessions.get", { id }));
  const checkout = await chat("Checkout");
  const search = await chat("Search");

  // Both chats browse at the same time, each its own page.
  await Promise.all([
    hostCall(window, "sessions.send", {
      id: checkout,
      text: `browse ${pathToFileURL(join(dir, "a.html")).href}`,
    }),
    hostCall(window, "sessions.send", {
      id: search,
      text: `browse ${pathToFileURL(join(dir, "b.html")).href}`,
    }),
  ]);
  await expect.poll(() => transcript(checkout), { timeout: 30000 }).toContain(DONE);
  await expect.poll(() => transcript(search), { timeout: 30000 }).toContain(DONE);

  // Each chat reads its own page: the other chat's page never moved it.
  await hostCall(window, "sessions.send", { id: checkout, text: "read the browser page" });
  await expect.poll(() => transcript(checkout), { timeout: 20000 }).toContain('My page: Page: \\"Cart A\\"');
  await hostCall(window, "sessions.send", { id: search, text: "read the browser page" });
  await expect.poll(() => transcript(search), { timeout: 20000 }).toContain('My page: Page: \\"Search B\\"');
  const states = async () =>
    JSON.stringify([
      await hostCall(window, "browser.state", { chatId: checkout }),
      await hostCall(window, "browser.state", { chatId: search }),
    ]);
  expect(await states()).toMatch(/a\.html.*b\.html/);

  // The view shows one tab per page; clicking one shows that page and its address.
  const view = window.getByTestId("browser-view");
  await expect(view).toBeVisible();
  const tabs = view.getByTestId("browser-tab");
  await expect(tabs).toHaveCount(2);
  const tabOf = (id: string) => view.locator(`[data-testid="browser-tab"][data-chat="${id}"]`);
  // One line per tab: the page title is in its tooltip (and the address row), not under the name.
  await expect(tabOf(checkout)).toHaveAttribute("title", /\nCart A$/);
  await expect(tabOf(search)).toHaveAttribute("title", /\nSearch B$/);
  await tabOf(checkout).click();
  await expect(tabOf(checkout)).toHaveAttribute("aria-selected", "true");
  await expect(view.getByTestId("browser-address")).toHaveValue(/a\.html$/);
  await expect(view.getByTestId("browser-frame")).toBeVisible({ timeout: 10000 });
  await tabOf(search).click();
  await expect(view.getByTestId("browser-address")).toHaveValue(/b\.html$/);
  await window.screenshot({ path: "test-results/claude-browser-pages.png" });

  // Close page from the tab's ⋯: its tab goes, and nothing below the tabs moves.
  const address = await view.getByTestId("browser-address").boundingBox();
  await tabOf(search).getByTestId("browser-tab-menu").click();
  await window.getByTestId("browser-tab-close").click();
  await expect(tabs).toHaveCount(1);
  expect((await view.getByTestId("browser-address").boundingBox())?.y).toBe(address?.y);
  await expect(view.getByTestId("browser-address")).toHaveValue(/a\.html$/);
  expect(JSON.stringify(await hostCall(window, "browser.state", { chatId: search }))).toContain(
    '"open":false',
  );

  // A deleted chat's page closes with it.
  await hostCall(window, "sessions.delete", { id: checkout });
  await expect(tabs).toHaveCount(0);
});
