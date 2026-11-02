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
    // Checking only tells; the user starts the download (D-236).
    updater.autoDownload = false;
    // Restart only after the user's Install and restart action, never on an ordinary quit.
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.on("update-available", (info) => {
      send({
        latest: info.version,
        available: true,
        download: undefined,
        percent: undefined,
        detail: `Jig ${info.version} is available.`,
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

const busy = () =>
  state?.download === "ready" || state?.download === "downloading" || state?.download === "installing";

export async function checkWindowsUpdates(): Promise<UpdateInfo> {
  if (busy()) return state!;
  try {
    const result = await updater().checkForUpdates();
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
        detail: `Jig ${result.updateInfo.version} is available.`,
      })
    );
  } catch (error) {
    return send({ download: "error", detail: `Couldn't check for updates: ${(error as Error).message}` });
  }
}

/** Starts the download the user asked for; progress and the result arrive as `updates.state`. */
export async function downloadWindowsUpdate(): Promise<UpdateInfo> {
  if (busy()) return state!;
  if (!state?.available) {
    await checkWindowsUpdates();
    if (!state?.available) return state!;
  }
  const info = send({
    download: "downloading",
    percent: 0,
    detail: `Downloading Jig ${state.latest ?? "update"}…`,
  });
  // Failures arrive through the updater's error event.
  void updater()
    .downloadUpdate()
    .catch(() => {});
  return info;
}

/** How long the "Installing…" notice shows before Jig closes for the installer. */
const INSTALL_NOTICE_MS = 2_000;

export const windowsUpdateReady = () => state?.download === "ready";

export function installWindowsUpdate(): boolean {
  if (!windowsUpdateReady()) return false;
  // Jig first says what happens next (a modal), so closing isn't a surprise; then the installer's own
  // window shows its progress and starts Jig again with --updated (D-236, D-252).
  send({ download: "installing", detail: `Installing Jig ${state?.latest ?? "update"}…` });
  setTimeout(() => updater().quitAndInstall(false, true), INSTALL_NOTICE_MS);
  return true;
}

/** Checks once shortly after Jig opens; an available update shows as a toast with Download. */
export function startWindowsUpdates(): void {
  if (!supportsWindowsUpdates() || process.env.JIG_ENGINE === "fake") return;
  const timer = setTimeout(() => void checkWindowsUpdates(), 5_000);
  timer.unref();
}
