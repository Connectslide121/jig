import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SessionSnapshot } from "../apps/desktop/src/shared/engine";
import { expect, hostCall, test } from "./fixtures";

test("Skills library: topbar access, stable details, global switches and project selection reach chats", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  const shop = (await hostCall(page, "projects.create", { name: "Shop", path: dir })) as {
    value: { id: string };
  };
  const blog = (await hostCall(page, "projects.create", { name: "Blog", path: dir })) as {
    value: { id: string };
  };
  const openLibrary = async () => {
    await page.getByTestId("tools-group-Chats").click();
    await page.getByRole("menuitem", { name: "Skills library", exact: true }).click();
  };
  await openLibrary();
  const library = page.getByTestId("skills-library");
  await expect(library.getByRole("switch")).toHaveCount(14);
  // Jig factory's skills start off (D-441); the others start on.
  const factorySkills = [
    "web-artifacts",
    "theme-factory",
    "webapp-testing",
    "web-design-guidelines",
    "demo-quality",
  ];
  for (const id of factorySkills)
    await expect(library.getByTestId(`skill-${id}`).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  await expect(library.getByRole("switch", { checked: true })).toHaveCount(9);
  const critic = library.getByTestId("skill-demo-quality").getByRole("switch");
  await critic.click();
  await expect(critic).toHaveAttribute("aria-checked", "true");
  const row = library.getByTestId("skill-frontend-design");
  const position = await row.boundingBox();
  await row.getByTestId("skill-name-frontend-design").click();
  const details = page.getByTestId("skill-details");
  await expect(details).toContainText("Apache-2.0");
  await expect(details).toContainText("anthropics");
  expect(await row.boundingBox()).toEqual(position);
  await expect(page.locator(".jig-modal-layer")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/skill-details.png" });
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await row.getByTestId("skill-projects-frontend-design").click();
  const picker = page.getByTestId("skill-projects");
  await expect(picker.getByRole("checkbox", { name: "Include Shop" })).toBeChecked();
  await picker.getByRole("checkbox", { name: "Include Shop" }).uncheck();
  await picker.getByRole("checkbox", { name: "Include Blog" }).check();
  expect(await row.boundingBox()).toEqual(position);
  await expect(page.locator(".jig-modal-layer")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/skill-projects.png" });
  await picker.getByTestId("skill-projects-apply").click();
  await expect(picker).toHaveCount(0);
  await expect(row).toContainText("1 excluded");
  await row.getByRole("switch").click();
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await row.getByTestId("skill-projects-frontend-design").click();
  await expect(picker).toContainText("globally off");
  await expect(picker.getByRole("checkbox", { name: "Include Shop" })).not.toBeChecked();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await row.getByRole("switch").click();
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(row).toContainText("1 excluded");
  await library.getByRole("textbox", { name: "Find skills" }).fill("security");
  await expect(library.getByTestId("skill-application-security")).toBeVisible();
  await expect(row).toHaveCount(0);
  await library.getByRole("textbox", { name: "Find skills" }).fill("");
  await page.screenshot({ path: "test-results/skills-library.png" });
  // Use separate chats at the same folder: project exclusions must never follow the active UI project.
  const create = async (projectId: string) =>
    ((await hostCall(page, "sessions.create", { projectId, cwd: dir })) as { value: { id: string } }).value
      .id;
  const reply = async (id: string, turns: number) => {
    await hostCall(page, "sessions.send", { id, text: "list jig library skills" });
    await expect
      .poll(
        async () =>
          ((await hostCall(page, "sessions.get", { id })) as { value: SessionSnapshot }).value.meta.turns,
      )
      .toBe(turns);
    const snap = ((await hostCall(page, "sessions.get", { id })) as { value: SessionSnapshot }).value;
    const item = snap.items.filter((i) => i.kind === "assistant").at(-1);
    return item?.kind === "assistant" ? item.text : "";
  };
  const shopChat = await create(shop.value.id);
  const blogChat = await create(blog.value.id);
  expect(await reply(shopChat, 1)).not.toContain("frontend-design");
  expect(await reply(blogChat, 1)).toContain("frontend-design");
  await row.getByRole("switch").click();
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  expect(await reply(blogChat, 2)).not.toContain("frontend-design");
  await row.getByRole("switch").click();
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  const next = (await hostCall(page, "projects.create", { name: "New project", path: dir })) as {
    value: { id: string };
  };
  expect(await reply(await create(next.value.id), 1)).toContain("frontend-design");
  await page.reload();
  await expect(row).toContainText("1 excluded");
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  const refused = await hostCall(page, "skills.details", { id: "../../config.json" });
  expect(refused).toMatchObject({ ok: false });
});
