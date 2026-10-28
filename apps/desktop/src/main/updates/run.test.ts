import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runCommand } from "./run";

describe("runCommand", () => {
  it.skipIf(process.platform === "win32")("ends the command and its children on timeout", async () => {
    const started = Date.now();
    // The shell starts a child that keeps the output pipe open; killing only the shell used to hang.
    const result = await runCommand("sleep 20 & sleep 20; wait", tmpdir(), { timeoutMs: 300 });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("reports output and success", async () => {
    const result = await runCommand("echo hello", tmpdir());
    expect(result).toMatchObject({ ok: true, code: 0, timedOut: false });
    expect(result.output).toContain("hello");
  });
});
