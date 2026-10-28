import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, test } from "./fixtures";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });

async function repo(dir: string, files: Record<string, string>) {
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Ann Demo");
  git(dir, "config", "user.email", "ann@example.com");
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name, ".."), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "Initial commit");
}

/** A folder of repositories: two changed, one clean and nested one level deeper. */
async function workspace(jigHome: string) {
  const ws = join(jigHome, "repos");
  await repo(join(ws, "api"), { "README.md": "# api\n" });
  await repo(join(ws, "web"), { "README.md": "# web\n", "package.json": '{"scripts":{"dev":"vite"}}' });
  await repo(join(ws, "client-a", "portal"), {
    "README.md": "# portal\n",
    "tools/seed/package.json": '{"scripts":{"seed":"node seed.js"}}',
  });
  await writeFile(join(ws, "api", "README.md"), "# api\n\nChanged.\n");
  await writeFile(join(ws, "web", "README.md"), "# web\n\nChanged too.\n");
  await writeFile(join(ws, "web", "new.txt"), "new\n");
  return ws;
}

test("a folder of repositories works as one workspace: every repo's changes in Git, focus, chats, scripts", async ({
  page,
  jigHome,
}) => {
  const ws = await workspace(jigHome);
  await hostCall(page, "projects.add", { path: ws });
  await expect(page.getByTestId("project-repos-repos")).toHaveText("3");

  // Git: all repositories, changed ones first and open.
  await page.keyboard.press("Control+Shift+G");
  const view = page.getByTestId("git-workspace");
  await expect(view).toContainText("3 repositories · 2 with changes", { timeout: 15000 });
  await expect(view.getByTestId("git-file-unstaged-api/README.md")).toBeVisible();
  await expect(view.getByTestId("git-file-untracked-web/new.txt")).toBeVisible();
  await expect(view.getByTestId("git-repo-client-a/portal")).toHaveAttribute(
    "data-testid",
    "git-repo-client-a/portal",
  );
  await expect(
    view.getByTestId("git-repo-client-a/portal").getByRole("button", { expanded: false }),
  ).toBeVisible();

  // The diff of a file in one repo opens in a tab.
  await view.getByTestId("git-file-unstaged-api/README.md").click();
  await expect(page.getByTestId("git-diff-split")).toContainText("Changed.");

  // Commit in one repository from its own commit box.
  const web = view.getByTestId("git-repo-web");
  await web.getByTestId("git-commit-message").fill("Update web readme");
  await web.getByTestId("git-commit").click();
  await expect(view).toContainText("3 repositories · 1 with changes", { timeout: 15000 });
  expect(git(join(ws, "web"), "log", "-1", "--format=%s").trim()).toBe("Update web readme");

  // A file created outside Jig shows up by itself (watcher, or the safety-net check where
  // folders can't be watched), without touching the window.
  await writeFile(join(ws, "client-a", "portal", "notes.md"), "notes\n");
  await expect(view).toContainText("3 repositories · 2 with changes", { timeout: 15000 });

  // Clicking a repository focuses it: the status bar shows its branch.
  await view.getByTestId("git-repo-client-a/portal").getByText("client-a/portal").click();
  await expect(page.getByTestId("git-status-branch")).toContainText("client-a/portal: main");

  // A chat inside one repository.
  await view.getByTestId("git-repo-api").getByText("api", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New chat in this repository" }).click();
  await expect(page.getByTestId("composer-input")).toBeVisible();
  await expect
    .poll(async () => {
      const r = (await hostCall(page, "sessions.list")) as { value: Array<{ cwd: string }> };
      return r.value.map((s) => s.cwd);
    })
    .toContain(join(ws, "api"));

  // Repos view lists the workspace's repositories.
  const list = (await hostCall(page, "addons.call", { id: "repos", method: "overview", args: {} })) as {
    value: Array<{ name: string; dirty: number }>;
  };
  expect(list.value.map((r) => r.name).sort()).toEqual(["repos/api", "repos/client-a/portal", "repos/web"]);

  // Scripts of every repository, also deeper ones.
  const scripts = (await hostCall(page, "scripts.list", {
    projectId: ((await hostCall(page, "projects.list")) as { value: { activeId: string } }).value.activeId,
  })) as { value: { scripts: Array<{ folder: string; name: string }> } };
  expect(scripts.value.scripts.map((s) => `${s.folder}:${s.name}`)).toEqual([
    "client-a/portal/tools/seed:seed",
    "web:dev",
  ]);
});
