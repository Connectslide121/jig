import { app, net, protocol, systemPreferences } from "electron";
import type { MicrophoneAccess } from "../../shared/speech";
import { emit, handle } from "../ipc/router";
import { paths } from "../state/paths";
import { SpeechModels } from "./models";

let models: SpeechModels | undefined;

/**
 * Before `app.whenReady`: with the fake engine (tests), Chromium's fake microphone plays a tone and
 * the permission prompt is answered, so dictation can be driven end to end.
 */
export function configureSpeechSwitches(): void {
  if (process.env.JIG_ENGINE !== "fake") return;
  app.commandLine.appendSwitch("use-fake-device-for-media-stream");
  app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
}

/** Dictation's model files (`jig-speech:`) and the speech host methods (D-208). */
export function startSpeech(): void {
  let last = 0;
  models = new SpeechModels(
    paths.models(),
    (url) => net.fetch(url),
    (model, loaded, total) => {
      const now = Date.now();
      if (now - last < 150 && loaded < total) return;
      last = now;
      emit("speech.progress", { model, loaded, total });
    },
  );
  protocol.handle("jig-speech", (request) => models!.serve(request.url));
  handle("speech.models", () => models!.list());
  handle("speech.removeModel", ({ model }) => models!.remove(model));
  handle("speech.microphone", async () => microphoneAccess());
}

async function microphoneAccess(): Promise<MicrophoneAccess> {
  if (process.platform === "darwin") {
    if (systemPreferences.getMediaAccessStatus("microphone") === "not-determined")
      await systemPreferences.askForMediaAccess("microphone");
    return systemPreferences.getMediaAccessStatus("microphone");
  }
  if (process.platform === "win32") return systemPreferences.getMediaAccessStatus("microphone");
  return "unknown";
}
