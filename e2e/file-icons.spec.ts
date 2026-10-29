import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, launchJig, test } from "./fixtures";

async function write(path: string, value: unknown) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
}

/** A home folder with VS Code, Material Icon Theme (a small stand-in) and VS Code's setting for it. */
async function fakeVsCodeHome(root: string) {
  const home = join(root, "user-home");
  const ext = join(home, ".vscode", "extensions", "pkief.material-icon-theme-5.40.0");
  await write(join(ext, "package.json"), {
    name: "material-icon-theme",
    publisher: "PKief",
    contributes: {
      iconThemes: [{ id: "material-icon-theme", label: "Material Icon Theme", path: "./dist/m.json" }],
    },
  });
  await write(join(ext, "dist", "m.json"), {
    iconDefinitions: {
      file: { iconPath: "./../icons/file.svg" },
      typescript: { iconPath: "./../icons/typescript.svg" },
      nodejs: { iconPath: "./../icons/nodejs.svg" },
      folder: { iconPath: "./../icons/folder.svg" },
      "folder-src-open": { iconPath: "./../icons/folder-src-open.svg" },
    },
    file: "file",
    folder: "folder",
    fileExtensions: { ts: "typescript" },
    fileNames: { "package.json": "nodejs" },
    folderNamesExpanded: { src: "folder-src-open" },
  });
  const svg = (fill: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/></svg>`;
  for (const [name, fill] of [
    ["file", "gray"],
    ["typescript", "blue"],
    ["nodejs", "green"],
    ["folder", "orange"],
    ["folder-src-open", "teal"],
  ])
    await write(join(ext, "icons", `${name}.svg`), svg(fill!));
  await write(
    join(configDir(home), "Code", "User", "settings.json"),
    '{ "workbench.iconTheme": "material-icon-theme" }',
  );
  return home;
}

// Where VS Code's settings are, as Jig looks for them (`vscodeSettingsFiles`), inside the fake home.
const configDir = (home: string) =>
  process.platform === "win32" ? join(home, "AppData", "Roaming") : join(home, ".config");

// A fake home on every OS: Windows takes the home folder from USERPROFILE, not HOME.
const homeEnv = (home: string) => ({
  HOME: home,
  USERPROFILE: home,
  APPDATA: join(home, "AppData", "Roaming"),
  LOCALAPPDATA: join(home, "AppData", "Local"),
  XDG_CONFIG_HOME: join(home, ".config"),
});

test("file icons follow the icon theme VS Code uses, and can be switched", async () => {
  const root = await mkdtemp(join(tmpdir(), "jig-e2e-"));
  const home = await fakeVsCodeHome(root);
  const app = await launchJig(join(root, "jig-home"), homeEnv(home));
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await page.keyboard.press("Control+,");
    const select = page.getByTestId("file-icon-theme");
    await expect(select.locator("option").first()).toHaveText("Same as VS Code (Material Icon Theme)");
    const samples = page.getByTestId("file-icon-samples");
    const icon = (name: string) => samples.locator("span", { hasText: name }).locator("[data-file-icon]");
    await expect(icon("index.ts")).toHaveAttribute("data-file-icon", "typescript");
    await expect(icon("package.json")).toHaveAttribute("data-file-icon", "nodejs");
    await expect(icon("src")).toHaveAttribute("data-file-icon", "folder-src-open");
    await expect(icon("README.md")).toHaveAttribute("data-file-icon", "file");
    // The SVG really loads through jig-icons:.
    await expect
      .poll(() => icon("index.ts").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);

    await select.selectOption("jig");
    await expect(icon("index.ts")).toHaveAttribute("data-file-icon", "jig");
    await select.selectOption("vscode:pkief.material-icon-theme/material-icon-theme");
    await expect(icon("index.ts")).toHaveAttribute("data-file-icon", "typescript");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
