import { describe, expect, it } from "vitest";
import { parseSignIn, signInText } from "./signIn";

describe("Claude Code sign-in", () => {
  it("keeps only whether you're signed in and how, never who", () => {
    const out = JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      email: "someone@example.com",
      orgId: "org-1",
      orgName: "Example",
    });
    expect(parseSignIn(out)).toEqual({ loggedIn: true, method: "your Claude subscription" });
    expect(parseSignIn(JSON.stringify({ loggedIn: false, authMethod: "none" }))).toEqual({
      loggedIn: false,
      method: undefined,
    });
    expect(parseSignIn("Not JSON")).toBeUndefined();
    expect(parseSignIn("{}")).toBeUndefined();
  });

  it("says it in words", () => {
    expect(signInText({ loggedIn: true, method: "your Claude subscription" })).toBe(
      "Signed in with your Claude subscription. Jig's chats use this login.",
    );
    expect(signInText({ loggedIn: false })).toContain("Sign in to Claude Code");
    expect(signInText(undefined)).toContain("Couldn't ask");
  });
});
