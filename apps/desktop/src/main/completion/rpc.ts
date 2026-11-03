/**
 * JSON-RPC 2.0 over a byte stream with LSP's `Content-Length` headers: enough of the Language Server
 * Protocol's base layer to talk to GitHub's Copilot language server (D-255). No dependency: the
 * framing is small and this keeps the server's own copy of vscode-jsonrpc out of Jig.
 */

export interface RpcMessage {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function frame(message: RpcMessage): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

/** Collects bytes and hands out each complete message; a broken one is skipped, never thrown. */
export class FrameReader {
  private buffer = Buffer.alloc(0);
  push(chunk: Buffer): RpcMessage[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const out: RpcMessage[] = [];
    for (;;) {
      const end = this.buffer.indexOf("\r\n\r\n");
      if (end < 0) break;
      const header = this.buffer.subarray(0, end).toString("ascii");
      const length = Number(/content-length:\s*(\d+)/i.exec(header)?.[1]);
      if (!Number.isFinite(length)) {
        // Not a header we understand: drop it and look for the next one.
        this.buffer = this.buffer.subarray(end + 4);
        continue;
      }
      if (this.buffer.length < end + 4 + length) break;
      const body = this.buffer.subarray(end + 4, end + 4 + length).toString("utf8");
      this.buffer = this.buffer.subarray(end + 4 + length);
      try {
        out.push(JSON.parse(body) as RpcMessage);
      } catch {
        // A message that isn't JSON is skipped.
      }
    }
    return out;
  }
}

/** A JSON-RPC peer: requests with answers, notifications, and requests the other side sends us. */
export class RpcPeer {
  private next = 1;
  private readonly waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly reader = new FrameReader();
  private closed = false;
  constructor(
    private readonly write: (data: Buffer) => void,
    private readonly handlers: {
      notification?: (method: string, params: unknown) => void;
      request?: (method: string, params: unknown) => Promise<unknown> | unknown;
    } = {},
  ) {}
  /** Bytes from the other side. */
  receive(chunk: Buffer): void {
    for (const message of this.reader.push(chunk)) this.dispatch(message);
  }
  private dispatch(message: RpcMessage): void {
    if (message.method && message.id !== undefined && message.id !== null) {
      const id = message.id;
      void Promise.resolve()
        .then(() => this.handlers.request?.(message.method!, message.params) ?? null)
        .then(
          (result) => this.send({ jsonrpc: "2.0", id, result }),
          (error: unknown) =>
            this.send({
              jsonrpc: "2.0",
              id,
              error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
            }),
        );
      return;
    }
    if (message.method) {
      this.handlers.notification?.(message.method, message.params);
      return;
    }
    const pending = typeof message.id === "number" ? this.waiting.get(message.id) : undefined;
    if (!pending) return;
    this.waiting.delete(message.id as number);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }
  private send(message: RpcMessage): void {
    if (!this.closed) this.write(frame(message));
  }
  request<T>(method: string, params?: unknown, timeoutMs = 30_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error("The language server stopped"));
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        this.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } });
        reject(new Error(`${method} took too long`));
      }, timeoutMs);
      this.waiting.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.send({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
    });
  }
  notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) });
  }
  /** The other side went away: every waiting request fails. */
  close(): void {
    this.closed = true;
    for (const pending of this.waiting.values()) pending.reject(new Error("The language server stopped"));
    this.waiting.clear();
  }
}
