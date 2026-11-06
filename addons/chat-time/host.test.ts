import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { chat, summary, toolBreakdown, toolChats } from "./host";

const home = mkdtempSync(join(tmpdir(), "jig-chat-time-"));
const projects = [
  { id: "p-shop", name: "Shop" },
  { id: "p-contoso", name: "Contoso" },
];
const api = {
  addon: { id: "chat-time", dir: "", dataDir: join(home, "addon-data", "chat-time") },
  projects: async () => projects,
} as unknown as AddonHostApi;

const NOW = Date.now();

/** A chat with one turn of `seconds` that ended `endAgo` seconds ago, running `command` from its start. */
function writeChat(
  id: string,
  projectId: string,
  title: string,
  endAgo: number,
  seconds: number,
  command: string,
) {
  const end = NOW - endAgo * 1000;
  const start = end - seconds * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const session = {
    meta: { id, title, projectId, provider: "claude", updatedAt: iso(end) },
    items: [
      { kind: "user", id: `${id}-u`, at: iso(start) },
      { kind: "tool", id: `${id}-t`, at: iso(start), name: "Bash", input: { command } },
      { kind: "assistant", id: `${id}-a`, at: iso(start + (seconds - 10) * 1000) },
      { kind: "result", id: `${id}-r`, at: iso(end), durationMs: seconds * 1000 },
    ],
  };
  writeFileSync(join(home, "sessions", `${id}.json`), JSON.stringify(session));
}

beforeAll(() => {
  mkdirSync(join(home, "sessions"), { recursive: true });
  mkdirSync(api.addon.dataDir, { recursive: true });
  process.env.CLAUDE_CONFIG_DIR = join(home, "no-claude");
  // Two Shop chats that overlap for 60 s, and a Contoso chat working at the same time as both.
  writeChat(
    "shop-tests",
    "p-shop",
    "Faster checkout tests",
    60,
    120,
    "npx playwright test e2e/checkout.spec.ts",
  );
  writeChat("shop-docs", "p-shop", "Docs for the cart", 0, 120, "git log --oneline");
  writeChat("contoso-1", "p-contoso", "Contoso invoices", 0, 180, "npm run build");
});

describe("summary", () => {
  it("sums a project's chats and counts other projects' chats as working at the same time", async () => {
    const s = await summary({ projectId: "p-shop", days: 1 }, api);
    expect(s.chats.map((c) => c.sessionId).sort()).toEqual(["shop-docs", "shop-tests"]);
    expect(s.workingMs).toBe(240_000);
    expect(s.totals.tests).toBe(110_000);
    expect(s.overlap.wallMs).toBe(180_000);
    // shop-tests: 0-60 with contoso, 60-120 with contoso and shop-docs → 180 s of others in 120 s.
    expect(s.chats.find((c) => c.sessionId === "shop-tests")?.overlap).toMatchObject({
      ownMs: 120_000,
      othersMs: 180_000,
      peak: 2,
    });
  });

  it("covers every project without a project id", async () => {
    const s = await summary({ days: 7 }, api);
    expect(s.chats).toHaveLength(3);
    expect(s.days).toHaveLength(7);
    expect(s.days.at(-1)?.workingMs).toBe(420_000);
  });
});

describe("chat", () => {
  it("measures one chat with its overlap", async () => {
    const c = await chat({ sessionId: "shop-docs" }, api);
    expect(c).toMatchObject({ title: "Docs for the cart", turns: 1, workingMs: 120_000, estimated: true });
    expect(c?.overlap).toMatchObject({ ownMs: 120_000, othersMs: 180_000, sharedMs: 120_000 });
    expect(await chat({ sessionId: "../escape" }, api)).toBeNull();
  });
});

describe("tools", () => {
  it("breakdown: a project by name, with categories, per-day rows, overlap and the slowest calls", async () => {
    const text = await toolBreakdown({ scope: "project", id: "Shop", days: 7, top: 2 }, api);
    expect(text).toContain('Project "Shop", last 7 days: 4m working in 2 chats');
    expect(text).toContain("Tests & builds | 2m | 46% | 1");
    expect(text).toContain("other chats working at the same time on average");
    expect(text).toContain("~2m | tests | Bash | shop-tests | npx playwright test");
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2} \| 4m \| 3m \| /m);
  });

  it("breakdown: the calling chat by default for scope chat, and errors as text", async () => {
    const text = await toolBreakdown({ scope: "chat", chat: { sessionId: "contoso-1" } }, api);
    expect(text).toContain('Chat "Contoso invoices" (contoso-1)');
    expect(await toolBreakdown({ scope: "project" }, api)).toContain("No project id given");
    expect(await toolBreakdown({ scope: "everything" }, api)).toContain('Unknown scope "everything"');
  });

  it("chats: ranked by working time across all projects, with project names", async () => {
    const text = await toolChats({ scope: "all", days: 1, top: 2 }, api);
    const rows = text.split("\n").slice(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(
      /^3m \| 43% \| 1\.\d \| Tests & builds 94% \| contoso-1 \| Contoso \| Contoso invoices$/,
    );
  });
});
