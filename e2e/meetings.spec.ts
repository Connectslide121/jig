import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import type { MeetingOverview } from "../apps/desktop/src/shared/meetings";
import { expect, hostCall, launchJig, test } from "./fixtures";

/**
 * The two Meetings windows (D-292): the lobby `meetings.open` opens, and the call window waiting hidden
 * beside it (joining, calls and the live meeting happen there).
 */
async function meetingWindows(app: ElectronApplication): Promise<{ lobby: Page; room: Page }> {
  const find = (param: string) => app.windows().find((w) => w.url().includes(`${param}=1`));
  await expect
    .poll(() => Boolean(find("meetingLobby") && find("meetingRoom")), { timeout: 30_000 })
    .toBe(true);
  const lobby = find("meetingLobby")!;
  const room = find("meetingRoom")!;
  for (const page of [lobby, room]) await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(lobby.getByTestId("meeting-lobby")).toBeVisible();
  await expect(room.getByTestId("meeting-room")).toBeAttached();
  return { lobby, room };
}

test("Meetings: device setup failure is visible and retryable before joining", async ({ jigHome }) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    await hostCall(main, "meetings.open");
    const { lobby, room } = await meetingWindows(app);
    // Only the call window runs on the loopback page the calling SDK needs; the lobby is a Jig page.
    expect(new URL(room.url()).hostname).toBe("localhost");
    expect(new URL(lobby.url()).hostname).not.toBe("localhost");
    // Exercise real SDK failure handling without giving a test access to physical devices.
    await app.evaluate(({ session }) => {
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    });
    await room.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Test denied device access", "NotAllowedError");
      };
    });
    // Join in the lobby opens the device check in the call window.
    await lobby.getByRole("button", { name: "Join from link…", exact: true }).first().click();
    const prejoin = room.getByRole("dialog", { name: "Join Teams meeting" });
    await expect(prejoin.getByRole("alert")).not.toBeEmpty({ timeout: 30_000 });
    await expect(prejoin.getByRole("alert")).toContainText("Microphone access was denied");
    await expect(prejoin.getByTestId("loading")).toHaveCount(0);
    const geometry = await prejoin.boundingBox();
    await prejoin.getByRole("button", { name: "Retry devices", exact: true }).click();
    await expect(prejoin.getByRole("alert")).not.toBeEmpty();
    expect(await prejoin.boundingBox()).toEqual(geometry);
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/device-error.png",
    });
  } finally {
    await app.close();
  }
});

test("Meetings: global live capture, project questions, notes and reviewed tasks", async ({ jigHome }) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    for (const name of ["shop", "portal"]) {
      const path = join(jigHome, name);
      await mkdir(path);
      expect((await hostCall(main, "projects.add", { path })).ok).toBe(true);
    }
    const projectResponse = await hostCall(main, "projects.list");
    if (!projectResponse.ok) throw new Error("Missing projects");
    const projects = projectResponse.value as { projects: Array<{ id: string; name: string }> };
    const [first, second] = projects.projects;
    await main.getByTestId("goto-button").click();
    await main.getByTestId("goto-input").fill("Meetings");
    await main.keyboard.press("Enter");
    const { lobby, room } = await meetingWindows(app);
    await hostCall(lobby, "meetings.configure", {
      tenantId: "22222222-2222-4222-8222-222222222222",
      clientId: "11111111-1111-4111-8111-111111111111",
      endpoint: "https://example.europe.communication.azure.com",
    });
    await lobby.getByRole("button", { name: "Connection", exact: true }).click();
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/connection.png",
    });
    await lobby
      .getByRole("dialog", { name: "Microsoft meeting connection" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    // Credentials and caption injection cannot be requested by another Jig window.
    // Not even by the lobby (D-292): only the call window gets the calling credential.
    for (const page of [main, lobby])
      expect((await hostCall(page, "meetings.credential", {})).ok).toBe(false);
    await lobby.getByRole("button", { name: "Refresh calendar" }).click();
    await expect(lobby.getByText("Weekly products", { exact: true })).toBeVisible();
    await lobby.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/agenda.png" });
    await lobby.getByRole("button", { name: "Week", exact: true }).click();
    await lobby.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/week.png" });
    await lobby.getByRole("button", { name: "Agenda", exact: true }).click();
    // Joining by link needs no acknowledgement and keeps host errors inside the modal.
    await lobby.getByRole("button", { name: "Join from link…", exact: true }).click();
    const linkJoin = room.getByRole("dialog", { name: "Join Teams meeting" });
    await linkJoin.getByLabel("Teams join link").fill("https://example.com/not-a-meeting");
    await expect(linkJoin.getByRole("checkbox")).toHaveCount(0);
    await expect(linkJoin.getByRole("button", { name: "Join meeting", exact: true })).toBeEnabled();
    const beforeError = await linkJoin.boundingBox();
    await linkJoin.getByRole("button", { name: "Join meeting", exact: true }).click();
    await expect(linkJoin.getByRole("alert")).not.toBeEmpty();
    expect(await linkJoin.boundingBox()).toEqual(beforeError);
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/join-error.png",
    });
    await linkJoin.getByRole("button", { name: "Cancel", exact: true }).click();
    await lobby.getByRole("button", { name: "Join Weekly products", exact: true }).click();
    const prejoin = room.getByRole("dialog", { name: "Join Teams meeting" });
    await prejoin.getByLabel("Speech language").selectOption("sv-se");
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/prejoin.png" });
    await prejoin.getByRole("button", { name: "Join meeting", exact: true }).click();
    const overview = async (): Promise<MeetingOverview> => {
      const result = await hostCall(room, "meetings.overview");
      if (!result.ok) throw new Error("Missing meeting");
      return result.value as MeetingOverview;
    };
    const transcript = room.getByTestId("meeting-transcript");
    await expect(transcript).toContainText("We should review the Shop API");
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/live.png" });
    // The meeting's Teams chat (D-270): on the left, readable and writable; kept with the meeting.
    const chat = room.getByRole("region", { name: "Chat" });
    await expect(chat.getByTestId("meeting-chat")).toContainText("Here's the Shop API spec");
    await chat.getByTestId("meeting-chat-input").fill("I'll review it today");
    await chat.getByTestId("meeting-chat-send").click();
    await expect(chat.getByTestId("meeting-chat")).toContainText("I'll review it today");
    await expect(chat.getByTestId("meeting-chat-input")).toHaveValue("");
    await expect.poll(async () => (await overview()).records[0]!.chat?.length).toBe(3);
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/chat.png" });
    // The lobby stays usable beside the live meeting (D-292): it says what is live, and joining
    // another meeting first offers to show the one you're in.
    const liveCall = lobby.getByTestId("lobby-live-call");
    await expect(liveCall).toContainText("Weekly products");
    await lobby.getByRole("button", { name: "Week", exact: true }).click();
    await lobby.getByRole("button", { name: "Agenda", exact: true }).click();
    await lobby.getByRole("button", { name: "Join Weekly products", exact: true }).click();
    const inMeeting = lobby.getByRole("dialog", { name: "You're in a meeting" });
    await expect(inMeeting).toBeVisible();
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/lobby-during-call.png",
    });
    await inMeeting.getByRole("button", { name: "Cancel", exact: true }).click();
    await lobby.getByRole("button", { name: "Connection", exact: true }).click();
    await lobby
      .getByRole("dialog", { name: "Microsoft meeting connection" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    expect((await overview()).activeId).toBeTruthy();
    // Panels move between slots from their menus, and the room remembers where they are.
    await room.getByRole("button", { name: "Notes options", exact: true }).click();
    await room.getByRole("menuitem", { name: "Left" }).click();
    await expect.poll(async () => (await overview()).layout?.panels.notes.slot).toBe("left");
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/live-layout.png",
    });
    // Everyone has a tile; People opens beside the call; a presenter's screen gets the space, tiles stay.
    await expect(room.getByRole("group", { name: "Sam" })).toBeVisible();
    await room.getByRole("button", { name: "Show people", exact: true }).click();
    await expect(room.getByRole("region", { name: "People" })).toContainText("Alex");
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/people.png" });
    await expect(room.getByText("Sam is presenting")).toBeVisible({ timeout: 15_000 });
    await expect(room.getByRole("group", { name: "Alex" })).toBeVisible();
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/presenting.png",
    });
    const before = await overview();
    const id = before.activeId!;
    const geometry = await transcript.boundingBox();
    await hostCall(main, "projects.setActive", { id: first!.id });
    await room.getByRole("button", { name: "Ask Claude", exact: true }).click();
    const ask = room.getByRole("dialog", { name: "Ask Claude about this meeting" });
    await expect(ask).toContainText(first!.name);
    await ask.getByLabel("Question", { exact: true }).fill("Would this work in the current repository?");
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/ask-claude.png",
    });
    await ask.getByRole("button", { name: "Ask in chat" }).click();
    await expect(ask).not.toBeVisible();
    expect(await transcript.boundingBox()).toEqual(geometry);
    await hostCall(main, "projects.setActive", { id: second!.id });
    await expect
      .poll(async () => (await overview()).records[0]!.captions.length)
      .toBeGreaterThan(before.records[0]!.captions.length);
    expect((await overview()).activeId).toBe(id);
    expect((await overview()).records[0]).not.toHaveProperty("projectId");
    // Revisions keep a single stable caption entry and reject late partials.
    const timestamp = new Date().toISOString();
    const caption = {
      id: "revision",
      speakerId: "alex",
      speaker: "Alex",
      timestamp,
      text: "Ship Tuesday",
      final: false,
    };
    await hostCall(room, "meetings.caption", { id, caption });
    await hostCall(room, "meetings.caption", {
      id,
      caption: { ...caption, text: "Ship Thursday", final: true },
    });
    await hostCall(room, "meetings.caption", { id, caption });
    expect((await overview()).records[0]!.captions.filter((c) => c.id === "revision")).toEqual([
      { ...caption, text: "Ship Thursday", final: true },
    ]);
    await room.getByRole("button", { name: "Share screen", exact: true }).click();
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/share-screen.png",
    });
    await room
      .getByRole("dialog", { name: "Share a screen or window" })
      .getByRole("button", { name: "Screen 1", exact: true })
      .click();
    await expect(room.getByRole("button", { name: "Stop sharing", exact: true })).toBeVisible();
    await room.getByRole("button", { name: "Stop sharing", exact: true }).click();
    await room.getByRole("button", { name: "Leave", exact: true }).click();
    await expect.poll(async () => (await overview()).activeId).toBeUndefined();
    // The call is over: the lobby shows the meeting's review, and says there is no call.
    await expect(liveCall).toHaveCount(0);
    await expect(lobby.getByRole("heading", { name: "Weekly products" })).toBeVisible();
    await lobby.getByRole("button", { name: "Generate notes", exact: true }).click();
    await expect.poll(async () => (await overview()).records[0]!.actions.length, { timeout: 30_000 }).toBe(2);
    await expect(lobby.getByRole("button", { name: "Review actions", exact: true })).toBeEnabled();
    await lobby.getByRole("button", { name: "Review actions", exact: true }).click();
    const review = lobby.getByRole("dialog", { name: "Review meeting actions" });
    await expect(review).toContainText("Your action");
    await review.getByRole("checkbox", { name: "Select Review the Shop API" }).check();
    await review.getByRole("checkbox", { name: "Select Update documentation" }).check();
    await review.getByLabel("Project for Review the Shop API").selectOption(first!.id);
    await review.getByLabel("Project for Update documentation").selectOption(second!.id);
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/action-review.png",
    });
    await review.getByRole("button", { name: "Add selected to queue", exact: true }).click();
    await expect(review).not.toBeVisible();
    // One queue per project: each task went to its own project's queue.
    for (const project of [first!, second!]) {
      const queue = await hostCall(main, "addons.call", {
        id: "tasks",
        method: "list",
        args: { projectId: project.id },
      });
      expect(queue.ok).toBe(true);
      if (queue.ok) {
        const value = queue.value as {
          running: boolean;
          tasks: Array<{ projectId: string; prompt: string; status: string }>;
        };
        expect(value.running).toBe(false);
        expect(value.tasks.map((t) => t.projectId)).toEqual([project.id]);
        expect(value.tasks.every((t) => t.status === "queued" && t.prompt.includes(id))).toBe(true);
      }
    }
    const saved = JSON.parse(await readFile(join(jigHome, "addon-data", "meetings.json"), "utf8")) as {
      records: Array<{ captions: unknown[]; status: string }>;
    };
    expect(saved.records[0]!.status).toBe("ended");
    expect(saved.records[0]!.captions.length).toBeGreaterThan(0);
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/meetings.png",
    });
    // Deleting asks first, then removes the meeting and returns to the lobby.
    await lobby.getByRole("button", { name: "Meeting options", exact: true }).click();
    await lobby.getByRole("menuitem", { name: "Delete meeting…" }).click();
    const confirm = lobby.getByRole("dialog", { name: /Delete "Weekly products"/ });
    await lobby.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/delete.png" });
    await confirm.getByRole("button", { name: "Delete meeting", exact: true }).click();
    await expect.poll(async () => (await overview()).records.length).toBe(0);
    await expect(lobby.getByText("No meetings yet")).toBeVisible();
  } finally {
    await app.close();
  }
});

test("Meetings: call someone, hang up, and answer a call that rings in Jig", async ({ jigHome }) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    await hostCall(main, "meetings.open");
    const { lobby, room } = await meetingWindows(app);
    await expect(lobby).toHaveTitle("Jig Meetings");
    await expect(room).toHaveTitle("Jig Call");

    // Calling: the people you work with, a search, and a whole row places the call in the call window.
    await lobby.getByRole("button", { name: "Call…", exact: true }).click();
    const dialog = lobby.getByTestId("call-dialog");
    await expect(dialog.getByTestId("call-person")).toHaveCount(3);
    await dialog.getByPlaceholder("Search people by name or e-mail").fill("alex");
    await expect(dialog.getByTestId("call-person")).toHaveCount(1);
    await lobby.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/call.png" });
    await dialog.getByTestId("call-person").click();
    await expect(room.getByRole("heading", { name: "Call with Alex Contoso" })).toBeVisible();
    await expect(room).toHaveTitle("Call with Alex Contoso · Jig Meetings");
    await expect(lobby.getByTestId("lobby-live-call")).toContainText("Call with Alex Contoso");
    await room.getByRole("button", { name: "Hang up", exact: true }).click();
    // Hung up: the lobby shows the call's review.
    await expect(lobby.getByRole("button", { name: "Call back", exact: true })).toBeVisible();
    await lobby.getByRole("button", { name: "Back to meetings" }).click();

    // A call rings: answer it; the call is kept like a meeting, and the last caller is a recent call.
    await room.evaluate(() =>
      (window as { jigTestRing?: (name: string) => void }).jigTestRing?.("Sam Fabrikam"),
    );
    const incoming = room.getByTestId("incoming-call");
    await expect(incoming).toContainText("Sam Fabrikam");
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/incoming.png",
    });
    await incoming.getByRole("button", { name: "Answer", exact: true }).click();
    await expect(room.getByRole("heading", { name: "Call with Sam Fabrikam" })).toBeVisible();
    await room.getByRole("button", { name: "Hang up", exact: true }).click();
    await expect(lobby.getByRole("button", { name: "Call back", exact: true })).toBeVisible();
    await lobby.getByRole("button", { name: "Back to meetings" }).click();
    await lobby.getByRole("button", { name: "Call…", exact: true }).click();
    await expect(dialog).toContainText("Recent calls");
    await expect(dialog.getByTestId("call-person").first()).toContainText("Sam Fabrikam");

    // Declining stops the ringing.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await room.evaluate(() =>
      (window as { jigTestRing?: (name: string) => void }).jigTestRing?.("Robin Shop"),
    );
    await incoming.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(incoming).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("Meetings: live captions in another language, with what was said under them", async ({ jigHome }) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    await hostCall(main, "meetings.open");
    const { lobby, room } = await meetingWindows(app);
    await lobby.getByRole("button", { name: "Join from link…", exact: true }).click();
    const prejoin = room.getByRole("dialog", { name: "Join Teams meeting" });
    await prejoin.getByLabel("Teams join link").fill("https://teams.microsoft.com/l/meetup-join/test");
    await prejoin.getByRole("button", { name: "Join meeting", exact: true }).click();
    const transcript = room.getByTestId("meeting-transcript");
    await expect(transcript).toContainText("We should review the Shop API");
    await room.getByTestId("caption-language").selectOption("sv-se");
    await expect(transcript).toContainText("[sv-se] ", { timeout: 15_000 });
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/translated.png",
    });
    // The choice is remembered for the next meeting.
    const overview = (await hostCall(room, "meetings.overview")) as { value: MeetingOverview };
    expect(overview.value.captionLanguage).toBe("sv-se");
    // A language Teams doesn't offer: Claude translates the finished captions (D-277), labelled as AI.
    await room.getByTestId("caption-language").selectOption("fr-fr");
    await expect(transcript).toContainText("[fr-fr] ", { timeout: 15_000 });
    await expect(room.getByText(/AI translation, may be inaccurate/)).toBeVisible();
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/translated-ai.png",
    });
    // Leave, so Jig closes without asking about the running meeting.
    await room.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(room.getByRole("button", { name: "Leave", exact: true })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("Meetings: Teams chats in the lobby, and Chat with someone from Call…", async ({ jigHome }) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    await hostCall(main, "meetings.open");
    const { lobby } = await meetingWindows(app);
    // Only the Meetings windows read your chats (D-296).
    expect((await hostCall(main, "meetings.chats")).ok).toBe(false);

    // Your chats, newest first: name, last message, time, and the unread mark.
    await lobby.getByRole("button", { name: "Chats", exact: true }).click();
    const rows = lobby.getByTestId("teams-chat");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("Alex Contoso");
    await expect(rows.first()).toContainText("Almost: can you look at the error codes?");
    await expect(rows.first()).toContainText("Unread");
    await expect(rows.nth(1)).toContainText("Portal planning");
    await expect(rows.nth(1)).toContainText("Sam Fabrikam: I added the sign-in flow to it.");
    await lobby.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/chats.png" });

    // The whole row opens the chat; writing in it updates the list, and opening it counts as read.
    await rows.first().click();
    const chat = lobby.getByRole("region", { name: "Chat" });
    await expect(chat.getByTestId("meeting-chat")).toContainText("Is the Shop API spec ready?");
    await chat.getByTestId("meeting-chat-input").fill("On it");
    await chat.getByTestId("meeting-chat-send").click();
    await expect(chat.getByTestId("meeting-chat")).toContainText("On it");
    await expect(rows.first()).toContainText("You: On it");
    await expect(rows.first()).not.toContainText("Unread");
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/chat-open.png",
    });

    // Call… has a Chat action per person: it opens your one-to-one chat with them.
    await lobby.getByRole("button", { name: "Meetings", exact: true }).click();
    await lobby.getByRole("button", { name: "Call…", exact: true }).click();
    const dialog = lobby.getByTestId("call-dialog");
    await dialog.getByPlaceholder("Search people by name or e-mail").fill("sam");
    await dialog.getByRole("button", { name: "Chat with Sam Fabrikam", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(chat.getByTestId("meeting-chat")).toContainText("Thanks for the review!");

    // Nobody to chat with yet: Jig can't start a chat, so it offers Teams instead.
    await lobby.getByRole("button", { name: "Call…", exact: true }).click();
    await dialog.getByPlaceholder("Search people by name or e-mail").fill("robin");
    await dialog.getByRole("button", { name: "Chat with Robin Shop", exact: true }).click();
    await expect(dialog.getByTestId("call-status")).toContainText("no Teams chat yet");
    await expect(dialog.getByRole("button", { name: "Open in Teams", exact: true })).toBeVisible();
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/chat-none.png",
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  } finally {
    await app.close();
  }
});
