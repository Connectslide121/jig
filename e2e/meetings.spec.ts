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

/** After a call, a fresh call window replaces the one that ran it (D-368): the new one, once loaded. */
async function renewedRoom(app: ElectronApplication, used: Page): Promise<Page> {
  const fresh = () => app.windows().find((w) => w !== used && w.url().includes("meetingRoom=1"));
  await expect.poll(() => Boolean(fresh()) && used.isClosed(), { timeout: 30_000 }).toBe(true);
  const room = fresh()!;
  await room.emulateMedia({ reducedMotion: "reduce" });
  await expect(room.getByTestId("meeting-room")).toBeAttached();
  return room;
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
  // One walk through the whole meetings flow: about a minute alone, longer beside the parallel suite.
  test.setTimeout(120_000);
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
      const result = await hostCall(lobby, "meetings.overview");
      if (!result.ok) throw new Error("Missing meeting");
      return result.value as MeetingOverview;
    };
    const transcript = room.getByTestId("meeting-transcript");
    await expect(transcript).toContainText("We should review the Shop API");
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/live.png" });
    // The meeting's Teams chat (D-270): on the left, readable and writable; kept with the meeting.
    const chat = room.getByRole("region", { name: "Chat" });
    await expect(chat.getByTestId("meeting-chat")).toContainText("Here's the Shop API spec");
    // Pictures and files in it (D-328): the picture in its box, opened larger; the file by name.
    const picture = chat.getByRole("button", { name: "Open picture" });
    await expect(picture).toBeVisible();
    await expect(chat.getByTestId("chat-file")).toContainText("Shop spec.docx");
    await picture.click();
    await expect(room.getByTestId("chat-image-viewer")).toBeVisible();
    // Big enough to look at: the whole window but the dialog's margin.
    const viewer = await room.getByTestId("chat-image-viewer").boundingBox();
    const windowSize = await room.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    expect(viewer!.height).toBeGreaterThan(windowSize.h - 60);
    expect(viewer!.width).toBeGreaterThan(windowSize.w - 60);
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/picture.png" });
    await room.keyboard.press("Escape");
    await expect(room.getByTestId("chat-image-viewer")).toHaveCount(0);
    await chat.getByTestId("meeting-chat-input").fill("I'll review it today");
    await chat.getByTestId("meeting-chat-send").click();
    await expect(chat.getByTestId("meeting-chat")).toContainText("I'll review it today");
    await expect(chat.getByTestId("meeting-chat-input")).toHaveValue("");
    await expect.poll(async () => (await overview()).records[0]!.chat?.length).toBe(7);
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
    await room.getByRole("button", { name: "Ask Jig", exact: true }).click();
    const ask = room.getByRole("dialog", { name: "Ask Jig about this meeting" });
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
    // The live transcript follows the newest caption; scrolled up, it stays put and offers Latest.
    const say = (n: number) =>
      hostCall(room, "meetings.caption", {
        id,
        caption: {
          id: `follow-${n}`,
          speakerId: n % 2 ? "alex" : "sam",
          speaker: n % 2 ? "Alex" : "Sam",
          timestamp: new Date().toISOString(),
          text: `Line ${n} about the Shop backlog and what ships next`,
          final: true,
        },
      });
    for (let n = 0; n < 30; n++) await say(n);
    const fromBottom = () => transcript.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
    await expect(transcript).toContainText("Line 29 about");
    await expect.poll(fromBottom).toBeLessThan(2);
    const latest = room.getByTestId("meeting-transcript-latest");
    await expect(latest).toHaveCount(0);
    await transcript.hover();
    await room.mouse.wheel(0, -600);
    await expect(latest).toBeVisible();
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/transcript-latest.png",
    });
    const top = await transcript.evaluate((el) => el.scrollTop);
    await say(30);
    await expect(transcript).toContainText("Line 30 about");
    expect(await transcript.evaluate((el) => el.scrollTop)).toBe(top);
    await latest.click();
    await expect.poll(fromBottom).toBeLessThan(2);
    await expect(latest).toHaveCount(0);
    await say(31);
    await expect(transcript).toContainText("Line 31 about");
    await expect.poll(fromBottom).toBeLessThan(2);
    await room.getByRole("button", { name: "Share screen", exact: true }).click();
    // No supported way to send the computer's sound: the dialog says so instead of a dead switch (D-324).
    await expect(room.getByRole("dialog", { name: "Share a screen or window" })).toContainText(
      "Sound isn't shared, only the picture",
    );
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
    // The call is over: the Meetings tab shows that meeting, and the window says there is no call.
    await expect(liveCall).toHaveCount(0);
    await expect(lobby.getByRole("heading", { name: "Meetings" })).toBeVisible();
    await expect(lobby.getByTestId("meeting-detail")).toContainText("Weekly products");
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
    // Deleting asks first, then removes the meeting from the list.
    await lobby.getByTestId("meeting-more").click();
    await lobby.getByRole("menuitem", { name: "Delete…" }).click();
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
    const { lobby, room: first } = await meetingWindows(app);
    let room = first;
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
    // Hung up: the Meetings tab shows the call (Call back is in its ⋯ menu), and a fresh call window
    // replaces the used one.
    await expect(lobby.getByTestId("meeting-detail")).toContainText("Call with Alex Contoso");
    await lobby.getByTestId("meeting-more").click();
    await expect(lobby.getByRole("menuitem", { name: "Call back", exact: true })).toBeVisible();
    await lobby.keyboard.press("Escape");
    room = await renewedRoom(app, room);

    // A call rings in the fresh window: answer it; the call is kept like a meeting, and the last
    // caller is a recent call.
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
    await expect(lobby.getByTestId("meeting-detail")).toContainText("Call with Sam Fabrikam");
    await lobby.getByTestId("meeting-more").click();
    await expect(lobby.getByRole("menuitem", { name: "Call back", exact: true })).toBeVisible();
    await lobby.keyboard.press("Escape");
    room = await renewedRoom(app, room);
    const ringing = room.getByTestId("incoming-call");
    await lobby.getByRole("button", { name: "Call…", exact: true }).click();
    await expect(dialog).toContainText("Recent calls");
    await expect(dialog.getByTestId("call-person").first()).toContainText("Sam Fabrikam");

    // Declining stops the ringing.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await room.evaluate(() =>
      (window as { jigTestRing?: (name: string) => void }).jigTestRing?.("Robin Shop"),
    );
    await ringing.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(ringing).toHaveCount(0);
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

test("Meetings: without Teams captions, the call is transcribed on this computer (D-321)", async ({
  jigHome,
}) => {
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

    // Teams refuses captions: the real reason and the one-line notice show, lines come marked Local.
    await room.evaluate(() =>
      (window as { jigTestCaptionsUnavailable?: () => void }).jigTestCaptionsUnavailable?.(),
    );
    await expect(transcript).toContainText("disabled in meeting policy. (403/45203)");
    await expect(transcript).toContainText("Teams captions unavailable — transcribing on this computer");
    await expect(transcript.getByText("Local", { exact: true }).first()).toBeVisible();
    await expect(transcript).toContainText("You");
    await expect(room.getByRole("status")).toContainText("Transcribing locally");
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/local-transcript.png",
    });

    // Turned off from the transcript's ⋯ menu: the setting follows, and the status says captions are missing.
    await room.getByRole("button", { name: "Transcript options", exact: true }).click();
    await room.getByRole("menuitem", { name: /Transcribe on this computer/ }).click();
    await expect(room.getByRole("status")).toContainText("Captions unavailable");
    const config = (await hostCall(room, "config.get")) as {
      value: { meetings: { localTranscription: boolean } };
    };
    expect(config.value.meetings.localTranscription).toBe(false);

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
    await lobby
      .getByRole("navigation", { name: "Sections" })
      .getByRole("button", { name: "Chats", exact: true })
      .click();
    const rows = lobby.getByTestId("teams-chat");
    await expect(rows).toHaveCount(10);
    // Each person's Teams status on their picture (D-329); a group chat has none.
    await expect(rows.first().getByRole("img", { name: "Alex Contoso: Available" })).toBeVisible();
    await expect(rows.nth(1).getByTestId("presence")).toHaveCount(0);
    await expect(rows.nth(2).getByRole("img", { name: "Sam Fabrikam: Away" })).toBeVisible();
    await expect(rows.nth(3).getByRole("img", { name: "Taylor Contoso: Busy, in a meeting" })).toBeVisible();
    await expect(rows.nth(4).getByRole("img", { name: "Kim Fabrikam: Do not disturb" })).toBeVisible();
    await expect(
      rows.filter({ hasText: "Morgan Shop" }).getByRole("img", { name: "Morgan Shop: Offline" }),
    ).toBeVisible();
    await expect(rows.first()).toContainText("Alex Contoso");
    await expect(rows.first()).toContainText("Almost: can you look at the error codes?");
    await expect(rows.first()).toContainText("Unread");
    await expect(rows.nth(1)).toContainText("Portal planning");
    await expect(rows.nth(1)).toContainText("Sam Fabrikam: I added the sign-in flow to it.");
    await lobby.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/chats.png" });
    // Your chat with yourself, which Graph's chat list leaves out: your name, picture and status.
    const own = rows.filter({ hasText: "Riley Contoso (You)" });
    await expect(own).toContainText("You: Send the Contoso quote on Friday.");
    await expect(own.getByRole("img", { name: "Riley Contoso (You): Available" })).toBeVisible();

    // The whole row opens the chat; writing in it updates the list, and opening it counts as read.
    await rows.first().click();
    const chat = lobby.getByRole("region", { name: "Chat" });
    await expect(chat.getByTestId("meeting-chat")).toContainText("Is the Shop API spec ready?");
    await chat.getByTestId("meeting-chat-input").fill("On it");
    await chat.getByTestId("meeting-chat-send").click();
    await expect(chat.getByTestId("meeting-chat")).toContainText("On it");
    await expect(rows.first()).toContainText("You: On it");
    await expect(rows.first()).not.toContainText("Unread");
    await own.click();
    await expect(chat.getByTestId("meeting-chat")).toContainText("Ideas for the Shop landing page");
    await chat.getByTestId("meeting-chat-input").fill("Book the Fabrikam visit");
    await chat.getByTestId("meeting-chat-send").click();
    await expect(own).toContainText("You: Book the Fabrikam visit");
    // A picture and a file in a group chat (D-328).
    await rows.filter({ hasText: "Portal planning" }).click();
    await expect(chat.getByTestId("chat-file")).toContainText("Shop spec.docx");
    await expect(chat.getByRole("button", { name: "Open picture" })).toBeVisible();
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/chat-open.png",
    });

    // Call… has a Chat action per person: it opens your one-to-one chat with them.
    await lobby
      .getByRole("navigation", { name: "Sections" })
      .getByRole("button", { name: "Calendar", exact: true })
      .click();
    await lobby.getByRole("button", { name: "Call…", exact: true }).click();
    const dialog = lobby.getByTestId("call-dialog");
    await dialog.getByPlaceholder("Search people by name or e-mail").fill("sam");
    await dialog.getByRole("button", { name: "Chat with Sam Fabrikam", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(chat.getByTestId("meeting-chat")).toContainText("Thanks for the review!");

    // Nobody to chat with yet: Start one… opens New chat with them (D-332), or Teams.
    await lobby.getByRole("button", { name: "Call…", exact: true }).click();
    await dialog.getByPlaceholder("Search people by name or e-mail").fill("robin");
    await dialog.getByRole("button", { name: "Chat with Robin Shop", exact: true }).click();
    await expect(dialog.getByTestId("call-status")).toContainText("no Teams chat yet");
    await expect(dialog.getByRole("button", { name: "Open in Teams", exact: true })).toBeVisible();
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/chat-none.png",
    });
    await dialog.getByRole("button", { name: "Start one…", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const newChat = lobby.getByTestId("new-chat-dialog");
    await expect(newChat.getByTestId("new-chat-picked")).toContainText("Robin Shop");
    await newChat.getByRole("button", { name: "Cancel", exact: true }).click();
  } finally {
    await app.close();
  }
});

test("Meetings chats: search, filters, Jig's pins and New chat (D-332)", async ({ jigHome }) => {
  // A long walk with screenshots in both themes: about 50 s alone, over a minute beside the parallel suite.
  test.setTimeout(120_000);
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    await hostCall(main, "meetings.open");
    const { lobby } = await meetingWindows(app);
    const shots = ".jig-test-home-meeting-screenshots";
    await lobby
      .getByRole("navigation", { name: "Sections" })
      .getByRole("button", { name: "Chats", exact: true })
      .click();
    const rows = lobby.getByTestId("teams-chat");
    await expect(rows).toHaveCount(10);
    const toolbar = lobby.getByTestId("chats-toolbar");
    const list = lobby.getByTestId("teams-chats");
    const before = { toolbar: await toolbar.boundingBox(), list: await list.boundingBox() };

    // Search: names, members and last messages of the loaded chats, then Microsoft Search's messages.
    const search = lobby.getByRole("textbox", { name: "Search chats" });
    await search.fill("fabrikam");
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasText: "Shop support" })).toHaveCount(1);
    const hits = lobby.getByTestId("chat-search-hit");
    await expect(hits.filter({ hasText: "The Fabrikam invoices are sent." })).toHaveCount(1);
    await lobby.screenshot({ animations: "disabled", path: `${shots}/chats-search-narrow-dark.png` });
    await search.fill("zzz");
    await expect(list).toContainText("No chat matches “zzz”.");
    await expect(list).toContainText("No messages with “zzz”.");
    // A message only Microsoft Search finds opens its chat.
    await search.fill("error codes");
    await expect(rows).toHaveCount(1);
    await search.fill("release notes");
    await expect(list).toContainText("No chat matches");
    await hits.first().click();
    await expect(lobby.getByRole("region", { name: "Chat" }).getByTestId("meeting-chat")).toContainText(
      "Release notes:",
    );
    await search.press("Escape");
    await expect(search).toHaveValue("");

    // Filters like Teams': meeting chats, chats with people, unread; again turns it off.
    const filters = lobby.getByRole("group", { name: "Filter chats" });
    await filters.getByRole("button", { name: "Meetings", exact: true }).click();
    await expect(rows).toHaveCount(2);
    await filters.getByRole("button", { name: "Chats", exact: true }).click();
    await expect(rows).toHaveCount(8);
    await filters.getByRole("button", { name: "Unread", exact: true }).click();
    await expect(filters.getByRole("button", { name: "Unread", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(rows).toHaveCount(3);
    await lobby.screenshot({ animations: "disabled", path: `${shots}/chats-filter-narrow-dark.png` });
    await filters.getByRole("button", { name: "Unread", exact: true }).click();
    await expect(rows).toHaveCount(10);
    // The toolbar never moves the list.
    expect({ toolbar: await toolbar.boundingBox(), list: await list.boundingBox() }).toEqual(before);

    // Jig's own pins: the hover action and the context menu, in pin order above the rest.
    const kim = rows.filter({ hasText: "The Fabrikam invoices are sent." });
    await kim.hover();
    await lobby.getByRole("button", { name: "Pin in Jig (not synced with Teams)" }).click();
    const pinned = lobby.getByTestId("chats-pinned");
    await expect(pinned.getByTestId("teams-chat")).toHaveText([/Kim Fabrikam/]);
    await expect(pinned).toContainText("In Jig only");
    await rows.filter({ hasText: "Portal planning" }).click({ button: "right" });
    await lobby.getByRole("menuitem", { name: /^Pin/ }).click();
    await expect(pinned.getByTestId("teams-chat")).toHaveText([/Kim Fabrikam/, /Portal planning/]);
    await expect(rows).toHaveCount(10);
    const pins = async () => {
      const result = await hostCall(lobby, "meetings.overview");
      return result.ok ? (result.value as MeetingOverview).chatPins : undefined;
    };
    await expect
      .poll(pins)
      .toEqual([
        "19:00000000-0000-4000-8000-0000000000ee_00000000-0000-4000-8000-0000000000c1@unq.gbl.spaces",
        "19:portal-planning@thread.v2",
      ]);
    await lobby.mouse.move(0, 0);
    await lobby.screenshot({ animations: "disabled", path: `${shots}/chats-pinned-narrow-dark.png` });
    await hostCall(main, "config.update", { appearance: { themeId: "jig-light" } });
    await lobby.screenshot({ animations: "disabled", path: `${shots}/chats-pinned-narrow-light.png` });
    // Wide: the search, filters and New chat on one line.
    await lobby.getByRole("separator", { name: "Resize chat list" }).focus();
    for (let i = 0; i < 3; i++) await lobby.keyboard.press("Shift+ArrowRight");
    await expect.poll(async () => (await toolbar.boundingBox())?.height).toBeLessThan(50);
    await filters.getByRole("button", { name: "Chats", exact: true }).click();
    await lobby.screenshot({ animations: "disabled", path: `${shots}/chats-filter-wide-light.png` });
    await hostCall(main, "config.update", { appearance: { themeId: "jig-dark" } });
    await lobby.screenshot({ animations: "disabled", path: `${shots}/chats-filter-wide-dark.png` });
    await filters.getByRole("button", { name: "Chats", exact: true }).click();
    await pinned.getByTestId("teams-chat").first().click({ button: "right" });
    await lobby.getByRole("menuitem", { name: /^Unpin/ }).click();
    await expect(pinned.getByTestId("teams-chat")).toHaveText([/Portal planning/]);

    // New chat: one person you already chat with opens that chat, with your message in it.
    await lobby.getByTestId("new-chat").click();
    const dialog = lobby.getByTestId("new-chat-dialog");
    const people = dialog.getByTestId("new-chat-person");
    await dialog.getByPlaceholder("Search people by name or e-mail").fill("sam");
    await people.filter({ hasText: "Sam Fabrikam" }).click();
    await expect(dialog.getByLabel("Group name")).toBeDisabled();
    await dialog.getByLabel("First message").fill("Lunch on Friday?");
    await dialog.getByRole("button", { name: "Start chat", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const chat = lobby.getByRole("region", { name: "Chat" });
    await expect(chat.getByTestId("meeting-chat")).toContainText("Thanks for the review!");
    await expect(chat.getByTestId("meeting-chat")).toContainText("Lunch on Friday?");
    await expect(rows).toHaveCount(10);

    // More people make a group chat with its name.
    await lobby.getByTestId("new-chat").click();
    await people.filter({ hasText: "Alex Contoso" }).click();
    await people.filter({ hasText: "Robin Shop" }).click();
    await expect(dialog.getByTestId("new-chat-picked")).toContainText("Alex Contoso");
    await dialog.getByLabel("Group name").fill("Launch crew");
    await dialog.getByLabel("First message").fill("Welcome to the launch chat");
    await lobby.screenshot({ animations: "disabled", path: `${shots}/new-chat-dark.png` });
    await hostCall(main, "config.update", { appearance: { themeId: "jig-light" } });
    await lobby.screenshot({ animations: "disabled", path: `${shots}/new-chat-light.png` });
    await hostCall(main, "config.update", { appearance: { themeId: "jig-dark" } });
    await dialog.getByRole("button", { name: "Start chat", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(chat.getByRole("heading", { name: "Launch crew" })).toBeVisible();
    await expect(chat.getByTestId("meeting-chat")).toContainText("Welcome to the launch chat");
    await expect(rows).toHaveCount(11);
    await expect(rows.filter({ hasText: "Launch crew" })).toContainText("You: Welcome to the launch chat");
  } finally {
    await app.close();
  }
});

test("Meetings chats: New chat says an administrator has to approve starting chats (D-332)", async ({
  jigHome,
}) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake", JIG_MEETINGS_CHAT_CREATE: "consent" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    await hostCall(main, "meetings.open");
    const { lobby } = await meetingWindows(app);
    await lobby
      .getByRole("navigation", { name: "Sections" })
      .getByRole("button", { name: "Chats", exact: true })
      .click();
    await lobby.getByTestId("new-chat").click();
    const dialog = lobby.getByTestId("new-chat-dialog");
    await expect(dialog.getByTestId("new-chat-status")).toContainText("An administrator has to approve");
    const people = dialog.getByTestId("new-chat-person");
    await people.filter({ hasText: "Alex Contoso" }).click();
    await people.filter({ hasText: "Sam Fabrikam" }).click();
    await dialog.getByLabel("First message").fill("Hello both");
    await expect(dialog.getByRole("button", { name: "Start chat", exact: true })).toBeDisabled();
    await lobby.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/new-chat-consent.png",
    });
    // A chat you already have still opens.
    await people.filter({ hasText: "Alex Contoso" }).click();
    await dialog.getByRole("button", { name: "Start chat", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(lobby.getByRole("region", { name: "Chat" }).getByTestId("meeting-chat")).toContainText(
      "Hello both",
    );
  } finally {
    await app.close();
  }
});

test("Meetings: System default names its device, and a picked device is remembered (D-323)", async ({
  jigHome,
}) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    await hostCall(main, "meetings.open");
    const { lobby, room } = await meetingWindows(app);
    const shots = ".jig-test-home-meeting-screenshots";

    // A remembered device that isn't connected: System default, said in the status line.
    expect(
      (
        await hostCall(room, "meetings.devices", {
          speaker: { id: "speaker:gone", name: "Headphones (Fabrikam Buds)" },
        })
      ).ok,
    ).toBe(true);
    // "System default" says which device it is (the test service's Windows default).
    await lobby.getByRole("button", { name: "Join from link…", exact: true }).click();
    const prejoin = room.getByRole("dialog", { name: "Join Teams meeting" });
    const speakers = prejoin.getByLabel("Speakers", { exact: true });
    await expect(speakers.locator("option").first()).toHaveText("System default (Contoso Headset)");
    await expect(prejoin.getByLabel("Microphone", { exact: true }).locator("option").first()).toHaveText(
      "System default (Contoso Cam HD)",
    );
    await expect(speakers).toHaveValue("");
    await expect(prejoin.getByRole("status")).toHaveText(
      "Fabrikam Buds isn't connected, so System default is used. Ready to join.",
    );
    await room.screenshot({ animations: "disabled", path: `${shots}/devices-dark.png` });
    await hostCall(main, "config.update", { appearance: { themeId: "jig-light" } });
    await room.screenshot({ animations: "disabled", path: `${shots}/devices-light.png` });

    // A picked device is kept for the next meeting (and replaces the missing one); nothing moves.
    const box = await prejoin.boundingBox();
    await speakers.selectOption({ label: "Speakers (Fabrikam(R) Audio)" });
    await expect(prejoin.getByRole("status")).toHaveText("Ready to join.");
    expect(await prejoin.boundingBox()).toEqual(box);
    await prejoin.getByLabel("Teams join link").fill("https://teams.microsoft.com/l/meetup-join/test");
    await prejoin.getByRole("button", { name: "Join meeting", exact: true }).click();
    await expect(room.getByTestId("meeting-transcript")).toContainText("We should review the Shop API");
    const devices = async () => {
      const result = await hostCall(lobby, "meetings.overview");
      return result.ok ? (result.value as MeetingOverview).devices : undefined;
    };
    await expect
      .poll(devices)
      .toEqual({ speaker: { id: "speaker:builtin", name: "Speakers (Fabrikam(R) Audio)" } });

    // The in-call picker opens on the picks, System default named.
    await room.getByRole("button", { name: "More call options", exact: true }).click();
    await room.getByRole("menuitem", { name: "Devices…" }).click();
    const picker = room.getByRole("dialog", { name: "Meeting devices" });
    await expect(picker.getByLabel("Speakers", { exact: true })).toHaveValue("speaker:builtin");
    await expect(picker.getByLabel("Camera", { exact: true }).locator("option").first()).toHaveText(
      "System default (Contoso Cam HD)",
    );
    await room.screenshot({ animations: "disabled", path: `${shots}/in-call-devices-light.png` });
    await hostCall(main, "config.update", { appearance: { themeId: "jig-dark" } });
    await room.screenshot({ animations: "disabled", path: `${shots}/in-call-devices-dark.png` });
    await picker.getByRole("button", { name: "Cancel", exact: true }).click();
    await room.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(room.getByRole("button", { name: "Leave", exact: true })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("Meetings: noise suppression is on in a call and switches from the call's menu (D-322)", async ({
  jigHome,
}) => {
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
    await expect(room.getByTestId("meeting-transcript")).toContainText("We should review the Shop API");

    // On by default, with its state in the menu; switching it off applies at once and is saved.
    const options = room.getByRole("button", { name: "More call options", exact: true });
    await options.click();
    await expect(room.getByTestId("noise-suppression")).toContainText("On");
    await room.getByTestId("noise-suppression").click();
    await options.click();
    await expect(room.getByTestId("noise-suppression")).toContainText("Off");
    await room.keyboard.press("Escape");
    const config = (await hostCall(room, "config.get")) as {
      value: { meetings: { noiseSuppression: boolean } };
    };
    expect(config.value.meetings.noiseSuppression).toBe(false);

    await room.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(room.getByRole("button", { name: "Leave", exact: true })).toHaveCount(0);
  } finally {
    await app.close();
  }
});
