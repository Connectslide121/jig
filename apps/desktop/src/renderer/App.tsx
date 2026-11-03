import { useEffect } from "react";
import { registerFeatures } from "./features";
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
  useHostEvent("meetings.chatOpen", ({ sessionId }) => {
    workbench.openTab("jig.chat", { sessionId });
  });
  return <Workbench />;
}
