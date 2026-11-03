// A tiny language server for the e2e tests (D-259): reports `bad` as an error, answers hover with the
// word under the cursor, and puts definitions at the first line. Speaks LSP over stdio.
let buffer = Buffer.alloc(0);
const docs = new Map();
const send = (message) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }));
  process.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
};
const diagnose = (uri) => {
  const text = docs.get(uri) ?? "";
  const diagnostics = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/\bbad\b/g))
      diagnostics.push({
        range: { start: { line: i, character: m.index }, end: { line: i, character: m.index + 3 } },
        severity: 1,
        message: "Fake error: `bad` isn't allowed here",
        source: "fake-lsp",
      });
  });
  send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics } });
};
const wordAt = (uri, pos) => {
  const line = (docs.get(uri) ?? "").split("\n")[pos.line] ?? "";
  const before = /\w*$/.exec(line.slice(0, pos.character))[0];
  const after = /^\w*/.exec(line.slice(pos.character))[0];
  return before + after;
};
const handle = (m) => {
  if (m.method === "initialize")
    return send({
      id: m.id,
      result: {
        capabilities: { textDocumentSync: 1, hoverProvider: true, definitionProvider: true },
        serverInfo: { name: "fake-lsp" },
      },
    });
  if (m.method === "textDocument/didOpen") {
    docs.set(m.params.textDocument.uri, m.params.textDocument.text);
    return diagnose(m.params.textDocument.uri);
  }
  if (m.method === "textDocument/didChange") {
    const last = m.params.contentChanges.at(-1);
    if (last && !last.range) docs.set(m.params.textDocument.uri, last.text);
    return diagnose(m.params.textDocument.uri);
  }
  if (m.method === "textDocument/hover") {
    const word = wordAt(m.params.textDocument.uri, m.params.position);
    return send({
      id: m.id,
      result: { contents: { kind: "markdown", value: `**${word}**: from the fake server` } },
    });
  }
  if (m.method === "textDocument/definition")
    return send({
      id: m.id,
      result: {
        uri: m.params.textDocument.uri,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      },
    });
  if (m.method === "shutdown") return send({ id: m.id, result: null });
  if (m.method === "exit") process.exit(0);
  if (m.id !== undefined && m.method) send({ id: m.id, result: null });
};
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const end = buffer.indexOf("\r\n\r\n");
    if (end < 0) return;
    const length = Number(/content-length: *(\d+)/i.exec(buffer.subarray(0, end).toString())[1]);
    if (buffer.length < end + 4 + length) return;
    const body = buffer.subarray(end + 4, end + 4 + length).toString();
    buffer = buffer.subarray(end + 4 + length);
    handle(JSON.parse(body));
  }
});
