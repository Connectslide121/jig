import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { contributedIconThemes, contributedThemes, parseJsonc } from "@jig/themes";
import { unzipSync } from "fflate";
import { JigError } from "../../shared/ipc";
import type { OpenVsxExtension } from "../../shared/themes";
import { isInside } from "./sources";

/**
 * Open VSX (open-vsx.org): search theme extensions and install one by extracting only its
 * `package.json`, `package.nls.json` and JSON files (plus icons and fonts for file icon themes).
 * Nothing from the `.vsix` is executed. Installed
 * extensions live in `~/.jig/themes/openvsx/<namespace>.<name>/`.
 */
export const OPEN_VSX = "https://open-vsx.org/api";
const MAX_VSIX_BYTES = 50 * 1024 * 1024;

export type Fetch = (url: string) => Promise<Response>;

interface SearchResponse {
  extensions?: Array<{
    namespace: string;
    name: string;
    displayName?: string;
    description?: string;
    version?: string;
    downloadCount?: number;
    files?: { icon?: string };
  }>;
}

const NAME = /^[\w.-]+$/;

export async function searchOpenVsx(query: string, fetchImpl: Fetch = fetch): Promise<OpenVsxExtension[]> {
  const url = `${OPEN_VSX}/-/search?${new URLSearchParams({
    query,
    category: "Themes",
    size: "30",
    sortBy: query.trim() ? "relevance" : "downloadCount",
    sortOrder: "desc",
  })}`;
  const response = await fetchImpl(url).catch((error: unknown) => {
    throw new JigError("network", `Open VSX is not reachable: ${(error as Error).message}`);
  });
  if (!response.ok) throw new JigError("network", `Open VSX search failed (${response.status})`);
  const body = (await response.json()) as SearchResponse;
  return (body.extensions ?? []).map((e) => ({
    namespace: e.namespace,
    name: e.name,
    displayName: e.displayName || e.name,
    description: e.description ?? "",
    version: e.version ?? "",
    downloads: e.downloadCount ?? 0,
    iconUrl: e.files?.icon,
  }));
}

/** Downloads `namespace.name` and extracts its theme files into `targetRoot/<namespace>.<name>`. */
export async function installOpenVsx(
  namespace: string,
  name: string,
  targetRoot: string,
  fetchImpl: Fetch = fetch,
): Promise<string> {
  if (!NAME.test(namespace) || !NAME.test(name)) throw new JigError("invalid_args", "Invalid extension name");
  const meta = await fetchImpl(`${OPEN_VSX}/${namespace}/${name}`);
  if (!meta.ok) throw new JigError("not_found", `Extension ${namespace}.${name} not found on Open VSX`);
  const download = ((await meta.json()) as { files?: { download?: string } }).files?.download;
  if (!download?.startsWith("https://")) throw new JigError("not_found", "Extension has no download");
  const response = await fetchImpl(download);
  if (!response.ok) throw new JigError("network", `Download failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_VSIX_BYTES) throw new JigError("too_large", "Extension is too large");
  return extractThemeVsix(bytes, join(targetRoot, `${namespace}.${name}`));
}

/**
 * Extracts the theme parts of a `.vsix` (a zip with the extension under `extension/`): JSON files, and
 * for file icon themes also their icons and fonts (svg, png, jpg, gif, webp, woff, woff2, ttf, otf).
 */
export async function extractThemeVsix(bytes: Uint8Array, targetDir: string): Promise<string> {
  const manifestBytes = unzipSync(bytes, { filter: (file) => file.name === "extension/package.json" })[
    "extension/package.json"
  ];
  if (!manifestBytes) throw new JigError("invalid_extension", "No package.json in the extension");
  const manifest = parseJsonc(new TextDecoder().decode(manifestBytes));
  const icons = contributedIconThemes(manifest).length > 0;
  if (contributedThemes(manifest).length === 0 && !icons)
    throw new JigError(
      "not_a_theme",
      "This extension does not contribute a colour theme or a file icon theme",
    );
  const wanted = icons ? /\.(json|jsonc|svg|png|jpe?g|gif|webp|woff2?|ttf|otf)$/i : /\.(json|jsonc)$/i;
  const files = unzipSync(bytes, {
    filter: (file) =>
      file.name.startsWith("extension/") &&
      !file.name.includes("node_modules/") &&
      wanted.test(file.name) &&
      file.originalSize < 10 * 1024 * 1024,
  });

  const temp = `${targetDir}.tmp-${Date.now()}`;
  await rm(temp, { recursive: true, force: true });
  for (const [name, data] of Object.entries(files)) {
    const relative = posix.normalize(name.slice("extension/".length));
    const out = join(temp, ...relative.split("/"));
    if (!isInside(out, temp) || relative.startsWith("..")) continue;
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, data);
  }
  await rm(targetDir, { recursive: true, force: true });
  await rename(temp, targetDir);
  return targetDir;
}
