import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverScripts, isWorktreeGitFile } from "./discover";

async function file(path: string, content = "") {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

describe("discoverScripts", () => {
  it("finds npm, PowerShell, shell, dotnet and Azure Functions scripts per folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-scripts-"));
    await file(
      join(root, "package.json"),
      JSON.stringify({ scripts: { dev: "vite", predev: "x", build: "tsc" } }),
    );
    await file(join(root, "pnpm-lock.yaml"));
    await file(join(root, "setup.ps1"));
    await file(join(root, "scripts", "deploy.sh"));
    await file(join(root, "web", "package.json"), JSON.stringify({ scripts: { start: "next start" } }));
    await file(join(root, "api", "Api.csproj"));
    await file(join(root, "api", "Api.Tests.csproj"));
    await file(join(root, "functions", "host.json"), "{}");
    await file(join(root, "functions", "local.settings.json"), "{}");
    await file(join(root, "functions", "Functions.csproj"));
    await file(join(root, "node_modules", "x", "package.json"), JSON.stringify({ scripts: { nope: "x" } }));
    await file(join(root, "docs", "notes.sh"));
    await file(join(root, "broken", "package.json"), "{ nope");

    const scripts = await discoverScripts(root, "win32");
    expect(scripts.map((s) => `${s.folder}|${s.name}|${s.command}`)).toEqual([
      "|build|pnpm build",
      "|dev|pnpm dev",
      '|setup.ps1|& ".\\setup.ps1"',
      'api|Api: run|dotnet run --project "Api.csproj"',
      'api|Api: watch|dotnet watch --project "Api.csproj" run',
      "functions|func start|func start",
      'scripts|deploy.sh|bash "./deploy.sh"',
      "web|start|pnpm start",
    ]);
    expect(scripts[0]).toMatchObject({ id: "npm::build", kind: "npm", cwd: root, detail: "tsc" });
    expect(scripts.find((s) => s.name === "start")?.cwd).toBe(join(root, "web"));
  });

  it("uses npm by default and pwsh for .ps1 off Windows", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-scripts-"));
    await file(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    await file(join(root, "go.ps1"));
    expect((await discoverScripts(root, "linux")).map((s) => s.command)).toEqual([
      'pwsh -File "./go.ps1"',
      "npm run test",
    ]);
  });

  it("returns nothing for a missing folder", async () => {
    expect(await discoverScripts(join(tmpdir(), "does-not-exist-jig"))).toEqual([]);
  });

  it("in a workspace, searches each repository from its own root (deeper scripts are found)", async () => {
    const { mkdir, mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const ws = await mkdtemp(join(tmpdir(), "jig-ws-scripts-"));
    const repo = join(ws, "client-a", "api");
    await mkdir(join(repo, "tools", "seed"), { recursive: true });
    await writeFile(
      join(repo, "tools", "seed", "package.json"),
      JSON.stringify({ scripts: { seed: "node seed.js" } }),
    );
    expect(await discoverScripts(ws, "linux")).toEqual([]);
    const found = await discoverScripts(ws, "linux", [repo]);
    expect(found.map((s) => `${s.folder}:${s.name}`)).toEqual(["client-a/api/tools/seed:seed"]);
  });
});

describe("git worktrees", () => {
  it("tells a worktree's .git file from a submodule's", () => {
    expect(isWorktreeGitFile("gitdir: E:/repos/shop/.git/worktrees/C1\n")).toBe(true);
    expect(isWorktreeGitFile(String.raw`gitdir: E:\repos\shop\.git\worktrees\C1`)).toBe(true);
    expect(isWorktreeGitFile("gitdir: ../.git/modules/lib\n")).toBe(false);
    expect(isWorktreeGitFile("")).toBe(false);
  });

  it("leaves out worktrees inside a folder, but not a worktree that is the project itself", async () => {
    const root = await mkdtemp(join(tmpdir(), "jig-scripts-wt-"));
    await file(join(root, "shop", "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    await file(join(root, "wt", "C1", "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    await file(join(root, "wt", "C1", ".git"), "gitdir: ../../shop/.git/worktrees/C1\n");
    const found = await discoverScripts(root, "linux", [join(root, "shop"), join(root, "wt", "C1")]);
    expect(found.map((s) => `${s.folder}:${s.name}`)).toEqual(["shop:dev"]);
    const own = await discoverScripts(join(root, "wt", "C1"), "linux");
    expect(own.map((s) => s.name)).toEqual(["dev"]);
  });
});
