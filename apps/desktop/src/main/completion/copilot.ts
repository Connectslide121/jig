import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";
import { gunzipSync } from "fflate";
import { z } from "zod";
import {
  type CompletionRequest,
  type CompletionSuggestion,
  type CopilotState,
  offsetAt,
  positionAt,
} from "../../shared/completion";
import { languageId } from "../../shared/lsp";
import { openExternal } from "../appWindows";
import { logger } from "../log";
import { writeJson } from "../state/jsonStore";
import { paths } from "../state/paths";
import { RpcPeer } from "./rpc";
import { untar } from "./tar";

const log = logger("copilot");
const PACKAGE = "@github/copilot-language-server";
const REGISTRY = "https://registry.npmjs.org";

const meta = z.object({
  version: z.string(),
  dist: z.object({ tarball: z.url(), integrity: z.string() }),
});

/**
 * GitHub's Copilot language server for inline completions (D-247, D-255). Jig downloads the npm
 * package the first time you set it up (it is optional and ~28 MB), runs it with Electron's own
 * Node, and speaks LSP to it. The server keeps the GitHub sign-in itself; Jig never sees the token.
 * Completions only: none of its chat or agent features are used.
 */
export class Copilot {
  private child?: ChildProcessWithoutNullStreams;
  private peer?: RpcPeer;
  private starting?: Promise<RpcPeer>;
  private docs = new Map<string, { version: number; text: string }>();
  private focused?: string;
  state: CopilotState = { installed: false, phase: "idle", signedIn: false };
  constructor(
    private readonly changed: () => void,
    private readonly dir = join(paths.cache(), "copilot"),
  ) {}

  private set(patch: Partial<CopilotState>): void {
    this.state = { ...this.state, ...patch };
    this.changed();
  }

  /** The installed version, if any (`current.json` names the folder in use). */
  async load(): Promise<void> {
    const version = await readFile(join(this.dir, "current.json"), "utf8")
      .then((t) => z.object({ version: z.string() }).parse(JSON.parse(t)).version)
      .catch(() => undefined);
    this.state = { ...this.state, installed: Boolean(version), ...(version ? { version } : {}) };
  }

  private entry(): string {
    return join(this.dir, this.state.version ?? "", "package", "dist", "language-server.js");
  }

  /** Downloads the latest server from npm, checks its integrity, and unpacks it. */
  async install(): Promise<void> {
    if (this.state.phase === "downloading") return;
    this.set({ phase: "downloading", message: undefined });
    try {
      const response = await fetch(`${REGISTRY}/${PACKAGE}/latest`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`npm answered ${response.status}`);
      const info = meta.parse(await response.json());
      if (new URL(info.dist.tarball).origin !== REGISTRY) throw new Error("Unexpected download address");
      const archive = await fetch(info.dist.tarball, { signal: AbortSignal.timeout(300_000) });
      if (!archive.ok) throw new Error(`The download failed (${archive.status})`);
      const bytes = new Uint8Array(await archive.arrayBuffer());
      const [algorithm, expected] = info.dist.integrity.split("-", 2);
      if (algorithm !== "sha512" || createHash("sha512").update(bytes).digest("base64") !== expected)
        throw new Error("The download didn't match npm's checksum");
      const target = join(this.dir, info.version);
      await rm(target, { recursive: true, force: true });
      for (const file of untar(gunzipSync(bytes))) {
        const path = join(target, ...file.path.split("/"));
        await mkdir(dirname(path), { recursive: true });
        // A fresh folder per version, and current.json (atomic) names it only once every file is there.
        await writeFile(path, file.data);
      }
      await writeJson(join(this.dir, "current.json"), { version: info.version });
      const old = this.state.version;
      this.stop();
      this.set({ installed: true, version: info.version, phase: "idle" });
      if (old && old !== info.version) await rm(join(this.dir, old), { recursive: true, force: true });
    } catch (error) {
      log.warn("Installing Copilot failed", error);
      this.set({ phase: "error", message: `Couldn't download Copilot: ${(error as Error).message}` });
      throw error;
    }
  }

  /** Starts the server (once) and learns whether you are signed in. */
  private start(): Promise<RpcPeer> {
    if (this.peer) return Promise.resolve(this.peer);
    if (!this.state.installed) return Promise.reject(new Error("Set up GitHub Copilot first"));
    this.starting ??= (async () => {
      this.set({ phase: "starting" });
      const child = spawn(process.execPath, [this.entry(), "--stdio"], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "pipe",
        windowsHide: true,
      });
      this.child = child;
      const peer = new RpcPeer((data) => child.stdin.write(data), {
        notification: (method, params) => {
          if (method === "didChangeStatus") {
            const p = params as { kind?: string; message?: string };
            this.set({
              message: p.message || undefined,
              ...(p.kind === "Error" ? { signedIn: false } : {}),
            });
            if (p.kind === "Normal" && !this.state.signedIn) void this.checkStatus();
          }
          // Newer servers send a list of statuses (one per part); the sign-in is re-read from it.
          if (method === "didChangeStatus/v2") {
            const list = (params as { statuses?: Array<{ kind?: string; message?: string }> }).statuses ?? [];
            const message = list.find((s) => s.message)?.message;
            this.set({ message: message || undefined });
            if (!this.state.signedIn || list.some((s) => s.kind === "Error")) void this.checkStatus();
          }
        },
        request: async (method, params) => {
          // The server opens the GitHub sign-in page through the editor: in the system browser.
          if (method === "window/showDocument") {
            const uri = String((params as { uri?: string }).uri ?? "");
            if (/^https:\/\//.test(uri)) await openExternal(uri);
            return { success: true };
          }
          if (method === "workspace/configuration")
            return ((params as { items?: unknown[] }).items ?? []).map(() => null);
          return null;
        },
      });
      child.stdout.on("data", (chunk: Buffer) => peer.receive(chunk));
      child.stderr.on("data", (chunk: Buffer) => log.debug(chunk.toString().trimEnd()));
      child.on("exit", (code) => {
        log.info("Copilot language server stopped", { code });
        peer.close();
        if (this.child === child) {
          this.child = undefined;
          this.peer = undefined;
          this.docs.clear();
          this.set({ phase: this.state.phase === "error" ? "error" : "idle" });
        }
      });
      await peer.request(
        "initialize",
        {
          processId: process.pid,
          capabilities: {
            workspace: { workspaceFolders: true },
            window: { showDocument: { support: true } },
          },
          initializationOptions: {
            editorInfo: { name: "Jig", version: app.getVersion() },
            editorPluginInfo: { name: "Jig", version: app.getVersion() },
          },
        },
        60_000,
      );
      peer.notify("initialized", {});
      peer.notify("workspace/didChangeConfiguration", { settings: {} });
      this.peer = peer;
      await this.checkStatus();
      return peer;
    })().finally(() => {
      this.starting = undefined;
    });
    return this.starting.catch((error: unknown) => {
      this.set({ phase: "error", message: `Copilot didn't start: ${(error as Error).message}` });
      this.stop();
      throw error;
    });
  }

  private async checkStatus(): Promise<void> {
    const status = await this.peer
      ?.request<{ status?: string; user?: string }>("checkStatus", {})
      .catch(() => undefined);
    const signedIn = status?.status === "OK" || status?.status === "AlreadySignedIn";
    this.set({
      signedIn,
      ...(status?.user ? { user: status.user } : {}),
      phase: this.state.phase === "signing-in" && !signedIn ? "signing-in" : "ready",
    });
  }

  /** Starts the server at Jig's start when Copilot is set up, so the first completion is quick. */
  async warm(): Promise<void> {
    if (this.state.installed) await this.start().catch(() => undefined);
  }

  /**
   * GitHub's device sign-in: returns the code to type; finishing it opens github.com in your browser
   * and the server keeps the result. The status changes when you're done.
   */
  async signIn(): Promise<{ userCode: string; url: string }> {
    const peer = await this.start();
    const result = await peer.request<{
      status?: string;
      userCode?: string;
      verificationUri?: string;
      command?: { command: string; arguments?: unknown[] };
    }>("signIn", {});
    if (result.status === "AlreadySignedIn" || result.status === "OK") {
      await this.checkStatus();
      return { userCode: "", url: "" };
    }
    if (!result.userCode || !result.command) throw new Error("GitHub didn't give a sign-in code");
    this.set({ phase: "signing-in" });
    // Runs until you finish in the browser (or it gives up); the status follows.
    void peer
      .request(
        "workspace/executeCommand",
        { command: result.command.command, arguments: result.command.arguments ?? [] },
        15 * 60_000,
      )
      .catch(() => undefined)
      .finally(() => void this.checkStatus());
    return { userCode: result.userCode, url: result.verificationUri ?? "https://github.com/login/device" };
  }

  async signOut(): Promise<void> {
    const peer = await this.start();
    await peer.request("signOut", {});
    this.set({ signedIn: false, user: undefined });
  }

  /** One inline completion at the caret, or undefined. */
  async complete(request: CompletionRequest): Promise<CompletionSuggestion | undefined> {
    if (!this.state.signedIn) return undefined;
    const peer = await this.start();
    const uri = pathToFileURL(request.path).href;
    const known = this.docs.get(uri);
    if (!known) {
      peer.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: languageId(request.path), version: 1, text: request.text },
      });
      this.docs.set(uri, { version: 1, text: request.text });
    } else if (known.text !== request.text) {
      const version = known.version + 1;
      peer.notify("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [
          {
            range: { start: { line: 0, character: 0 }, end: positionAt(known.text, known.text.length) },
            text: request.text,
          },
        ],
      });
      this.docs.set(uri, { version, text: request.text });
    }
    if (this.focused !== uri) {
      peer.notify("textDocument/didFocus", { textDocument: { uri } });
      this.focused = uri;
    }
    const result = await peer
      .request<{
        items?: Array<{
          insertText: string | { value: string };
          range?: { start: { line: number; character: number }; end: { line: number; character: number } };
          command?: { command: string; arguments?: unknown[] };
        }>;
      }>(
        "textDocument/inlineCompletion",
        {
          textDocument: { uri, version: this.docs.get(uri)!.version },
          position: positionAt(request.text, request.offset),
          context: { triggerKind: 2 },
          formattingOptions: { tabSize: request.tabSize, insertSpaces: request.insertSpaces },
        },
        10_000,
      )
      .catch(() => undefined);
    const item = result?.items?.[0];
    if (!item) return undefined;
    const insert = typeof item.insertText === "string" ? item.insertText : item.insertText.value;
    const from = item.range ? offsetAt(request.text, item.range.start) : request.offset;
    const to = item.range ? offsetAt(request.text, item.range.end) : request.offset;
    const id = item.command ? JSON.stringify(item.command) : undefined;
    if (item.command) peer.notify("textDocument/didShowCompletion", { item });
    return { text: insert.replace(/\r\n/g, "\n"), from, to, provider: "copilot", ...(id ? { id } : {}) };
  }

  /** You pressed Tab: Copilot's own acceptance command (its telemetry). */
  accepted(id: string): void {
    try {
      const command = JSON.parse(id) as { command: string; arguments?: unknown[] };
      if (command.command.startsWith("github.copilot."))
        void this.peer
          ?.request("workspace/executeCommand", {
            command: command.command,
            arguments: command.arguments ?? [],
          })
          .catch(() => undefined);
    } catch {
      // Not one of Copilot's ids.
    }
  }

  /** Forgets a closed file. */
  close(path: string): void {
    const uri = pathToFileURL(path).href;
    if (!this.docs.delete(uri)) return;
    this.peer?.notify("textDocument/didClose", { textDocument: { uri } });
  }

  stop(): void {
    this.peer?.close();
    this.peer = undefined;
    this.child?.kill();
    this.child = undefined;
    this.docs.clear();
    this.focused = undefined;
  }
}
