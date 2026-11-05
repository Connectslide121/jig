import { useEffect } from "react";
import { registerFeatures } from "./features";
import { startPhone } from "./features/phone/store";
import { followWakeSetting } from "./features/speech/commands/wake";
import { useHostEvent } from "./lib/host";
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
  useHostEvent("meetings.chatOpen", ({ sessionId }) => {
    workbench.openTab("jig.chat", { sessionId });
  });
  return <Workbench />;
}
