import { app } from "electron";
import electronUpdater from "electron-updater";
import type { UpdateInfo } from "../../shared/setup";
import { emit } from "../ipc/router";
import { logger } from "../log";

const log = logger("updates");
let state: UpdateInfo | undefined;
let started = false;

export const supportsWindowsUpdates = () => app.isPackaged && process.platform === "win32";

function send(patch: Partial<UpdateInfo>): UpdateInfo {
  state = {
    mode: "release",
    current: app.getVersion(),
    available: false,
    detail: "Checking for updates…",
    ...state,
    ...patch,
  };
  emit("updates.state", state);
  return state;
}

function updater() {
  const updater = electronUpdater.autoUpdater;
  if (!started) {
    started = true;
    updater.autoDownload = true;
    // Restart only after the user's Install and restart action, never on an ordinary quit.
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.on("update-available", (info) => {
      send({
        latest: info.version,
        available: true,
        download: "downloading",
        percent: 0,
        detail: `Downloading Jig ${info.version}…`,
      });
    });
    updater.on("download-progress", (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
      if (percent !== state?.percent)
        send({
          download: "downloading",
          percent,
          detail: `Downloading Jig ${state?.latest ?? "update"} — ${percent}%`,
        });
    });
    updater.on("update-downloaded", (info) => {
      send({
        latest: info.version,
        available: true,
        download: "ready",
        percent: 100,
        detail: `Jig ${info.version} is ready to install.`,
      });
    });
    updater.on("error", (error) => {
      log.warn("Update failed", error);
      send({ download: "error", detail: `Couldn't update: ${error.message}` });
    });
  }
  return updater;
}

export async function checkWindowsUpdates(): Promise<UpdateInfo> {
  if (state?.download === "ready" || state?.download === "downloading") return state;
  try {
    const result = await updater().checkForUpdates();
    // Downloads run in the background; always handle their rejection.
    void result?.downloadPromise?.catch(() => {});
    if (!result?.isUpdateAvailable)
      return send({
        available: false,
        latest: result?.updateInfo.version,
        download: undefined,
        percent: undefined,
        detail: "Jig is up to date.",
      });
    return (
      state ??
      send({
        available: true,
        latest: result.updateInfo.version,
        download: "downloading",
        detail: "Downloading update…",
      })
    );
  } catch (error) {
    return send({ download: "error", detail: `Couldn't check for updates: ${(error as Error).message}` });
  }
}

export function installWindowsUpdate(): boolean {
  if (state?.download !== "ready") return false;
  setTimeout(() => updater().quitAndInstall(true, true), 300);
  return true;
}

export function startWindowsUpdates(): void {
  if (!supportsWindowsUpdates() || process.env.JIG_ENGINE === "fake") return;
  const timer = setTimeout(() => void checkWindowsUpdates(), 15_000);
  timer.unref();
}
