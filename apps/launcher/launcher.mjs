// Jig's launcher (protected: the builder may only change this file after you confirm explicitly).
//
// Restarts Jig after a change to its own code, and makes sure a broken build can't lock you out:
//   1. waits for the old Jig process to exit,
//   2. starts the new build and waits for its "ready" heartbeat (a file Jig writes when its window
//      has loaded),
//   3. if it crashes or stays silent, starts the previous build (Jig then offers to undo the change),
//   4. if that fails too, starts the new build in safe mode (add-ons off).
//
// Plain Node with no dependencies, run by Electron in Node mode (ELECTRON_RUN_AS_NODE=1).
// Usage: launcher.mjs --electron <path> --app <dir> [--previous <dir>] --home <jigHome>
//                     [--wait-pid <pid>] [--timeout <seconds>]
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function parseArgs(argv) {
  const out = { timeout: 60 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--electron") out.electron = value;
    else if (key === "--app") out.app = value;
    else if (key === "--previous") out.previous = value;
    else if (key === "--home") out.home = value;
    else if (key === "--wait-pid") out.waitPid = Number(value);
    else if (key === "--timeout") out.timeout = Number(value);
    else continue;
    i++;
  }
  return out;
}

/** The attempts, in order: new build, previous build, new build in safe mode. */
export function plan(args) {
  const attempts = [{ name: "new", app: args.app, env: {} }];
  if (args.previous && existsSync(args.previous))
    attempts.push({ name: "previous", app: args.previous, env: { JIG_STARTED_AFTER_FAILURE: "1" } });
  attempts.push({
    name: "safe-mode",
    app: args.app,
    env: { JIG_SAFE_MODE: "1", JIG_STARTED_AFTER_FAILURE: "1" },
  });
  return attempts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Starts one attempt; resolves true when it reported ready, false when it died or timed out. */
export async function attempt(args, step, log, spawnImpl = spawn) {
  const dir = join(args.home, "launcher");
  mkdirSync(dir, { recursive: true });
  const ready = join(dir, `ready-${Date.now()}-${step.name}`);
  rmSync(ready, { force: true });
  const env = { ...process.env, ...step.env, JIG_READY_FILE: ready, JIG_LAUNCHED_BY: "launcher" };
  delete env.ELECTRON_RUN_AS_NODE;
  const extra = process.platform === "linux" && process.getuid?.() === 0 ? ["--no-sandbox"] : [];
  log(`starting ${step.name}: ${args.electron} ${step.app}`);
  const child = spawnImpl(args.electron, [step.app, ...extra], { env, detached: true, stdio: "ignore" });
  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    log(`${step.name} exited with ${code}`);
  });
  child.on("error", (error) => {
    exited = true;
    log(`${step.name} could not start: ${error.message}`);
  });
  const deadline = Date.now() + args.timeout * 1000;
  while (Date.now() < deadline) {
    if (existsSync(ready)) {
      child.unref();
      log(`${step.name} is ready`);
      return true;
    }
    if (exited) return false;
    await sleep(250);
  }
  log(`${step.name} did not report ready within ${args.timeout}s`);
  try {
    process.kill(child.pid);
  } catch {}
  return false;
}

export async function main(argv = process.argv.slice(2), spawnImpl = spawn) {
  const args = parseArgs(argv);
  if (!args.electron || !args.app || !args.home)
    throw new Error("launcher: --electron, --app and --home are required");
  const dir = join(args.home, "launcher");
  mkdirSync(dir, { recursive: true });
  const log = (line) => appendFileSync(join(dir, "launcher.log"), `${new Date().toISOString()} ${line}\n`);
  if (args.waitPid) {
    const until = Date.now() + 30_000;
    while (alive(args.waitPid) && Date.now() < until) await sleep(200);
  }
  for (const step of plan(args)) {
    if (await attempt(args, step, log, spawnImpl)) {
      writeFileSync(
        join(dir, "status.json"),
        JSON.stringify({ result: step.name, at: new Date().toISOString() }),
      );
      return step.name;
    }
  }
  writeFileSync(join(dir, "status.json"), JSON.stringify({ result: "failed", at: new Date().toISOString() }));
  return "failed";
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop())) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
