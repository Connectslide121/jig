import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, net, protocol, systemPreferences, utilityProcess } from "electron";
import type { MicrophoneAccess } from "../../shared/speech";
import { emit, handle } from "../ipc/router";
import { logger } from "../log";
import { paths } from "../state/paths";
import { SpeechModels } from "./models";
import { NaturalVoiceHost, type VoiceChannel } from "./naturalVoice";
import type { FromVoiceHost } from "./voiceProtocol";

const log = logger("speech");
const here = dirname(fileURLToPath(import.meta.url));

let models: SpeechModels | undefined;
let voice: NaturalVoiceHost | undefined;

/** The natural voice's background process (`voice-host.mjs`, built next to the main bundle). */
function voiceProcess(): VoiceChannel {
  const child = utilityProcess.fork(join(here, "voice-host.mjs"), [paths.models()], {
    serviceName: "Jig voice",
    stdio: "pipe",
  });
  child.stdout?.on("data", (d: Buffer) => log.debug(`[voice] ${d.toString().trimEnd()}`));
  child.stderr?.on("data", (d: Buffer) => log.warn(`[voice] ${d.toString().trimEnd()}`));
  return {
    send: (message) => child.postMessage(message),
    onMessage: (listener) => child.on("message", (message: FromVoiceHost) => listener(message)),
    onExit: (listener) => child.on("exit", listener),
    kill: () => child.kill(),
  };
}

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
  // The natural voice that reads aloud (D-243).
  voice = new NaturalVoiceHost(voiceProcess);
  handle("speech.voiceModel", () => models!.voiceStatus());
  handle("speech.prepareVoice", async ({ voice: id }) => {
    await models!.ensureVoice(id);
    await voice!.load();
  });
  handle("speech.say", async ({ text, voice: id, speed }) => {
    await models!.ensureVoice(id);
    return voice!.say(text, id, speed);
  });
  handle("speech.removeVoiceModel", async () => {
    voice!.stop();
    await models!.removeVoice();
  });
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
