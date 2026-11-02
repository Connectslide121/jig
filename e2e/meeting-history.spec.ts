import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, hostCall, launchJig, test } from "./fixtures";

const OLD = "1a2b3c4d-0000-4000-8000-000000000001";
const NEW = "5e6f7a8b-0000-4000-8000-000000000002";

/** Two past meetings in JIG_HOME before Jig starts: the history needs no meeting window. */
async function seed(jigHome: string): Promise<void> {
  const caption = (id: string, speaker: string, at: string, text: string) => ({
    id,
    speakerId: speaker,
    speaker,
    timestamp: at,
    text,
    final: true,
  });
  const meeting = (id: string, title: string, day: string, notes: string, text: string) => ({
    id,
    title,
    joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
    startedAt: `${day}T09:00:00.000Z`,
    endedAt: `${day}T09:45:00.000Z`,
    status: "ended",
    capture: "Captions",
    captions: [caption(`${id}-c1`, "Alex", `${day}T09:01:00.000Z`, text)],
    gaps: [],
    notes,
    actions: [],
  });
  await mkdir(join(jigHome, "addon-data"), { recursive: true });
  await writeFile(
    join(jigHome, "addon-data", "meetings.json"),
    JSON.stringify({
      records: [
        meeting(OLD, "Shop planning", "2026-01-05", "", "Ship the checkout first."),
        meeting(NEW, "Portal review", "2026-02-10", "**Summary** Portal is ready.", "Portal looks good."),
      ],
    }),
  );
}

test("Meeting history: open from the top bar, search, rename, copy as Markdown", async ({ jigHome }) => {
  await seed(jigHome);
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await page.getByTestId("topbar-meetings").click();
    await page.getByTestId("meetings-open-history").click();
    const history = page.getByTestId("meeting-history");
    await expect(history.getByTestId("meeting-row")).toHaveCount(2);
    // Newest first, and the first is shown with its notes and transcript.
    await expect(history.getByTestId("meeting-row").first()).toContainText("Portal review");
    await expect(history.getByTestId("meeting-detail")).toContainText("Portal is ready.");
    await expect(history.getByTestId("meeting-transcript")).toContainText("Portal looks good.");

    await history.getByPlaceholder("Search meetings").fill("shop");
    await expect(history.getByTestId("meeting-row")).toHaveCount(1);
    await history.getByTestId("meeting-row").click();
    await expect(history.getByTestId("meeting-transcript")).toContainText("Ship the checkout first.");

    await history.getByTestId("meeting-more").click();
    await page.getByTestId("meeting-rename").click();
    const input = page.getByRole("dialog").getByRole("textbox");
    await input.fill("Shop kickoff");
    await page.getByTestId("dialog-confirm").click();
    await history.getByPlaceholder("Search meetings").fill("");
    await expect(history.getByTestId("meeting-row").nth(1)).toContainText("Shop kickoff");

    const markdown = await hostCall(page, "meetings.markdown", { id: OLD });
    expect(markdown).toMatchObject({ ok: true });
    expect((markdown as { value: string }).value).toContain("# Shop kickoff");
    expect((markdown as { value: string }).value).toContain("Ship the checkout first.");
  } finally {
    await app.close();
  }
});

test("Meeting history: a chat started from a meeting mentions it, and Claude reads it", async ({
  jigHome,
}) => {
  await seed(jigHome);
  await mkdir(join(jigHome, "shop"));
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    const added = await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
    const projectId = (added as { value: { id: string } }).value.id;

    // The @ picker finds meetings by name.
    const found = await hostCall(page, "meetings.mentions", { query: "meeting:portal" });
    expect((found as { value: Array<{ mention: string }> }).value.map((m) => m.mention)).toEqual([
      "@meeting:portal-review-5e6f7a8b",
    ]);

    await page.getByTestId("topbar-meetings").click();
    await page.getByTestId("meetings-open-history").click();
    await page.getByTestId("meeting-start-chat").click();
    await page.getByTestId(`meeting-chat-${projectId}`).click();
    const input = page.getByTestId("composer-input");
    await expect(input).toHaveValue("@meeting:portal-review-5e6f7a8b ");
    await input.press("End");
    await input.pressSequentially("what was decided?");
    await input.press("Enter");
    await expect(page.getByTestId("assistant-message").last()).toContainText("From the mentioned meeting", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("assistant-message").last()).toContainText("Portal looks good.");
  } finally {
    await app.close();
  }
});
