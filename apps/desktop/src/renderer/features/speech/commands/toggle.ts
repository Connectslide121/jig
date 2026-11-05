import { updateConfig, useConfig } from "../../../stores/config";

/** Turns listening for "Hey Jig" on or off: the status bar item and the Jig menu action (D-387). */
export function toggleWake(): void {
  void updateConfig({ speech: { wake: !useConfig.getState().config?.speech.wake } });
}
