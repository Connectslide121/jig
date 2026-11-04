import { describe, expect, it } from "vitest";
import {
  missingDevicesText,
  rememberedChoices,
  resolveChoice,
  resolveDefault,
  shortDeviceName,
  systemDefaultLabel,
  windowsDefaultName,
} from "./meetingDevices";

const entries = [
  {
    deviceId: "default",
    groupId: "g1",
    kind: "audiooutput",
    label: "Default - Headphones (Contoso Headset)",
  },
  {
    deviceId: "communications",
    groupId: "g2",
    kind: "audiooutput",
    label: "Communications - Speakers (Fabrikam Audio)",
  },
  { deviceId: "a", groupId: "g2", kind: "audiooutput", label: "Speakers (Fabrikam Audio)" },
  { deviceId: "b", groupId: "g1", kind: "audiooutput", label: "Headphones (Contoso Headset)" },
  {
    deviceId: "c",
    groupId: "g1",
    kind: "audiooutput",
    label: "Headset Earphone (Contoso Headset Hands-Free)",
  },
  { deviceId: "default", groupId: "g3", kind: "audioinput", label: "Default - Microphone (2- Contoso Cam)" },
  { deviceId: "d", groupId: "g3", kind: "audioinput", label: "Microphone (2- Contoso Cam)" },
];

describe("windowsDefaultName", () => {
  it("names the device behind Chromium's default entry, not the communications one", () => {
    expect(windowsDefaultName(entries, "audiooutput")).toBe("Headphones (Contoso Headset)");
    expect(windowsDefaultName(entries, "audioinput")).toBe("Microphone (2- Contoso Cam)");
  });
  it("falls back to the group, then the label after the dash", () => {
    const renamed = [
      { deviceId: "default", groupId: "g1", kind: "audiooutput", label: "Standard – Kopfhörer" },
      { deviceId: "b", groupId: "g1", kind: "audiooutput", label: "Kopfhörer (Contoso)" },
    ];
    expect(windowsDefaultName(renamed, "audiooutput")).toBe("Kopfhörer (Contoso)");
    expect(
      windowsDefaultName(
        [{ deviceId: "default", groupId: "", kind: "audiooutput", label: "Default - Speakers (X)" }],
        "audiooutput",
      ),
    ).toBe("Speakers (X)");
  });
  it("knows nothing without a named default entry", () => {
    expect(windowsDefaultName([], "audiooutput")).toBeUndefined();
    expect(
      windowsDefaultName([{ deviceId: "default", groupId: "", kind: "audioinput", label: "" }], "audioinput"),
    ).toBe(undefined);
  });
});

describe("resolveDefault", () => {
  const speakers = [
    { id: "speaker:a", name: "Speakers (Fabrikam Audio)", isSystemDefault: true },
    { id: "speaker:b", name: "Headphones (Contoso Headset)", isSystemDefault: false },
  ];
  it("prefers Windows' default by name over the SDK's guess", () => {
    expect(resolveDefault(speakers, "Headphones (Contoso Headset)")?.id).toBe("speaker:b");
  });
  it("then the SDK's default, a default id and the first", () => {
    expect(resolveDefault(speakers)?.id).toBe("speaker:a");
    expect(
      resolveDefault([
        { id: "x", name: "X" },
        { id: "default", name: "Default" },
      ])?.id,
    ).toBe("default");
    expect(resolveDefault([{ id: "x", name: "X" }], "gone")?.id).toBe("x");
    expect(resolveDefault([])).toBeUndefined();
  });
});

describe("resolveChoice", () => {
  const list = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ];
  it("uses the pick while it's connected, otherwise the default", () => {
    expect(resolveChoice(list, "b", "a")?.id).toBe("b");
    expect(resolveChoice(list, "gone", "b")?.id).toBe("b");
    expect(resolveChoice(list, "", "b")?.id).toBe("b");
    expect(resolveChoice(list, "", "")?.id).toBe("a");
  });
});

describe("shortDeviceName", () => {
  it("keeps the product of Windows' names", () => {
    expect(shortDeviceName("Headphones (Contoso Headset)")).toBe("Contoso Headset");
    expect(shortDeviceName("Speakers (Fabrikam(R) Audio)")).toBe("Fabrikam(R) Audio");
    expect(shortDeviceName("Microphone (2- Contoso Cam)")).toBe("Contoso Cam");
    expect(shortDeviceName("Contoso Cam HD (046d:0825)")).toBe("Contoso Cam HD");
    expect(shortDeviceName("Fabrikam Camera")).toBe("Fabrikam Camera");
  });
  it("labels the System default option", () => {
    expect(systemDefaultLabel("Headphones (Contoso Headset)")).toBe("System default (Contoso Headset)");
    expect(systemDefaultLabel()).toBe("System default");
  });
});

describe("rememberedChoices", () => {
  const list = {
    microphones: [{ id: "m1", name: "Microphone (Contoso Cam)" }],
    speakers: [{ id: "s1", name: "Speakers (Fabrikam Audio)" }],
    cameras: [],
  };
  it("starts on connected picks and names the missing ones", () => {
    const { choices, missing } = rememberedChoices(
      {
        microphone: { id: "m1", name: "Microphone (Contoso Cam)" },
        speaker: { id: "s9", name: "Headphones (Contoso Headset)" },
        camera: { id: "c9", name: "Fabrikam Camera" },
      },
      list,
    );
    expect(choices).toEqual({ microphone: "m1", speaker: "", camera: "" });
    expect(missingDevicesText(missing)).toBe(
      "Contoso Headset and Fabrikam Camera aren't connected, so System default is used.",
    );
    expect(missingDevicesText({ speaker: missing.speaker! })).toBe(
      "Contoso Headset isn't connected, so System default is used.",
    );
    expect(rememberedChoices(undefined, list).choices).toEqual({ microphone: "", speaker: "", camera: "" });
  });
});
