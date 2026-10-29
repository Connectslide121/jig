import type { Classified } from "./commits";
import type { ReleasePolicy } from "./policy";
import type { Bump } from "./version";

/**
 * Claude's part of a release (pure, tested): the prompt for the bump suggestion, the changelog and the
 * user notes, and reading its answer. Used once per release, when you click "Draft with Claude".
 */
export interface Draft {
  bump?: Bump;
  reason?: string;
  changelog?: string;
  notes: Array<{ audience: string; language: string; text: string }>;
}

export function releasePrompt(input: {
  repo: string;
  current?: string;
  version: string;
  policy: ReleasePolicy;
  commits: Classified[];
  date: string;
}): string {
  const audiences = input.policy.notes?.length
    ? input.policy.notes
    : [{ audience: "users of the product", language: "English" }];
  const commits = input.commits
    .slice(0, 200)
    .map(
      (c) =>
        `- ${c.hash.slice(0, 7)} ${c.subject}${c.body.trim() ? ` — ${c.body.trim().split("\n")[0]}` : ""}`,
    )
    .join("\n");
  return [
    `Prepare the release notes for ${input.repo}.`,
    `Current version: ${input.current ?? "none yet (first release)"}. Proposed version: ${input.version} (${input.policy.scheme}).`,
    "",
    "Commits since the last release:",
    commits || "(none)",
    "",
    "Answer with JSON only, no prose around it:",
    '{"bump": "major"|"minor"|"patch", "reason": "one sentence", "changelog": "markdown", "notes": [{"audience": "...", "language": "...", "text": "markdown"}]}',
    `- bump: SemVer meaning (breaking → major, new features → minor, fixes → patch).${input.policy.scheme === "calver" ? " The scheme is CalVer, so the bump only informs the reason." : ""}`,
    `- changelog: a Keep a Changelog section starting with "## [${input.version}] - ${input.date}", with ### Added / ### Changed / ### Fixed (only those with entries). Short, for developers. Skip chores, CI and merges.`,
    `- notes: one entry per audience: ${audiences.map((a) => `${a.audience} (${a.language})`).join("; ")}. Plain language, what changes for them, no commit hashes.`,
  ].join("\n");
}

/** Claude's answer as a draft; tolerates a code fence or text around the JSON. */
export function parseDraft(answer: string): Draft | undefined {
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const raw = JSON.parse(answer.slice(start, end + 1));
    const bump = ["major", "minor", "patch"].includes(raw.bump) ? (raw.bump as Bump) : undefined;
    const notes = Array.isArray(raw.notes)
      ? raw.notes
          .filter((n: unknown): n is Record<string, unknown> => Boolean(n) && typeof n === "object")
          .map((n: Record<string, unknown>) => ({
            audience: String(n.audience ?? "Users"),
            language: String(n.language ?? "English"),
            text: String(n.text ?? ""),
          }))
          .filter((n: { text: string }) => n.text.trim())
      : [];
    return {
      bump,
      reason: typeof raw.reason === "string" ? raw.reason : undefined,
      changelog: typeof raw.changelog === "string" ? raw.changelog.trim() : undefined,
      notes,
    };
  } catch {
    return undefined;
  }
}

/** The notes as one Markdown text (to copy or put in the tag message). */
export function notesMarkdown(version: string, notes: Draft["notes"]): string {
  if (!notes.length) return "";
  if (notes.length === 1) return `# ${version}\n\n${notes[0]!.text.trim()}\n`;
  return `# ${version}\n\n${notes.map((n) => `## ${n.audience} (${n.language})\n\n${n.text.trim()}`).join("\n\n")}\n`;
}

/** A setup chat's first message: what detection found, and what to write. */
export function setupPrompt(input: { repo: string; detection: unknown; existing?: string }): string {
  return [
    `Set up versioning and releases for ${input.repo}.`,
    "",
    "Jig's Releases add-on found this (no AI, just files, tags and commits):",
    "```json",
    JSON.stringify(input.detection, null, 2),
    "```",
    input.existing ? `\nThe current policy (.jig/release.json):\n\`\`\`json\n${input.existing}\n\`\`\`` : "",
    "",
    "Look at the repository (stack, how it is deployed, pipelines, history), then ask me only what you can't work out. Then write `.jig/release.json`:",
    "- If versioning is already in place, adopt it: describe what the team already does (scheme, tag format, changelog, tools) and change nothing else. A tool such as GitVersion stays in charge (`managedBy`).",
    "- If there is none, propose rules with a reason for each: SemVer for APIs and libraries, CalVer for sites and apps that just ship; the one file the version lives in; the tag format; environments (stage gets release candidates, prod the release); audiences and languages for the notes; a commit convention (optional); when to release.",
    "- The release style: `planned` (versions, candidates, notes per release), `continuous` (every prod deploy is a release, versioned automatically), or `none`.",
    "",
    "The file's shape:",
    "```json",
    JSON.stringify(
      {
        version: 1,
        style: "planned",
        scheme: "semver",
        versionFile: "Directory.Build.props",
        managedBy: "GitVersion (optional)",
        tagFormat: "v{version}",
        changelog: { path: "CHANGELOG.md" },
        notes: [{ audience: "customers", language: "Swedish" }],
        commitConvention: "conventional",
        cadence: "before-prod-deploy",
        environments: [
          {
            name: "stage",
            deploy: "pipeline",
            pipeline: { org: "https://dev.azure.com/x", project: "Shop", id: 12 },
            prerelease: "rc",
          },
          { name: "prod", deploy: "manual", production: true },
        ],
      },
      null,
      2,
    ),
    "```",
    "Show me the proposal before writing the file.",
  ].join("\n");
}
