/**
 * Which microphone, speakers and camera a meeting uses (D-323). "System default" ("" as a choice)
 * follows Windows' default device, the one Settings → Sound shows as "Default device"; Chromium lists
 * it as the `default` entry, beside the real device it stands for. A picked device is remembered for
 * the next meeting; while it isn't connected the default is used.
 */

export type DeviceKind = "microphone" | "speaker" | "camera";
export const DEVICE_KINDS: DeviceKind[] = ["microphone", "speaker", "camera"];

/** A device as the calling SDK lists it. */
export interface MeetingDevice {
  id: string;
  name: string;
  /** The SDK's own guess at the system default (it can also mark the active mic or the list's top). */
  isSystemDefault?: boolean;
}

/** The devices to choose from, and the id "System default" means now for each kind. */
export interface MeetingDeviceList {
  microphones: MeetingDevice[];
  speakers: MeetingDevice[];
  cameras: MeetingDevice[];
  defaults: Record<DeviceKind, string>;
}

/** A device picked in the dialogs, kept for the next meeting (its name says which one is missing). */
export interface RememberedDevice {
  id: string;
  name: string;
}
export type RememberedDevices = Partial<Record<DeviceKind, RememberedDevice>>;

/** What `navigator.mediaDevices.enumerateDevices()` gives (only the fields used here). */
export interface BrowserDevice {
  deviceId: string;
  groupId: string;
  kind: string;
  label: string;
}

const SYNTHETIC = new Set(["default", "communications"]);

/**
 * The name of the real device behind Chromium's `default` entry for a kind ("audioinput",
 * "audiooutput"): Windows' default device. The `communications` entry (Windows' default
 * communications device) is not followed, as the calling SDK and Teams on the web don't either.
 */
export function windowsDefaultName(entries: BrowserDevice[], kind: string): string | undefined {
  const all = entries.filter((d) => d.kind === kind);
  const synthetic = all.find((d) => d.deviceId === "default");
  if (!synthetic?.label) return undefined;
  const real = all.filter((d) => !SYNTHETIC.has(d.deviceId) && d.label);
  // The label is "Default - Headphones (Contoso Headset)": the real one's label at its end.
  const byLabel = real.filter((d) => synthetic.label.endsWith(d.label));
  if (byLabel.length) return byLabel.sort((a, b) => b.label.length - a.label.length)[0]!.label;
  const byGroup = real.filter((d) => synthetic.groupId && d.groupId === synthetic.groupId);
  if (byGroup.length === 1) return byGroup[0]!.label;
  const dash = synthetic.label.indexOf(" - ");
  return dash >= 0 ? synthetic.label.slice(dash + 3) : undefined;
}

/**
 * The device "System default" stands for: Windows' default (by name), then the one the SDK marks as
 * default, then a `default` id, then the first.
 */
export function resolveDefault<T extends MeetingDevice>(devices: T[], windowsName?: string): T | undefined {
  return (
    (windowsName ? devices.find((d) => d.name === windowsName) : undefined) ??
    devices.find((d) => d.isSystemDefault) ??
    devices.find((d) => d.id === "default") ??
    devices[0]
  );
}

/** The device to use for a choice: the picked one while it's connected, otherwise the default. */
export function resolveChoice<T extends MeetingDevice>(
  devices: T[],
  choice: string,
  defaultId: string,
): T | undefined {
  return (
    (choice ? devices.find((d) => d.id === choice) : undefined) ??
    devices.find((d) => d.id === defaultId) ??
    devices[0]
  );
}

/**
 * A device's short name, as the selects show it after "System default": the product in Windows'
 * "Kind (Product)" names, without a "2- " prefix or a USB id ("Contoso Cam (046d:0825)").
 */
export function shortDeviceName(name: string): string {
  let short = name
    .trim()
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, "")
    .trim();
  const kindAndProduct = /^([^()]+?)\s+\((.+)\)$/.exec(short);
  if (kindAndProduct) short = kindAndProduct[2]!.trim();
  short = short.replace(/^\d+-\s*/, "");
  return short || name;
}

/** The label of the "System default" option: which device that is now. */
export function systemDefaultLabel(name?: string): string {
  return name ? `System default (${shortDeviceName(name)})` : "System default";
}

/**
 * The choices a dialog starts on from the remembered devices: a remembered one that is connected,
 * otherwise "System default"; `missing` names the ones that aren't connected.
 */
export function rememberedChoices(
  remembered: RememberedDevices | undefined,
  list: Pick<MeetingDeviceList, "microphones" | "speakers" | "cameras">,
): { choices: Record<DeviceKind, string>; missing: RememberedDevices } {
  const choices: Record<DeviceKind, string> = { microphone: "", speaker: "", camera: "" };
  const missing: RememberedDevices = {};
  for (const kind of DEVICE_KINDS) {
    const picked = remembered?.[kind];
    if (!picked) continue;
    if (devicesOf(list, kind).some((d) => d.id === picked.id)) choices[kind] = picked.id;
    else missing[kind] = picked;
  }
  return { choices, missing };
}

/** The status line's note on remembered devices that aren't connected. */
export function missingDevicesText(remembered: RememberedDevices): string {
  const missing = DEVICE_KINDS.flatMap((kind) => remembered[kind] ?? []);
  if (!missing.length) return "";
  const names = missing.map((d) => shortDeviceName(d.name));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${list} ${missing.length === 1 ? "isn't" : "aren't"} connected, so System default is used.`;
}

export function devicesOf(
  list: Pick<MeetingDeviceList, "microphones" | "speakers" | "cameras">,
  kind: DeviceKind,
): MeetingDevice[] {
  return kind === "microphone" ? list.microphones : kind === "speaker" ? list.speakers : list.cameras;
}
