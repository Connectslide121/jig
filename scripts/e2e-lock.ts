/**
 * One e2e run at a time on this computer (D-420). Every run launches an Electron per worker, so two
 * chats (or task queues) running e2e at once fight over the CPU and both take minutes longer, and two
 * builds of the same checkout overwrite each other's `apps/desktop/dist`. `npm run e2e`, `npm run
 * e2e:changed` and a plain `npx playwright test` (the config's global setup) take this lock before
 * building and running, and wait while another run holds it. Only e2e runs: Jig's browser and
 * everything else run as before.
 *
 * The lock is a file in the temp folder holding the owner's pid; a lock whose process is gone (a run
 * that was killed) is taken over. The Tests add-on shows a run that waits by the lines printed here
 * (`WAITING_LINE`, `GOT_LINE`; keep them equal to `addons/tests/lib/results.ts`).
 */
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const LOCK_FILE = join(tmpdir(), "jig-e2e.lock");
/** The environment variable a lock owner passes to the processes it starts (Playwright under e2e:changed). */
export const LOCK_ENV = "JIG_E2E_LOCK_PID";
export const WAITING_LINE = "Waiting for another e2e run to finish";
export const GOT_LINE = "The other e2e run finished: starting.";
/** A lock older than this is stale whatever its pid says (a reused pid). */
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

export interface LockOwner {
  pid: number;
  at: string;
  /** The checkout the run is in. */
  cwd: string;
  /** What runs: "e2e:changed", "e2e", "playwright". */
  what: string;
}

/** Whether a process with this pid exists (EPERM: it exists, owned by someone else). */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readOwner(file: string): LockOwner | undefined {
  try {
    const owner = JSON.parse(readFileSync(file, "utf8")) as LockOwner;
    return typeof owner.pid === "number" ? owner : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a lock file's owner is gone: its process ended, it is too old, or it can't be read. */
export function stale(owner: LockOwner | undefined, ageMs: number, isAlive = alive): boolean {
  if (!owner) return ageMs > 10_000; // a half-written file gets a moment
  return ageMs > MAX_AGE_MS || !isAlive(owner.pid);
}

/** Whether another live process holds the lock now (this run will wait for it). */
export function heldByOther(file = LOCK_FILE): boolean {
  const owner = readOwner(file);
  return (
    !!owner && owner.pid !== process.pid && owner.pid !== Number(process.env[LOCK_ENV]) && alive(owner.pid)
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Takes the lock, waiting while another live run holds it, and releases it when this process exits.
 * Returns at once when a parent process already holds it for us (`LOCK_ENV`).
 */
export async function acquireE2eLock(what: string, file = LOCK_FILE): Promise<void> {
  const inherited = Number(process.env[LOCK_ENV]);
  if (inherited && readOwner(file)?.pid === inherited && alive(inherited)) return;
  const me: LockOwner = { pid: process.pid, at: new Date().toISOString(), cwd: process.cwd(), what };
  const started = Date.now();
  let told = 0;
  for (;;) {
    try {
      const fd = openSync(file, "wx");
      writeSync(fd, JSON.stringify(me));
      closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    const owner = readOwner(file);
    let age = 0;
    try {
      age = Date.now() - statSync(file).mtimeMs;
    } catch {
      continue; // released between the two calls
    }
    if (stale(owner, age)) {
      rmSync(file, { force: true });
      continue;
    }
    // Said once, then every minute, so a long wait shows it is still waiting.
    if (Date.now() - told >= 60_000) {
      const waited = Math.round((Date.now() - started) / 1000);
      console.log(
        `${WAITING_LINE} (${owner ? `${owner.what} in ${owner.cwd}, pid ${owner.pid}` : "starting"})${waited ? `, ${waited} s so far` : ""}…`,
      );
      told = Date.now();
    }
    await sleep(2000);
  }
  if (told) console.log(GOT_LINE);
  process.env[LOCK_ENV] = String(process.pid);
  const release = () => {
    if (readOwner(file)?.pid === process.pid) rmSync(file, { force: true });
  };
  process.on("exit", release);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.once(signal, () => {
      release();
      process.exit(130);
    });
}

/** A process as the orphan check sees it. */
export interface Proc {
  pid: number;
  ppid: number;
  cmd: string;
}

/**
 * Test Electrons left behind by a killed run: an Electron main process Playwright launched (its
 * loader on the command line) whose parent, the Playwright worker, is gone. Renderers and helpers
 * (`--type=`) go with their main. Pure.
 */
export function orphanTestElectrons(procs: Proc[]): number[] {
  const pids = new Set(procs.map((p) => p.pid));
  return procs
    .filter(
      (p) =>
        /electron/i.test(p.cmd) &&
        /playwright-core[\\/]lib[\\/]server[\\/]electron[\\/]loader/.test(p.cmd) &&
        !p.cmd.includes("--type=") &&
        (p.ppid <= 1 || !pids.has(p.ppid)),
    )
    .map((p) => p.pid);
}

function listProcesses(): Proc[] {
  if (process.platform === "win32") {
    const json = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
    const rows = JSON.parse(json) as Array<{
      ProcessId: number;
      ParentProcessId: number;
      CommandLine: string | null;
    }>;
    return rows.map((r) => ({ pid: r.ProcessId, ppid: r.ParentProcessId, cmd: r.CommandLine ?? "" }));
  }
  return execFileSync("ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3]! }));
}

/** Ends the test Electrons killed runs left behind (they hold gigabytes of memory); best effort. */
export function killOrphanTestElectrons(): number {
  let orphans: number[] = [];
  try {
    orphans = orphanTestElectrons(listProcesses());
  } catch {
    return 0;
  }
  for (const pid of orphans) {
    try {
      if (process.platform === "win32")
        execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(pid, "SIGKILL");
    } catch {}
  }
  if (orphans.length) console.log(`Ended ${orphans.length} test Electron(s) a stopped run left behind.`);
  return orphans.length;
}
