/**
 * Whether Claude Code is signed in, asked from Claude Code itself (`claude auth status --json`).
 * Only "signed in" and how are kept: never the account's email, organisation or any credential.
 */
export interface ClaudeSignIn {
  loggedIn: boolean;
  /** In words: "your Claude subscription", "an Anthropic Console account"… */
  method?: string;
}

const METHODS: Record<string, string> = {
  "claude.ai": "your Claude subscription",
  console: "an Anthropic Console account (API billing)",
  api_key: "an API key",
  apiKey: "an API key",
};

/** Reads `claude auth status --json`; undefined when it isn't that. */
export function parseSignIn(stdout: string): ClaudeSignIn | undefined {
  try {
    const json = JSON.parse(stdout.trim()) as { loggedIn?: unknown; authMethod?: unknown };
    if (typeof json.loggedIn !== "boolean") return undefined;
    const method =
      typeof json.authMethod === "string" ? (METHODS[json.authMethod] ?? json.authMethod) : undefined;
    return { loggedIn: json.loggedIn, method: json.loggedIn ? method : undefined };
  } catch {
    return undefined;
  }
}

/** The sentence for Check your setup and the sign-in toast. */
export function signInText(signIn: ClaudeSignIn | undefined): string {
  if (!signIn) return "Couldn't ask Claude Code whether it's signed in.";
  return signIn.loggedIn
    ? `Signed in${signIn.method ? ` with ${signIn.method}` : ""}. Jig's chats use this login.`
    : "Not signed in: use Sign in to Claude Code….";
}
