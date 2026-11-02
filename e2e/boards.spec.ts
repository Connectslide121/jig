import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, hostCall, test } from "./fixtures";

/**
 * An `az` that answers like Azure DevOps: one organisation (contoso), projects Shop and Portal, two
 * teams with their boards, and the Web team's Stories board with three columns and four cards.
 */
const FAKE_AZ = `
const args = process.argv.slice(2);
const has = (...words) => words.every((w) => args.includes(w));
const say = (value) => { process.stdout.write(JSON.stringify(value)); process.exit(0); };
const uri = args.includes("--uri") ? args[args.indexOf("--uri") + 1] : "";
const card = (id, title, type, state, column, who) => ({ id, fields: {
  "System.Id": id, "System.Title": title, "System.WorkItemType": type, "System.State": state,
  "WEF_1_Kanban.Column": column, ...(who ? { "System.AssignedTo": { displayName: who } } : {}),
}});
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
if (uri.endsWith("/teamfieldvalues")) say({ field: { referenceName: "System.AreaPath" }, values: [{ value: "Shop\\\\Web", includeChildren: true }] });
if (has("boards", "query")) {
  const wiql = args[args.indexOf("--wiql") + 1];
  if (!wiql.includes("UNDER 'Shop\\\\Web'") || !wiql.includes("[WEF_1_Kanban.Column]")) { console.error("unexpected query " + wiql); process.exit(1); }
  say([
    card(101, "Checkout fails with a saved card", "Bug", "Active", "Doing", "Ann Demo"),
    card(102, "Add a wish list", "User Story", "New", "New"),
    card(103, "Write the release notes", "User Story", "Closed", "Closed", "Ben Sample"),
    card(104, "Show delivery dates", "User Story", "Active", "Doing"),
  ]);
}
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
