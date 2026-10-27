import { registerCoreActions } from "../workbench/actions";
import { registerProjects } from "./projects";
import { registerSessions } from "./sessions";
import { registerSettings } from "./settings";
import { registerTerminals } from "./terminals";

/** Registers every core view, tab type and action. Add-ons register theirs at runtime (phase 6). */
export function registerFeatures(): void {
  registerCoreActions();
  registerProjects();
  registerSessions();
  registerSettings();
  registerTerminals();
}
