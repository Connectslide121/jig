import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MeetingOverview } from "../apps/desktop/src/shared/meetings";
import { expect, hostCall, launchJig, test } from "./fixtures";

test("Meetings: device setup failure is visible and retryable before joining", async ({ jigHome }) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    const newWindow = app.waitForEvent("window");
    await hostCall(main, "meetings.open");
    const room = await newWindow;
    await room.emulateMedia({ reducedMotion: "reduce" });
    await expect(room.getByTestId("meeting-room")).toBeVisible();
    expect(new URL(room.url()).hostname).toBe("localhost");
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
    await room.getByRole("button", { name: "Join from link…", exact: true }).first().click();
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
    const newWindow = app.waitForEvent("window");
    await main.getByTestId("goto-button").click();
    await main.getByTestId("goto-input").fill("Meetings");
    await main.keyboard.press("Enter");
    const room = await newWindow;
    await room.emulateMedia({ reducedMotion: "reduce" });
    await expect(room.getByTestId("meeting-room")).toBeVisible();
    await hostCall(room, "meetings.configure", {
      tenantId: "22222222-2222-4222-8222-222222222222",
      clientId: "11111111-1111-4111-8111-111111111111",
      endpoint: "https://example.europe.communication.azure.com",
    });
    await room.getByRole("button", { name: "Connection", exact: true }).click();
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/connection.png",
    });
    await room
      .getByRole("dialog", { name: "Microsoft meeting connection" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    // Credentials and caption injection cannot be requested by another Jig window.
    const refused = await hostCall(main, "meetings.credential", {});
    expect(refused.ok).toBe(false);
    await room.getByRole("button", { name: "Refresh calendar" }).click();
    await expect(room.getByText("Weekly products", { exact: true })).toBeVisible();
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/agenda.png" });
    await room.getByRole("button", { name: "Week", exact: true }).click();
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/week.png" });
    await room.getByRole("button", { name: "Agenda", exact: true }).click();
    // Joining by link needs no acknowledgement and keeps host errors inside the modal.
    await room.getByRole("button", { name: "Join from link…", exact: true }).click();
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
    await room.getByRole("button", { name: "Join Weekly products", exact: true }).click();
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
    await room.getByRole("button", { name: "Generate notes", exact: true }).click();
    await expect.poll(async () => (await overview()).records[0]!.actions.length, { timeout: 30_000 }).toBe(2);
    await expect(room.getByRole("button", { name: "Review actions", exact: true })).toBeEnabled();
    await room.getByRole("button", { name: "Review actions", exact: true }).click();
    const review = room.getByRole("dialog", { name: "Review meeting actions" });
    await expect(review).toContainText("Your action");
    await review.getByRole("checkbox", { name: "Select Review the Shop API" }).check();
    await review.getByRole("checkbox", { name: "Select Update documentation" }).check();
    await review.getByLabel("Project for Review the Shop API").selectOption(first!.id);
    await review.getByLabel("Project for Update documentation").selectOption(second!.id);
    await room.screenshot({
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
    await room.screenshot({
      animations: "disabled",
      path: ".jig-test-home-meeting-screenshots/meetings.png",
    });
    // Deleting asks first, then removes the meeting and returns to the lobby.
    await room.getByRole("button", { name: "Meeting options", exact: true }).click();
    await room.getByRole("menuitem", { name: "Delete meeting…" }).click();
    const confirm = room.getByRole("dialog", { name: /Delete "Weekly products"/ });
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/delete.png" });
    await confirm.getByRole("button", { name: "Delete meeting", exact: true }).click();
    await expect.poll(async () => (await overview()).records.length).toBe(0);
    await expect(room.getByText("No meetings yet")).toBeVisible();
  } finally {
    await app.close();
  }
});

test("Meetings: call someone, hang up, and answer a call that rings in Jig", async ({ jigHome }) => {
  const app = await launchJig(jigHome, { JIG_MEETINGS: "fake" });
  try {
    const main = await app.firstWindow();
    await main.waitForSelector("[data-testid=app-root]");
    const newWindow = app.waitForEvent("window");
    await hostCall(main, "meetings.open");
    const room = await newWindow;
    await room.emulateMedia({ reducedMotion: "reduce" });
    await expect(room.getByTestId("meeting-room")).toBeVisible();
    await expect(room).toHaveTitle("Jig Meetings");

    // Calling: the people you work with, a search, and a whole row places the call.
    await room.getByRole("button", { name: "Call…", exact: true }).click();
    const dialog = room.getByTestId("call-dialog");
    await expect(dialog.getByTestId("call-person")).toHaveCount(3);
    await dialog.getByPlaceholder("Search people by name or e-mail").fill("alex");
    await expect(dialog.getByTestId("call-person")).toHaveCount(1);
    await room.screenshot({ animations: "disabled", path: ".jig-test-home-meeting-screenshots/call.png" });
    await dialog.getByTestId("call-person").click();
    await expect(room.getByRole("heading", { name: "Call with Alex Contoso" })).toBeVisible();
    await expect(room).toHaveTitle("Call with Alex Contoso · Jig Meetings");
    await room.getByRole("button", { name: "Hang up", exact: true }).click();
    await expect(room.getByRole("button", { name: "Call back", exact: true })).toBeVisible();
    await room.getByRole("button", { name: "Back to meetings" }).click();

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
    await room.getByRole("button", { name: "Back to meetings" }).click();
    await room.getByRole("button", { name: "Call…", exact: true }).click();
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
