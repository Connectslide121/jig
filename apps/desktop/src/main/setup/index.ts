import { join } from "node:path";
import { app, net, shell } from "electron";
import { JigError } from "../../shared/ipc";
import { compareVersions, type UpdateInfo } from "../../shared/setup";
import { getConfig } from "../config";
import { handle } from "../ipc/router";
import { logger } from "../log";
import { paths } from "../state/paths";
import { claudeBinary } from "../terminals/claudeBinary";
import { restarter, sourceRepo } from "../updates/relaunch";
import { sourceStatus, updateSource } from "../updates/source";
import { execTool, runSetupChecks } from "./checks";

const log = logger("setup");

/** Where installed builds look for new releases (GitHub releases of Jig's repository). */
export const RELEASES_REPO = "Connectslide121/jig";

async function latestRelease(): Promise<{ version: string; url: string }> {
  const response = await net.fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Jig" },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const release = (await response.json()) as { tag_name?: string; html_url?: string };
  if (!release.tag_name) throw new Error("No release found");
  return {
    version: release.tag_name.replace(/^v/i, ""),
    url: release.html_url ?? `https://github.com/${RELEASES_REPO}/releases`,
  };
}

async function checkForUpdates(): Promise<UpdateInfo> {
  const current = app.getVersion();
  const repo = app.isPackaged ? undefined : await sourceRepo();
  if (repo) {
    try {
      const status = await sourceStatus(repo);
      if (!status.upstream)
        return {
          mode: "source",
          current,
          available: false,
          detail: `${status.branch} has no upstream branch to pull from.`,
        };
      return {
        mode: "source",
        current,
        available: status.behind > 0,
        detail:
          status.behind > 0
            ? `${status.behind} new commit${status.behind === 1 ? "" : "s"} on ${status.upstream}.`
            : `Up to date with ${status.upstream}.`,
      };
    } catch (error) {
      return {
        mode: "source",
        current,
        available: false,
        detail: `Couldn't check: ${(error as Error).message}`,
      };
    }
  }
  try {
    const latest = await latestRelease();
    const available = compareVersions(latest.version, current) > 0;
    return {
      mode: "release",
      current,
      latest: latest.version,
      available,
      url: latest.url,
      detail: available ? `Jig ${latest.version} is available.` : `Jig ${current} is the latest release.`,
    };
  } catch (error) {
    return {
      mode: "release",
      current,
      available: false,
      detail: `Couldn't check: ${(error as Error).message}`,
    };
  }
}

export function registerSetupHandlers(): void {
  handle("setup.check", () => runSetupChecks(execTool, claudeBinary(getConfig().engine.claudePath)));
  handle("updates.check", () => checkForUpdates());
  handle("updates.apply", async () => {
    const info = await checkForUpdates();
    if (info.mode === "release") {
      if (info.url) await shell.openExternal(info.url);
      return { restarting: false };
    }
    const repo = await sourceRepo();
    if (!repo) throw new JigError("no_source", "Jig isn't running from a git clone");
    const b = getConfig().updates;
    try {
      const result = await updateSource(
        repo,
        { build: b.buildCommand, install: b.installCommand },
        join(paths.appBuilds(), "previous"),
      );
      log.info(`Updated ${result.from.slice(0, 8)} → ${result.to.slice(0, 8)}`);
      const restart = restarter();
      if (restart) setTimeout(() => restart(join(repo, "apps", "desktop"), result.previous), 300);
      return { restarting: Boolean(restart) };
    } catch (error) {
      throw new JigError("update_failed", (error as Error).message);
    }
  });
}
