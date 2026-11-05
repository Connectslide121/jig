import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, launchJig, test } from "./fixtures";

const TURNS = 120;

/** A chat with `TURNS` turns, written where Jig keeps chats, before Jig starts. */
async function seedLongChat(jigHome: string): Promise<void> {
  const at = "2026-11-01T08:00:00.000Z";
  const items: unknown[] = [];
  for (let t = 0; t < TURNS; t++) {
    items.push({ kind: "user", id: `u${t}`, text: `Question number ${t}`, at });
    items.push({
      kind: "assistant",
      id: `a${t}`,
      text: `Answer ${t}. ${"Some words to fill a line. ".repeat(8)}`,
      at,
    });
    items.push({ kind: "result", id: `r${t}`, ok: true, durationMs: 1000, at });
  }
  const meta = {
    id: "long",
    cwd: tmpdir(),
    title: "Long chat",
    createdAt: at,
    updatedAt: at,
    model: "",
    permissionMode: "default",
    status: "idle",
    authSource: "subscription",
    costUsd: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    turns: TURNS,
  };
  await mkdir(join(jigHome, "sessions"), { recursive: true });
  await writeFile(join(jigHome, "sessions", "long.json"), JSON.stringify({ meta, items, queue: [] }));
}

test("long chat: renders its latest rows, more as you scroll up, without moving what you read", async ({
  jigHome,
}) => {
  await seedLongChat(jigHome);
  const app = await launchJig(jigHome);
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root] [data-testid=main-area]");
    await page.getByTestId("view-tab-jig.sessions").click();
    await page.getByTestId("session-Long chat").click();
    const transcript = page.getByTestId("transcript");
    await expect(transcript.getByTestId("user-message-text").last()).toHaveText(
      `Question number ${TURNS - 1}`,
    );
    // Only the latest rows are in the page (D-366).
    const users = transcript.getByTestId("user-message");
    expect(await users.count()).toBeLessThan(TURNS);
    await expect(transcript.getByText("Question number 0", { exact: true })).toHaveCount(0);

    // Scrolling near the top renders earlier rows above, and the row you look at stays put.
    const moved = await transcript.evaluate(async (el) => {
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const list = el.querySelector("[data-first-row]")!;
      const before = Number(list.getAttribute("data-first-row"));
      el.scrollTop = Math.max(0, el.clientHeight / 2);
      const seen = [...list.children].find(
        (c) => c.getBoundingClientRect().top > el.getBoundingClientRect().top,
      )!;
      const top = seen.getBoundingClientRect().top;
      await frames();
      await frames();
      return {
        before,
        after: Number(list.getAttribute("data-first-row")),
        shift: seen.getBoundingClientRect().top - top,
      };
    });
    expect(moved.after).toBeLessThan(moved.before);
    expect(Math.abs(moved.shift)).toBeLessThan(2);

    // Find in chat reaches the first message, however far up it is.
    await page.keyboard.press("Control+f");
    await page.getByTestId("find-input").fill("Question number 0");
    await expect(transcript.getByText("Question number 0", { exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");

    // Back at the latest, the chat renders only its latest rows again.
    await page.getByTestId("jump-latest").click();
    await expect(transcript.getByText("Question number 0", { exact: true })).toHaveCount(0);
    await expect(users.last()).toBeInViewport();
  } finally {
    await app.close();
  }
});
