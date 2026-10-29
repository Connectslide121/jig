import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { findOnPath, quoteForCmd, resolveCommand } from "./winCommand";

const env = { PATH: "C:\\bin;C:\\tools", PATHEXT: ".COM;.EXE;.BAT;.CMD" };
const files = new Set(["C:\\tools\\az.cmd", "C:\\bin\\git.exe", "C:\\tools\\git.exe"]);
const exists = (p: string) => files.has(p.replaceAll("/", "\\"));

describe("Windows command resolution", () => {
  it("finds programs through PATH and PATHEXT", () => {
    expect(findOnPath("git", env, exists)?.replaceAll("/", "\\")).toBe("C:\\bin\\git.exe");
    expect(findOnPath("az", env, exists)?.replaceAll("/", "\\")).toBe("C:\\tools\\az.cmd");
    expect(findOnPath("nope", env, exists)).toBeUndefined();
  });

  it("runs .cmd files through cmd.exe with quoted arguments", () => {
    const r = resolveCommand(
      "az",
      ["pipelines", "list", "--project", "My Project", "--query", "[?a=='b']"],
      "win32",
      env,
      exists,
    );
    expect(r.file).toBe("cmd.exe");
    expect(r.verbatim).toBe(true);
    expect(r.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(r.args[3]).toContain('^"My Project^"');
    const exe = resolveCommand("git", ["status"], "win32", env, exists);
    expect(exe).toEqual({ file: expect.stringMatching(/git\.exe$/), args: ["status"], verbatim: false });
    expect(resolveCommand("git", ["x"], "linux", env, exists)).toEqual({
      file: "git",
      args: ["x"],
      verbatim: false,
    });
  });

  it("passes a cmd /c command line as written", () => {
    const r = resolveCommand("cmd.exe", ["/d", "/s", "/c", 'echo "a b" & dir'], "win32", env, exists);
    expect(r).toEqual({ file: "cmd.exe", args: ["/d", "/s", "/c", '"echo "a b" & dir"'], verbatim: true });
    expect(resolveCommand("cmd", ["/C", "ver"], "win32", env, exists).args).toEqual(["/s", "/c", '"ver"']);
  });

  it.runIf(process.platform === "win32")("keeps quotes in a real cmd.exe", () => {
    const r = resolveCommand("cmd.exe", ["/d", "/s", "/c", 'echo "a b"'], "win32", process.env);
    const out = spawnSync(r.file, r.args, { encoding: "utf8", windowsVerbatimArguments: r.verbatim });
    expect(out.stdout.trim()).toBe('"a b"');
  });

  it.runIf(process.platform === "win32")(
    "runs a .cmd whose path has spaces and brackets, with its arguments intact",
    async () => {
      const { mkdtemp, writeFile } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = join(await mkdtemp(join(tmpdir(), "jig cmd ")), "My Tools (x86)");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(dir);
      // Like az.cmd in C:\Program Files\…: prints its arguments one per line.
      await writeFile(
        join(dir, "tool.cmd"),
        "@node -e \"console.log(process.argv.slice(1).join('\\n'))\" -- %*\r\n",
      );
      const r = resolveCommand("tool", ["--project", "My Project", "a&b", '"q"'], "win32", {
        ...process.env,
        PATH: `${dir};${process.env.PATH ?? process.env.Path}`,
      });
      const out = spawnSync(r.file, r.args, { encoding: "utf8", windowsVerbatimArguments: r.verbatim });
      expect(out.stderr).toBe("");
      expect(out.stdout.trim().split(/\r?\n/)).toEqual(["--project", "My Project", "a&b", '"q"']);
    },
  );

  it("escapes quotes, backslashes and cmd metacharacters", () => {
    expect(quoteForCmd("plain")).toBe('^"plain^"');
    expect(quoteForCmd('say "hi"')).toBe('^"say \\^"hi\\^"^"');
    expect(quoteForCmd("a&b|c")).toBe('^"a^&b^|c^"');
    expect(quoteForCmd("C:\\dir\\")).toBe('^"C:\\dir\\\\^"');
  });
});
