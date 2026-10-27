import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { extractThemeVsix } from "./openvsx";
import { ThemeService } from "./service";

let root: string;
let themesDir: string;
let extDir: string;

async function write(path: string, value: unknown) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
}

function vsix(files: Record<string, unknown>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name,
        strToU8(typeof value === "string" ? value : JSON.stringify(value)),
      ]),
    ),
  );
}

const themeManifest = (label: string, path = "./themes/t.json") => ({
  name: "night",
  publisher: "acme",
  contributes: { themes: [{ label, uiTheme: "vs-dark", path }] },
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jig-themes-"));
  process.env.JIG_HOME = join(root, "home");
  themesDir = join(root, "home", "themes");
  extDir = join(root, "vscode-ext");
  await write(join(themesDir, "mine.json"), {
    label: "Mine",
    appearance: "light",
    colors: { accent: "#0055aa" },
  });
  await write(
    join(themesDir, "copied.jsonc"),
    '{ "name": "Copied", "colors": { "editor.background": "#101010", }, }',
  );
  await write(join(themesDir, "broken.json"), "{ nope");
  await write(join(themesDir, "notes.txt"), "ignored");
  // An editor extension with a localised label and an include chain.
  const ext = join(extDir, "acme.night-1.0.0");
  await write(join(ext, "package.json"), themeManifest("%theme.label%"));
  await write(join(ext, "package.nls.json"), { "theme.label": "Acme Night" });
  await write(join(ext, "themes", "t.json"), {
    include: "./base.json",
    colors: { "editor.background": "#0b0c10" },
  });
  await write(join(ext, "themes", "base.json"), { colors: { "button.background": "#66fcf1" } });
  // An older version of the same extension left behind by the editor: ignored.
  await write(join(extDir, "acme.night-0.9.0", "package.json"), themeManifest("Old Night"));
  // An extension without themes and a theme pointing outside its folder.
  await write(join(extDir, "other", "package.json"), { name: "other" });
  await write(join(extDir, "evil", "package.json"), {
    ...themeManifest("Evil", "../../escape.json"),
    name: "evil",
  });
});

describe("ThemeService", () => {
  it("lists built-in, user and editor themes and skips broken ones", async () => {
    const service = new ThemeService({ themesDir, extensionDirs: [extDir, join(root, "missing")] });
    const list = await service.list();
    expect(list.map((t) => t.id)).toEqual([
      "jig-dark",
      "jig-light",
      "user:copied",
      "user:mine",
      "vscode:acme.night/acme-night",
    ]);
    expect(list.find((t) => t.id === "user:mine")).toMatchObject({ label: "Mine", appearance: "light" });
  });

  it("loads full themes, following includes inside the extension", async () => {
    const service = new ThemeService({ themesDir, extensionDirs: [extDir] });
    const night = await service.get("vscode:acme.night/acme-night");
    expect(night.label).toBe("Acme Night");
    expect(night.appearance).toBe("dark");
    expect(night.colors.canvas).toBe("#0b0c10");
    expect(night.colors.accent).toBe("#66fcf1");
    expect((await service.get("user:mine")).colors.accent).toBe("#0055aa");
    expect((await service.get("user:copied")).colors.canvas).toBe("#101010");
  });

  it("reports unknown and unreadable themes with stable codes", async () => {
    const service = new ThemeService({ themesDir, extensionDirs: [] });
    await expect(service.get("nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(service.get("user:broken")).rejects.toMatchObject({ code: "invalid_theme" });
  });

  it("removes user themes but not built-in ones", async () => {
    const service = new ThemeService({ themesDir, extensionDirs: [] });
    let notified = 0;
    service.onChange(() => notified++);
    await service.remove("user:mine");
    expect(await readdir(themesDir)).not.toContain("mine.json");
    expect(notified).toBe(1);
    await expect(service.remove("jig-dark")).rejects.toMatchObject({ code: "not_removable" });
  });

  it("installs from Open VSX through the API and extracts only theme JSON", async () => {
    const bytes = vsix({
      "extension/package.json": themeManifest("Acme Night"),
      "extension/themes/t.json": { colors: { "editor.background": "#222244" } },
      "extension/out/extension.js": "process.exit(1)",
      "extension/node_modules/x/package.json": {},
      "[Content_Types].xml": "<xml/>",
    });
    const requested: string[] = [];
    const fetchImpl = async (url: string) => {
      requested.push(url);
      if (url.endsWith("/api/acme/night"))
        return Response.json({ files: { download: "https://open-vsx.org/x.vsix" } });
      if (url === "https://open-vsx.org/x.vsix") return new Response(bytes);
      return new Response("", { status: 404 });
    };
    const service = new ThemeService({ themesDir, extensionDirs: [], fetch: fetchImpl });
    const added = await service.installOpenVsx("acme", "night");
    expect(added.map((t) => t.id)).toEqual(["openvsx:acme.night/acme-night"]);
    const dir = join(themesDir, "openvsx", "acme.night");
    expect((await readdir(dir)).sort()).toEqual(["package.json", "themes"]);
    expect((await service.get("openvsx:acme.night/acme-night")).colors.canvas).toBe("#222244");
    await service.remove("openvsx:acme.night/acme-night");
    expect(await readdir(join(themesDir, "openvsx"))).toEqual([]);
    await expect(service.installOpenVsx("../x", "y")).rejects.toMatchObject({ code: "invalid_args" });
  });

  it("maps Open VSX search results", async () => {
    const fetchImpl = async (url: string) => {
      expect(url).toContain("category=Themes");
      return Response.json({
        extensions: [
          { namespace: "a", name: "b", displayName: "", downloadCount: 5, files: { icon: "https://i" } },
        ],
      });
    };
    const service = new ThemeService({ themesDir, extensionDirs: [], fetch: fetchImpl });
    expect(await service.searchOpenVsx("dark")).toEqual([
      {
        namespace: "a",
        name: "b",
        displayName: "b",
        description: "",
        version: "",
        downloads: 5,
        iconUrl: "https://i",
      },
    ]);
    const offline = new ThemeService({
      themesDir,
      extensionDirs: [],
      fetch: async () => {
        throw new Error("offline");
      },
    });
    await expect(offline.searchOpenVsx("x")).rejects.toMatchObject({ code: "network" });
  });

  it("refuses extensions without colour themes and paths that escape", async () => {
    const target = join(root, "out", "x");
    await expect(
      extractThemeVsix(vsix({ "extension/package.json": { name: "x" } }), target),
    ).rejects.toMatchObject({
      code: "not_a_theme",
    });
    const escaping = vsix({
      "extension/package.json": themeManifest("A"),
      "extension/../../escaped.json": {},
    });
    await extractThemeVsix(escaping, target);
    expect(await readdir(join(root, "out"))).toEqual(["x"]);
  });
});
