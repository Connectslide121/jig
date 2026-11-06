import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "./fixtures";

const manifest = {
  id: "hello",
  name: "Hello",
  description: "A test add-on",
  icon: "hand",
  permissions: [],
  contributes: {
    views: [{ id: "main", title: "Hello", region: "right", component: "HelloView" }],
    tabs: [{ type: "detail", title: "Hello detail", component: "DetailTab" }],
    statusbar: [{ id: "status", side: "right", component: "Status" }],
    actions: [
      { id: "greet", title: "Say hello", run: "greet" },
      { id: "ping", title: "Ping the host", run: "ping" },
    ],
    search: [{ id: "cards", title: "Hello cards", icon: "kanban", run: "findCards" }],
    prompts: [{ id: "p", label: "Hello prompt", text: "Hello from the add-on" }],
  },
};

const ui = (label: string) => `
import { useState } from "react";
import { Button, useHostCall } from "@jig/sdk/ui";
import type { AddonComponentProps, AddonTabProps, AddonUiContext } from "@jig/sdk";

export function HelloView({ ctx }: AddonComponentProps) {
  const { data } = useHostCall<number>("double", { n: 21 });
  const [crash, setCrash] = useState(false);
  if (crash) throw new Error("Boom from the add-on");
  return (
    <div className="flex flex-col gap-2 p-3" data-testid="hello-view">
      <span data-testid="hello-label">${label}</span>
      <span data-testid="hello-host">host says {data ?? "…"}</span>
      <Button onClick={() => ctx.openTab("detail", { which: 1 })}>Open detail</Button>
      <Button onClick={() => setCrash(true)}>Crash</Button>
    </div>
  );
}
export function DetailTab({ params }: AddonTabProps) {
  return <div className="p-4" data-testid="hello-detail">detail {String(params.which)}</div>;
}
export function Status() {
  return <span data-testid="hello-status">hello!</span>;
}
export function greet(ctx: AddonUiContext) {
  ctx.notify({ title: "Hello from the action", tone: "success" });
}
export function ping(ctx: AddonUiContext) {
  void ctx.host.call("ping");
}
`;

const host = `
import type { AddonHostApi, AddonSearchQuery } from "@jig/sdk";
export async function double(args: { n: number }) { return args.n * 2; }
export async function ping(_args: unknown, api: AddonHostApi) {
  api.setBadge("main", 3);
  api.notify({ title: "Host found 3 cards", actions: [{ label: "Open card", tab: "detail", params: { which: 7 } }] });
}
export async function findCards(q: AddonSearchQuery) {
  return q.query.includes("zebra")
    ? [{ id: "z1", label: "Zebra card", detail: "column Doing", open: { tab: "detail", params: { which: 9 } } }]
    : [];
}
`;

async function install(jigHome: string, label = "Hello v1") {
  const dir = join(jigHome, "addons", "hello");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "addon.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "host.ts"), host);
  await writeFile(join(dir, "ui.tsx"), ui(label));
  return dir;
}

test("a user add-on loads into its slots, calls its host code and hot-reloads", async ({ page, jigHome }) => {
  const dir = await install(jigHome);
  await expect(page.getByTestId("view-tab-addon.hello.main")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("hello-label")).toHaveText("Hello v1");
  await expect(page.getByTestId("hello-host")).toHaveText("host says 42");
  // Tailwind classes generated for the add-on at runtime:
  const padding = await page.getByTestId("hello-view").evaluate((el) => getComputedStyle(el).paddingTop);
  expect(padding).not.toBe("0px");
  await expect(page.getByTestId("hello-status")).toHaveText("hello!");

  await page.getByRole("button", { name: "Open detail" }).click();
  await expect(page.getByTestId("hello-detail")).toHaveText("detail 1");

  // tools.action contributions are in their own menu as well as shared search.
  await page.getByTestId("tools-group-Hello").click();
  await page.getByRole("menuitem", { name: "Say hello", exact: true }).click();
  await expect(page.getByTestId("toast").last()).toContainText("Hello from the action");
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("say hello");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("toast").last()).toContainText("Hello from the action");

  // Host code: a badge on the view's icon, a toast whose button opens a tab, results in Go to (D-215).
  await page.getByTestId("tools-group-Hello").click();
  await page.getByRole("menuitem", { name: "Ping the host", exact: true }).click();
  await expect(page.getByTestId("view-badge-addon.hello.main")).toHaveText("3");
  const toast = page.getByTestId("toast").filter({ hasText: "Host found 3 cards" });
  await toast.getByRole("button", { name: "Open card" }).click();
  await expect(page.getByTestId("hello-detail").filter({ hasText: "detail 7" })).toBeVisible();
  await page.getByTestId("goto-button").click();
  await page.getByTestId("goto-input").fill("zebra");
  await expect(page.getByTestId("goto").getByText("Zebra card")).toBeVisible();
  await expect(page.getByTestId("goto").getByText("Hello cards")).toBeVisible();
  await page.getByTestId("goto").getByText("Zebra card").click();
  await expect(page.getByTestId("hello-detail").filter({ hasText: "detail 9" })).toBeVisible();

  await writeFile(join(dir, "ui.tsx"), ui("Hello v2"));
  await expect(page.getByTestId("hello-label")).toHaveText("Hello v2", { timeout: 15000 });
});

test("a crashing add-on is contained and can be turned off", async ({ page, jigHome }) => {
  await install(jigHome);
  await expect(page.getByTestId("hello-view")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Crash" }).click();
  await expect(page.getByRole("alert")).toContainText("Boom from the add-on");
  await expect(page.getByTestId("project-switcher")).toBeVisible();
  await page.getByRole("button", { name: "Turn off Hello" }).click();
  await expect(page.getByTestId("view-tab-addon.hello.main")).toHaveCount(0);
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-addons").click();
  await expect(page.getByTestId("addon-hello")).toBeVisible();
  await page.getByTestId("addon-hello").getByRole("switch").click();
  await expect(page.getByTestId("view-tab-addon.hello.main")).toBeVisible({ timeout: 15000 });
});

test("build errors are shown instead of loading a broken add-on, and a notice says so (D-417)", async ({
  page,
  jigHome,
}) => {
  const dir = await install(jigHome);
  await expect(page.getByTestId("hello-view")).toBeVisible({ timeout: 15000 });
  await writeFile(join(dir, "ui.tsx"), "export const HelloView = () => <div>;");
  await expect(page.getByTestId("view-tab-addon.hello.main")).toHaveCount(0, { timeout: 15000 });
  const toast = page.getByTestId("toast").filter({ hasText: "Hello couldn't load" });
  await expect(toast).toContainText("ui.tsx:1:", { timeout: 10000 });
  await toast.getByRole("button", { name: "Show in Settings" }).click();
  await expect(page.getByTestId("addon-hello").getByTestId("addon-errors")).toContainText("ui.tsx:1:");
});

test("a top bar item can lead the right side and a menu group gets live entries (D-305)", async ({
  page,
  jigHome,
}) => {
  const dir = join(jigHome, "addons", "clock");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "addon.json"),
    JSON.stringify({
      id: "clock",
      name: "Clock",
      contributes: {
        topbar: [
          { id: "late", component: "Late", placement: "right-start", order: 20 },
          { id: "early", component: "Early", placement: "right-start", order: 10 },
        ],
        actions: [{ id: "open", title: "Open Clock", group: "Clock", run: "open" }],
        menuGroups: [
          { group: "Clock", items: "clockMenu" },
          { group: "Clock", items: "brokenMenu" },
        ],
      },
    }),
  );
  await writeFile(
    join(dir, "ui.tsx"),
    `
import type { AddonUiContext, MenuInput } from "@jig/sdk";
let running = false;
export function Early() { return <span data-testid="clock-early">E</span>; }
export function Late() { return <span data-testid="clock-late">L</span>; }
export function open() {}
export async function clockMenu(): Promise<MenuInput[]> {
  return [
    running
      ? { label: "Stop", testId: "clock-stop", onSelect: () => { running = false; } }
      : { label: "Start", testId: "clock-start", onSelect: () => { running = true; } },
    { heading: "Projects" },
    { label: "Contoso", badge: "1:15", checked: running },
  ];
}
export function brokenMenu(_ctx: AddonUiContext): MenuInput[] { throw new Error("no clock"); }
`,
  );
  await expect(page.getByTestId("clock-early")).toBeVisible({ timeout: 15000 });
  // right-start items come first on the right, in order, before Suggestions.
  const x = async (id: string) => (await page.getByTestId(id).boundingBox())?.x ?? 0;
  expect(await x("clock-early")).toBeLessThan(await x("clock-late"));
  expect(await x("clock-late")).toBeLessThan(await x("suggestions-badge"));

  // Live entries above the static action, computed each time; a broken export only toasts.
  await page.getByTestId("tools-group-Clock").click();
  await expect(page.getByTestId("clock-start")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Open Clock" })).toBeVisible();
  await expect(page.getByTestId("toast").last()).toContainText("no clock");
  await page.getByTestId("clock-start").click();
  await page.getByTestId("tools-group-Clock").click();
  await expect(page.getByTestId("clock-stop")).toBeVisible();
});
