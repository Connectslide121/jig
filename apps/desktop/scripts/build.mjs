// Production build: main (esbuild, ESM), preload (esbuild, CJS), renderer (Vite).
import { rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { appDir, mainConfig, preloadConfig } from "./build-config.mjs";

await rm(`${appDir}/dist`, { recursive: true, force: true });
await Promise.all([esbuild(mainConfig), esbuild(preloadConfig)]);
await viteBuild({ configFile: `${appDir}/vite.config.ts`, logLevel: "warn" });
console.log("Built apps/desktop/dist");
