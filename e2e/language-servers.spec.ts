import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, launchJig, test } from "./fixtures";

const fakeServer = fileURLToPath(new URL("./fake-lsp.mjs", import.meta.url));

/** A `typescript-language-server` on PATH that is really the fake server. */
async function fakeOnPath(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  if (process.platform === "win32")
    await writeFile(join(dir, "typescript-language-server.cmd"), `@node "${fakeServer}" %*\r\n`);
  else {
    const file = join(dir, "typescript-language-server");
    await writeFile(file, `#!/bin/sh\nexec node "${fakeServer}" "$@"\n`);
    await chmod(file, 0o755);
  }
  return dir;
}

test("Language servers: errors underlined, hover from the server, status line names it", async ({
  jigHome,
}) => {
  const bin = await fakeOnPath(join(jigHome, "bin"));
  const dir = join(jigHome, "shop");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), "{}");
  await writeFile(join(dir, "cart.ts"), "export const total = 1;\nconst x = bad;\n");
  const PATH = `${bin}${delimiter}${process.env.PATH ?? process.env.Path}`;
  const app = await launchJig(jigHome, { PATH, Path: PATH });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await page.evaluate(
      (path) =>
        (window as unknown as { jig: { invoke(m: string, a: unknown): Promise<unknown> } }).jig.invoke(
          "projects.add",
          { path },
        ),
      dir,
    );
    await page.keyboard.press("Control+Shift+E");
    await page.getByTestId("files-view").getByTestId("files-entry-cart.ts").click();
    const tab = page.locator("[data-tab-id]:not(.hidden)");
    await expect(tab.getByTestId("editor-lsp")).toContainText("TypeScript", { timeout: 15000 });
    // The server's error is underlined, and its message shows on hover.
    const error = tab.locator(".cm-lintRange-error");
    await expect(error).toHaveCount(1, { timeout: 15000 });
    await error.hover();
    await expect(page.locator(".cm-tooltip")).toContainText("isn't allowed here");
    await page.screenshot({ path: test.info().outputPath("lsp-error.png") });
    // Hover on a word: the server's Markdown, rendered.
    await page.mouse.move(5, 800);
    await expect(page.locator(".cm-tooltip-hover")).toHaveCount(0);
    await tab.locator(".cm-line").first().getByText("total").hover();
    await expect(page.locator(".cm-lsp-documentation")).toContainText("from the fake server");
  } finally {
    await app.close();
  }
});
