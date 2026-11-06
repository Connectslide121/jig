import { cp, realpath, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { JigError } from "../../shared/ipc";
import { isInside } from "../themes/sources";

export interface CopyPickers {
  /** A Save dialog: where to put the file (undefined: cancelled). */
  file(defaultName: string): Promise<string | undefined>;
  /** A folder picker: the folder to copy into (undefined: cancelled). */
  folder(): Promise<string | undefined>;
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** `name`, or `name 2`, `name 3`… when something of that name is already in `folder`. */
export async function freeName(folder: string, name: string): Promise<string> {
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 1; ; i++) {
    const candidate = join(folder, i === 1 ? name : `${stem} ${i}${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
}

/** A name that is safe as a file or folder name (no separators or characters Windows refuses). */
export const safeName = (name: string) =>
  [...name]
    .map((c) => (c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 120) || "copy";

/**
 * `ctx.saveCopy`: copies a file or folder out of an add-on's own data folder to where the user chooses.
 * Anything outside that folder is refused, so an add-on can't use it to read other files. Never
 * overwrites: a folder lands in `<chosen>/<name>` (numbered when taken); a file goes where the Save dialog
 * says, which has already asked about replacing.
 */
export async function saveAddonCopy(
  dataFolder: string,
  from: string,
  options: { name?: string },
  pick: CopyPickers,
): Promise<string | undefined> {
  const root = await realpath(dataFolder).catch(() => undefined);
  const source = await realpath(from).catch(() => undefined);
  if (!root || !source || !isInside(source, root) || source === root)
    throw new JigError("invalid_args", "That isn't in the add-on's own data folder");
  const info = await stat(source);
  const name = safeName(options.name ?? basename(source));
  if (info.isDirectory()) {
    const folder = await pick.folder();
    if (!folder) return undefined;
    const target = await freeName(folder, name);
    await cp(source, target, { recursive: true, errorOnExist: true, force: false });
    return target;
  }
  const target = await pick.file(name);
  if (!target) return undefined;
  await cp(source, target, { force: true });
  return target;
}
