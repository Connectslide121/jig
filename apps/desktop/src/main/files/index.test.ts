import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readImage } from "./index";

describe("readImage", () => {
  it("returns a data URL for images and refuses anything else", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jig-img-"));
    await writeFile(join(dir, "a.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    await writeFile(join(dir, "notes.txt"), "secret");
    const image = await readImage(join(dir, "a.svg"));
    expect(image.mime).toBe("image/svg+xml");
    expect(image.dataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(image.bytes).toBe(41);
    await expect(readImage(join(dir, "notes.txt"))).rejects.toMatchObject({ code: "not_image" });
    await expect(readImage(join(dir, "missing.png"))).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("writeTextFile", () => {
  it("saves inside allowed folders, refuses others, and refuses when the file changed meanwhile", async () => {
    const { readFile, stat, readdir } = await import("node:fs/promises");
    const { writeTextFile } = await import("./index");
    const dir = await mkdtemp(join(tmpdir(), "jig-write-"));
    const file = join(dir, "a.ts");
    await writeFile(file, "one\n");
    const allowed = (p: string) => p.startsWith(dir);
    const { mtimeMs } = await stat(file);
    const saved = await writeTextFile(file, "two\r\n", mtimeMs, allowed);
    expect(await readFile(file, "utf8")).toBe("two\r\n");
    expect(saved.size).toBe(5);
    // Nothing left behind next to the file.
    expect(await readdir(dir)).toEqual(["a.ts"]);
    // Someone (Claude) changed it since: refused.
    await expect(writeTextFile(file, "three", mtimeMs - 10_000, allowed)).rejects.toMatchObject({
      code: "changed",
    });
    await expect(writeTextFile("/elsewhere/x.ts", "x", undefined, allowed)).rejects.toMatchObject({
      code: "not_allowed",
    });
    // A new file is fine.
    await writeTextFile(join(dir, "b.ts"), "new", undefined, allowed);
    expect(await readFile(join(dir, "b.ts"), "utf8")).toBe("new");
  });

  it.skipIf(process.platform === "win32")("keeps the file's mode and writes through a symlink", async () => {
    const { chmod, lstat, readFile, stat, symlink } = await import("node:fs/promises");
    const { writeTextFile } = await import("./index");
    const dir = await mkdtemp(join(tmpdir(), "jig-write-"));
    const script = join(dir, "run.sh");
    await writeFile(script, "echo 1\n");
    await chmod(script, 0o755);
    await writeTextFile(script, "echo 2\n", undefined, () => true);
    expect((await stat(script)).mode & 0o777).toBe(0o755);
    const link = join(dir, "link.sh");
    await symlink(script, link);
    await writeTextFile(link, "echo 3\n", undefined, () => true);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(script, "utf8")).toBe("echo 3\n");
  });
});

describe.runIf(process.platform === "win32")("writeTextFile on Windows", () => {
  it("saves a file another program holds open, by writing into it", async () => {
    const { spawn } = await import("node:child_process");
    const { readFile, readdir } = await import("node:fs/promises");
    const { writeTextFile } = await import("./index");
    const dir = await mkdtemp(join(tmpdir(), "jig-held-"));
    const file = join(dir, "a.txt");
    await writeFile(file, "one\r\n");
    // Open for reading, sharing read and write but not delete: rename over it fails.
    const holder = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$f=[IO.File]::Open('${file}','Open','Read','ReadWrite'); 'open'; Start-Sleep 20; $f.Close()`,
      ],
      { windowsHide: true },
    );
    await new Promise((r) => holder.stdout.once("data", r));
    try {
      await writeTextFile(file, "two\r\n", undefined, () => true);
      expect(await readFile(file, "utf8")).toBe("two\r\n");
      expect(await readdir(dir)).toEqual(["a.txt"]);
    } finally {
      holder.kill();
    }
  });
});
