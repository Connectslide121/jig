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
  await expect(view.getByTestId("git-repo-picker")).toContainText("All repositories");
  await expect(view).toContainText("2 changed", { timeout: 15000 });
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
  await expect(view).toContainText("1 changed", { timeout: 15000 });
  expect(git(join(ws, "web"), "log", "-1", "--format=%s").trim()).toBe("Update web readme");

  // A file created outside Jig shows up by itself (watcher, or the safety-net check where
  // folders can't be watched), without touching the window.
  await writeFile(join(ws, "client-a", "portal", "notes.md"), "notes\n");
  await expect(view).toContainText("2 changed", { timeout: 15000 });

  // Clicking a repository focuses it (the status bar shows its branch) and still lists all.
  await view.getByTestId("git-repo-client-a/portal").getByText("client-a/portal").click();
  await expect(page.getByTestId("git-status-branch")).toContainText("client-a/portal: main");
  await expect(view.getByTestId("git-repo-web")).toBeVisible();

  // Working in one repository: the list follows it, and others can be shown next to it.
  await view.getByTestId("git-repo-picker").click();
  await page.getByRole("menuitem", { name: "web", exact: true }).click();
  await expect(view.getByTestId("git-repo-picker")).toContainText("web");
  await expect(view.getByTestId("git-repo-api")).toHaveCount(0);
  await expect(view.getByTestId("git-repo-client-a/portal")).toHaveCount(0);
  await expect(page.getByTestId("git-status-branch")).toContainText("web: main");
  await view.getByTestId("git-shown-menu").click();
  await page.getByRole("menuitem", { name: "client-a/portal" }).click();
  await expect(view.getByTestId("git-repo-client-a/portal")).toBeVisible();
  await expect(view.getByTestId("git-repo-picker")).toContainText("+1");
  // Kept per project: still there after a reload.
  await page.reload();
  await page.waitForSelector("[data-testid=app-root]");
  await expect(page.getByTestId("git-workspace").getByTestId("git-repo-client-a/portal")).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByTestId("git-workspace")
    .getByTestId("git-repo-client-a/portal")
    .getByText("client-a/portal", { exact: true })
    .hover();
  await page.getByTestId("git-repo-hide-client-a/portal").click();
  await expect(view.getByTestId("git-repo-client-a/portal")).toHaveCount(0);

  // Every repository at a glance in the Repos view, in the lower half of the sidebar.
  const repos = page.getByTestId("region-left2");
  // Each repository by its own name (not repos/client-a/portal), with its sync chip and branch.
  const portal = repos.getByTestId("repo-repos/client-a/portal");
  await expect(portal).toContainText("portal", { timeout: 15000 });
  await expect(portal).not.toContainText("repos/");
  await expect(portal.getByTestId("repo-sync-portal")).toBeVisible();
  await expect(repos.getByTestId("repos-view")).toBeVisible();

  // Arrange, for all projects: a titled divider right above web, and api hidden.
  await repos.getByTestId("repos-arrange").click();
  await repos.getByTestId(/^arrange-divider-above-.*web$/).click();
  await page.getByTestId("dialog-input").fill("Frontends");
  await page.getByTestId("dialog-confirm").click();
  await repos.getByTestId(/^arrange-toggle-.*api$/).click();
  await repos.getByTestId("repos-arrange").click();
  const rows = () =>
    repos
      .locator('[data-testid=arrange-divider], [data-testid^="repo-repos/"]')
      .evaluateAll((els) =>
        els.map((e) =>
          e.getAttribute("data-testid") === "arrange-divider"
            ? `--${e.textContent}`
            : (e.getAttribute("data-testid") ?? "").replace("repo-repos/", ""),
        ),
      );
  await expect.poll(rows).toEqual(["client-a/portal", "--Frontends", "web"]);

  // Back to every repository.
  await view.getByTestId("git-repo-picker").click();
  await page.getByRole("menuitem", { name: /All repositories/ }).click();
  await expect(view.getByTestId("git-repo-api")).toBeVisible();

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

test("Git fetches in the background and has a settings page", async ({ page, jigHome }) => {
  // A remote, a clone added to Jig, and a commit pushed to the remote from elsewhere.
  const origin = join(jigHome, "origin.git");
  await mkdir(origin, { recursive: true });
  git(origin, "init", "-q", "--bare", "-b", "main");
  const other = join(jigHome, "other");
  await repo(other, { "README.md": "# app\n" });
  git(other, "remote", "add", "origin", origin);
  git(other, "push", "-q", "-u", "origin", "main");
  const mine = join(jigHome, "app");
  execFileSync("git", ["clone", "-q", origin, mine]);
  await writeFile(join(other, "NEWS.md"), "news\n");
  git(other, "add", ".");
  git(other, "commit", "-q", "-m", "News");
  git(other, "push", "-q");
  await hostCall(page, "projects.add", { path: mine });

  // The background fetch (a watcher every minute; called directly here) brings the commit in.
  expect(await hostCall(page, "addons.call", { id: "git", method: "autoFetch", args: {} })).toMatchObject({
    ok: true,
  });
  expect(git(mine, "rev-list", "--count", "HEAD..origin/main").trim()).toBe("1");

  // Settings → Git: on by default, every 5 minutes; turning it off is kept.
  const settingsNow = async () =>
    ((await hostCall(page, "addons.call", { id: "git", method: "settings", args: {} })) as { value: unknown })
      .value;
  expect(await settingsNow()).toEqual({ enabled: true, minutes: 5 });
  await page.getByTestId("tools-button").click();
  await page.getByTestId("tools-filter").fill("settings");
  await page.keyboard.press("Enter");
  await page.locator('[data-testid^="settings-nav-"]', { hasText: /^Git$/ }).click();
  const settings = page.getByTestId("git-settings");
  await expect(settings).toBeVisible();
  await settings.getByRole("switch", { name: "Fetch in the background" }).click();
  await expect.poll(settingsNow).toEqual({ enabled: false, minutes: 5 });
});

test("project Git history picks an inner repository and follows the project focus", async ({
  page,
  jigHome,
}) => {
  const ws = await workspace(jigHome);
  const added = (await hostCall(page, "projects.add", { path: ws })) as {
    value: { id: string };
  };
  await page.getByTestId("project-repos").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Git history", exact: true }).click();
  await page.getByRole("menuitem", { name: "client-a/portal", exact: true }).click();
  const history = page.locator("[data-tab-id]:not(.hidden)").getByTestId("git-history");
  await expect(history).toContainText("Initial commit");
  await expect(page.locator("[role=tab][aria-selected=true]")).toContainText("client-a/portal");
  await hostCall(page, "projects.setFocusRepo", { id: added.value.id, repo: join(ws, "web") });
  await page.getByTestId("project-repos").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Git history", exact: true }).click();
  await expect(page.locator("[role=tab][aria-selected=true]")).toContainText("web");
  await expect(page.locator("[data-tab-id]:not(.hidden)").getByTestId("git-history")).toContainText(
    "Initial commit",
  );
});
