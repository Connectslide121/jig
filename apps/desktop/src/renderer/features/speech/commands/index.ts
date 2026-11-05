import { Mic } from "lucide-react";
import { registerAction, registerStatusItem } from "../../../workbench/registry";
import { toggleWake } from "./toggle";
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
    run: toggleWake,
  });
}
