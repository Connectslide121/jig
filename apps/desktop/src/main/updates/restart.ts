import { spawn } from "node:child_process";
import { cp, mkdir, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Before an update from source goes live, the running build is kept as "previous"
 * (`~/.jig/app-builds/previous`), so the launcher can fall back to it. Then Jig restarts through the
 * launcher (apps/launcher/launcher.mjs, shipped next to the main bundle).
 */
const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** Copies the built app of `repo` (dist, package.json, built-in add-ons) and links its node_modules. */
export async function snapshotBuild(repo: string, target: string): Promise<string> {
  await rm(target, { recursive: true, force: true });
  const desktop = join(target, "apps", "desktop");
  await mkdir(desktop, { recursive: true });
  await cp(join(repo, "apps", "desktop", "dist"), join(desktop, "dist"), { recursive: true });
  await cp(join(repo, "apps", "desktop", "package.json"), join(desktop, "package.json"));
  if (await exists(join(repo, "addons")))
    await cp(join(repo, "addons"), join(target, "addons"), { recursive: true });
  const type = process.platform === "win32" ? "junction" : "dir";
  for (const rel of ["node_modules", join("apps", "desktop", "node_modules")]) {
    if (await exists(join(repo, rel))) await symlink(join(repo, rel), join(target, rel), type);
  }
  return desktop;
}

/** Starts the launcher (Electron in Node mode) and lets it restart Jig once this process exits. */
export function restartWithLauncher(options: {
  launcher: string;
  electron: string;
  app: string;
  previous?: string;
  home: string;
}): void {
  const args = [
    options.launcher,
    "--electron",
    options.electron,
    "--app",
    options.app,
    "--home",
    options.home,
    "--wait-pid",
    String(process.pid),
  ];
  if (options.previous) args.push("--previous", options.previous);
  const child = spawn(options.electron, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  child.unref();
}
