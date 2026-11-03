import { useEffect, useState } from "react";
import { updateConfig, useConfig } from "../../stores/config";
import { Button, Dialog, Select } from "../../ui";
import { SettingRow } from "../settings/parts";
import { type AudioDevice, useAudioDevices } from "./devices";

/** A device Select: "System default", the devices, and the chosen one even while it's unplugged. */
function DeviceSelect({
  label,
  value,
  devices,
  testId,
  onChange,
}: {
  label: string;
  value: string;
  devices: AudioDevice[] | undefined;
  testId: string;
  onChange: (id: string) => void;
}) {
  const missing = value && devices && !devices.some((d) => d.id === value);
  return (
    <Select
      value={value}
      aria-label={label}
      data-testid={testId}
      className="w-56"
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">System default</option>
      {devices?.map((d) => (
        <option key={d.id} value={d.id}>
          {d.label}
        </option>
      ))}
      {missing && <option value={value}>Not connected (default is used)</option>}
    </Select>
  );
}

/**
 * The microphone and speaker rows (Settings → Speech, and the talking window's Audio devices).
 * A new microphone is used straight away, also while talking.
 */
export function AudioDeviceRows() {
  const devices = useAudioDevices();
  const speech = useConfig((s) => s.config?.speech);
  if (!speech) return null;
  const systemVoice = speech.engine === "system";
  return (
    <>
      <SettingRow
        label="Microphone"
        description={
          devices && !devices.named
            ? "Names show once Jig has used the microphone (dictate or talk once)."
            : "What dictation and talking listen to."
        }
      >
        <DeviceSelect
          label="Microphone"
          value={speech.inputDevice}
          devices={devices?.inputs}
          testId="speech-input-device"
          onChange={(id) => void updateConfig({ speech: { inputDevice: id } })}
        />
      </SettingRow>
      <SettingRow
        label="Speaker"
        description={
          systemVoice
            ? "The natural voice and talking sounds play here; system voices always use the system's output."
            : "Where Claude's voice and the talking sounds play."
        }
      >
        <DeviceSelect
          label="Speaker"
          value={speech.outputDevice}
          devices={devices?.outputs}
          testId="speech-output-device"
          onChange={(id) => void updateConfig({ speech: { outputDevice: id } })}
        />
      </SettingRow>
    </>
  );
}

let openDevices: (() => void) | undefined;

/** Opens the Audio devices dialog (from the talking window). */
export function openAudioDevices(): void {
  openDevices?.();
}

/** Mounted once with the talking window. */
export function AudioDevicesDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    openDevices = () => setOpen(true);
    return () => {
      openDevices = undefined;
    };
  }, []);
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Audio devices"
      width="md"
      testId="audio-devices"
      footer={
        <Button variant="primary" data-autofocus onClick={() => setOpen(false)}>
          Done
        </Button>
      }
    >
      <div className="-mx-4 -my-3">
        <AudioDeviceRows />
      </div>
    </Dialog>
  );
}
