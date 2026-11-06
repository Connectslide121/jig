import { useEffect, useState } from "react";
import { windowsDefaultName } from "../../../shared/meetingDevices";
import { useConfig } from "../../stores/config";

/**
 * Which microphone and speaker speech uses (Settings → Speech, or Audio devices in the talking
 * window). Empty = the system's default; a device that is gone falls back to the default.
 */

export interface AudioDevice {
  id: string;
  label: string;
}

export interface AudioDevices {
  inputs: AudioDevice[];
  outputs: AudioDevice[];
  /** The names of the devices "System default" stands for now, when the system tells. */
  defaultInput?: string;
  defaultOutput?: string;
  /** The system hides names until the microphone has been used once. */
  named: boolean;
}

const EMPTY: AudioDevices = { inputs: [], outputs: [], named: true };

async function listDevices(): Promise<AudioDevices> {
  const all = await navigator.mediaDevices?.enumerateDevices().catch(() => []);
  if (!all) return EMPTY;
  // "default" and "communications" are the system's choices, offered as "System default".
  const real = all.filter((d) => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications");
  const named = real.every((d) => d.label);
  const of = (kind: MediaDeviceKind, name: string) =>
    real
      .filter((d) => d.kind === kind)
      .map((d, i) => ({ id: d.deviceId, label: d.label || `${name} ${i + 1}` }));
  return {
    inputs: of("audioinput", "Microphone"),
    outputs: of("audiooutput", "Speaker"),
    defaultInput: windowsDefaultName(all, "audioinput"),
    defaultOutput: windowsDefaultName(all, "audiooutput"),
    named,
  };
}

/** The microphones and speakers, kept up to date as devices are plugged in or out. */
export function useAudioDevices(): AudioDevices | undefined {
  const [devices, setDevices] = useState<AudioDevices>();
  useEffect(() => {
    let live = true;
    const refresh = () => void listDevices().then((d) => live && setDevices(d));
    refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => {
      live = false;
      navigator.mediaDevices?.removeEventListener("devicechange", refresh);
    };
  }, []);
  return devices;
}

/** The chosen microphone's id, or undefined for the system's default. */
export function inputDevice(): string | undefined {
  return useConfig.getState().config?.speech.inputDevice || undefined;
}

const routed = new WeakMap<AudioContext, string>();

/** Sends an audio context to the chosen speaker (again only when the choice changed). */
export function routeToSpeaker(context: AudioContext): void {
  const id = useConfig.getState().config?.speech.outputDevice ?? "";
  if ((routed.get(context) ?? "") === id) return;
  routed.set(context, id);
  const sink = context as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  // A speaker that is gone: the system's default plays it.
  void sink.setSinkId?.(id).catch(() => sink.setSinkId?.("").catch(() => undefined));
}
