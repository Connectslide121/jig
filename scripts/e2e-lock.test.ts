import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GOT_LINE as VIEW_GOT, WAITING_LINE as VIEW_WAITING } from "../addons/tests/lib/results";
import { GOT_LINE, heldByOther, orphanTestElectrons, stale, WAITING_LINE } from "./e2e-lock";

const LOADER = "-r E:\\repo\\node_modules\\playwright-core\\lib\\server\\electron\\loader.js";

describe("the computer's e2e lock (D-420)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("is stale when its process is gone, it is very old, or unreadable for a while", () => {
    const owner = { pid: 42, at: "", cwd: "", what: "e2e:changed" };
    expect(stale(owner, 1000, () => true)).toBe(false);
    expect(stale(owner, 1000, () => false)).toBe(true);
    expect(stale(owner, 4 * 60 * 60 * 1000, () => true)).toBe(true);
    expect(stale(undefined, 1000)).toBe(false);
    expect(stale(undefined, 20_000)).toBe(true);
  });

  it("tells whether another live process holds it", () => {
    const dir = mkdtempSync(join(tmpdir(), "jig-lock-test-"));
    dirs.push(dir);
    const file = join(dir, "lock");
    expect(heldByOther(file)).toBe(false);
    writeFileSync(file, JSON.stringify({ pid: process.pid, at: "", cwd: "", what: "e2e" }));
    expect(heldByOther(file)).toBe(false);
    writeFileSync(file, JSON.stringify({ pid: process.ppid, at: "", cwd: "", what: "e2e" }));
    expect(heldByOther(file)).toBe(true);
  });

  it("prints the lines the Tests view reads", () => {
    expect(WAITING_LINE).toBe(VIEW_WAITING);
    expect(GOT_LINE).toBe(VIEW_GOT);
  });
});

describe("test Electrons a killed run left behind", () => {
  it("are Playwright-launched Electron mains whose parent is gone", () => {
    const procs = [
      { pid: 10, ppid: 1, cmd: "node playwright test" },
      { pid: 11, ppid: 10, cmd: `"electron.exe" ${LOADER} --inspect=0 E:\\repo\\apps\\desktop` },
      { pid: 12, ppid: 999, cmd: `"electron.exe" ${LOADER} --inspect=0 E:\\repo\\apps\\desktop` },
      { pid: 13, ppid: 12, cmd: `"electron.exe" --type=renderer ${LOADER}` },
      { pid: 14, ppid: 1, cmd: `/usr/bin/electron ${LOADER.replaceAll("\\", "/")} apps/desktop` },
      { pid: 15, ppid: 999, cmd: "electron.exe E:\\repo\\apps\\desktop (npm run dev)" },
      { pid: 16, ppid: 999, cmd: "C:\\Programs\\Jig\\Jig.exe" },
    ];
    expect(orphanTestElectrons(procs)).toEqual([12, 14]);
  });
});
