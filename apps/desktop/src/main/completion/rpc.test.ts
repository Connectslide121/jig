import { describe, expect, it } from "vitest";
import { FrameReader, frame, RpcPeer } from "./rpc";
import { safePath, untar } from "./tar";

describe("LSP framing", () => {
  it("reads messages split and joined across chunks, skipping broken ones", () => {
    const one = frame({ jsonrpc: "2.0", id: 1, result: "ä" });
    const two = frame({ jsonrpc: "2.0", method: "didChangeStatus", params: { kind: "Normal" } });
    const bytes = Buffer.concat([one, Buffer.from("Content-Length: 3\r\n\r\nnot"), two]);
    const reader = new FrameReader();
    expect(reader.push(bytes.subarray(0, 10))).toEqual([]);
    const got = reader.push(bytes.subarray(10));
    expect(got).toEqual([
      { jsonrpc: "2.0", id: 1, result: "ä" },
      { jsonrpc: "2.0", method: "didChangeStatus", params: { kind: "Normal" } },
    ]);
  });
  it("answers requests, routes notifications and the other side's requests", async () => {
    const sent: Buffer[] = [];
    const notes: string[] = [];
    const peer = new RpcPeer((b) => sent.push(b), {
      notification: (m) => notes.push(m),
      request: (m, p) => ({ m, p }),
    });
    const answer = peer.request<string>("initialize", { a: 1 });
    const id = (new FrameReader().push(sent[0]!)[0] as { id: number }).id;
    peer.receive(frame({ jsonrpc: "2.0", id, result: "ok" }));
    await expect(answer).resolves.toBe("ok");
    peer.receive(frame({ jsonrpc: "2.0", method: "didChangeStatus" }));
    expect(notes).toEqual(["didChangeStatus"]);
    peer.receive(frame({ jsonrpc: "2.0", id: 9, method: "window/showDocument", params: { uri: "x" } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(new FrameReader().push(sent.at(-1)!)[0]).toEqual({
      jsonrpc: "2.0",
      id: 9,
      result: { m: "window/showDocument", p: { uri: "x" } },
    });
    const late = peer.request("x");
    peer.close();
    await expect(late).rejects.toThrow("stopped");
  });
});

/** A ustar header block for `name` with `size` bytes. */
function header(name: string, size: number, type = "0", prefix = ""): Uint8Array {
  const block = new Uint8Array(512);
  const put = (s: string, at: number) => block.set(new TextEncoder().encode(s), at);
  put(name, 0);
  put(size.toString(8).padStart(11, "0"), 124);
  put(type, 156);
  put("ustar", 257);
  put(prefix, 345);
  return block;
}
function archive(entries: Array<{ name: string; body: string; type?: string; prefix?: string }>) {
  const parts: Uint8Array[] = [];
  for (const e of entries) {
    const body = new TextEncoder().encode(e.body);
    parts.push(header(e.name, body.length, e.type, e.prefix));
    const padded = new Uint8Array(Math.ceil(body.length / 512) * 512);
    padded.set(body);
    parts.push(padded);
  }
  parts.push(new Uint8Array(1024));
  return Buffer.concat(parts);
}

describe("untar", () => {
  it("reads files with prefixes and long names, and never paths that leave the folder", () => {
    const long = `package/dist/${"x".repeat(120)}.js`;
    const files = untar(
      archive([
        { name: "language-server.js", prefix: "package/dist", body: "server" },
        { name: "././@LongLink", type: "L", body: long },
        { name: "ignored", body: "long" },
        { name: "../evil.js", body: "no" },
        { name: "package/dist", type: "5", body: "" },
      ]),
    );
    expect(files.map((f) => [f.path, new TextDecoder().decode(f.data)])).toEqual([
      ["package/dist/language-server.js", "server"],
      [long, "long"],
    ]);
    expect(safePath("C:/windows/x")).toBeUndefined();
    expect(safePath("a/./b")).toBe("a/b");
  });
});
