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

test("Meeting history: a recurring meeting gets its own folder, and you make folders and drag meetings in", async ({
  jigHome,
}) => {
  const thread =
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ShopDaily%40thread.v2/0?context=%7b%7d";
  const meeting = (id: string, title: string, at: string, joinUrl: string) => ({
    id,
    title,
    joinUrl,
    startedAt: at,
    endedAt: at,
    status: "ended",
    capture: "Captions",
    captions: [],
    gaps: [],
    notes: "",
    actions: [],
  });
  await mkdir(join(jigHome, "addon-data"), { recursive: true });
  await writeFile(
    join(jigHome, "addon-data", "meetings.json"),
    JSON.stringify({
      records: [
        meeting("1a2b3c4d-0000-4000-8000-000000000011", "Shop daily", "2026-02-11T09:00:00.000Z", thread),
        meeting("1a2b3c4d-0000-4000-8000-000000000012", "Shop daily", "2026-02-10T09:00:00.000Z", thread),
        meeting(
          NEW,
          "Contoso review",
          "2026-02-09T09:00:00.000Z",
          "https://teams.microsoft.com/l/meetup-join/x",
        ),
      ],
    }),
  );
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByTestId("topbar-meetings").click();
    await page.getByTestId("meetings-open-history").click();
    const history = page.getByTestId("meeting-history");
    // The two occurrences share a Teams meeting thread: one series folder, opened on the newest.
    const series = history.getByTestId("meeting-folder").filter({ hasText: "Shop daily" });
    await expect(series.getByTestId("meeting-row")).toHaveCount(2);
    await expect(history.getByTestId("meeting-no-folder")).toBeVisible();

    await history.getByTestId("meeting-new-folder").click();
    await page.getByRole("dialog").getByRole("textbox").fill("Customers");
    await page.getByTestId("dialog-confirm").click();
    const customers = history.getByTestId("meeting-folder").filter({ hasText: "Customers" });
    await expect(customers).toContainText("Drag meetings here");

    await history
      .getByTestId("meeting-row")
      .filter({ hasText: "Contoso review" })
      .dragTo(customers.getByTestId("meeting-folder-row"));
    await expect(customers.getByTestId("meeting-row")).toHaveCount(1);
    const folders = (await hostCall(page, "meetings.folders")) as {
      value: Array<{ id: string; name: string }>;
    };
    expect(folders.value.map((f) => f.name)).toEqual(["Customers"]);
    const records = (await hostCall(page, "meetings.history")) as {
      value: Array<{ id: string; folder?: string }>;
    };
    expect(records.value.find((r) => r.id === NEW)?.folder).toBe(folders.value[0]!.id);
  } finally {
    await app.close();
  }
});

test("Chats: @chat mentions a Teams chat, and Claude reads it with jig_teams_chat_read (D-333)", async ({
  jigHome,
}) => {
  await mkdir(join(jigHome, "shop"));
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
    await page.keyboard.press("Control+N");
    const input = page.getByTestId("composer-input");
    const shots = ".jig-test-home-meeting-screenshots";

    // `@chat` narrows the picker to Teams chats; a word after it filters them by name or member.
    await input.fill("@chat");
    const picker = page.getByTestId("composer-picker");
    await expect(picker).toContainText("Teams chats");
    await expect(picker).toContainText("Alex Contoso");
    await expect(picker).not.toContainText("Shop planning");
    await expect(picker.getByRole("option")).toHaveCount(8);
    await page.screenshot({ animations: "disabled", path: `${shots}/chat-mention-picker-dark.png` });
    await hostCall(page, "config.update", { appearance: { themeId: "jig-light" } });
    await page.screenshot({ animations: "disabled", path: `${shots}/chat-mention-picker-light.png` });
    // Your chat with yourself is mentionable too, found by your own name.
    await input.fill("@chat riley");
    await expect(picker.getByRole("option")).toHaveCount(1);
    await expect(picker).toContainText("Riley Contoso (You)");
    await input.fill("@chat plann");
    await expect(picker.getByRole("option")).toHaveCount(1);
    await expect(picker).toContainText("Portal planning");
    await expect(picker).toContainText("Teams chat ·");
    await input.press("Enter");
    await expect(input).toHaveValue(/^@chat:portal-planning-[0-9a-f]{8} $/);
    const chip = page.getByTestId("composer-mention");
    await expect(chip).toHaveAttribute("data-kind", "chat");
    await expect(chip).toContainText("Portal planning");
    await input.pressSequentially("what is on the agenda?");
    await page.screenshot({ animations: "disabled", path: `${shots}/chat-mention-chip-light.png` });
    await hostCall(page, "config.update", { appearance: { themeId: "jig-dark" } });
    await page.screenshot({ animations: "disabled", path: `${shots}/chat-mention-chip-dark.png` });

    // Jig's context names the chat; Claude reads it, oldest first, pictures and files named.
    await input.press("Enter");
    const answer = page.getByTestId("assistant-message").last();
    await expect(answer).toContainText("From the mentioned Teams chat", { timeout: 20_000 });
    await expect(answer).toContainText("Teams chat: Portal planning (group chat)");
    await expect(answer).toContainText("Agenda for Thursday is in the channel.");
    await expect(answer).toContainText("[image] [file: Shop spec.docx]");
  } finally {
    await app.close();
  }
});
