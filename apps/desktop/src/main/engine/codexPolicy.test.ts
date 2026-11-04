import { describe, expect, it } from "vitest";
import { codexExitError, codexPolicy } from "./codex";

describe("Codex permission modes", () => {
  it("runs Don't ask without a sandbox and never asks, like Claude Code's bypassPermissions (D-334)", () => {
    expect(codexPolicy("bypassPermissions", ["/extra"])).toEqual({
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      sandboxPolicy: { type: "dangerFullAccess" },
    });
  });

  it("asks before changes in a workspace-write sandbox without network", () => {
    expect(codexPolicy("default", ["/extra"])).toEqual({
      approvalPolicy: "untrusted",
      sandbox: "workspace-write",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: ["/extra"],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    });
  });

  it("accepts edits in the same sandbox, Codex asking only on request", () => {
    const policy = codexPolicy("acceptEdits");
    expect(policy.approvalPolicy).toBe("on-request");
    expect(policy.sandbox).toBe("workspace-write");
    expect(policy.sandboxPolicy).toMatchObject({
      type: "workspaceWrite",
      writableRoots: [],
      networkAccess: false,
    });
  });

  it("plans in a read-only sandbox", () => {
    expect(codexPolicy("plan", ["/extra"])).toEqual({
      approvalPolicy: "on-request",
      sandbox: "read-only",
      sandboxPolicy: { type: "readOnly", networkAccess: false },
    });
  });
});

describe("Codex's app-server ending", () => {
  it("says nothing when Jig stopped it or it ended cleanly", () => {
    expect(codexExitError(1, null, true, "boom")).toBeUndefined();
    expect(codexExitError(null, "SIGTERM", true, "")).toBeUndefined();
    expect(codexExitError(0, null, false, "bye")).toBeUndefined();
  });

  it("reports an exit code or a signal with the last line Codex logged", () => {
    expect(codexExitError(3, null, false, "starting\npanic: oops\n")).toBe(
      "Codex stopped (exit code 3): panic: oops",
    );
    expect(codexExitError(null, "SIGKILL", false, "")).toBe("Codex stopped (stopped by SIGKILL)");
  });
});
