import { updateConfig, useConfig } from "../../../stores/config";
import { openWakeTraining } from "./train";

/**
 * Turns listening for "Hey Jig" on or off: the status bar item, the Jig menu action and Settings
 * (D-387). Turned on before it was ever trained, the training opens first; skipping it still turns
 * it on (D-389).
 */
export function setWake(on: boolean): void {
  const speech = useConfig.getState().config?.speech;
  if (on && !speech?.wake && !speech?.wakeProfile) openWakeTraining({ turnOn: true });
  else void updateConfig({ speech: { wake: on } });
}

export function toggleWake(): void {
  setWake(!useConfig.getState().config?.speech.wake);
}
