import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listFiles, searchFiles } from "./search";

async function tree(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "jig-search-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

describe("listFiles", () => {
  it("walks folders but skips dependencies and build output", async () => {
    const root = await tree({
      "src/a.ts": "",
      "node_modules/x/index.js": "",
      "dist/a.js": "",
      "README.md": "",
    });
    expect((await listFiles(root)).sort()).toEqual(["README.md", "src/a.ts"]);
  });

  it("uses git inside a repository, so ignored files stay out", async () => {
    const root = await tree({
      "web/src/cart.ts": "",
      "web/.gitignore": "secret.txt\n",
      "web/secret.txt": "",
    });
    execFileSync("git", ["init", "-q"], { cwd: join(root, "web") });
    const files = await listFiles(root);
    expect(files).toContain("web/src/cart.ts");
    expect(files).not.toContain("web/secret.txt");
  });
});

describe("searchFiles", () => {
  it("finds files and folders fuzzily", async () => {
    const root = await tree({ "src/cart.ts": "", "src/checkout/pay.ts": "", "docs/guide.md": "" });
    expect((await searchFiles(root, "cart"))[0]).toBe("src/cart.ts");
    expect(await searchFiles(root, "checkout/")).toContain("src/checkout/");
  });
});
