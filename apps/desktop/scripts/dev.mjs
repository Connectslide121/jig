// Development: Vite dev server for the renderer (hot reload), esbuild watch for main/preload,
// Electron restarted whenever main or preload change.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { context } from "esbuild";
import { createServer } from "vite";
import { appDir, mainConfig, preloadConfig } from "./build-config.mjs";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const vite = await createServer({ configFile: `${appDir}/vite.config.ts` });
await vite.listen();
const url = vite.resolvedUrls?.local[0];
console.log(`Renderer dev server: ${url}`);

let electron;
let restarting = false;

function startElectron() {
  const args = [appDir];
  if (process.platform === "linux" && process.getuid?.() === 0) args.push("--no-sandbox");
  electron = spawn(electronPath, args, {
    stdio: "inherit",
    env: { ...process.env, JIG_RENDERER_URL: url, JIG_DEV: "1" },
  });
  electron.on("exit", () => {
    if (!restarting) void shutdown();
  });
}

function restartElectron() {
  if (!electron) return startElectron();
  restarting = true;
  electron.once("exit", () => {
    restarting = false;
    startElectron();
  });
  electron.kill();
}

/** Resolves on the first (initial) build; later successful builds restart Electron. */
function restartOnRebuild(name) {
  let resolveFirst;
  const firstBuild = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const plugin = {
    name: `restart-on-${name}`,
    setup(build) {
      let first = true;
      build.onEnd((result) => {
        if (first) {
          first = false;
          resolveFirst();
          return;
        }
        if (result.errors.length > 0) return;
        console.log(`[dev] ${name} changed — restarting Electron`);
        restartElectron();
      });
    },
  };
  return { plugin, firstBuild };
}

const mainWatch = restartOnRebuild("main");
const preloadWatch = restartOnRebuild("preload");
const mainCtx = await context({ ...mainConfig, plugins: [...mainConfig.plugins, mainWatch.plugin] });
const preloadCtx = await context({ ...preloadConfig, plugins: [preloadWatch.plugin] });
await Promise.all([mainCtx.watch(), preloadCtx.watch()]);
await Promise.all([mainWatch.firstBuild, preloadWatch.firstBuild]);
startElectron();

async function shutdown() {
  restarting = true;
  electron?.kill();
  await Promise.all([mainCtx.dispose(), preloadCtx.dispose(), vite.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
