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
    actions: [{ id: "greet", title: "Say hello", run: "greet" }],
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
`;

const host = `export async function double(args: { n: number }) { return args.n * 2; }`;

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

  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("say hello");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("toast")).toContainText("Hello from the action");

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

test("build errors are shown instead of loading a broken add-on", async ({ page, jigHome }) => {
  const dir = await install(jigHome);
  await expect(page.getByTestId("hello-view")).toBeVisible({ timeout: 15000 });
  await writeFile(join(dir, "ui.tsx"), "export const HelloView = () => <div>;");
  await expect(page.getByTestId("view-tab-addon.hello.main")).toHaveCount(0, { timeout: 15000 });
  await page.getByTestId("settings-button").click();
  await page.getByTestId("settings-nav-addons").click();
  await expect(page.getByTestId("addon-hello").getByTestId("addon-errors")).toContainText("ui.tsx:1:");
});
