import { createHash } from "node:crypto";
import { builtinModules } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { build, type Message, type Plugin } from "esbuild";

/**
 * Bundles an add-on's UI (`ui.tsx`) into one ES module and its host part (`host.ts`) into a Node
 * module, with esbuild. The UI shares the app's React, design system and icons: those imports become
 * reads of `globalThis.__jigShared[name]`, which the renderer sets up (renderer/addons/shared.ts).
 */
export const SHARED_UI_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "@jig/sdk/ui",
  "@jig/sdk",
  "lucide-react",
];

const sharedModules: Plugin = {
  name: "jig-shared-modules",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      // On Windows the entry point is "C:\…", which the filter also matches.
      if (args.kind === "entry-point" || isAbsolute(args.path)) return undefined;
      if (SHARED_UI_MODULES.includes(args.path)) return { path: args.path, namespace: "jig-shared" };
      return {
        errors: [
          {
            text: `"${args.path}" can't be imported in an add-on UI. Use react, react-dom, lucide-react, @jig/sdk/ui or a relative file.`,
          },
        ],
      };
    });
    b.onLoad({ filter: /.*/, namespace: "jig-shared" }, (args) => ({
      contents: `module.exports = globalThis.__jigShared[${JSON.stringify(args.path)}];`,
      loader: "js",
    }));
  },
};

const format = (messages: Message[]) =>
  messages.map((m) =>
    m.location ? `${m.location.file}:${m.location.line}:${m.location.column} ${m.text}` : m.text,
  );

export interface BundleResult {
  code?: string;
  hash?: string;
  errors: string[];
  /** Every source file that went into the bundle (for the token check and Tailwind). */
  inputs: string[];
}

export async function bundleUi(entry: string): Promise<BundleResult> {
  try {
    const result = await build({
      entryPoints: [entry],
      absWorkingDir: dirname(entry),
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "chrome140",
      jsx: "automatic",
      sourcemap: "inline",
      metafile: true,
      logLevel: "silent",
      plugins: [sharedModules],
      loader: { ".svg": "dataurl", ".png": "dataurl" },
    });
    const code = result.outputFiles[0]!.text;
    return {
      code,
      hash: createHash("sha256").update(code).digest("hex").slice(0, 16),
      errors: [],
      inputs: Object.keys(result.metafile.inputs)
        .filter((f) => !f.startsWith("jig-shared:"))
        .map((f) => resolve(dirname(entry), f)),
    };
  } catch (error) {
    const errors = (error as { errors?: Message[] }).errors;
    return { errors: errors ? format(errors) : [String(error)], inputs: [] };
  }
}

const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export async function bundleHost(entry: string, nodePaths: string[]): Promise<BundleResult> {
  try {
    const result = await build({
      entryPoints: [entry],
      absWorkingDir: dirname(entry),
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      target: "node22",
      sourcemap: "inline",
      metafile: true,
      logLevel: "silent",
      external: [...nodeBuiltins, "electron"],
      nodePaths,
    });
    const code = result.outputFiles[0]!.text;
    return {
      code,
      hash: createHash("sha256").update(code).digest("hex").slice(0, 16),
      errors: [],
      inputs: Object.keys(result.metafile.inputs).map((f) => resolve(dirname(entry), f)),
    };
  } catch (error) {
    const errors = (error as { errors?: Message[] }).errors;
    return { errors: errors ? format(errors) : [String(error)], inputs: [] };
  }
}
