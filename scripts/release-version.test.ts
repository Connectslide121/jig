import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readVersions, setVersion } from "../.agents/skills/jig-release/scripts/version.mjs";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "jig-release-version-"));
  roots.push(root);
  await mkdir(join(root, "apps/desktop"), { recursive: true });
  const files = {
    "package.json": { name: "jig", version: "0.1.0", workspaces: ["apps/*", "packages/*"] },
    "apps/desktop/package.json": { name: "@jig/desktop", version: "0.1.0" },
    "package-lock.json": {
      name: "jig",
      version: "0.1.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "jig", version: "0.1.0" },
        "apps/desktop": { name: "@jig/desktop", version: "0.1.0" },
        "packages/sdk": { name: "@jig/sdk", version: "2.0.0" },
      },
    },
  };
  for (const [path, data] of Object.entries(files)) {
    await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("updates all five app version fields without changing other workspace packages", async () => {
  const root = await fixture();
  expect(setVersion(root, "0.2.0")).toMatchObject({ from: "0.1.0", to: "0.2.0", dryRun: false });
  expect(readVersions(root).current).toBe("0.2.0");
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  expect(lock.packages["packages/sdk"].version).toBe("2.0.0");
});

it("dry runs and rejected versions leave every manifest unchanged", async () => {
  const root = await fixture();
  const snapshot = () =>
    Promise.all(readVersions(root).files.map((file: string) => readFile(join(root, file), "utf8")));
  const before = await snapshot();
  expect(setVersion(root, "0.1.1", { dryRun: true }).dryRun).toBe(true);
  for (const invalid of [
    "0.1.0",
    "0.0.9",
    "v0.1.1",
    "0.1.1-beta.1",
    "01.2.3",
    "1.2",
    "1.2.9007199254740992",
  ]) {
    expect(() => setVersion(root, invalid)).toThrow();
  }
  expect(await snapshot()).toEqual(before);
});

it("refuses inconsistent app versions before writing anything", async () => {
  const root = await fixture();
  const file = join(root, "apps/desktop/package.json");
  await writeFile(file, JSON.stringify({ name: "@jig/desktop", version: "0.1.9" }));
  const before = await readFile(join(root, "package-lock.json"), "utf8");
  expect(() => setVersion(root, "0.2.0")).toThrow(/disagree/);
  expect(await readFile(join(root, "package-lock.json"), "utf8")).toBe(before);
});
