import { describe, expect, it } from "vitest";
import { classifyPaste, collapsePastes, MASK, maskSecrets, sanitizePrompt } from "./sanitize";

describe("maskSecrets", () => {
  it("masks headers, bearer tokens and JWTs", () => {
    expect(maskSecrets("Authorization: Bearer abc.def.ghi123456")).toBe(`Authorization: ${MASK}`);
    expect(maskSecrets('curl -H "Authorization: Bearer abcdefgh12345678" https://api')).toBe(
      `curl -H "Authorization: ${MASK}" https://api`,
    );
    expect(maskSecrets("Cookie: session=abc123; theme=dark")).toBe(`Cookie: ${MASK}`);
    expect(maskSecrets("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig")).toBe(`token ${MASK}`);
  });

  it("masks key=value, JSON fields, flags and connection strings", () => {
    expect(maskSecrets("API_KEY=sup3rs3cret npm start")).toBe(`API_KEY=${MASK} npm start`);
    expect(maskSecrets('{"user":"ann","password":"hunter2"}')).toBe(`{"user":"ann","password":"${MASK}"}`);
    expect(maskSecrets("az login --password hunter2 -u ann")).toBe(`az login --password ${MASK} -u ann`);
    expect(maskSecrets("Server=db;User Id=ann;Password=hunter2;")).toBe(
      `Server=db;User Id=ann;Password=${MASK};`,
    );
    expect(maskSecrets("AccountKey=abc+def/123==;EndpointSuffix=core.windows.net")).toBe(
      `AccountKey=${MASK};EndpointSuffix=core.windows.net`,
    );
    expect(maskSecrets("https://api.x.com/v1?id=4&access_token=abc123&x=1")).toBe(
      `https://api.x.com/v1?id=4&access_token=${MASK}&x=1`,
    );
  });

  it("masks known key formats, URL credentials and private keys", () => {
    expect(maskSecrets("use ghp_abcdefghijklmnopqrstuvwxyz0123")).toBe(`use ${MASK}`);
    expect(maskSecrets("key AKIAABCDEFGHIJKLMNOP here")).toBe(`key ${MASK} here`);
    expect(maskSecrets("git clone https://ann:hunter2@dev.azure.com/org/repo")).toBe(
      `git clone https://ann:${MASK}@dev.azure.com/org/repo`,
    );
    expect(maskSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----")).toBe(
      `${MASK} (private key)`,
    );
  });

  it("leaves ordinary text alone", () => {
    const text = "Fix the token parser in src/auth.ts and run npm test; the password field is optional.";
    expect(maskSecrets("Fix the login bug in src/auth.ts and run npm test")).toBe(
      "Fix the login bug in src/auth.ts and run npm test",
    );
    expect(maskSecrets(text)).toBe(text);
  });
});

describe("classifyPaste", () => {
  it("recognises HTTP, JSON, stack traces, logs, HTML and SQL", () => {
    expect(
      classifyPaste(["HTTP/1.1 500 Internal Server Error", "Content-Type: application/json", "", "{}"]),
    ).toBe("http");
    expect(classifyPaste(["{", '  "id": 4,', '  "items": []', "}"])).toBe("json");
    expect(
      classifyPaste([
        "TypeError: Cannot read properties of undefined (reading 'x')",
        "    at total (src/cart.ts:12:5)",
        "    at main (src/index.ts:3:1)",
      ]),
    ).toBe("stack trace");
    expect(classifyPaste(["2026-10-28 10:00:01 INFO started", "2026-10-28 10:00:02 ERROR failed"])).toBe(
      "log",
    );
    expect(classifyPaste(["<div>", "  <p>hi</p>", "</div>"])).toBe("xml/html");
    expect(classifyPaste(["SELECT id, name", "FROM users", "WHERE id = 4"])).toBe("sql");
  });
});

describe("collapsePastes / sanitizePrompt", () => {
  it("replaces a pasted response, keeping what was typed around it", () => {
    const message = [
      "The checkout call fails, here is the response:",
      "HTTP/1.1 500 Internal Server Error",
      "Content-Type: application/json",
      "Authorization: Bearer abcdefgh12345678",
      "X-Request-Id: 42",
      "Date: Tue, 28 Oct 2026",
      "Server: kestrel",
      "",
      "What is wrong?",
    ].join("\n");
    const result = sanitizePrompt(message);
    expect(result.text).toBe(
      "The checkout call fails, here is the response:\n[pasted http, 6 lines]\n\nWhat is wrong?",
    );
    expect(result.pasted).toEqual({ http: 1 });
    expect(result.text).not.toContain("abcdefgh");
  });

  it("replaces big fenced blocks and keeps small ones", () => {
    const json = ["```json", "{", '  "a": 1,', '  "b": 2,', '  "c": 3,', '  "d": 4', "}", "```"].join("\n");
    expect(collapsePastes(`Why is d 4?\n${json}`).text).toBe("Why is d 4?\n[pasted json, 6 lines]");
    const small = "Rename this:\n```ts\nconst a = 1;\n```";
    expect(collapsePastes(small).text).toBe(small);
  });

  it("replaces a long blob on one line, and leaves ordinary messages as they are", () => {
    const blob = `token dump: ${"QUJD".repeat(200)}`;
    expect(collapsePastes(blob).pasted).toEqual({ data: 1 });
    const plain = "Add a discount field to the cart and write tests for it.\nKeep the API the same.";
    expect(collapsePastes(plain)).toEqual({ text: plain, pasted: {} });
  });
});
