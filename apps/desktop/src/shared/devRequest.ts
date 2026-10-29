import type { BuildJob, ExtensionProposal } from "./builds";

/**
 * A development request (D-119): when the builder finds that no layout change, setting or add-on can
 * do what someone asked, Jig packs what the developers need (a spec, a prompt for Claude Code in the
 * Jig repository, a clickable mockup, context) into a zip that one button emails to them.
 */
export interface DevRequestInfo {
  /** Same as the build's id. */
  id: string;
  title: string;
  /** The zip to send. */
  zipPath: string;
  /** The unpacked files, next to the zip. */
  folder: string;
  hasMockup: boolean;
  createdAt: string;
  /** When "Email to developers" last opened an email for it. */
  emailedAt?: string;
}

/** How the email was opened, so the UI can say what to do next. */
export type MailMethod = "outlook" | "apple-mail" | "xdg-email" | "eml" | "mailto" | "test";

export interface DevRequestContext {
  jigVersion: string;
  os: string;
  /** Switched-on add-ons (ids), so the developer knows what was there. */
  addons: string[];
  createdAt: string;
}

/** A request's title: the builder's, else the first line of what was asked. */
export function requestTitle(goal: string, proposal: ExtensionProposal): string {
  const title = proposal.title?.trim() || goal.split("\n")[0]!.trim() || "Development request";
  return title.length > 90 ? `${title.slice(0, 89)}…` : title;
}

const bullets = (items: readonly string[] | undefined) =>
  (items ?? []).filter((x) => x.trim()).map((x) => `- ${x.trim()}`);

/** SPEC.md: what to build and why, for a person or for Claude. */
export function requestSpec(
  job: Pick<BuildJob, "goal">,
  p: ExtensionProposal,
  ctx: DevRequestContext,
): string {
  const lines = [
    `# ${requestTitle(job.goal, p)}`,
    "",
    "A development request from Jig's builder: what someone asked for can't be built as a layout change, a setting or an add-on with today's extension points, so Jig needs a change in its source.",
    "",
    "## What was asked",
    "",
    job.goal
      .trim()
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n"),
  ];
  if (p.userStory?.trim()) lines.push("", "## User story", "", p.userStory.trim());
  lines.push("", "## Why an add-on can't do it today", "", p.reason.trim() || "(not given)");
  lines.push("", "## Proposed change to Jig", "", p.proposal.trim() || "(not given)");
  if (p.addonPlan?.trim()) lines.push("", "## Then, as an add-on", "", p.addonPlan.trim());
  const acceptance = bullets(p.acceptance);
  if (acceptance.length) lines.push("", "## Acceptance criteria", "", ...acceptance);
  if (p.mockupHtml)
    lines.push(
      "",
      "## Reference",
      "",
      "`mockup.html` in this package is a clickable mockup of the intended result (open it in a browser). It shows the idea; it is not code to copy.",
    );
  lines.push(
    "",
    "## Context",
    "",
    `- Jig ${ctx.jigVersion} on ${ctx.os}`,
    `- Add-ons switched on: ${ctx.addons.length ? ctx.addons.join(", ") : "none"}`,
    `- Requested: ${ctx.createdAt}`,
  );
  return `${lines.join("\n")}\n`;
}

/** PROMPT.md: everything Claude Code needs in a Jig clone, in one paste (the spec is inside it). */
export function requestPrompt(spec: string, hasMockup: boolean): string {
  return `Implement this development request for Jig. You are in the Jig repository.

1. Read AGENTS.md and the docs it points to first; follow them (architecture rules, design tokens, tests, docs and decisions in the same change).
2. Make the change as an extension point (a new slot, add-on API or setting), not as one-off core code, so the requested tool can then be built as an add-on (AGENTS.md: "New features of that kind start as a slot or add-on API").
3. Keep it as small as the request allows. Add unit tests, an e2e test where the UI changes, and update docs/reference, docs/status.md, docs/plan and docs/decisions.md.
4. If the spec leaves a real choice open, ask me before deciding.
5. When it's done, tell me how to build the requested tool on top of it (or build it as an add-on if that's quick).
${hasMockup ? "\nThe package also has mockup.html, a clickable mockup of the intended result. Ask me to share it if you need to see it.\n" : ""}
---

${spec}`;
}

/** The README in the package: what's inside and what to do with it. */
export function requestReadme(title: string, hasMockup: boolean): string {
  return `# Development request: ${title}

Made by Jig's builder: what was asked needs a change in Jig's source.

- SPEC.md: what to build, why, and how to know it's done.
- PROMPT.md: paste it into Claude Code in your Jig clone; it has the spec inside.
${hasMockup ? "- mockup.html: a clickable mockup of the intended result (open it in a browser).\n" : ""}- context.json: Jig's version, the OS and the add-ons that were on.
`;
}

/** The email: short, because the package carries the details. */
export function requestEmail(
  title: string,
  to: string,
  zipName: string,
): { to: string; subject: string; body: string } {
  return {
    to,
    subject: `Jig development request: ${title}`,
    body: `Hi,

Jig's builder couldn't make this as an add-on, so here is a development request:

${title}

The attached ${zipName} has the spec (SPEC.md), a prompt for Claude Code in the Jig repository (PROMPT.md) and, if there is one, a clickable mockup (mockup.html).

Thanks!
`,
  };
}

/** The zip's name: `jig-request-<title>-<id>.zip`. */
export function requestZipName(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `jig-request-${slug || "feature"}-${id.slice(0, 6)}.zip`;
}

/** A `mailto:` link (the last resort: no attachment, so the zip is shown in its folder). */
export function mailtoUrl(mail: { to: string; subject: string; body: string }): string {
  return `mailto:${encodeURIComponent(mail.to).replace("%40", "@")}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
}
