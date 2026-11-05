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
  /** The version each gallery or imported add-on came as, to show edits and restore it (D-249). */
  addonOriginals: () => join(jigHome(), "addon-originals"),
  addonsState: () => join(jigHome(), "addons-state.json"),
  work: () => join(jigHome(), "work"),
  cache: () => join(jigHome(), "cache"),
  /** Speech-to-text models, downloaded on first use (D-208). */
  models: () => join(jigHome(), "models"),
  activity: () => join(jigHome(), "activity"),
  suggestions: () => join(jigHome(), "suggestions.json"),
  /** Notes Claude saved from chats for suggestions (Learning 2). */
  evidence: () => join(jigHome(), "evidence.json"),
  /** How you work, readable and editable (Learning 2). */
  profile: () => join(jigHome(), "profile.md"),
  builds: () => join(jigHome(), "builds.json"),
  scripts: () => join(jigHome(), "scripts.json"),
  logs: () => join(jigHome(), "logs"),
  /** Best-of-N runs: one JSON per run, worktrees inside. */
  attempts: () => join(jigHome(), "attempts"),
  worktrees: () => join(jigHome(), "worktrees"),
  worktreeChats: () => join(jigHome(), "worktree-chats.json"),
  /** Development requests: one folder per build (its files and the zip). */
  devRequests: () => join(jigHome(), "dev-requests"),
  /** Azure tenants (D-282): one Azure CLI folder per added tenant, and `tenants.json`. */
  azure: () => join(jigHome(), "azure"),
  azureTenants: () => join(jigHome(), "azure", "tenants.json"),
  /** Your phone's Telegram bot (D-350): its token encrypted with the OS, and who it is paired with. */
  phone: () => join(jigHome(), "phone.json"),
  /** The "Set up Teams" progress (D-370): where the Azure pieces went and what was made. No secrets. */
  phoneTeamsSetup: () => join(jigHome(), "phone-teams-setup.json"),
  /** The Teams app package setup writes, to upload in Teams. */
  phoneTeamsPackage: () => join(jigHome(), "teams", "jig-teams-app.zip"),
  /** The build that ran before the last update from source (launcher fallback). */
  appBuilds: () => join(jigHome(), "app-builds"),
};
