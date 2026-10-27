import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bundleHost, bundleUi } from "./bundle";
import { scanAddons } from "./catalog";
import { addonCss, candidates, extractTheme, setTokensFile } from "./css";

const tokens = fileURLToPath(new URL("../../renderer/styles/tokens.css", import.meta.url));

async function addon(root: string, id: string, files: Record<string, string>) {
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
  return dir;
}

describe("catalog", () => {
  it("finds add-ons, validates manifests and lets user add-ons override built-ins", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-addons-"));
    const builtin = join(root, "builtin");
    const user = join(root, "user");
    await addon(builtin, "git", {
      "addon.json": JSON.stringify({ id: "git", name: "Git" }),
      "ui.tsx": "",
      "README.md": "# Git",
    });
    await addon(builtin, "repos", {
      "addon.json": JSON.stringify({ id: "repos", name: "Repos" }),
      "host.ts": "",
    });
    await addon(user, "my-git", { "addon.json": JSON.stringify({ id: "git", name: "My Git" }) });
    await addon(user, "broken", { "addon.json": "{ nope" });
    await addon(user, "invalid", { "addon.json": JSON.stringify({ id: "Invalid", name: "x" }) });
    await addon(user, "no-manifest", { "ui.tsx": "" });
    const records = await scanAddons(builtin, user);
    expect(records.map((r) => [r.id, r.source, r.errors.length > 0])).toEqual([
      ["broken", "user", true],
      ["Invalid", "user", true],
      ["git", "user", false],
      ["repos", "builtin", false],
    ]);
    const git = records.find((r) => r.id === "git")!;
    expect(git).toMatchObject({ overridesBuiltin: true, manifest: { name: "My Git" } });
    const repos = records.find((r) => r.id === "repos")!;
    expect(repos.hostEntry).toMatch(/host\.ts$/);
    expect(repos.uiEntry).toBeUndefined();
  });
});

describe("bundleUi", () => {
  it("bundles TSX with shared React and SDK modules", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-bundle-"));
    const dir = await addon(root, "hello", {
      "ui.tsx": `import { useState } from "react";\nimport { Button } from "@jig/sdk/ui";\nimport { label } from "./label";\nexport function Hello() { const [n, setN] = useState(0); return <Button onClick={() => setN(n + 1)}>{label} {n}</Button>; }\n`,
      "label.ts": `export const label = "Clicked";`,
    });
    const result = await bundleUi(join(dir, "ui.tsx"));
    expect(result.errors).toEqual([]);
    expect(result.code).toContain('globalThis.__jigShared["react"]');
    expect(result.code).toContain('globalThis.__jigShared["@jig/sdk/ui"]');
    expect(result.code).toContain("Clicked");
    expect(result.code).toMatch(/export\s*\{/);
    expect(result.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.inputs.some((f) => f.endsWith("label.ts"))).toBe(true);
  });

  it("rejects imports that aren't shared or relative, and reports syntax errors with a location", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-bundle-"));
    const dir = await addon(root, "bad", { "ui.tsx": `import _ from "lodash";\nexport const X = _;` });
    expect((await bundleUi(join(dir, "ui.tsx"))).errors[0]).toContain('"lodash" can\'t be imported');
    const dir2 = await addon(root, "syntax", { "ui.tsx": `export const X = <div>;` });
    expect((await bundleUi(join(dir2, "ui.tsx"))).errors[0]).toMatch(/ui\.tsx:1:\d+/);
  });
});

describe("bundleHost", () => {
  it("bundles host code for Node with builtins external", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-bundle-"));
    const dir = await addon(root, "h", {
      "host.ts": `import { readFile } from "node:fs/promises";\nexport async function status(_a: unknown) { return typeof readFile; }`,
    });
    const result = await bundleHost(join(dir, "host.ts"), []);
    expect(result.errors).toEqual([]);
    expect(result.code).toContain('from "node:fs/promises"');
  });
});

describe("addon CSS", () => {
  it("extracts only the @theme block and generates token utilities", async () => {
    const { readFile } = await import("node:fs/promises");
    const theme = extractTheme(await readFile(tokens, "utf8"));
    expect(theme.startsWith("@theme")).toBe(true);
    expect(theme).not.toContain(":root");
    setTokensFile(tokens);
    const css = await addonCss([
      `<div className="bg-surface text-muted p-2 hover:bg-hover rounded-md text-red-500" />`,
    ]);
    expect(css).toContain(".bg-surface");
    expect(css).toContain("var(--jig-surface)");
    expect(css).toContain(".hover\\:bg-hover");
    expect(css).not.toContain("text-red-500");
    expect(css).not.toContain("#1e1f22");
  });

  it("splits candidates", () => {
    expect(candidates(`cn("p-2 bg-surface", x && 'hover:bg-hover', \`w-[var(--jig-x)]\`)`)).toEqual(
      expect.arrayContaining(["p-2", "bg-surface", "hover:bg-hover", "w-[var(--jig-x)]"]),
    );
  });
});
