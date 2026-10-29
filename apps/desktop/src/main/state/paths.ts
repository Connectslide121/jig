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
  /** Images sent in chats, one folder per session. */
  attachments: () => join(jigHome(), "attachments"),
  themes: () => join(jigHome(), "themes"),
  addons: () => join(jigHome(), "addons"),
  addonData: () => join(jigHome(), "addon-data"),
  addonsState: () => join(jigHome(), "addons-state.json"),
  work: () => join(jigHome(), "work"),
  cache: () => join(jigHome(), "cache"),
  activity: () => join(jigHome(), "activity"),
  suggestions: () => join(jigHome(), "suggestions.json"),
  /** Notes Claude saved from chats for suggestions (Learning 2). */
  evidence: () => join(jigHome(), "evidence.json"),
  /** How you work, readable and editable (Learning 2). */
  profile: () => join(jigHome(), "profile.md"),
  builds: () => join(jigHome(), "builds.json"),
  scripts: () => join(jigHome(), "scripts.json"),
  logs: () => join(jigHome(), "logs"),
  /** The build that ran before the last update from source (launcher fallback). */
  appBuilds: () => join(jigHome(), "app-builds"),
};
