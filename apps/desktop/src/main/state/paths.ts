import { homedir } from "node:os";
import { join } from "node:path";

/** Root of everything Jig stores: `JIG_HOME` or `~/.jig`. See docs/reference/state.md. */
export function jigHome(): string {
  return process.env.JIG_HOME || join(homedir(), ".jig");
}

export const paths = {
  config: () => join(jigHome(), "config.json"),
  windowState: () => join(jigHome(), "window-state.json"),
  layout: () => join(jigHome(), "layout.json"),
  projects: () => join(jigHome(), "projects.json"),
  sessions: () => join(jigHome(), "sessions"),
  themes: () => join(jigHome(), "themes"),
  addons: () => join(jigHome(), "addons"),
  addonData: () => join(jigHome(), "addon-data"),
  work: () => join(jigHome(), "work"),
  cache: () => join(jigHome(), "cache"),
  activity: () => join(jigHome(), "activity"),
  suggestions: () => join(jigHome(), "suggestions.json"),
  builds: () => join(jigHome(), "builds.json"),
  scripts: () => join(jigHome(), "scripts.json"),
  logs: () => join(jigHome(), "logs"),
};
