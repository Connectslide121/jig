import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiLineHashes, lineHash } from "@jig/learning";
import { afterEach, describe, expect, it } from "vitest";
import type { SavedClaudeMessage, SavedClaudeSession } from "../../shared/engine";
import { claudeWrittenLines, forgetClaudeLines } from "./claudeLines";
import { ANYWHERE, computeWorked, pathKey } from "./worked";

const day = 86_400_000;
const assistant = (...blocks: unknown[]): SavedClaudeMessage => ({
  type: "assistant",
  uuid: "a",
  parent_tool_use_id: null,
  message: { content: blocks },
});
const tool = (name: string, input: Record<string, unknown>) => ({ type: "tool_use", id: "t", name, input });

function engine(sessions: SavedClaudeSession[], chats: Record<string, SavedClaudeMessage[]>) {
  const reads: string[] = [];
  return {
    reads,
    savedSessions: async () => sessions,
    savedToolUses: async (id: string) => {
      reads.push(id);
      const chat = chats[id];
      if (!chat) throw new Error("gone");
      // Only Claude's own messages hold tool calls (the engine reads them from the transcript).
      return chat
        .filter((m) => m.type === "assistant")
        .flatMap(
          (m) =>
            (m.message as { content: Array<{ type: string; name: string; input: Record<string, unknown> }> })
              .content,
        )
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ name: b.name, input: b.input }));
    },
  };
}

const session = (id: string, cwd: string, lastModified = Date.now()) =>
  ({ sessionId: id, title: "x", cwd, lastModified }) as SavedClaudeSession;

/** A repository with the author Jig measures (ann@example.com). */
async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "jig-worked-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Ann Demo");
  git("config", "user.email", "ann@example.com");
  return { dir, git };
}

afterEach(() => forgetClaudeLines());

describe("lines Claude wrote outside Jig", () => {
  it("collects what Write, Edit and MultiEdit wrote, per file, from recent chats only; each chat is read once", async () => {
    const now = Date.now();
    const e = engine(
      [
        session("new", "/work/shop", now - day),
        session("old", "/work/shop", now - 60 * day),
        session("broken", "/work/shop", now - day),
      ],
      {
        new: [
          assistant(
            tool("Write", {
              file_path: "/work/shop/cart.ts",
              content: "export const total = 1;\nconst tax = 2;\n",
            }),
            tool("Edit", { file_path: "src/pay.ts", old_string: "a", new_string: "const paid = true;" }),
            tool("Bash", { command: "echo not a writer" }),
          ),
          {
            type: "user",
            uuid: "u",
            parent_tool_use_id: null,
            message: {
              content: [tool("Write", { file_path: "/work/shop/ignored.ts", content: "const ignored = 1;" })],
            },
          },
        ],
        old: [assistant(tool("Write", { file_path: "/work/shop/old.ts", content: "const old = 1;" }))],
      },
    );
    const since = new Date(now - 28 * day);
    const lines = await claudeWrittenLines(e, since);
    expect([...lines.keys()].filter((k) => k !== ANYWHERE).sort()).toEqual(
      [pathKey("/work/shop/cart.ts"), pathKey("/work/shop/src/pay.ts")].sort(),
    );
    expect(lines.get(pathKey("/work/shop/cart.ts"))).toEqual(
      new Set(aiLineHashes("Write", { content: "export const total = 1;\nconst tax = 2;\n" })),
    );
    // The old chat isn't read; the broken one is skipped; the new one is read once across runs.
    await claudeWrittenLines(e, since);
    expect(e.reads.filter((id) => id === "new")).toHaveLength(1);
    expect(e.reads).not.toContain("old");
  });

  it("counts the long lines of a script Claude wrote in every file, not only in the script", async () => {
    const line = "export const shipped = (order: Order) => order.items.length > 0;";
    const e = engine([session("s", "/work")], {
      s: [
        assistant(
          tool("Write", {
            file_path: "/tmp/patch.py",
            content: `s = open(p).read()\nnew = """\n${line}\n"""`,
          }),
        ),
      ],
    });
    const lines = await claudeWrittenLines(e, new Date(Date.now() - day));
    expect(lines.get(ANYWHERE)).toEqual(new Set([lineHash(line)]));
  });

  it("counts the long lines of a command anywhere, and ignores short ones", async () => {
    const line = "const total = (a, b) => a + b + tax(a);";
    const e = engine([session("s", "/work")], {
      s: [assistant(tool("Bash", { command: `python - <<'X'\n${line}\n});\nX` }))],
    });
    const lines = await claudeWrittenLines(e, new Date(Date.now() - day));
    expect(lines.get(ANYWHERE)).toEqual(new Set([lineHash(line)]));
  });
});

describe("How you worked counts Claude Code's own history", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("counts lines Claude wrote in a chat outside Jig as Claude's, not by hand", async () => {
    const made = await repo();
    dir = made.dir;
    await mkdir(join(dir, "src"), { recursive: true });
    const claude =
      "export const total = (a: number, b: number) => a + b;\nexport const tax = (n: number) => n * 0.25;\n";
    await writeFile(join(dir, "src", "cart.ts"), `${claude}// written by hand: keep the totals in cents\n`);
    made.git("add", ".");
    made.git("commit", "-q", "-m", "Add the cart");

    // Without Claude Code's history: everything is by hand.
    const alone = await computeWorked([dir], []);
    expect(alone).toMatchObject({ commits: 1, ai: 0 });
    // With it: the two lines Claude wrote are Claude's.
    const e = engine([session("s", dir)], {
      s: [assistant(tool("Write", { file_path: join(dir, "src", "cart.ts"), content: claude }))],
    });
    const elsewhere = await claudeWrittenLines(e, new Date(Date.now() - 28 * day));
    const worked = await computeWorked([dir], [], new Date(), elsewhere);
    expect(worked.ai).toBe(2);
    expect(worked.hand).toBe(alone.hand - 2);
  });

  it("counts lines Claude wrote with a shell command, and leaves lock files out", async () => {
    const made = await repo();
    dir = made.dir;
    const script = "export const shipped = (order: Order) => order.items.length > 0;";
    await writeFile(
      join(dir, "ship.ts"),
      `${script}\nexport const rounded = (n: number) => Math.round(n * 100) / 100;\n`,
    );
    await writeFile(join(dir, "package-lock.json"), '{ "name": "shop", "lockfileVersion": 3 }\n'.repeat(500));
    made.git("add", ".");
    made.git("commit", "-q", "-m", "Ship orders");
    const e = engine([session("s", dir)], {
      s: [assistant(tool("Bash", { command: `cat > ship.ts <<'EOF'\n${script}\nEOF` }))],
    });
    const elsewhere = await claudeWrittenLines(e, new Date(Date.now() - 28 * day));
    const worked = await computeWorked([dir], [], new Date(), elsewhere);
    // The 500 lock-file lines aren't counted; of the two lines in ship.ts one came from the command.
    expect(worked).toMatchObject({ commits: 1, ai: 1, hand: 1 });
  });
});
