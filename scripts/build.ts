// npm run build -- <demo folder> [--out <folder>]: the demo as one self-contained index.html that
// opens from disk (no server, no network).
import { build } from "vite";
import { demoFolder, outFolder, parseArgs } from "./lib/args.ts";
import { KIT_ROOT } from "./lib/generate.ts";

export async function buildDemo(demoDir: string, out: string) {
  process.env.KIT_DEMO = demoDir;
  process.env.KIT_OUT = out;
  await build({ configFile: `${KIT_ROOT}/vite.config.ts`, logLevel: "warn" });
}

if (import.meta.main) {
  const { target, options } = parseArgs(process.argv.slice(2));
  const demo = demoFolder(target);
  const out = outFolder(demo, options.out);
  await buildDemo(demo, out);
  console.log(`Built ${out}/index.html`);
}
