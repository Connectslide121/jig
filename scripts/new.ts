// npm run new -- <folder> [--name "Product"]: a new demo from the template, ready for `npm run dev`.
import fs from "node:fs";
import path from "node:path";
import { demoFolder, parseArgs } from "./lib/args.ts";
import { KIT_ROOT } from "./lib/generate.ts";

const { target, options } = parseArgs(process.argv.slice(2));
if (!target) {
  console.error("Usage: npm run new -- <folder> [--name \"Product name\"]");
  process.exit(2);
}
const dir = demoFolder(target);
if (fs.existsSync(path.join(dir, "demo.tsx"))) {
  console.error(`${dir} already has a demo`);
  process.exit(1);
}
const name = typeof options.name === "string" ? options.name : "New product";
const template = path.join(KIT_ROOT, "templates/demo");
fs.mkdirSync(dir, { recursive: true });
fs.cpSync(template, dir, { recursive: true, force: false, errorOnExist: false });
const demoFile = path.join(dir, "demo.tsx");
fs.writeFileSync(demoFile, fs.readFileSync(demoFile, "utf8").replaceAll("__NAME__", name));
console.log(`New demo in ${dir}\n  npm run dev -- ${target}\n  npm run check -- ${target}`);
