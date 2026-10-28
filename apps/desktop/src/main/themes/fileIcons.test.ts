import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { FileIconService } from "./fileIcons";
import { extractThemeVsix } from "./openvsx";

async function write(path: string, value: unknown) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
}

const manifest = {
  name: "material-icon-theme",
  publisher: "PKief",
  contributes: {
    iconThemes: [{ id: "material-icon-theme", label: "Material Icon Theme", path: "./dist/icons.json" }],
  },
};
const iconsJson = {
  iconDefinitions: {
    file: { iconPath: "./../icons/file.svg" },
    typescript: { iconPath: "./../icons/typescript.svg" },
    escape: { iconPath: "./../../../outside.svg" },
    script: { iconPath: "./../icons/run.js" },
  },
  file: "file",
  fileExtensions: { ts: "typescript" },
};

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "jig-icons-"));
  const extDir = join(root, "ext");
  const ext = join(extDir, "pkief.material-icon-theme-5.40.0");
  await write(join(ext, "package.json"), manifest);
  await write(join(ext, "dist", "icons.json"), iconsJson);
  await write(join(ext, "icons", "file.svg"), "<svg/>");
  await write(join(ext, "icons", "typescript.svg"), "<svg id='ts'/>");
  const settings = join(root, "Code", "User", "settings.json");
  await write(settings, '{ // VS Code settings are JSONC\n "workbench.iconTheme": "material-icon-theme", }');
  const service = new FileIconService({
    extensionDirs: [extDir],
    openVsxDir: join(root, "openvsx"),
    settingsFiles: [join(root, "missing.json"), settings],
  });
  return { root, service, settings };
}

describe("FileIconService", () => {
  it("finds icon themes, matches VS Code's choice and serves only the theme's icons", async () => {
    const { service } = await setup();
    const list = await service.list();
    expect(list).toEqual({
      themes: [
        {
          id: "vscode:pkief.material-icon-theme/material-icon-theme",
          label: "Material Icon Theme",
          source: "vscode",
          extension: "PKief.material-icon-theme",
          themeId: "material-icon-theme",
        },
      ],
      vscodeSetting: "material-icon-theme",
      vscodeMatch: "vscode:pkief.material-icon-theme/material-icon-theme",
    });
    const data = (await service.active("vscode"))!;
    expect(data.label).toBe("Material Icon Theme");
    const url = data.theme.iconDefinitions.typescript!.iconPath!;
    expect(url).toMatch(/^jig-icons:\/\/[0-9a-f]{16}\/icons\/typescript\.svg$/);
    // Paths outside the extension and non-icon files are dropped.
    expect(Object.keys(data.theme.iconDefinitions).sort()).toEqual(["file", "typescript"]);
    expect(await readFile(service.resolveUrl(url)!, "utf8")).toBe("<svg id='ts'/>");
    expect(service.resolveUrl(url.replace("icons/typescript.svg", "package.json"))).toBeUndefined();
    expect(service.resolveUrl(url.replace("icons/typescript.svg", "..%2F..%2Fx.svg"))).toBeUndefined();
    expect(service.resolveUrl("jig-icons://0000000000000000/icons/file.svg")).toBeUndefined();
    expect(await service.active("jig")).toBeNull();
  });

  it("defaults to Seti when VS Code has no icon theme setting, and to Jig's icons when nothing matches", async () => {
    const { service, settings } = await setup();
    await writeFile(settings, "{}");
    expect(await service.vscodeSetting()).toBe("vs-seti");
    expect((await service.list()).vscodeMatch).toBeUndefined();
    expect(await service.active("vscode")).toBeNull();
  });

  it("installs icon themes from Open VSX with their icons, but no code", async () => {
    const { root } = await setup();
    const vsix = zipSync({
      "extension/package.json": strToU8(JSON.stringify(manifest)),
      "extension/dist/icons.json": strToU8(JSON.stringify(iconsJson)),
      "extension/icons/file.svg": strToU8("<svg/>"),
      "extension/icons/run.js": strToU8("alert(1)"),
      "extension/dist/extension.js": strToU8("module.exports = {}"),
    });
    const target = join(root, "openvsx", "PKief.material-icon-theme");
    await extractThemeVsix(vsix, target);
    expect((await readdir(join(target, "icons"))).sort()).toEqual(["file.svg"]);
    expect(await readdir(join(target, "dist"))).toEqual(["icons.json"]);
  });
});
