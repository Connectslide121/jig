import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddonHostApi } from "@jig/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { list, publish, remove, retitle, toolList, toolRead, where } from "./host";

let root: string;
let work: string;
let data: string;
let store: Record<string, unknown>;
let api: AddonHostApi;
const chat = () => ({ cwd: work, sessionId: "s1", projectId: "proj" });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jig-pages-"));
  work = join(root, "work");
  data = join(root, "data");
  await mkdir(work, { recursive: true });
  await mkdir(data, { recursive: true });
  store = {};
  api = {
    addon: { id: "pages", dir: "", dataDir: data },
    storage: {
      get: async (key: string) => store[key],
      set: async (key: string, value: unknown) => {
        store[key] = value;
      },
    },
    emit: () => undefined,
    projects: async () => [{ id: "proj", name: "Shop", path: work, repos: [] }],
    chats: { get: async () => ({ title: "Quarterly report" }) },
  } as unknown as AddonHostApi;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const parse = (text: string) =>
  JSON.parse(text) as {
    page: string;
    version: number;
    updated: boolean;
    files: number;
    notIncluded?: string[];
  };

describe("publish", () => {
  it("copies the page and the files it loads into Jig's own folder", async () => {
    await mkdir(join(work, "img"), { recursive: true });
    await writeFile(join(work, "img", "logo.png"), Buffer.from([1, 2, 3]));
    await writeFile(join(work, "data.json"), "{}");
    await writeFile(
      join(work, "report.html"),
      '<title>Q3</title><img src="img/logo.png"><img src="missing.png"><a href="x.html">x</a>',
    );
    const result = parse(await publish({ file: "report.html", files: ["data.json"], chat: chat() }, api));
    expect(result).toMatchObject({ version: 1, updated: false, files: 3 });
    const where_ = await where({ id: result.page }, api);
    expect(await readFile(where_.file, "utf8")).toContain("Q3");
    expect([...(await readdir(where_.dir))].sort()).toEqual(["data.json", "img", "report.html"]);
    // The scratch files can go: the page survives.
    await rm(work, { recursive: true, force: true });
    expect(await readFile(join(where_.dir, "img", "logo.png"))).toEqual(Buffer.from([1, 2, 3]));
    const [page] = await list(undefined, api);
    expect(page).toMatchObject({ title: "Q3", chatTitle: "Quarterly report", projectId: "proj" });
  });

  it("takes the HTML itself", async () => {
    const result = parse(await publish({ html: "<h1>Hi</h1>", title: "Greeting", chat: chat() }, api));
    const w = await where({ id: result.page }, api);
    expect(w.file.endsWith("index.html")).toBe(true);
    expect(await readFile(w.file, "utf8")).toBe("<h1>Hi</h1>");
  });

  it("updates the same page as a new version and keeps what the update doesn't bring again", async () => {
    await writeFile(join(work, "logo.png"), "png");
    await writeFile(join(work, "a.html"), '<img src="logo.png"><p>one</p>');
    const first = parse(await publish({ file: "a.html", title: "A", chat: chat() }, api));
    await writeFile(join(work, "a.html"), "<p>two</p>");
    const second = parse(await publish({ file: "a.html", id: first.page, chat: chat() }, api));
    expect(second).toMatchObject({ page: first.page, version: 2, updated: true });
    const pages = await list(undefined, api);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ title: "A", version: 2, versions: [1, 2] });
    const w = await where({ id: first.page }, api);
    expect(await readFile(w.file, "utf8")).toContain("two");
    expect(await readFile(join(w.dir, "logo.png"), "utf8")).toBe("png");
    expect(await readFile((await where({ id: first.page, version: 1 }, api)).file, "utf8")).toContain("one");
  });

  it("keeps only the newest versions", async () => {
    const first = parse(await publish({ html: "<p>1</p>", chat: chat() }, api));
    for (let i = 2; i <= 8; i++) await publish({ html: `<p>${i}</p>`, id: first.page, chat: chat() }, api);
    const [page] = await list(undefined, api);
    expect(page?.versions).toEqual([4, 5, 6, 7, 8]);
    expect((await readdir(join(data, first.page))).sort()).toEqual(["v4", "v5", "v6", "v7", "v8"]);
  });

  it("refuses paths that leave the page's folder", async () => {
    await writeFile(join(root, "secret.txt"), "s");
    await writeFile(join(work, "a.html"), "<p>x</p>");
    for (const files of [["../secret.txt"], [join(root, "secret.txt")], ["C:\\secret.txt"], ["nope.png"]])
      await expect(publish({ file: "a.html", files, chat: chat() }, api)).rejects.toThrow();
    expect(await list(undefined, api)).toEqual([]);
    expect(await readdir(data)).toEqual([]);
  });

  it("leaves out files the HTML names but that lie elsewhere, and says so", async () => {
    await writeFile(join(work, "a.html"), '<img src="../outside.png"><img src="gone.png">');
    const result = parse(await publish({ file: "a.html", chat: chat() }, api));
    expect(result.notIncluded ?? []).toEqual(["gone.png"]);
  });

  it("refuses an HTML file outside the chat's folders", async () => {
    const other = await mkdtemp(join(process.cwd(), ".tmp-pages-"));
    try {
      await writeFile(join(other, "a.html"), "<p>x</p>");
      await expect(publish({ file: join(other, "a.html"), chat: chat() }, api)).rejects.toThrow(/outside/);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("refuses a symlink that points out of the page's folder", async () => {
    await writeFile(join(root, "secret.txt"), "s");
    await writeFile(join(work, "a.html"), '<img src="link.txt">');
    try {
      await symlink(join(root, "secret.txt"), join(work, "link.txt"));
    } catch {
      return; // no symlinks here (Windows without the right)
    }
    const result = parse(await publish({ file: "a.html", chat: chat() }, api));
    expect(result.notIncluded).toEqual(["link.txt"]);
    const w = await where({ id: result.page }, api);
    expect(await readdir(w.dir)).toEqual(["a.html"]);
  });

  it("needs a file or html, not both; and an HTML file", async () => {
    await expect(publish({ chat: chat() }, api)).rejects.toThrow(/either/);
    await expect(publish({ file: "a.html", html: "<p>", chat: chat() }, api)).rejects.toThrow(/either/);
    await writeFile(join(work, "a.txt"), "x");
    await expect(publish({ file: "a.txt", chat: chat() }, api)).rejects.toThrow(/isn't an HTML/);
    await expect(publish({ html: "  ", chat: chat() }, api)).rejects.toThrow(/empty/);
  });

  it("refuses to update a page that doesn't exist", async () => {
    await expect(publish({ html: "<p>", id: "p_0123456789", chat: chat() }, api)).rejects.toThrow(/No page/);
    await expect(publish({ html: "<p>", id: "../evil", chat: chat() }, api)).rejects.toThrow();
    await expect(where({ id: "../evil" }, api)).rejects.toThrow(/isn't a page id/);
  });
});

describe("the page list", () => {
  it("renames, removes and tells Claude", async () => {
    const a = parse(await publish({ html: "<p>a</p>", title: "Alpha", chat: chat() }, api));
    const b = parse(await publish({ html: "<p>b</p>", title: "Beta", chat: chat() }, api));
    expect((await list(undefined, api)).map((p) => p.title)).toEqual(["Beta", "Alpha"]);
    expect(await toolList({} as never, api)).toContain(`${a.page}: "Alpha"`);
    expect(await toolRead({ id: b.page }, api)).toContain("<p>b</p>");
    await retitle({ id: a.page, title: "  Renamed  " }, api);
    await expect(retitle({ id: a.page, title: " " }, api)).rejects.toThrow();
    expect((await list(undefined, api)).map((p) => p.title)).toContain("Renamed");
    await remove({ id: a.page }, api);
    expect((await list(undefined, api)).map((p) => p.id)).toEqual([b.page]);
    expect(await readdir(data)).toEqual([b.page]);
    await expect(where({ id: a.page }, api)).rejects.toThrow(/gone/);
  });
});
