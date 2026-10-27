// Shared esbuild configuration for the main process and the preload script.
import { fileURLToPath } from "node:url";

export const appDir = fileURLToPath(new URL("..", import.meta.url));

/** Bundle our own code and workspace packages (TypeScript source); keep npm dependencies external. */
const externalizeDependencies = {
  name: "externalize-dependencies",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith("@jig/")) return undefined;
      return { path: args.path, external: true };
    });
  },
};

export const mainConfig = {
  entryPoints: { index: `${appDir}/src/main/index.ts` },
  outdir: `${appDir}/dist/main`,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  plugins: [externalizeDependencies],
  logLevel: "warning",
};

export const preloadConfig = {
  entryPoints: { index: `${appDir}/src/preload/index.ts` },
  outdir: `${appDir}/dist/preload`,
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: "inline",
  external: ["electron"],
  logLevel: "warning",
};
