import type { AddonChatListItem, AddonChatTimelineEntry, AddonHostApi } from "@jig/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { chat, overview, summary, toolBreakdown, toolChats } from "./host";

const projects = [
  { id: "p-shop", name: "Shop" },
  { id: "p-contoso", name: "Contoso" },
];
const chats = new Map<string, { item: AddonChatListItem; timeline: AddonChatTimelineEntry[] }>();
const api = {
  addon: { id: "chat-time", dir: "", dataDir: "" },
  projects: async () => projects,
  chats: {
    list: async (filter?: { projectId?: string; since?: number }) =>
      [...chats.values()]
        .map((c) => c.item)
        .filter((c) => filter?.since === undefined || Date.parse(c.updatedAt) >= filter.since),
    timeline: async (sessionId: string) => {
      const c = chats.get(sessionId);
      if (!c) throw new Error("Session not found");
      return c.timeline;
    },
  },
} as unknown as AddonHostApi;

const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * A chat with one turn of `seconds` that ended `endAgo` seconds ago, running `command` from its start.
 * `toolSeconds`: when the call's end was recorded (D-423); left out, it's estimated from the next step.
 */
function addChat(
  id: string,
  projectId: string,
  title: string,
  endAgo: number,
  seconds: number,
  command: string,
  toolSeconds?: number,
) {
  const end = NOW - endAgo * 1000;
  const start = end - seconds * 1000;
  chats.set(id, {
    item: {
      sessionId: id,
      title,
      projectId,
      provider: toolSeconds === undefined ? "claude" : "chatgpt",
      createdAt: iso(start),
      updatedAt: iso(end),
      turns: 1,
    },
    timeline: [
      { kind: "step", id: `${id}-u`, at: iso(start), what: "user" },
      {
        kind: "tool",
        id: `${id}-t`,
        at: iso(start),
        name: "Bash",
        input: { command },
        status: "done",
        ...(toolSeconds === undefined
          ? {}
          : { endedAt: iso(start + toolSeconds * 1000), durationMs: toolSeconds * 1000 }),
      },
      { kind: "step", id: `${id}-a`, at: iso(start + (seconds - 10) * 1000), what: "assistant" },
      { kind: "turn", id: `${id}-r`, at: iso(end), durationMs: seconds * 1000, ok: true },
    ],
  });
}

beforeAll(() => {
  // Two Shop chats that overlap for 60 s, and a Contoso chat working at the same time as both.
  addChat(
    "shop-tests",
    "p-shop",
    "Faster checkout tests",
    60,
    120,
    "npx playwright test e2e/checkout.spec.ts",
  );
  addChat("shop-docs", "p-shop", "Docs for the cart", 0, 120, "git log --oneline");
  addChat("contoso-1", "p-contoso", "Contoso invoices", 0, 180, "npm run build");
  // A ChatGPT chat from long ago whose call's end was recorded: exact, no estimate.
  addChat("fabrikam", "p-contoso", "Fabrikam export", 30 * 86_400, 100, "npm test", 42);
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

  it("uses the recorded end of a call: exact, also for ChatGPT chats (D-423)", async () => {
    const c = await overview({ sessionId: "fabrikam" }, api);
    expect(c).toMatchObject({ provider: "chatgpt", estimated: false, workingMs: 100_000 });
    expect(c?.totals.tests).toBe(42_000);
    expect(c?.slowest[0]).toMatchObject({ ms: 42_000, estimated: false });
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
