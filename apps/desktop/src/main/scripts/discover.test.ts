import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverScripts } from "./discover";

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
});
