import { registerCoreActions } from "../workbench/actions";
import { registerAbout } from "./about";
import { registerAttempts } from "./attempts";
import { registerBuilder } from "./builder";
import { registerDigest } from "./digest";
import { registerFiles } from "./files";
import { registerLearning } from "./learning";
import { registerPreview } from "./preview";
import { registerProjects } from "./projects";
import { registerSessions } from "./sessions";
import { registerSettings } from "./settings";
import { registerSetup } from "./setup";
import { registerTerminals } from "./terminals";
import { registerTour } from "./tour";
import { registerUsage } from "./usage";

/** Registers every core view, tab type and action. Add-ons register theirs at runtime (phase 6). */
export function registerFeatures(): void {
  registerCoreActions();
  registerProjects();
  registerSessions();
  registerSettings();
  registerTerminals();
  registerBuilder();
  registerLearning();
  registerSetup();
  registerFiles();
  registerPreview();
  registerAttempts();
  registerTour();
  registerDigest();
  registerUsage();
  registerAbout();
}
