import { registerFeatures } from "./features";
import { useHostEvent } from "./lib/host";
import { useThemeController } from "./lib/theme";
import { workbench } from "./workbench/store";
import { Workbench } from "./workbench/Workbench";

registerFeatures();

export function App() {
  useThemeController();
  useHostEvent("meetings.chatOpen", ({ sessionId }) => {
    workbench.openTab("jig.chat", { sessionId });
  });
  return <Workbench />;
}
