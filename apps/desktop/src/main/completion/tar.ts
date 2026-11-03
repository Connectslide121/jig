/**
 * Reads the files of a tar archive (the npm package of GitHub's Copilot language server, D-255):
 * ustar names with their prefix, and pax/GNU long names. Only regular files; links and devices are
 * skipped, and no name may leave the target folder.
 */
export interface TarFile {
  path: string;
  data: Uint8Array;
}

const text = (block: Uint8Array, from: number, length: number) => {
  const slice = block.subarray(from, from + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end < 0 ? slice : slice.subarray(0, end));
};

/** A safe relative path inside the archive, or undefined for one that would escape it. */
export function safePath(name: string): string | undefined {
  const parts = name
    .replaceAll("\\", "/")
    .split("/")
    .filter((p) => p && p !== ".");
  if (!parts.length || parts.some((p) => p === ".." || p.includes(":"))) return undefined;
  if (/^[a-z]:/i.test(name) || name.startsWith("/")) return undefined;
  return parts.join("/");
}

export function untar(archive: Uint8Array): TarFile[] {
  const files: TarFile[] = [];
  let offset = 0;
  let longName: string | undefined;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = Number.parseInt(text(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = text(header, 257, 6).startsWith("ustar") ? text(header, 345, 155) : "";
    const name = longName ?? (prefix ? `${prefix}/${text(header, 0, 100)}` : text(header, 0, 100));
    longName = undefined;
    const start = offset + 512;
    const data = archive.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
    if (type === "L") longName = text(data, 0, data.length);
    else if (type === "x") {
      const path = /\d+ path=([^\n]*)\n/.exec(new TextDecoder().decode(data))?.[1];
      if (path) longName = path;
    } else if (type === "0" || type === "\0" || type === "7") {
      const path = safePath(name);
      if (path) files.push({ path, data });
    }
  }
  return files;
}
