import { Mic } from "lucide-react";
import { updateConfig, useConfig } from "../../../stores/config";
import { registerAction, registerStatusItem } from "../../../workbench/registry";
import { WakeStatusItem } from "./WakeStatus";

/** "Hey Jig" voice commands (D-278): the status bar item and the on/off action. */
export function registerVoiceCommands(): void {
  registerStatusItem({ id: "jig.wake", side: "right", order: -10, component: WakeStatusItem, owner: "core" });
  registerAction({
    id: "jig.wake.toggle",
    title: "Listen for “Hey Jig” on or off",
    group: "Jig",
    icon: Mic,
    keywords: ["voice", "commands", "hey jig", "wake", "microphone", "speech"],
    run: () => void updateConfig({ speech: { wake: !useConfig.getState().config?.speech.wake } }),
  });
}
