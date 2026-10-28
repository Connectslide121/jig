import type { DeepPartial, JigConfig } from "./config";
import type { Layout } from "./layout";

/**
 * Build jobs: "Build something…" from anywhere. A job runs a builder session (Claude Code with Jig's
 * builder instructions and the `jig-builder` tools) that picks the lightest level that works:
 * 1 = layout/settings, 2 = an add-on (preferring to change an existing one), 3 = Jig's source (phase 10).
 * Documented in docs/reference/builder.md.
 */
export type BuildOrigin = "tools" | "addon" | "chat" | "suggestion" | "settings";

export type BuildStatus =
  | "working" // the builder session is running
  | "needs_you" // the builder stopped or asks something: open its chat
  | "preview" // validated; waiting for Accept / Discard
  | "accepted"
  | "discarded"
  | "failed";

export type BuildKind = "layout" | "settings" | "change-addon" | "new-addon" | "app" | "nothing";

export interface LayoutOp {
  op: "move" | "hide" | "show" | "resize" | "collapse" | "expand";
  view?: string;
  region?: "left" | "right" | "bottom";
  size?: number;
}

export interface BuildLogEntry {
  at: string;
  text: string;
  tone?: "info" | "success" | "warning" | "danger";
}

export interface BuildFile {
  path: string;
  status: "added" | "modified" | "deleted";
  added: number;
  deleted: number;
}

export interface BuildJob {
  id: string;
  goal: string;
  origin: BuildOrigin;
  /** The chat that asked (origin "chat"), where a progress card is shown. */
  originSessionId?: string;
  /** An add-on the request is about ("Change this with AI", "Fix with AI"). */
  targetAddonId?: string;
  status: BuildStatus;
  createdAt: string;
  updatedAt: string;
  /** The builder's Claude Code session (open it to follow or answer). */
  sessionId?: string;
  /** Git worktree of ~/.jig/addons for level-2 work. */
  worktree?: string;
  branch?: string;
  kind?: BuildKind;
  level?: 1 | 2 | 3;
  addonId?: string;
  summary?: string;
  staged?: { layoutOps?: LayoutOp[]; layout?: Layout; settings?: DeepPartial<JigConfig> };
  files?: BuildFile[];
  permissions?: string[];
  problems?: string[];
  validationRounds: number;
  log: BuildLogEntry[];
  error?: string;
}

export interface BuildRequestInput {
  goal: string;
  origin: BuildOrigin;
  targetAddonId?: string;
  originSessionId?: string;
}
