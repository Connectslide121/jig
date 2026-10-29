import { describe, expect, it } from "vitest";
import { type Exec, runSetupChecks } from "./checks";

describe("runSetupChecks", () => {
  it("asks only for versions and reports what's missing", async () => {
    const calls: string[] = [];
    const exec: Exec = async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (command === "/sdk/claude") return { code: 0, stdout: "2.3.4 (Claude Code)\n", stderr: "" };
      if (command === "git") return { code: 0, stdout: "git version 2.50.1.windows.1\n", stderr: "" };
      if (command === "az" && args[0] === "--version")
        return {
          code: 0,
          stdout: "WARNING: You have 2 update(s) available.\nazure-cli 2.80.0\n...",
          stderr: "",
        };
      if (command === "az") return { code: 1, stdout: "", stderr: "not installed" };
      return { code: 127, stdout: "", stderr: "not found" };
    };
    const checks = await runSetupChecks(exec, "/sdk/claude");
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(byId.claude).toMatchObject({ ok: true, optional: false });
    expect(byId.claude?.detail).toContain("2.3.4 (Claude Code)");
    expect(byId.git).toMatchObject({ ok: true, detail: "git version 2.50.1.windows.1" });
    expect(byId.gh).toMatchObject({ ok: false, optional: true });
    expect(byId.az).toMatchObject({ ok: true, detail: "azure-cli 2.80.0" });
    expect(byId["az-devops"]).toMatchObject({ ok: false, detail: "Not installed." });
    expect(byId.code?.ok).toBe(false);
    // Nothing but version / extension queries.
    expect(calls.every((c) => c.endsWith("--version") || c.includes("extension show"))).toBe(true);
  });

  it("asks Claude Code whether it's signed in, keeping only yes or no and how", async () => {
    const exec =
      (signedIn: boolean): Exec =>
      async (command, args) => {
        if (command !== "/sdk/claude") return { code: 127, stdout: "", stderr: "" };
        if (args[0] === "auth")
          return {
            code: 0,
            stdout: JSON.stringify({ loggedIn: signedIn, authMethod: "claude.ai", email: "me@example.com" }),
            stderr: "",
          };
        return { code: 0, stdout: "2.3.4 (Claude Code)\n", stderr: "" };
      };
    const [yes] = await runSetupChecks(exec(true), "/sdk/claude", { signIn: true });
    expect(yes).toMatchObject({ id: "claude", ok: true });
    expect(yes?.detail).toBe(
      "2.3.4 (Claude Code). Signed in with your Claude subscription. Jig's chats use this login.",
    );
    expect(yes?.detail).not.toContain("example.com");
    const [no] = await runSetupChecks(exec(false), "/sdk/claude", { signIn: true });
    expect(no).toMatchObject({ ok: false });
    expect(no?.detail).toContain("Not signed in");
  });

  it("says when no Claude Code binary is available", async () => {
    const checks = await runSetupChecks(async () => ({ code: 127, stdout: "", stderr: "" }), undefined);
    expect(checks[0]).toMatchObject({ id: "claude", ok: false });
    expect(checks[0]?.detail).toMatch(/^Not found/);
  });
});
