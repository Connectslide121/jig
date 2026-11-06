// Command-line arguments shared by the kit's scripts: one positional folder, `--name value` options.
import path from "node:path";
import { KIT_ROOT } from "./generate.ts";

export function parseArgs(argv: string[]): { target?: string; options: Record<string, string | true> } {
  const options: Record<string, string | true> = {};
  let target: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options[a.slice(2)] = next;
        i++;
      } else options[a.slice(2)] = true;
    } else if (target === undefined) target = a;
  }
  return { target, options };
}

/** The demo folder a command works on: the argument (from where npm was run), else the sample. */
export function demoFolder(target?: string): string {
  const cwd = process.env.INIT_CWD ?? process.cwd();
  return target ? path.resolve(cwd, target) : path.join(KIT_ROOT, "demos/sample");
}

/** Where a build goes: --out, else <demo>/dist. Never the demo folder or a folder holding it. */
export function outFolder(demoDir: string, out?: string | true): string {
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const dir = typeof out === "string" ? path.resolve(cwd, out) : path.join(demoDir, "dist");
  const inside = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);
  if (inside(demoDir, dir) || inside(KIT_ROOT, dir)) throw new Error(`Refusing to build into ${dir}: it would empty the demo's sources`);
  return dir;
}
