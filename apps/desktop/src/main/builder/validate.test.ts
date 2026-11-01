import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateAddon } from "./validate";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function addon(manifest: object, host?: string): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "jig-validate-"));
  await writeFile(
    join(dir, "addon.json"),
    JSON.stringify({ id: "board", name: "Board", version: "1.0.0", contributes: {}, ...manifest }),
  );
  await writeFile(join(dir, "README.md"), "# Board\n\nWork items.\n");
  if (host !== undefined) await writeFile(join(dir, "host.ts"), host);
  return dir;
}

describe("validateAddon", () => {
  it("checks that events, search providers and shared methods exist in host.ts", async () => {
    const v = await validateAddon(
      await addon(
        {
          exports: ["cards"],
          contributes: {
            events: [{ on: "chat.finished", run: "chatFinished" }],
            search: [{ id: "cards", title: "Work items", run: "searchCards" }],
          },
        },
        "export async function chatFinished() {}\nexport async function cards() { return []; }\n",
      ),
      [],
    );
    expect(v.problems).toEqual([
      'addon.json refers to "searchCards", but host.ts has no export with that name.',
    ]);
  });

  it("says when addon.json needs host code and there is none", async () => {
    const v = await validateAddon(
      await addon({ contributes: { events: [{ on: "git.commit", run: "x" }] } }),
      [],
    );
    expect(v.ok).toBe(false);
    expect(v.problems.join()).toContain("there is no host.ts");
  });
});
