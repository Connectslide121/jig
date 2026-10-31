import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import type { LibrarySkill } from "../../shared/skills";
import { getConfig } from "../config";
import { handle } from "../ipc/router";
import { SkillLibrary } from "./library";

let library: SkillLibrary | undefined;
export function skillLibrary(): SkillLibrary {
  if (!library) throw new Error("Skills library not started");
  return library;
}
export async function startSkills(): Promise<void> {
  const root = app.isPackaged
    ? join(process.resourcesPath, "skills")
    : join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "skills");
  library = new SkillLibrary(
    root,
    JSON.parse(await readFile(join(root, "catalog.json"), "utf8")) as LibrarySkill[],
  );
  handle("skills.list", () => skillLibrary().catalog);
  handle("skills.details", ({ id }) => skillLibrary().details(id));
}
export const selectedSkillPlugins = (projectId?: string) => skillLibrary().plugins(getConfig(), projectId);
