import type { AddonScript } from "@jig/sdk";
import { describe, expect, it } from "vitest";
import {
  addMember,
  groupState,
  memberKey,
  moveGroup,
  newGroup,
  parseMember,
  removeGroup,
  removeMember,
  renameGroup,
} from "./groups";
import { countText, relativeRepos, repoOf, scriptTree } from "./tree";

const s = (folder: string, name: string, kind = "npm"): AddonScript => ({
  id: `${kind}:${folder}:${name}`,
  name,
  kind,
  folder,
  cwd: `/r/${folder}`,
  command: name,
});

describe("the scripts tree", () => {
  const scripts = [
    s("Shop/web", "dev"),
    s("Shop/web", "build"),
    s("Shop/Api", "Api", "dotnet-run"),
    s("Clients/acme/portal", "start"),
    s("Clients/acme/api", "func start", "func"),
    s("Clients/beta", "dev"),
    s("", "setup.ps1", "ps1"),
  ];
  const repos = ["Shop", "Clients/acme", "Clients/beta"];

  it("finds the deepest repository holding a folder", () => {
    expect(repoOf("Clients/acme/api", repos)).toBe("Clients/acme");
    expect(repoOf("Shop", repos)).toBe("Shop");
    expect(repoOf("Other/x", repos)).toBeUndefined();
    expect(repoOf("web", ["", "web/inner"])).toBe("");
  });

  it("groups by top folder, then repository, then package, backends first", () => {
    const tree = scriptTree(scripts, repos, "repos");
    expect(tree.map((t) => [t.label, t.flat, t.repos.map((r) => r.label)])).toEqual([
      ["repos", true, [""]],
      ["Clients", false, ["acme", "beta"]],
      ["Shop", true, [""]],
    ]);
    const shop = tree[2]!.repos[0]!.packages;
    expect(shop.map((p) => [p.label, p.kind, p.scripts.map((x) => x.name)])).toEqual([
      ["Api", "api", ["Api"]],
      ["web", "npm", ["dev", "build"]],
    ]);
    expect(tree[0]!.repos[0]!.packages[0]).toMatchObject({ label: "repos", kind: "script" });
    expect(countText(tree[1]!.repos.flatMap((r) => r.packages))).toBe("1 backend · 2 packages");
    expect(countText([])).toBe("");
  });

  it("makes a workspace's repositories relative to the project folder", () => {
    expect(
      relativeRepos(
        "E:\\repos",
        [{ path: "E:\\repos\\Shop" }, { path: "E:\\repos\\Clients\\acme" }, { path: "D:\\x" }],
        false,
      ),
    ).toEqual(["Shop", "Clients/acme"]);
    expect(relativeRepos("/r/shop", [], true)).toEqual([""]);
  });
});

describe("script groups", () => {
  it("are created, renamed, reordered, filled and emptied", () => {
    const front = memberKey("E:/repos", "npm:Shop/web:dev");
    const back = memberKey("E:/repos", "dotnet-run:Shop/Api:Api");
    let groups = newGroup([], " Shop ", front);
    groups = newGroup(groups, "Other");
    const [shop, other] = groups;
    expect(shop).toMatchObject({ name: "Shop", members: [front] });
    groups = addMember(groups, shop!.id, back);
    groups = addMember(groups, shop!.id, back);
    expect(groups[0]!.members).toEqual([front, back]);
    expect(renameGroup(groups, shop!.id, "  ")[0]!.name).toBe("Shop");
    expect(renameGroup(groups, shop!.id, "Shop app")[0]!.name).toBe("Shop app");
    expect(moveGroup(groups, other!.id, -1).map((g) => g.name)).toEqual(["Other", "Shop"]);
    expect(moveGroup(groups, other!.id, 1)).toBe(groups);
    expect(removeMember(groups, shop!.id, front)[0]!.members).toEqual([back]);
    expect(removeGroup(groups, shop!.id).map((g) => g.name)).toEqual(["Other"]);
    expect(parseMember(back)).toEqual({ folder: "E:/repos", scriptId: "dotnet-run:Shop/Api:Api" });
    expect(groupState(groups[0]!, (m) => m === back)).toEqual({ running: [back], stopped: [front] });
  });
});
