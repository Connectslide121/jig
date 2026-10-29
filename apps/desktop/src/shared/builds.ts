import type { DeepPartial, JigConfig } from "./config";
import type { Layout } from "./layout";

/**
 * Build jobs: "Build something…" from anywhere. A job runs a builder session (Claude Code with Jig's
 * builder instructions and the `jig-builder` tools) that picks the lightest level that works:
 * 1 = layout/settings, 2 = an add-on (preferring to change an existing one). When neither can do it,
 * the builder proposes the missing extension point instead of changing Jig (`ExtensionProposal`).
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
  op: "move" | "hide" | "show" | "resize" | "collapse" | "expand" | "below";
  view?: string;
  /** For "below": the view to show `view` under, as a collapsible section in its tab. */
  host?: string;
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

/**
 * What the builder writes when no slot can do the request (D-074: Jig never edits its own code): the
 * extension point Jig is missing, for you to add to Jig's source yourself.
 */
export interface ExtensionProposal {
  /** Why no layout change, setting or add-on can do it. */
  reason: string;
  /** The new slot or API, what it would let add-ons do, and how the request would then be built. */
  proposal: string;
  /** For the development request (D-119): a short name for it. */
  title?: string;
  /** "As a …, I want … so that …". */
  userStory?: string;
  /** How the developer knows it's done. */
  acceptance?: string[];
  /** How the request is built as an add-on once the extension point exists. */
  addonPlan?: string;
  /** A self-contained, clickable HTML mockup of the intended result. */
  mockupHtml?: string;
}

export interface BuildJob {
  id: string;
  goal: string;
  origin: BuildOrigin;
  /** The chat that asked (origin "chat"), where a progress card is shown. */
  originSessionId?: string;
  /** An add-on the request is about ("Change this with AI", "Fix with AI"). */
  targetAddonId?: string;
  /**
   * What the build's changes are compared with: the commit of the copy of a built-in add-on it
   * changes (so only the builder's edits show), else where the build's branch started.
   */
  base?: string;
  status: BuildStatus;
  createdAt: string;
  updatedAt: string;
  /** The builder's Claude Code session (open it to follow or answer). */
  sessionId?: string;
  /** Git worktree of ~/.jig/addons for level-2 work. */
  worktree?: string;
  branch?: string;
  kind?: BuildKind;
  level?: 1 | 2;
  addonId?: string;
  summary?: string;
  staged?: { layoutOps?: LayoutOp[]; layout?: Layout; settings?: DeepPartial<JigConfig> };
  files?: BuildFile[];
  permissions?: string[];
  problems?: string[];
  validationRounds: number;
  /** Set when the request needs a new extension point in Jig (kind "app"). */
  proposal?: ExtensionProposal;
  /** How many times the builder has written the development request (1, then each revision). */
  revision?: number;
  log: BuildLogEntry[];
  error?: string;
}

export interface BuildRequestInput {
  goal: string;
  origin: BuildOrigin;
  targetAddonId?: string;
  originSessionId?: string;
}
