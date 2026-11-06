import { useEffect } from "react";
import { registerFeatures } from "./features";
import { startPhone } from "./features/phone/store";
import { startPhoneVoice } from "./features/phone/voice";
import { newSession } from "./features/sessions/actions";
import { followWakeSetting } from "./features/speech/commands/wake";
import { call, useHostEvent } from "./lib/host";
import { useThemeController } from "./lib/theme";
import { workbench } from "./workbench/store";
import { Workbench } from "./workbench/Workbench";

registerFeatures();

export function App() {
  useThemeController();
  // "Hey Jig" voice commands, while `speech.wake` is on (D-278).
  useEffect(() => followWakeSetting(), []);
  // Jig on your phone (D-350): its state for the chat menu's Open on my phone.
  useEffect(startPhone, []);
  useEffect(startPhoneVoice, []);
  useHostEvent("meetings.chatOpen", ({ sessionId }) => {
    workbench.openTab("jig.chat", { sessionId });
  });
  // A meeting action's Create card… found no boards: that project's Boards view, to follow one (D-425).
  useHostEvent("meetings.boardsOpen", ({ projectId }) => {
    void call("projects.setActive", { id: projectId })
      .catch(() => undefined)
      .then(() => workbench.showView("addon.boards.boards"));
  });
  // A meeting's "Start a chat" in the Meetings window: the chat opens here, with the meeting mentioned.
  useHostEvent("meetings.chatNew", ({ projectId, draft }) => {
    void newSession(projectId, undefined, draft);
  });
  return <Workbench />;
}
