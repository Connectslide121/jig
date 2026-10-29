import { registerCoreActions } from "../workbench/actions";
import { registerAbout } from "./about";
import { registerArtifacts } from "./artifacts";
import { registerAttempts } from "./attempts";
import { registerBrowser } from "./browser";
import { registerBuilder } from "./builder";
import { registerDigest } from "./digest";
import { registerFiles } from "./files";
import { registerLearning } from "./learning";
import { registerLinks } from "./links";
import { registerPreview } from "./preview";
import { registerProjects } from "./projects";
import { registerRoutines } from "./routines";
import { registerSessions } from "./sessions";
import { registerSettings } from "./settings";
import { registerSetup } from "./setup";
import { registerTerminals } from "./terminals";
import { registerTour } from "./tour";
import { registerUsage } from "./usage";
import { registerWorktrees } from "./worktrees";

/** Registers every core view, tab type and action. Add-ons register theirs at runtime (phase 6). */
export function registerFeatures(): void {
  registerCoreActions();
  registerProjects();
  registerLinks();
  registerSessions();
  registerSettings();
  registerTerminals();
  registerBuilder();
  registerLearning();
  registerSetup();
  registerFiles();
  registerPreview();
  registerAttempts();
  registerBrowser();
  registerRoutines();
  registerArtifacts();
  registerTour();
  registerDigest();
  registerUsage();
  registerWorktrees();
  registerAbout();
}
