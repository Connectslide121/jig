import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MeetingOverview } from "../apps/desktop/src/shared/meetings";
import { expect, hostCall, launchJig, test } from "./fixtures";

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
    await room.getByRole("button", { name: "Join Weekly products", exact: true }).click();
    const prejoin = room.getByRole("dialog", { name: "Join Teams meeting" });
    await prejoin.getByRole("checkbox", { name: /I will inform/ }).check();
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
    const queue = await hostCall(main, "addons.call", { id: "tasks", method: "list" });
    expect(queue.ok).toBe(true);
    if (queue.ok) {
      const value = queue.value as {
        running: boolean;
        tasks: Array<{ projectId: string; prompt: string; status: string }>;
      };
      expect(value.running).toBe(false);
      expect(value.tasks.map((t) => t.projectId)).toEqual([first!.id, second!.id]);
      expect(value.tasks.every((t) => t.status === "queued" && t.prompt.includes(id))).toBe(true);
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
  } finally {
    await app.close();
  }
});
