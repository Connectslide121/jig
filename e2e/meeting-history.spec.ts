import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { AZ_ARGV, expect, hostCall, launchJig, test } from "./fixtures";

const OLD = "1a2b3c4d-0000-4000-8000-000000000001";
const NEW = "5e6f7a8b-0000-4000-8000-000000000002";

/** The Meetings window once it is open (the top-bar button, or `meetings.open`), with motion off. */
async function meetingsWindow(app: ElectronApplication): Promise<Page> {
  const find = () => app.windows().find((w) => w.url().includes("meetingLobby=1"));
  await expect.poll(() => Boolean(find()), { timeout: 30_000 }).toBe(true);
  const lobby = find()!;
  await lobby.emulateMedia({ reducedMotion: "reduce" });
  await expect(lobby.getByTestId("meeting-lobby")).toBeVisible();
  return lobby;
}
const tab = (lobby: Page, name: string) =>
  lobby.getByRole("navigation", { name: "Sections" }).getByRole("button", { name, exact: true });

/** Two past meetings in JIG_HOME before Jig starts: the history needs no call; `actions` go to the newer one. */
async function seed(jigHome: string, actions: unknown[] = []): Promise<void> {
  const caption = (id: string, speaker: string, at: string, text: string) => ({
    id,
    speakerId: speaker,
    speaker,
    timestamp: at,
    text,
    final: true,
  });
  const meeting = (
    id: string,
    title: string,
    day: string,
    notes: string,
    text: string,
    drafted: unknown[] = [],
  ) => ({
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
    actions: drafted,
  });
  await mkdir(join(jigHome, "addon-data"), { recursive: true });
  await writeFile(
    join(jigHome, "addon-data", "meetings.json"),
    JSON.stringify({
      records: [
        meeting(OLD, "Shop planning", "2026-01-05", "", "Ship the checkout first."),
        meeting(
          NEW,
          "Portal review",
          "2026-02-10",
          "**Summary** Portal is ready.",
          "Portal looks good.",
          actions,
        ),
      ],
    }),
  );
}

test("Meeting history: the top-bar button opens the Meetings window; search, rename, copy as Markdown", async ({
  jigHome,
}) => {
  await seed(jigHome);
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    // One click opens the window, on the Calendar the first time; the history is its Meetings tab.
    await page.getByTestId("topbar-meetings").click();
    const lobby = await meetingsWindow(app);
    await expect(tab(lobby, "Calendar")).toHaveAttribute("aria-current", "page");
    await tab(lobby, "Meetings").click();
    const history = lobby.getByTestId("meeting-history");
    await expect(history.getByTestId("meeting-row")).toHaveCount(2);
    // Newest first, and the first is shown with its notes; the transcript waits behind its button.
    await expect(history.getByTestId("meeting-row").first()).toContainText("Portal review");
    await expect(history.getByTestId("meeting-detail")).toContainText("Portal is ready.");
    const toggle = history.getByTestId("meeting-transcript-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toContainText("Transcript1");
    await expect(history.getByTestId("meeting-transcript")).toHaveCount(0);
    // Shown beside the notes (with a handle), and remembered.
    const before = await toggle.boundingBox();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(await toggle.boundingBox()).toEqual(before);
    await expect(history.getByTestId("meeting-transcript")).toContainText("Portal looks good.");
    await expect(history.getByTestId("meeting-detail")).toContainText("Portal is ready.");
    await expect(history.getByRole("separator", { name: "Resize the transcript" })).toBeVisible();
    await expect
      .poll(async () => (await hostCall(page, "meetings.overview")) as { value: { layout?: unknown } })
      .toMatchObject({ value: { layout: { historyTranscript: true } } });

    await history.getByPlaceholder("Search meetings").fill("shop");
    await expect(history.getByTestId("meeting-row")).toHaveCount(1);
    await history.getByTestId("meeting-row").click();
    await expect(history.getByTestId("meeting-transcript")).toContainText("Ship the checkout first.");

    await history.getByTestId("meeting-more").click();
    await lobby.getByTestId("meeting-rename").click();
    const input = lobby.getByRole("dialog").getByRole("textbox");
    await input.fill("Shop kickoff");
    await lobby.getByTestId("dialog-confirm").click();
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

    await hostCall(page, "meetings.open", { tab: "meetings" });
    const lobby = await meetingsWindow(app);
    await lobby.getByTestId("meeting-start-chat").click();
    await lobby.getByTestId(`meeting-chat-${projectId}`).click();
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

test("Meeting actions: run one in a new chat, mark one done, dismiss one, and restore it (D-407)", async ({
  jigHome,
}) => {
  const drafted = (id: string, title: string, extra: object = {}) => ({
    id,
    title,
    prompt: `${title} for the portal`,
    owner: "Alex",
    mine: true,
    evidence: "09:01 Portal looks good.",
    ...extra,
  });
  // An action queued before D-407 (`queued: true`) still reads as Queued.
  await seed(jigHome, [
    drafted("a1", "Write release notes"),
    drafted("a2", "Email the team"),
    drafted("a3", "Book a demo"),
    drafted("a4", "Old queued task", { queued: true }),
  ]);
  await mkdir(join(jigHome, "shop"));
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    const added = await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
    const projectId = (added as { value: { id: string } }).value.id;
    const actions = async () =>
      (
        (await hostCall(page, "meetings.overview")) as {
          value: {
            records: Array<{
              id: string;
              actions: Array<{ id: string; status?: string; sessionId?: string }>;
            }>;
          };
        }
      ).value.records.find((r) => r.id === NEW)!.actions;

    await hostCall(page, "meetings.open", { tab: "meetings", select: NEW });
    const lobby = await meetingsWindow(app);
    await lobby.getByRole("button", { name: "Review actions", exact: true }).click();
    const review = lobby.getByRole("dialog", { name: "Review meeting actions" });
    const card = (title: string) => review.getByTestId("action-card").filter({ hasText: title });
    // To-do cards show their title in an input; handled ones as text.
    const todo = (title: string) =>
      review
        .getByTestId("action-card")
        .filter({ has: lobby.getByRole("checkbox", { name: `Select ${title}` }) });
    await expect(todo("Old queued task").getByTestId("action-status")).toHaveText("Queued");
    await expect(review.getByRole("tab", { name: "To do · 4" })).toBeVisible();

    // Run in a chat goes to the action's project (without one it asks for one in a submenu, D-425).
    const run = review.getByRole("button", { name: "Run in a chat" }).first();
    await review.getByLabel("Project for Write release notes").selectOption(projectId);
    const box = await review.getByTestId("review-list").boundingBox();
    await run.click();
    await expect(review.getByTestId("review-message")).toContainText(
      "Started “Write release notes” in a new chat",
    );
    await expect(todo("Write release notes").getByTestId("action-status")).toHaveText("Running");
    const started = (await actions()).find((a) => a.id === "a1")!;
    expect(started.status).toBe("running");
    const chats = (await hostCall(page, "sessions.list")) as {
      value: Array<{ id: string; projectId?: string; title: string }>;
    };
    expect(chats.value.find((c) => c.id === started.sessionId)).toMatchObject({ projectId });
    // The running action opens its chat in Jig's main window.
    await review.getByRole("button", { name: "Open the chat" }).click();
    await expect(page.getByTestId("user-message-text").first()).toContainText(
      "Write release notes for the portal",
    );

    // Done and Dismiss move actions to Handled; the list keeps its size.
    await review.getByRole("button", { name: "More for Email the team" }).click();
    await lobby.getByTestId("action-done").click();
    await review.getByRole("button", { name: "More for Book a demo" }).click();
    await lobby.getByTestId("action-dismiss").click();
    await expect(review.getByRole("tab", { name: "To do · 2" })).toBeVisible();
    await expect(todo("Email the team")).toHaveCount(0);
    expect(await review.getByTestId("review-list").boundingBox()).toEqual(box);
    await review.getByRole("tab", { name: "Handled · 2" }).click();
    await expect(card("Email the team").getByTestId("action-status")).toHaveText("Done");
    await expect(card("Book a demo").getByTestId("action-status")).toHaveText("Dismissed");
    expect(await review.getByTestId("review-list").boundingBox()).toEqual(box);
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/action-handled.png",
    });
    expect((await actions()).map((a) => [a.id, a.status])).toEqual([
      ["a1", "running"],
      ["a2", "done"],
      ["a3", "dismissed"],
      ["a4", "queued"],
    ]);

    // Reopen brings a dismissed one back to the to-do list.
    await review.getByRole("button", { name: "Reopen Book a demo" }).click();
    await expect(review.getByRole("tab", { name: "Handled · 1" })).toBeVisible();
    await review.getByRole("tab", { name: "To do · 3" }).click();
    await expect(todo("Book a demo").getByTestId("action-status")).toHaveText("Your action");
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/action-todo.png",
    });
    expect((await actions()).find((a) => a.id === "a3")!.status).toBeUndefined();
  } finally {
    await app.close();
  }
});

/**
 * An `az` for Create card… (D-425): who you are, one person named Alex Demo in contoso, the Web team's
 * Stories board, and a create that logs its arguments next to it and answers card #501.
 */
const CARD_AZ = `
const args = ${AZ_ARGV};
const has = (...words) => words.every((w) => args.includes(w));
const say = (value) => { process.stdout.write(JSON.stringify(value)); process.exit(0); };
const uri = args.includes("--uri") ? args[args.indexOf("--uri") + 1] : "";
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
if (uri.endsWith("/profiles/me")) say({ id: "me-1", displayName: "Sam Example", emailAddress: "sam@contoso.com" });
if (uri.endsWith("/_apis/identities")) say({ value: [
  { providerDisplayName: "Alex Demo", isActive: true, properties: { Mail: { $value: "alex@contoso.com" } } },
]});
if (uri.endsWith("/Web/_apis/work/boards/b-stories")) say({
  columns: [
    { id: "c1", name: "New", columnType: "incoming", itemLimit: 0, stateMappings: { Bug: "New", "User Story": "New" } },
    { id: "c2", name: "Closed", columnType: "outgoing", itemLimit: 0, stateMappings: { Bug: "Closed", "User Story": "Closed" } },
  ],
  fields: { columnField: { referenceName: "WEF_1_Kanban.Column" } },
});
if (uri.endsWith("/teamfieldvalues")) say({ field: { referenceName: "System.AreaPath" }, defaultValue: "Shop\\\\Web", values: [{ value: "Shop\\\\Web", includeChildren: true }] });
if (uri.endsWith("/teamsettings/iterations")) say({ value: [] });
if (uri.endsWith("/teamsettings")) say({ defaultIteration: null });
if (has("boards", "query")) say([]);
if (has("boards", "work-item", "create")) {
  require("node:fs").appendFileSync(require("node:path").join(__dirname, "az-writes.log"), JSON.stringify(args) + "\\n");
  say({ id: 501, fields: { "System.Id": 501, "System.Title": arg("--title"), "System.WorkItemType": arg("--type"), "System.State": "New" } });
}
console.error("ERROR: Please run 'az login' to setup account.");
process.exit(1);
`;

test("Meeting actions: a row's menu makes a board card, queues it with the card, marks done and reopens (D-425)", async ({
  jigHome,
}) => {
  const drafted = (id: string, title: string, extra: object = {}) => ({
    id,
    title,
    prompt: `${title} for the portal`,
    owner: "Alex Demo",
    evidence: "09:01 Portal looks good.",
    at: ["2026-02-10T09:01:00.000Z"],
    ...extra,
  });
  await seed(jigHome, [
    drafted("a1", "Fix the login"),
    drafted("a2", "Update the docs", { owner: "Sam", mine: true }),
  ]);
  // Generated notes (D-424), so the actions show as rows in the notes' Action items.
  const file = join(jigHome, "addon-data", "meetings.json");
  const data = JSON.parse(await readFile(file, "utf8"));
  data.records[1].notesDoc = {
    tldr: "Portal is ready.",
    decisions: [],
    questions: [],
    topics: [],
    participants: ["Alex"],
    generatedAt: "2026-02-10T10:00:00.000Z",
    through: "2026-02-10T09:45:00.000Z",
    provider: "claude",
    model: "sonnet",
  };
  await writeFile(file, JSON.stringify(data));
  await mkdir(join(jigHome, "shop"));
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    const bin = join(jigHome, "fake-bin");
    await writeFile(join(bin, "az-signed-out.cjs"), CARD_AZ);
    await writeFile(join(bin, "az"), `#!/usr/bin/env node\n${CARD_AZ}`);
    const added = await hostCall(page, "projects.add", { path: join(jigHome, "shop") });
    const projectId = (added as { value: { id: string } }).value.id;
    // The project follows the Web team's Stories board in the Boards add-on.
    await hostCall(page, "addons.storageSet", {
      id: "boards",
      key: `@project(${projectId}) boards`,
      value: [
        {
          id: "web-stories",
          name: "Stories",
          org: "contoso",
          project: "Shop",
          team: "Web",
          boardId: "b-stories",
          boardName: "Stories",
        },
      ],
    });

    await hostCall(page, "meetings.open", { tab: "meetings", select: NEW });
    const lobby = await meetingsWindow(app);
    const rows = lobby.getByTestId("notes-action");
    await expect(rows).toHaveCount(2);
    const row = (title: string) => rows.filter({ hasText: title });

    // The whole row opens its menu; Create card… opens a modal with everything filled in.
    await row("Fix the login").click();
    await lobby.getByTestId("action-create-card").click();
    const dialog = lobby.getByTestId("action-card-dialog");
    await expect(dialog.getByLabel("Board")).toHaveValue("web-stories");
    await expect(dialog.getByLabel("Board")).toBeDisabled();
    await expect(dialog.getByLabel("Type")).toHaveValue("User Story");
    await expect(dialog.getByLabel("Assigned to")).toHaveValue("alex@contoso.com");
    await expect(dialog.getByTestId("card-assignee-hint")).toHaveText("Found Alex Demo in Azure DevOps");
    await expect(dialog.getByLabel("Description")).toHaveValue(
      "Fix the login for the portal\n\n“09:01 Portal looks good.”\n\nFrom meeting Portal review, 2026-02-10",
    );
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/card-dialog.png",
    });
    await dialog.getByRole("button", { name: "Create card" }).click();
    await expect(dialog).toBeHidden();
    await expect(row("Fix the login").getByTestId("action-card-link")).toHaveText("#501");
    const created = JSON.parse((await readFile(join(bin, "az-writes.log"), "utf8")).trim()) as string[];
    expect(created[created.indexOf("--type") + 1]).toBe("User Story");
    expect(created[created.indexOf("--title") + 1]).toBe("Fix the login");
    expect(created[created.indexOf("--assigned-to") + 1]).toBe("alex@contoso.com");

    // Queued with its card: the task owns it (the card gave the action its project).
    await row("Fix the login").click();
    await lobby.getByTestId("action-queue").click();
    await expect(row("Fix the login").getByTestId("action-status")).toHaveText("Queued");
    const queue = (await hostCall(page, "addons.storageGet", {
      id: "tasks",
      key: `@project(${projectId}) queue`,
    })) as { value: { tasks: Array<{ prompt: string }> } };
    expect(queue.value.tasks[0]!.prompt).toContain(
      "Board card #501 (board Web · Stories): you own it; move it as you work and resolve it when done.",
    );

    // Mark as done from the menu, then Reopen from the row's hover action; badges stay in one column.
    await row("Update the docs").click();
    await lobby.getByTestId("action-done").click();
    await expect(row("Update the docs").getByTestId("action-status")).toHaveText("Done");
    const right = async (title: string) => {
      const box = await row(title).getByTestId("action-status").boundingBox();
      return box && box.x + box.width;
    };
    expect(await right("Update the docs")).toBe(await right("Fix the login"));
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/action-rows.png",
    });
    await row("Update the docs").hover();
    await row("Update the docs").getByRole("button", { name: "Reopen" }).click();
    await expect(row("Update the docs").getByTestId("action-status")).toHaveText("");

    // With the Boards add-on off, Create card… isn't offered.
    await hostCall(page, "addons.setEnabled", { id: "boards", enabled: false });
    await expect
      .poll(
        async () =>
          ((await hostCall(page, "meetings.overview")) as { value: { boards: boolean } }).value.boards,
      )
      .toBe(false);
    await row("Update the docs").click();
    await expect(lobby.getByTestId("action-done")).toBeVisible();
    await expect(lobby.getByTestId("action-create-card")).toHaveCount(0);
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
    await hostCall(page, "meetings.open", { tab: "meetings" });
    const lobby = await meetingsWindow(app);
    const history = lobby.getByTestId("meeting-history");
    // The two occurrences share a Teams meeting thread: one series folder, opened on the newest.
    const series = history.getByTestId("meeting-folder").filter({ hasText: "Shop daily" });
    await expect(series.getByTestId("meeting-row")).toHaveCount(2);
    await expect(history.getByTestId("meeting-no-folder")).toBeVisible();

    await history.getByTestId("meeting-new-folder").click();
    await lobby.getByRole("dialog").getByRole("textbox").fill("Customers");
    await lobby.getByTestId("dialog-confirm").click();
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

test("Meeting notes: written silently with a spinner and Cancel, structured, stale hint, failure with Retry (D-424)", async ({
  jigHome,
}) => {
  const at = (s: string) => `2026-02-10T09:${s}.000Z`;
  const line = (id: string, speaker: string, time: string, text: string) => ({
    id,
    speakerId: speaker,
    speaker,
    timestamp: at(time),
    text,
    final: true,
  });
  const record = (id: string, title: string, captions: unknown[]) => ({
    id,
    title,
    joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
    startedAt: at("00:00"),
    endedAt: at("30:00"),
    status: "ended",
    capture: "Captions",
    captions,
    gaps: [],
    notes: "",
    actions: [],
  });
  await mkdir(join(jigHome, "addon-data"), { recursive: true });
  await writeFile(
    join(jigHome, "addon-data", "meetings.json"),
    JSON.stringify({
      records: [
        // The fake engine holds notes whose transcript says "hold until released" (D-424).
        record(NEW, "Portal review", [
          line("n1", "Alex", "01:05", "Review the API before the release, hold until released."),
          line("n2", "Sam", "12:30", "I'll update the service documentation."),
          line("n3", "Sam", "28:00", "The release date may slip."),
        ]),
        record(OLD, "Shop planning", [line("o1", "Alex", "01:00", "Please fail the notes.")]),
      ],
    }),
  );
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    await hostCall(page, "meetings.open", { tab: "meetings", select: "5e6f7a8b" });
    const lobby = await meetingsWindow(app);
    const detail = lobby.getByTestId("meeting-detail");
    const notes = detail.getByRole("region", { name: "Notes" });
    const generate = notes.getByRole("button", { name: "Generate notes", exact: true });
    const writing = notes.getByTestId("meeting-notes-writing");
    const footer = notes.getByTestId("meeting-notes-footer");
    // Opt-in screenshots of each state, in Jig Dark and Jig Light, at a few window widths.
    const shoot = async (state: string) => {
      if (!process.env.JIG_SCREENSHOTS) return;
      for (const themeId of ["jig-dark", "jig-light"]) {
        await hostCall(page, "config.update", { appearance: { themeId } });
        for (const width of [720, 1100, 1500]) {
          await lobby.setViewportSize({ width, height: 760 });
          await lobby.waitForTimeout(150);
          await notes.screenshot({
            animations: "disabled",
            path: `.tmp/shots/meeting-notes-${state}-${themeId}-${width}.png`,
          });
        }
      }
      await hostCall(page, "config.update", { appearance: { themeId: "jig-dark" } });
    };
    await expect(notes).toContainText("No notes yet");
    await shoot("empty");
    const box = await notes.boundingBox();

    // First notes: a spinner in the notes' own space, with Cancel; no chat opens.
    await generate.click();
    await expect(writing).toBeVisible();
    await expect(generate).toBeDisabled();
    expect(await notes.boundingBox()).toEqual(box);
    await shoot("spinner");
    await writing.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(writing).toHaveCount(0);
    await expect(notes).toContainText("No notes yet");
    expect(await hostCall(page, "fake.release")).toMatchObject({ value: 0 });

    // Again, and let it finish: Jig renders the structured notes.
    await generate.click();
    await expect(writing).toBeVisible();
    await expect
      .poll(async () => (await hostCall(page, "fake.release")) as { value: number })
      .toMatchObject({
        value: 1,
      });
    const doc = notes.getByTestId("meeting-notes-doc");
    await expect(doc).toContainText("scripted notes");
    await expect(doc).toContainText("Decided by Alex");
    await expect(doc).toContainText("Review the Shop API");
    await expect(doc).toContainText("You · due Friday");
    await expect(doc).toContainText("Risk · raised by Sam");
    await expect(doc).toContainText("Participants");
    await expect(doc).toContainText("Alex, Sam");
    // 30 minutes: the discussion by topic is there.
    await expect(doc).toContainText("Who reviews it");
    await expect(footer).toContainText("AI-generated by Claude Sonnet · from transcript up to");
    await expect(footer).toContainText("check important details");
    expect(await notes.boundingBox()).toEqual(box);
    await shoot("notes");
    const saved = (await hostCall(page, "meetings.overview")) as {
      value: {
        records: Array<{ id: string; notes: string; actions: Array<{ at?: string[]; projectId?: string }> }>;
      };
    };
    const portal = saved.value.records.find((r) => r.id === NEW)!;
    expect(portal.notes).toContain("**TL;DR**");
    expect(portal.actions).toHaveLength(2);
    // A citation that matches no caption is dropped; so is a project that doesn't exist.
    expect(portal.actions[1]!.at).toEqual([at("28:00")]);
    expect(portal.actions[1]!.projectId).toBeUndefined();

    // A timestamp shows that caption in the transcript.
    // (The decision and the first action cite 09:01:05, the second action 09:28:00.)
    await doc.getByTitle("Show in the transcript").nth(2).click();
    await expect(detail.getByTestId("meeting-transcript")).toBeVisible();
    await expect(detail.locator(`[data-at="${at("28:00")}"]`)).toHaveClass(/bg-accent-soft/);
    await detail.getByTestId("meeting-transcript-toggle").click();
    await expect(detail.getByTestId("meeting-transcript")).toHaveCount(0);

    // Regenerating keeps the old notes dimmed under the spinner, then replaces them.
    await generate.click();
    await expect(writing).toBeVisible();
    await expect(doc).toBeVisible();
    await shoot("regenerating");
    await expect
      .poll(async () => (await hostCall(page, "fake.release")) as { value: number })
      .toMatchObject({
        value: 1,
      });
    await expect(writing).toHaveCount(0);
    const again = (await hostCall(page, "meetings.overview")) as typeof saved;
    expect(again.value.records.find((r) => r.id === NEW)!.actions).toHaveLength(2);

    // A failure shows in the same place, with Retry.
    await lobby.getByTestId("meeting-row").nth(1).click();
    await expect(detail).toContainText("Shop planning");
    await generate.click();
    const failed = notes.getByTestId("meeting-notes-failed");
    await expect(failed).toContainText("Couldn't write the notes");
    await expect(failed).toContainText("The scripted notes failed");
    await expect(failed.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await shoot("error");
    await failed.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(failed).toHaveCount(0);
    await expect(notes).toContainText("No notes yet");
  } finally {
    await app.close();
  }
});

test("Meetings window: three tabs, the last one is remembered, and a link opens a meeting on its tab", async ({
  jigHome,
}) => {
  await seed(jigHome);
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("[data-testid=app-root]");
    // A meeting chip in a chat opens the window on Meetings with that meeting selected.
    await hostCall(page, "meetings.open", { tab: "meetings", select: "1a2b3c4d" });
    const lobby = await meetingsWindow(app);
    await expect(tab(lobby, "Meetings")).toHaveAttribute("aria-current", "page");
    await expect(lobby.getByTestId("meeting-detail")).toContainText("Shop planning");
    await expect(lobby.getByTestId("meeting-row").first()).toContainText("Portal review");
    // The window is open: asking again moves it, without a second window.
    await hostCall(page, "meetings.open", { tab: "calendar" });
    await expect(tab(lobby, "Calendar")).toHaveAttribute("aria-current", "page");
    await expect(lobby.getByTestId("meeting-history")).toHaveCount(0);
    await hostCall(page, "meetings.open", { select: "5e6f7a8b" });
    await expect(tab(lobby, "Meetings")).toHaveAttribute("aria-current", "page");
    await expect(lobby.getByTestId("meeting-detail")).toContainText("Portal is ready.");
    await tab(lobby, "Chats").click();
    await expect(tab(lobby, "Chats")).toHaveAttribute("aria-current", "page");
    // Closed and opened again, it opens on the tab you left it on.
    await lobby.close();
    await page.getByTestId("topbar-meetings").click();
    const again = await meetingsWindow(app);
    await expect(tab(again, "Chats")).toHaveAttribute("aria-current", "page");
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
