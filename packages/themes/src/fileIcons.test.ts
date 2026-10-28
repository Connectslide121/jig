import { describe, expect, it } from "vitest";
import {
  contributedIconThemes,
  type FileIconTheme,
  iconThemeSetting,
  languageIdForFile,
  resolveFileIcon,
} from "./fileIcons";

// Shaped like Material Icon Theme's material-icons.json.
const theme: FileIconTheme = {
  iconDefinitions: Object.fromEntries(
    [
      "file",
      "folder",
      "folder-open",
      "folder-root",
      "folder-src",
      "folder-src-open",
      "typescript",
      "test-ts",
      "typescript-def",
      "react_ts",
      "json",
      "nodejs",
      "readme",
      "markdown",
      "docker",
      "python",
      "image",
      "json-light",
    ].map((id) => [id, { iconPath: `./../icons/${id}.svg` }]),
  ),
  file: "file",
  folder: "folder",
  folderExpanded: "folder-open",
  rootFolder: "folder-root",
  fileExtensions: {
    ts: "typescript",
    "spec.ts": "test-ts",
    "d.ts": "typescript-def",
    json: "json",
    png: "image",
  },
  fileNames: {
    "package.json": "nodejs",
    "readme.md": "readme",
    dockerfile: "docker",
    broken: "missing-definition",
  },
  folderNames: { src: "folder-src" },
  folderNamesExpanded: { src: "folder-src-open" },
  languageIds: { typescriptreact: "react_ts", markdown: "markdown", python: "python" },
  light: { fileExtensions: { json: "json-light" } },
};

describe("resolveFileIcon", () => {
  it("follows VS Code's order: name, longest extension, language, default", () => {
    expect(resolveFileIcon(theme, { name: "package.json" })).toBe("nodejs");
    expect(resolveFileIcon(theme, { name: "README.md" })).toBe("readme");
    expect(resolveFileIcon(theme, { name: "Dockerfile" })).toBe("docker");
    expect(resolveFileIcon(theme, { name: "cart.spec.ts" })).toBe("test-ts");
    expect(resolveFileIcon(theme, { name: "types.d.ts" })).toBe("typescript-def");
    expect(resolveFileIcon(theme, { name: "src/cart.ts" })).toBe("typescript");
    expect(resolveFileIcon(theme, { name: "C:\\work\\App.tsx" })).toBe("react_ts");
    expect(resolveFileIcon(theme, { name: "notes.md" })).toBe("markdown");
    expect(resolveFileIcon(theme, { name: "Logo.PNG" })).toBe("image");
    expect(resolveFileIcon(theme, { name: "unknown.xyz" })).toBe("file");
    // A mapping to a definition that doesn't exist is skipped.
    expect(resolveFileIcon(theme, { name: "broken" })).toBe("file");
  });

  it("uses light overrides and folder icons", () => {
    expect(resolveFileIcon(theme, { name: "a.json", light: true })).toBe("json-light");
    expect(resolveFileIcon(theme, { name: "a.json" })).toBe("json");
    expect(resolveFileIcon(theme, { name: "src", folder: true })).toBe("folder-src");
    expect(resolveFileIcon(theme, { name: "src", folder: true, expanded: true })).toBe("folder-src-open");
    expect(resolveFileIcon(theme, { name: "lib", folder: true, expanded: true })).toBe("folder-open");
    expect(resolveFileIcon(theme, { name: "shop", folder: true, root: true })).toBe("folder-root");
  });
});

describe("icon theme helpers", () => {
  it("reads contributions, VS Code's setting and language ids", () => {
    expect(
      contributedIconThemes({
        contributes: {
          iconThemes: [{ id: "material-icon-theme", label: "Material", path: "./dist/m.json" }, { id: 3 }],
        },
      }),
    ).toEqual([{ id: "material-icon-theme", label: "Material", path: "./dist/m.json" }]);
    expect(contributedIconThemes({})).toEqual([]);
    expect(iconThemeSetting({ "workbench.iconTheme": "material-icon-theme" })).toBe("material-icon-theme");
    expect(iconThemeSetting({ "workbench.iconTheme": null })).toBe("");
    expect(iconThemeSetting({})).toBeUndefined();
    expect(languageIdForFile("Dockerfile")).toBe("dockerfile");
    expect(languageIdForFile("deploy.ps1")).toBe("powershell");
    expect(languageIdForFile("noext")).toBeUndefined();
  });
});
