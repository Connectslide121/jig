import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { AZ_ARGV, expect, hostCall, settledBox, test } from "./fixtures";

/**
 * An `az` that answers like Azure DevOps: one organisation (contoso), projects Shop and Portal, two
 * teams with their boards, and the Web team's Stories board with three columns and four cards.
 */
const FAKE_AZ = `
const args = ${AZ_ARGV};
const has = (...words) => words.every((w) => args.includes(w));
const say = (value) => { process.stdout.write(JSON.stringify(value)); process.exit(0); };
const uri = args.includes("--uri") ? args[args.indexOf("--uri") + 1] : "";
const card = (id, title, type, state, column, who) => ({ id, fields: {
  "System.Id": id, "System.Title": title, "System.WorkItemType": type, "System.State": state,
  "WEF_1_Kanban.Column": column, ...(who ? { "System.AssignedTo": { displayName: who, uniqueName: who.toLowerCase().replace(" ", ".") + "@contoso.com" } } : {}),
}});
const tagged = (c, tags) => { c.fields["System.Tags"] = tags; return c; };
if (uri.endsWith("/profiles/me")) say({ id: "me-1" });
if (uri.endsWith("/_apis/accounts")) say({ value: [{ accountName: "contoso" }] });
if (has("devops", "project", "list")) say({ value: [{ name: "Portal" }, { name: "Shop" }] });
if (has("devops", "team", "list")) say([{ name: "Web" }, { name: "Mobile" }]);
if (/\\/(Web|Mobile)\\/_apis\\/work\\/boards$/.test(uri)) say({ value: [
  { id: "b-stories", name: "Stories" }, { id: "b-features", name: "Features" },
]});
if (uri.endsWith("/Web/_apis/work/boards/b-stories")) say({
  columns: [
    { id: "c1", name: "New", columnType: "incoming", itemLimit: 0, stateMappings: { "User Story": "New", Bug: "New" } },
    { id: "c2", name: "Doing", columnType: "inProgress", itemLimit: 1, stateMappings: { "User Story": "Active", Bug: "Active" } },
    { id: "c3", name: "Closed", columnType: "outgoing", itemLimit: 0, stateMappings: { "User Story": "Closed", Bug: "Closed" } },
  ],
  fields: { columnField: { referenceName: "WEF_1_Kanban.Column" } },
});
if (uri.endsWith("/teamfieldvalues")) say({ field: { referenceName: "System.AreaPath" }, defaultValue: "Shop\\\\Web", values: [{ value: "Shop\\\\Web", includeChildren: true }] });
// Managing cards (D-262): writes are logged next to this script, for the test to read.
const log = (line) => require("node:fs").appendFileSync(require("node:path").join(__dirname, "az-writes.log"), line + "\\n");
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
if (has("boards", "work-item", "show")) say({ id: Number(arg("--id")), fields: {
  "System.Id": Number(arg("--id")), "System.Title": "Checkout fails with a saved card", "System.WorkItemType": "Bug",
  "System.State": "Active", "WEF_1_Kanban.Column": "Doing", "System.AssignedTo": { displayName: "Ann Demo" },
  "System.Description": "<div>Paying with a saved card fails.</div>", "System.Tags": "checkout; payments",
  "Microsoft.VSTS.Common.Priority": 2, "System.AreaPath": "Shop\\\\Web",
}, relations: [] });
if (uri.endsWith("/comments")) say({ comments: [{ text: "<div>Seen on mobile too.</div>", createdBy: { displayName: "Ben Sample" }, createdDate: "2026-11-01T10:00:00Z" }] });
if (uri.includes("/workitemtypes/")) say({ value: [{ name: "New" }, { name: "Active" }, { name: "Closed" }] });
if (has("boards", "work-item", "update")) { log("update " + args.join(" ")); say(card(Number(arg("--id")), "x", "Bug", "Active", "Doing")); }
if (has("boards", "work-item", "create")) { log("create " + args.join(" ")); say(card(105, arg("--title"), arg("--type"), "New", "New")); }
if (has("rest", "delete") && /\\/_apis\\/wit\\/workitems\\/\\d+$/.test(uri)) { log("delete " + args.join(" ")); say({ id: Number(uri.split("/").pop()), code: 200 }); }
if (has("boards", "query")) {
  const wiql = args[args.indexOf("--wiql") + 1];
  if (!wiql.includes("UNDER 'Shop\\\\Web'") || !wiql.includes("[WEF_1_Kanban.Column]")) { console.error("unexpected query " + wiql); process.exit(1); }
  say([
    tagged(card(101, "Checkout fails with a saved card", "Bug", "Active", "Doing", "Ann Demo"), "checkout; payments"),
    card(102, "Add a wish list", "User Story", "New", "New"),
    card(103, "Write the release notes", "User Story", "Closed", "Closed", "Ben Sample"),
    card(104, "Show delivery dates", "User Story", "Active", "Doing"),
  ]);
}
// Adding a tenant (D-282): the browser sign-in and who it is.
if (args[0] === "login") process.exit(0);
if (has("account", "show")) say({ tenantId: "22222222-2222-4222-8222-222222222222", tenantDisplayName: "Northwind", user: { name: "ann@northwind.example.com" } });
console.error("ERROR: Please run 'az login' to setup account.");
process.exit(1);
`;

async function setUp(page: Page, jigHome: string, signedIn: boolean) {
  if (signedIn) {
    const bin = join(jigHome, "fake-bin");
    await writeFile(join(bin, "az-signed-out.cjs"), FAKE_AZ);
    await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${FAKE_AZ}`);
  }
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await hostCall(page, "projects.add", { path: dir });
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("boards");
  await page.keyboard.press("Enter");
  const view = page.getByTestId("boards-view");
  await expect(view).toBeVisible();
  return view;
}

test("Boards: pick team boards found in Azure DevOps; columns and cards like Azure DevOps; a chat about a card", async ({
  page,
  jigHome,
}) => {
  const view = await setUp(page, jigHome, true);
  await view.getByTestId("boards-add-first").click();
  const dialog = page.getByTestId("boards-dialog");
  // The organisation is found from the az login; the Azure DevOps project named like the Jig one is picked.
  await expect(dialog.getByTestId("boards-org")).toHaveValue("contoso");
  await expect(dialog.getByTestId("boards-project")).toHaveValue("Shop");
  await dialog.getByTestId("boards-pick-Web-Stories").click();
  await dialog.getByTestId("boards-pick-Mobile-Features").click();
  await dialog.getByTestId("boards-add-picked").click();

  // Two teams followed: each tab says which team.
  await expect(view.getByTestId("board-tab-Web · Stories")).toBeVisible();
  await expect(view.getByTestId("board-tab-Mobile · Features")).toBeVisible();
  await view.getByTestId("board-tab-Web · Stories").click();
  await expect(view.getByTestId("board-item-101")).toContainText("Checkout fails with a saved card");
  // Who has it: an avatar at the far right (initials without the meeting sign-in), an empty slot of
  // the same size when nobody has it (D-291).
  const avatar = view.getByTestId("board-item-avatar-101");
  await expect(avatar).toHaveText("AD");
  await expect(avatar).toHaveAttribute("aria-label", "Ann Demo (ann.demo@contoso.com)");
  await expect(view.getByTestId("board-item-avatar-102")).toHaveText("");
  const left = async (id: number) => (await view.getByTestId(`board-item-avatar-${id}`).boundingBox())?.x;
  expect(await left(101)).toBe(await left(104));
  const columns = await view
    .locator("[data-testid^='board-column-']")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(columns).toEqual(["board-column-New", "board-column-Doing", "board-column-Closed"]);
  // Over its WIP limit (2 of 1).
  await expect(view.getByTestId("board-column-Doing")).toContainText("2/1");
  // One slider sets every column's width.
  await view.getByTestId("boards-width").fill("400");
  for (const name of ["New", "Doing", "Closed"])
    await expect(view.getByTestId(`board-column-${name}`)).toHaveCSS("width", "400px");
  // The width is kept: it comes back after a reload.
  await expect(view.getByTestId("boards-width")).toHaveValue("400");
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByTestId("board-column-New")).toHaveCSS("width", "400px");
  await expect(page.getByTestId("boards-width")).toHaveValue("400");
  await expect(view.getByTestId("board-column-Doing").getByTestId("board-item-104")).toBeVisible();

  // Followed boards show as added the next time.
  await view.getByTestId("boards-add").click();
  await expect(dialog.getByTestId("boards-pick-Web-Stories")).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await view.getByTestId("board-item-101").click({ button: "right" });
  await page.getByTestId("board-item-chat").click();
  await expect(page.getByTestId("composer-input")).toContainText(
    "Bug #101: Checkout fails with a saved card",
  );
});

test("Boards: az signed out says how to sign in", async ({ page, jigHome }) => {
  const view = await setUp(page, jigHome, false);
  await view.getByTestId("boards-add-first").click();
  const dialog = page.getByTestId("boards-dialog");
  await expect(dialog.getByTestId("boards-find-error")).toContainText("az login");
  await expect(dialog.getByTestId("boards-add-picked")).toBeDisabled();
});

test("Boards: open a card in Jig, edit it, drag it, add and delete cards; Claude's tools read the board", async ({
  page,
  jigHome,
}) => {
  const view = await setUp(page, jigHome, true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await view.getByTestId("boards-add-first").click();
  const dialog = page.getByTestId("boards-dialog");
  await dialog.getByTestId("boards-pick-Web-Stories").click();
  await dialog.getByTestId("boards-add-picked").click();
  await expect(view.getByTestId("board-item-101")).toBeVisible();
  const writes = async () => readFile(join(jigHome, "fake-bin", "az-writes.log"), "utf8").catch(() => "");

  // A click opens the card in Jig: description, tags, comments; edit and save.
  await view.getByTestId("board-item-101").click();
  const card = page.getByTestId("board-card-dialog");
  await expect(card.getByTestId("board-card-description")).toHaveValue("Paying with a saved card fails.");
  await expect(card.getByTestId("board-card-comments")).toContainText("Seen on mobile too.");
  await page.screenshot({ path: test.info().outputPath("card.png") });
  await card.getByTestId("board-card-title").fill("Checkout fails with a saved Visa card");
  await card.getByTestId("board-card-save").click();
  await expect(card).toBeHidden();
  await expect.poll(writes).toContain("--title Checkout fails with a saved Visa card");

  // Drag a card to another column: its column and the column's state go to Azure DevOps.
  await view.getByTestId("board-item-102").dragTo(view.getByTestId("board-column-Doing"));
  await expect.poll(writes).toContain("--id 102");
  expect(await writes()).toMatch(/--id 102 .*--state Active .*WEF_1_Kanban\.Column=Doing/);

  // A new card in a column.
  await view.getByTestId("board-new-New").click();
  // Free text reaches az as written: quotes, %, and non-ASCII (D-290).
  await page.getByTestId("board-new-card-title").fill('Gift cards – "10 % off" › Malmö…');
  await page.getByTestId("board-new-card-create").click();
  await expect.poll(writes).toContain('--title Gift cards – "10 % off" › Malmö… ');
  expect(await writes()).toMatch(/create .*--area Shop/);

  // Delete from the card menu, after asking.
  await view.getByTestId("board-item-103").click({ button: "right" });
  await page.getByTestId("board-item-delete").click();
  await page.getByTestId("dialog-confirm").click();
  // Through the REST API: `az boards work-item delete` answers in plain text, not JSON.
  await expect.poll(writes).toMatch(/delete .*\/_apis\/wit\/workitems\/103 /);

  // Claude's tools read the same board for the chat's project.
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const projectId = projects.value.projects[0]!.id;
  const listed = (await hostCall(page, "addons.call", {
    id: "boards",
    method: "toolCards",
    args: { chat: { projectId }, column: "Doing" },
  })) as { value: string };
  expect(listed.value).toContain("## Doing");
  expect(listed.value).toContain("#101 Bug");
});

test("Boards: cards stay on screen while the board refreshes in the background (D-302)", async ({
  page,
  jigHome,
}) => {
  const view = await setUp(page, jigHome, true);
  await view.getByTestId("boards-add-first").click();
  const dialog = page.getByTestId("boards-dialog");
  await dialog.getByTestId("boards-pick-Web-Stories").click();
  await dialog.getByTestId("boards-pick-Mobile-Features").click();
  await dialog.getByTestId("boards-add-picked").click();
  await view.getByTestId("board-tab-Web · Stories").click();
  await expect(view.getByTestId("board-item-101")).toBeVisible();
  await expect(view.getByTestId("board-updated")).toHaveText("updated just now");
  const card = await settledBox(view.getByTestId("board-item-101"));
  const refresh = await settledBox(view.getByTestId("board-refresh"));

  // Refreshing keeps the cards where they are; only the refresh button's icon turns.
  await view.getByTestId("board-refresh").click();
  await expect(view.getByTestId("board-item-101")).toBeVisible();
  expect(await view.getByTestId("board-item-101").boundingBox()).toEqual(card);
  await expect(view.getByTestId("board-refresh")).not.toHaveAttribute("data-refreshing", "true");
  expect(await settledBox(view.getByTestId("board-refresh"))).toEqual(refresh);

  // Back on a board seen before: its cards at once, from the host's cache, while it refreshes.
  await view.getByTestId("board-tab-Mobile · Features").click();
  await view.getByTestId("board-tab-Web · Stories").click();
  await expect(view.getByTestId("board-item-101")).toBeVisible({ timeout: 1_000 });

  // A reload of the window shows the cached cards too, and Claude's tools read the fresh cache.
  await page.reload();
  await expect(page.getByTestId("board-item-101")).toBeVisible({ timeout: 2_000 });
  const projects = (await hostCall(page, "projects.list")) as { value: { projects: Array<{ id: string }> } };
  const listed = (await hostCall(page, "addons.call", {
    id: "boards",
    method: "toolCards",
    args: { chat: { projectId: projects.value.projects[0]!.id }, board: "Web · Stories" },
  })) as { value: string };
  expect(listed.value).toContain("#104");
});

test("Boards: search and filters hide cards, keep the columns and are remembered per board (D-304)", async ({
  page,
  jigHome,
}) => {
  const view = await setUp(page, jigHome, true);
  await view.getByTestId("boards-add-first").click();
  const dialog = page.getByTestId("boards-dialog");
  await dialog.getByTestId("boards-pick-Web-Stories").click();
  await dialog.getByTestId("boards-add-picked").click();
  await expect(view.getByTestId("board-item-101")).toBeVisible();
  const doing = await settledBox(view.getByTestId("board-column-Doing"));

  // Search as you type: matching cards only; every column stays, counting shown/total.
  await view.getByTestId("board-search").fill("wish");
  await expect(view.getByTestId("board-item-101")).toBeHidden();
  await expect(view.getByTestId("board-item-102")).toBeVisible();
  await expect(view.getByTestId("board-count-New")).toHaveText("1/1");
  await expect(view.getByTestId("board-count-Doing")).toHaveText("0/2");
  await expect(view.getByTestId("board-column-Doing")).toContainText("No cards match the filters");
  expect(await view.getByTestId("board-column-Doing").boundingBox()).toEqual(doing);
  // Esc clears the search.
  await view.getByTestId("board-search").press("Escape");
  await expect(view.getByTestId("board-item-101")).toBeVisible();

  // A picker: a menu with checkboxes that stays open; the count and Clear filters show.
  const openPicker = async (field: string) => {
    if (await view.getByTestId(`board-filter-${field}`).isVisible())
      await view.getByTestId(`board-filter-${field}`).click();
    else {
      await view.getByTestId("board-filter-all").click();
      await page.getByTestId(`board-filter-menu-${field}`).click();
    }
  };
  await openPicker("tags");
  await page.getByTestId("board-filter-tags-checkout").click();
  await page.keyboard.press("Escape");
  await expect(view.getByTestId("board-item-102")).toBeHidden();
  await expect(view.getByTestId("board-item-101")).toBeVisible();
  await expect(view.getByTestId("board-filter-clear")).toBeVisible();

  // Remembered for the board: back after a reload.
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId("board-item-101")).toBeVisible();
  await expect(page.getByTestId("board-item-102")).toBeHidden();
  await page.getByTestId("board-filter-clear").click();
  await expect(page.getByTestId("board-item-102")).toBeVisible();

  // Ctrl+F on the board focuses the search.
  await page.getByTestId("board-column-New").click({ position: { x: 20, y: 300 } });
  await page.keyboard.press("Control+f");
  await expect(page.getByTestId("board-search")).toBeFocused();
});

test("Boards: a board followed in another tenant keeps its space and switches to it", async ({
  page,
  jigHome,
}) => {
  const view = await setUp(page, jigHome, true);
  await view.getByTestId("boards-add-first").click();
  const dialog = page.getByTestId("boards-dialog");
  await dialog.getByTestId("boards-pick-Web-Stories").click();
  await dialog.getByTestId("boards-add-picked").click();
  await expect(view.getByTestId("board-item-101")).toBeVisible();
  const tabs = await settledBox(view.getByTestId("board-tab-Web · Stories"));

  // Another tenant: the board (followed with your own az login) says where it is, not an az error.
  await hostCall(page, "azure.addTenant", { tenant: "northwind.example.com" });
  await hostCall(page, "azure.setActiveTenant", { key: "northwind" });
  const elsewhere = view.getByTestId("board-elsewhere");
  await expect(elsewhere).toContainText("In your own az login");
  await expect(view.getByTestId("board-error")).toBeHidden();
  expect(await settledBox(view.getByTestId("board-tab-Web · Stories"))).toEqual(tabs);

  // The whole card switches back, and the board loads again.
  await elsewhere.click();
  await expect(page.getByTestId("tenant-switcher")).toHaveAttribute(
    "aria-label",
    "Azure tenant: Your az login",
  );
  await expect(view.getByTestId("board-item-101")).toBeVisible();
});
