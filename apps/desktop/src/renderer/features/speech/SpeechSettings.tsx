import { AudioLines, Download, ScrollText, Trash2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import {
  NATURAL_VOICES,
  naturalVoice,
  SPEECH_LANGUAGES,
  SPEECH_MODEL_IDS,
  SPEECH_MODELS,
  type SpeechModelStatus,
  VOICE_LANGUAGES,
  VOICE_MODEL,
  type VoiceModelStatus,
} from "../../../shared/speech";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Button, confirmDialog, Select, Spinner, Switch } from "../../ui";
import { formatShortcut } from "../../workbench/shortcuts";
import { notify } from "../../workbench/toasts";
import { openAbout } from "../about";
import { SettingRow, SettingsSection } from "../settings/parts";
import { AudioDeviceRows } from "./AudioDevicesDialog";
import { useWakeVoice } from "./commands/state";
import { setWake } from "./commands/toggle";
import { openWakeTraining } from "./commands/train";
import { DICTATION_SHORTCUT } from "./DictationButton";
import { hasGpu } from "./engine";
import { downloadNaturalVoice, resetNaturalVoice, useNaturalVoice } from "./naturalVoice";
import { speak, speechVoices, stopSpeaking } from "./speak";

/** How to add voices to the system, per platform: Jig can only use the voices the system has. */
const MORE_VOICES: Record<string, string[]> = {
  win32: [
    "Open Windows Settings → Time & language → Speech.",
    "Under Manage voices, click Add voices, pick a language and voice, and install it.",
    "If the voice doesn't show up below, also add its language in Time & language → Language & region (with Speech checked).",
    "Restart Jig, then choose the voice above and click Try it.",
  ],
  darwin: [
    "Open System Settings → Accessibility → Spoken Content.",
    "Click the ⓘ beside System voice, then Manage Voices… and download a voice (Premium and Enhanced voices sound best).",
    "Restart Jig, then choose the voice above and click Try it.",
  ],
  linux: [
    "Jig uses speech-dispatcher. Install it and a voice engine, e.g. speech-dispatcher with espeak-ng or RHVoice from your distribution.",
    "Restart Jig, then choose the voice above and click Try it.",
  ],
};

/** Says a short sentence in the chosen voice and speed (in the natural voice's language). */
function tryVoice(): void {
  const speech = useConfig.getState().config?.speech;
  const spanish = speech?.engine !== "system" && naturalVoice(speech?.naturalVoice).language === "es";
  stopSpeaking();
  speak(
    spanish ? "Hola, soy Jig. Así sueno cuando hablamos." : "Hi, I'm Jig. This is how I sound when we talk.",
    { onEnd: () => undefined },
  );
}

function loadVoiceModel(): Promise<VoiceModelStatus> {
  return call("speech.voiceModel").catch(() => ({ downloaded: false, bytes: 0 }));
}

const PAUSES = [600, 800, 1000, 1500, 2000, 3000];
const RATES = [0.8, 1, 1.15, 1.3, 1.5];

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/** Settings → Speech: dictation's model and language, and the voice that reads aloud (D-208). */
export function SpeechSettings() {
  const config = useConfig((s) => s.config);
  const [models, setModels] = useState<SpeechModelStatus[]>();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>();
  const [gpu, setGpu] = useState<boolean>();
  const [voiceModel, setVoiceModel] = useState<VoiceModelStatus>();
  const natural = useNaturalVoice();
  const wakeMuted = useWakeVoice((v) => v.muted);
  const refresh = () => {
    void call("speech.models")
      .then(setModels)
      .catch(() => setModels([]));
    void loadVoiceModel().then(setVoiceModel);
  };
  useEffect(refresh, []);
  // The model's size once a download finishes (or fails).
  useEffect(() => {
    if (natural.state === "ready" || natural.state === "missing") void loadVoiceModel().then(setVoiceModel);
  }, [natural.state]);
  useEffect(() => {
    void speechVoices().then(setVoices);
    void hasGpu().then(setGpu);
  }, []);
  if (!config) return <Spinner center />;
  const s = config.speech;
  const variant = s.gpu && gpu ? "gpu" : "cpu";
  const platform = useConfig.getState().info?.platform ?? "win32";
  const steps = MORE_VOICES[platform] ?? MORE_VOICES.linux!;
  const languages = SPEECH_LANGUAGES.some((l) => l.code === s.language)
    ? SPEECH_LANGUAGES
    : [...SPEECH_LANGUAGES, { code: s.language, label: s.language }];
  const remove = async (m: SpeechModelStatus) => {
    const ok = await confirmDialog({
      title: "Remove the dictation model?",
      message: `Whisper ${m.model} (${megabytes(m.bytes)}) is deleted; the next dictation with it downloads it again.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await call("speech.removeModel", { model: m.model });
    } catch (error) {
      notify({ title: "Couldn't remove it", message: errorMessage(error), tone: "danger" });
    }
    refresh();
  };
  const removeVoice = async () => {
    const ok = await confirmDialog({
      title: "Remove the natural voice?",
      message: `Its model (${megabytes(voiceModel?.bytes ?? 0)}) is deleted; your system's voice reads until you download it again.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    stopSpeaking();
    try {
      await call("speech.removeVoiceModel");
    } catch (error) {
      notify({ title: "Couldn't remove it", message: errorMessage(error), tone: "danger" });
    }
    resetNaturalVoice();
    refresh();
  };
  const downloading = natural.state === "downloading";
  const naturalOn = s.engine === "natural";
  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Microphone and speaker"
        description="The devices dictation, talking with Jig and reading aloud use. While talking, the headphones button changes them too."
      >
        <AudioDeviceRows />
      </SettingsSection>
      <SettingsSection
        title="Dictation"
        description={`Click the microphone in a chat's message box (or press ${formatShortcut(DICTATION_SHORTCUT)} there), speak, and click again: what you said appears in the message for you to check and send. Whisper turns speech into text on this computer; the model is downloaded once from Hugging Face.`}
      >
        <SettingRow label="Model" description="A bigger model understands more and takes longer.">
          <Select
            value={s.model}
            aria-label="Dictation model"
            data-testid="settings-speech-model"
            onChange={(e) => void updateConfig({ speech: { model: e.target.value as typeof s.model } })}
          >
            {SPEECH_MODEL_IDS.map((id) => (
              <option key={id} value={id}>
                {SPEECH_MODELS[id].label} ({SPEECH_MODELS[id].size[variant]})
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          label="Use the graphics card"
          description={
            gpu === false
              ? "No graphics card WebGPU can use was found; Whisper runs on the processor."
              : "Much faster with a good graphics card (WebGPU), close to real time. Off: the processor."
          }
        >
          <Switch
            label="Use the graphics card"
            checked={s.gpu}
            onChange={(v) => void updateConfig({ speech: { gpu: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Show words as you speak"
          description="The text appears while you talk and is corrected as you go. Off: once you stop."
        >
          <Switch
            label="Show words as you speak"
            checked={s.live}
            onChange={(v) => void updateConfig({ speech: { live: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Sound while Jig works"
          description="While you talk: a soft note every few seconds while Jig thinks. After you hand it a task by voice: a chime when it finishes or needs you."
        >
          <Switch
            label="Sound while Jig works"
            checked={s.workSound}
            onChange={(v) => void updateConfig({ speech: { workSound: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Language you speak"
          description="Recognising it works for most speech; choosing it helps with short messages."
        >
          <Select
            value={s.language}
            aria-label="Language you speak"
            data-testid="settings-speech-language"
            onChange={(e) => void updateConfig({ speech: { language: e.target.value } })}
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </SettingRow>
        {SPEECH_MODEL_IDS.map((id) => {
          const m = models?.find((x) => x.model === id);
          return (
            <SettingRow
              key={id}
              label={`Whisper ${id}`}
              description={
                !m || m.bytes === 0
                  ? "Not downloaded."
                  : m.downloaded
                    ? `Downloaded for the ${m.variants.map((v) => (v === "gpu" ? "graphics card" : "processor")).join(" and ")}, in Jig's folder (models).`
                    : "Partly downloaded; the next dictation with it finishes the download."
              }
            >
              <span className="w-16 text-right text-sm text-muted tabular-nums">
                {m && m.bytes > 0 ? megabytes(m.bytes) : ""}
              </span>
              <Button
                variant="ghost"
                icon={Trash2}
                disabled={!m || m.bytes === 0}
                data-testid={`settings-speech-remove-${id}`}
                onClick={() => m && void remove(m)}
              >
                Remove
              </Button>
            </SettingRow>
          );
        })}
      </SettingsSection>
      <SettingsSection
        title="Talking with Jig"
        description="Click the Talk button (sound waves) in a chat's message box to talk: Jig answers out loud, asks what it needs, and when you agree to its plan (say “yes, go ahead”) it starts working. Click again to stop. Headphones keep Jig from hearing itself."
      >
        <SettingRow
          label="Pause that ends your turn"
          description="How long you stay quiet before Jig answers."
        >
          <Select
            value={String(s.pause)}
            aria-label="Pause that ends your turn"
            data-testid="settings-speech-pause"
            onChange={(e) => void updateConfig({ speech: { pause: Number(e.target.value) } })}
          >
            {(PAUSES.includes(s.pause) ? PAUSES : [...PAUSES, s.pause].sort((a, b) => a - b)).map((ms) => (
              <option key={ms} value={ms}>
                {(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} s
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          label="Ignore background noise"
          description="Only a voice starts your turn or interrupts Jig: dishes, typing or a sniff don't. Checked on this computer."
        >
          <Select
            value={s.noiseFilter}
            aria-label="Ignore background noise"
            data-testid="settings-speech-noise"
            onChange={(e) =>
              void updateConfig({ speech: { noiseFilter: e.target.value as typeof s.noiseFilter } })
            }
          >
            <option value="strong">Strongly</option>
            <option value="light">A little</option>
            <option value="off">Off (any loud sound)</option>
          </Select>
        </SettingRow>
        <div className="px-4 py-3" data-testid="settings-speech-how-to-talk">
          <div className="text-sm text-fg">How to talk with Jig</div>
          <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4 text-xs text-muted">
            <li>
              In a chat, click the Talk button (sound waves, beside the microphone) or + → Talk with Jig. The
              talking window opens over the chat.
            </li>
            <li>
              Speak; the waves follow your voice and the sentence shows as you say it. Stay quiet for the
              pause above and it is sent.
            </li>
            <li>
              Jig answers out loud and can look at the code to help you plan. Start talking to interrupt it;
              Conversation shows everything said so far.
            </li>
            <li>
              The chat is in plan mode: Jig asks what it needs, then shows its plan. Say “yes, go ahead” or
              press Go ahead: Jig starts working, talking ends, and a chime plays when it's done.
            </li>
            <li>Say “bye” or press End talking to stop talking; the chat and Jig's work go on.</li>
          </ol>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Hey Jig"
        description="Say “Hey Jig” and a command, such as “Hey Jig, new chat in Shop” or “Hey Jig, what's happening”, while Jig is open, also when it is minimized or behind other windows. Jig hears and runs the commands on this computer, without sending anything to an AI provider and without using your plan; only “ask Claude” starts a chat. While it's on the microphone stays open, and the status bar shows it."
      >
        <SettingRow
          label="Listen for “Hey Jig”"
          description="Uses the dictation model above and the voice detector; the first moments of what is said are read to find “Hey Jig”, and nothing else is kept."
        >
          <Switch label="Listen for Hey Jig" checked={s.wake} onChange={setWake} />
        </SettingRow>
        <SettingRow
          label="Say when chats finish"
          description="While listening: Jig says out loud when a chat is done or needs you."
        >
          <Switch
            label="Say when chats finish"
            checked={s.announce}
            disabled={!s.wake}
            onChange={(v) => void updateConfig({ speech: { announce: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Jig's voice"
          description={
            wakeMuted
              ? "Muted: Jig shows its answers in the status bar without saying them. Commands still run."
              : "Jig says its answers out loud. Say “Hey Jig, mute” to only show them."
          }
        >
          <Button
            variant="ghost"
            icon={wakeMuted ? VolumeX : Volume2}
            disabled={!s.wake}
            data-testid="settings-speech-wake-voice"
            onClick={() => useWakeVoice.setState({ muted: !wakeMuted })}
          >
            {wakeMuted ? "Unmute" : "Mute"}
          </Button>
        </SettingRow>
        <SettingRow
          label="Train Hey Jig"
          description={
            s.wakeProfile
              ? `Trained on ${new Date(s.wakeProfile.trainedAt).toLocaleDateString()}. Say “Hey Jig” five times again if Jig still misses you.`
              : "Say “Hey Jig” five times so Jig learns how it sounds in your voice. Only text and loudness are kept, never your voice."
          }
        >
          <Button
            variant="ghost"
            icon={AudioLines}
            data-testid="settings-speech-train"
            onClick={() => openWakeTraining()}
          >
            {s.wakeProfile ? "Train again…" : "Train…"}
          </Button>
        </SettingRow>
        <SettingRow label="Voice commands" description="Everything you can say, on What Jig can do.">
          <Button
            variant="ghost"
            icon={ScrollText}
            data-testid="settings-speech-commands"
            onClick={() => openAbout("voice")}
          >
            Show the commands
          </Button>
        </SettingRow>
      </SettingsSection>
      <SettingsSection
        title="Reading aloud"
        description="Jig reads its replies aloud on this computer, with a natural voice or your system's voices. The same voice and speed are used for Read aloud (the speaker on Jig's messages) and when talking with Jig. Code blocks are skipped."
      >
        <SettingRow
          label="Reads aloud"
          description="The natural voice sounds like a person and runs on this computer; the system's voices need no download."
        >
          <Select
            value={s.engine}
            aria-label="Reads aloud"
            data-testid="settings-speech-engine"
            onChange={(e) => void updateConfig({ speech: { engine: e.target.value as typeof s.engine } })}
          >
            <option value="natural">Natural voice</option>
            <option value="system">System voices</option>
          </Select>
        </SettingRow>
        <SettingRow
          label="Natural voice"
          description="Women and men, in American and British English and in Spanish."
        >
          <Select
            value={naturalVoice(s.naturalVoice).id}
            aria-label="Natural voice"
            disabled={!naturalOn}
            data-testid="settings-speech-natural-voice"
            onChange={(e) => void updateConfig({ speech: { naturalVoice: e.target.value } })}
          >
            {VOICE_LANGUAGES.map((l) => (
              <optgroup key={l.code} label={l.label}>
                {NATURAL_VOICES.filter((v) => v.language === l.code).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender === "female" ? "woman" : "man"})
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </SettingRow>
        <SettingRow
          label="System voice"
          description="The voices installed on your system. To get more, see “Adding system voices” below."
        >
          <Select
            value={s.voice}
            aria-label="System voice"
            disabled={!voices || naturalOn}
            data-testid="settings-speech-voice"
            onChange={(e) => void updateConfig({ speech: { voice: e.target.value } })}
          >
            <option value="">System default</option>
            {(voices ?? []).map((v) => (
              <option key={v.voiceURI} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
            {s.voice && !voices?.some((v) => v.name === s.voice) && (
              <option value={s.voice}>{s.voice}</option>
            )}
          </Select>
        </SettingRow>
        <SettingRow label="Speed" description="How fast the voice speaks.">
          <Select
            value={String(s.rate)}
            aria-label="Speed"
            data-testid="settings-speech-rate"
            onChange={(e) => void updateConfig({ speech: { rate: Number(e.target.value) } })}
          >
            {(RATES.includes(s.rate) ? RATES : [...RATES, s.rate].sort((a, b) => a - b)).map((r) => (
              <option key={r} value={r}>
                {r === 1 ? "Normal" : `${r}×`}
              </option>
            ))}
          </Select>
        </SettingRow>
        <SettingRow label="Try the voice" description="Hear a sentence in the chosen voice and speed.">
          <Button variant="ghost" icon={Volume2} data-testid="settings-speech-try" onClick={tryVoice}>
            Try it
          </Button>
        </SettingRow>
        <SettingRow
          label="Natural voice model"
          description={
            downloading
              ? "Downloading from Hugging Face; your system's voice reads until it's ready."
              : voiceModel?.downloaded
                ? "Downloaded, in Jig's folder (models). It runs on this computer; nothing it reads is sent anywhere."
                : `Not downloaded (${VOICE_MODEL.size}). It downloads the first time it reads, or now.`
          }
        >
          <span
            className="w-16 text-right text-sm text-muted tabular-nums"
            data-testid="settings-speech-voice-size"
          >
            {downloading
              ? `${natural.total ? Math.floor((natural.loaded / natural.total) * 100) : 0}%`
              : voiceModel && voiceModel.bytes > 0
                ? megabytes(voiceModel.bytes)
                : ""}
          </span>
          {voiceModel?.downloaded || downloading ? (
            <Button
              variant="ghost"
              icon={Trash2}
              disabled={downloading}
              className="w-28 justify-start"
              data-testid="settings-speech-remove-voice"
              onClick={() => void removeVoice()}
            >
              Remove
            </Button>
          ) : (
            <Button
              variant="ghost"
              icon={Download}
              className="w-28 justify-start"
              data-testid="settings-speech-download-voice"
              onClick={() => void downloadNaturalVoice(false)}
            >
              Download
            </Button>
          )}
        </SettingRow>
        <div className="px-4 py-3" data-testid="settings-speech-more-voices">
          <div className="text-sm text-fg">Adding system voices</div>
          <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4 text-xs text-muted">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="mt-1.5 text-xs text-hint">
            Some newer “natural” voices are only available to the system's own apps and may not appear here.
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
