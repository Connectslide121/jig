import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { JigError } from "../../shared/ipc";
import {
  fileUri,
  LANGUAGE_SERVERS,
  type LanguageServerDef,
  type LanguageServerInfo,
  type LanguageServerStatus,
  languageId,
  serverFor,
} from "../../shared/lsp";
import { FrameReader, frame } from "../completion/rpc";
import { getConfig } from "../config";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";

const log = logger("lsp");

interface Running {
  id: string;
  def: LanguageServerDef;
  root: string;
  child: ChildProcessWithoutNullStreams;
  refs: number;
  idle?: ReturnType<typeof setTimeout>;
}
const running = new Map<string, Running>();
const found = new Map<string, string | undefined>();
/** A server nobody uses any more stops after this long (so switching tabs doesn't restart it). */
const IDLE_MS = 3 * 60_000;

/** The program on PATH (on Windows also with PATHEXT's extensions: npm installs `.cmd` files). */
async function onPath(command: string): Promise<string | undefined> {
  if (found.has(command)) return found.get(command);
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.toLowerCase())
      : [""];
  for (const dir of dirs)
    for (const ext of exts) {
      const candidate = join(dir, command + ext);
      if ((await stat(candidate).catch(() => undefined))?.isFile()) {
        found.set(command, candidate);
        return candidate;
      }
    }
  found.set(command, undefined);
  return undefined;
}

/** The project root for a file: the nearest folder with one of the server's markers, or git's root. */
async function rootFor(path: string, def: LanguageServerDef): Promise<string> {
  let dir = dirname(path);
  let gitRoot: string | undefined;
  for (;;) {
    const names = await readdir(dir).catch(() => [] as string[]);
    const marked = def.markers.some((m) =>
      m.startsWith("*.") ? names.some((n) => n.toLowerCase().endsWith(m.slice(1))) : names.includes(m),
    );
    if (marked) return dir;
    if (!gitRoot && names.includes(".git")) gitRoot = dir;
    const up = dirname(dir);
    if (up === dir) return gitRoot ?? dirname(path);
    dir = up;
  }
}

function stop(server: Running): void {
  running.delete(server.id);
  clearTimeout(server.idle);
  try {
    // A polite shutdown, then the process goes either way.
    server.child.stdin.write(frame({ jsonrpc: "2.0", id: "shutdown", method: "shutdown" }));
    server.child.stdin.write(frame({ jsonrpc: "2.0", method: "exit" }));
  } catch {
    // Already gone.
  }
  setTimeout(() => server.child.kill(), 2000).unref();
}

async function start(def: LanguageServerDef, root: string, program: string): Promise<Running> {
  const id = randomUUID();
  // npm's `.cmd` launchers need a shell on Windows; the program path is Jig's own lookup, not input.
  const shell = /\.(cmd|bat)$/i.test(program);
  const child = spawn(shell ? `"${program}"` : program, def.args, {
    cwd: root,
    shell,
    windowsHide: true,
    stdio: "pipe",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  const server: Running = { id, def, root, child, refs: 0 };
  const reader = new FrameReader();
  child.stdout.on("data", (chunk: Buffer) => {
    for (const message of reader.push(chunk)) emit("lsp.message", { id, message: JSON.stringify(message) });
  });
  child.stderr.on("data", (chunk: Buffer) => log.debug(`${def.id}: ${chunk.toString().trimEnd()}`));
  child.on("error", (error) => log.warn(`${def.id} failed to start`, error));
  child.on("exit", (code) => {
    log.info(`${def.id} language server stopped`, { code });
    if (running.get(id) === server) running.delete(id);
    emit("lsp.exited", { id });
  });
  running.set(id, server);
  return server;
}

async function servers(): Promise<LanguageServerInfo[]> {
  const out: LanguageServerInfo[] = [];
  for (const def of LANGUAGE_SERVERS) {
    const path = await onPath(def.command);
    out.push({
      id: def.id,
      name: def.name,
      command: def.command,
      install: def.install,
      extensions: def.extensions,
      ...(path ? { path } : {}),
      running: [...running.values()].filter((r) => r.def.id === def.id).length,
    });
  }
  return out;
}

/**
 * Language servers for the editor (D-259): Jig finds the user's installed servers on PATH, runs one
 * per server and project root, and relays LSP messages between it and the editor's client (CodeMirror's
 * `@codemirror/lsp-client`) as strings. Servers stop a few minutes after their last editor closes.
 */
export function startLanguageServers(): void {
  handle("lsp.open", async ({ path }): Promise<LanguageServerStatus> => {
    if (!getConfig().editor.languageServers) return { status: "off" };
    const def = serverFor(path);
    if (!def) return { status: "none" };
    const program = await onPath(def.command);
    if (!program) return { status: "missing", serverId: def.id, name: def.name, install: def.install };
    const root = await rootFor(path, def);
    let server = [...running.values()].find((r) => r.def.id === def.id && r.root === root);
    server ??= await start(def, root, program);
    server.refs++;
    clearTimeout(server.idle);
    return {
      status: "ready",
      id: server.id,
      serverId: def.id,
      name: def.name,
      rootUri: fileUri(root),
      languageId: languageId(path),
    };
  });
  handle("lsp.send", ({ id, message }) => {
    const server = running.get(id);
    if (!server) throw new JigError("not_found", "The language server stopped");
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      throw new JigError("invalid_args", "Not a JSON-RPC message");
    }
    server.child.stdin.write(frame(parsed as Parameters<typeof frame>[0]));
  });
  handle("lsp.release", ({ id }) => {
    const server = running.get(id);
    if (!server) return;
    server.refs = Math.max(0, server.refs - 1);
    if (server.refs === 0) server.idle = setTimeout(() => stop(server), IDLE_MS);
  });
  handle("lsp.restart", ({ id }) => {
    const server = running.get(id);
    if (server) stop(server);
  });
  handle("lsp.servers", async () => {
    // Asked from Settings: look on PATH again (something may have been installed meanwhile).
    found.clear();
    return servers();
  });
}

export function stopLanguageServers(): void {
  for (const server of [...running.values()]) stop(server);
}
