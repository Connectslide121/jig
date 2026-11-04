import { describe, expect, it } from "vitest";
import { codexPolicy } from "./codex";

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
