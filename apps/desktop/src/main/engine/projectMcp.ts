import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "./codex-protocol/serde_json/JsonValue";

/** A server in a project's `.mcp.json` (Claude Code's format). */
interface McpJsonServer {
  type?: string;
  command?: string;
  args?: unknown[];
  env?: Record<string, unknown>;
  url?: string;
  headers?: Record<string, unknown>;
}

type Json = Record<string, unknown>;

/** Server names Jig serves itself; a project's server can't take their place. */
const RESERVED = new Set(["jig", "jig-builder"]);

/** `${VAR}` and `${VAR:-default}` from the environment, as Claude Code expands `.mcp.json`. */
export function expandEnv(value: string, env: Record<string, string | undefined>): string {
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (_, name: string, fallback?: string) => {
      const v = env[name];
      return v !== undefined && v !== "" ? v : (fallback ?? "");
    },
  );
}

const samePath = (a: string, b: string) => {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return process.platform === "win32" ? norm(a) === norm(b) : a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
};

/**
 * Which `.mcp.json` servers Claude Code may start in this folder: the ones you approved there
 * (`enableAllProjectMcpServers`, `enabledMcpjsonServers`), minus `disabledMcpjsonServers`, from your
 * settings, the project's settings and Claude Code's per-project state. Only those flags are read.
 */
export function approvedProjectServers(
  cwd: string,
  read: (path: string) => Json | undefined,
  home = homedir(),
): (name: string) => boolean {
  const sources: Json[] = [];
  for (const file of [
    join(home, ".claude", "settings.json"),
    join(cwd, ".claude", "settings.json"),
    join(cwd, ".claude", "settings.local.json"),
  ]) {
    const json = read(file);
    if (json) sources.push(json);
  }
  const projects = read(join(home, ".claude.json"))?.projects;
  if (projects && typeof projects === "object")
    for (const [path, entry] of Object.entries(projects as Json))
      if (entry && typeof entry === "object" && samePath(path, cwd)) sources.push(entry as Json);
  const list = (key: string) =>
    new Set(sources.flatMap((s) => (Array.isArray(s[key]) ? (s[key] as unknown[]).map(String) : [])));
  const all = sources.some((s) => s.enableAllProjectMcpServers === true);
  const enabled = list("enabledMcpjsonServers");
  const disabled = list("disabledMcpjsonServers");
  return (name) => !disabled.has(name) && (all || enabled.has(name));
}

/** One `.mcp.json` server as a Codex `mcp_servers` entry; SSE servers (Codex has no SSE) are left out. */
export function codexServerEntry(
  server: McpJsonServer,
  env: Record<string, string | undefined>,
): Record<string, JsonValue> | undefined {
  const x = (v: unknown) => expandEnv(String(v), env);
  const strings = (o: Record<string, unknown> | undefined) =>
    o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, x(v)])) : undefined;
  const type = server.type ?? (server.url ? "http" : "stdio");
  if (type === "stdio" && server.command) {
    const envs = strings(server.env);
    return {
      command: x(server.command),
      ...(Array.isArray(server.args) ? { args: server.args.map(x) } : {}),
      ...(envs && Object.keys(envs).length ? { env: envs } : {}),
    };
  }
  if (type === "http" && server.url) {
    const headers = strings(server.headers);
    return {
      url: x(server.url),
      ...(headers && Object.keys(headers).length ? { http_headers: headers } : {}),
    };
  }
  return undefined;
}

const readJson = (path: string): Json | undefined => {
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    return json && typeof json === "object" ? json : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Codex config overrides for the project's `.mcp.json` servers (D-313): the same servers a Claude
 * chat in this folder gets, so a Codex chat has the project's tools too. Only servers you approved
 * for Claude Code are passed; values are expanded from the chat's environment. Each key adds one
 * server and leaves your own Codex servers alone.
 */
export function projectMcpConfig(
  cwd: string,
  env: Record<string, string | undefined>,
  read: (path: string) => Json | undefined = readJson,
  home = homedir(),
): Record<string, JsonValue> {
  const servers = read(join(cwd, ".mcp.json"))?.mcpServers;
  if (!servers || typeof servers !== "object") return {};
  const approved = approvedProjectServers(cwd, read, home);
  const config: Record<string, JsonValue> = {};
  for (const [name, server] of Object.entries(servers as Record<string, McpJsonServer>)) {
    if (RESERVED.has(name) || !/^[\w-]+$/.test(name) || !approved(name)) continue;
    const entry = server && typeof server === "object" ? codexServerEntry(server, env) : undefined;
    if (entry) config[`mcp_servers.${name}`] = entry;
  }
  return config;
}
