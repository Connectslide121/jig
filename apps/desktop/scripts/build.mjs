// Production build: main (esbuild, ESM), preload (esbuild, CJS), renderer (Vite).
import { copyFile, mkdir, rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { appDir, mainAssets, mainConfig, preloadConfig } from "./build-config.mjs";

await rm(`${appDir}/dist`, { recursive: true, force: true });
await Promise.all([esbuild(mainConfig), esbuild(preloadConfig)]);
await mkdir(`${appDir}/dist/main`, { recursive: true });
for (const [from, to] of mainAssets) await copyFile(from, to);
await viteBuild({ configFile: `${appDir}/vite.config.ts`, logLevel: "warn" });
console.log("Built apps/desktop/dist");
