import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { generate, KIT_ROOT } from "./scripts/lib/generate.ts";

// Which demo to build or serve: KIT_DEMO (set by `npm run dev|build -- <folder>`), else the sample.
const DEMO = process.env.KIT_DEMO ?? path.join(KIT_ROOT, "demos/sample");

/**
 * A demo may live outside the kit (a run folder in a product repository). Its bare imports
 * (react, lucide-react…) resolve from the kit's node_modules, and edits to its tokens regenerate CSS.
 */
function kitDemo(demoDir: string, tokensPath: string): Plugin {
  const entry = path.join(KIT_ROOT, "src/main.tsx");
  const inKit = (file: string) => file.startsWith(KIT_ROOT + path.sep) && !file.includes(`${path.sep}node_modules${path.sep}`);
  return {
    name: "kit-demo",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || inKit(importer) || source.startsWith(".") || source.startsWith("/") || source.startsWith("\0")) return null;
      if (!importer.startsWith(demoDir) || source.startsWith("@demo") || source.startsWith("@/")) return null;
      return this.resolve(source, entry, { ...options, skipSelf: true });
    },
    configureServer(server) {
      server.watcher.add(tokensPath);
      server.watcher.on("change", async (file) => {
        if (path.resolve(file) === tokensPath) await generate(demoDir);
      });
    },
  };
}

export default defineConfig(async () => {
  const paths = await generate(DEMO);
  const out = process.env.KIT_OUT ?? path.join(paths.demoDir, "dist");
  return {
    root: KIT_ROOT,
    base: "./",
    plugins: [kitDemo(paths.demoDir, paths.tokensPath), react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
    resolve: {
      alias: {
        "@demo": paths.demoDir,
        "@generated": paths.genDir,
        "@": path.join(KIT_ROOT, "src"),
      },
      dedupe: ["react", "react-dom"],
    },
    server: { fs: { allow: [KIT_ROOT, paths.demoDir] } },
    build: {
      outDir: out,
      emptyOutDir: fs.existsSync(out) ? true : undefined,
      assetsInlineLimit: Number.POSITIVE_INFINITY,
      chunkSizeWarningLimit: 4000,
      reportCompressedSize: false,
    },
  };
});
