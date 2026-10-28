import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { getConfig } from "../config";
import { logger } from "../log";
import { jigHome } from "../state/paths";
import { restartWithLauncher } from "./restart";
import { isJigRepo } from "./workspace";

const log = logger("selfmod");
const here = dirname(fileURLToPath(import.meta.url));

/** Jig's source repository: Settings → Builder, else the repository Jig runs from (development). */
export async function sourceRepo(): Promise<string | undefined> {
  const configured = getConfig().builder.sourcePath;
  if (configured) return configured;
  if (app.isPackaged) return undefined;
  const running = join(app.getAppPath(), "..", "..");
  return (await isJigRepo(running)) ? running : undefined;
}

/** Restarts into `appDir` through the launcher, or undefined when restarts are off (JIG_NO_RESTART). */
export function restarter(): ((appDir: string, previous: string | undefined) => void) | undefined {
  if (process.env.JIG_NO_RESTART) return undefined;
  return (appDir, previous) => {
    log.info(`Restarting through the launcher into ${appDir}`);
    restartWithLauncher({
      launcher: join(here, "launcher.mjs"),
      electron: process.execPath,
      app: appDir,
      previous,
      home: jigHome(),
    });
    app.quit();
  };
}
