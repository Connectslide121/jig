import { Trash2, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  SPEECH_LANGUAGES,
  SPEECH_MODEL_IDS,
  SPEECH_MODELS,
  type SpeechModelStatus,
} from "../../../shared/speech";
import { call, errorMessage } from "../../lib/host";
import { updateConfig, useConfig } from "../../stores/config";
import { Button, confirmDialog, Select, Spinner, Switch } from "../../ui";
import { formatShortcut } from "../../workbench/shortcuts";
import { notify } from "../../workbench/toasts";
import { SettingRow, SettingsSection } from "../settings/parts";
import { DICTATION_SHORTCUT } from "./DictationButton";
import { hasGpu } from "./engine";
import { speechVoices, voiceUtterance } from "./speak";

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

/** Says a short sentence in the chosen voice and speed. */
function tryVoice(): void {
  const synth = window.speechSynthesis;
  if (!synth) {
    notify({ title: "No voices", message: "This system has no speech voices." });
    return;
  }
  synth.cancel();
  synth.speak(voiceUtterance("Hi, I'm Claude. This is how I sound when we talk."));
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
  const refresh = () =>
    void call("speech.models")
      .then(setModels)
      .catch(() => setModels([]));
  useEffect(refresh, []);
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
  return (
    <div className="flex flex-col gap-6">
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
          label="Sound while Claude works"
          description="After you hand Claude a task by voice: a soft note every few seconds while it works, and a chime when it finishes or needs you."
        >
          <Switch
            label="Sound while Claude works"
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
        title="Talking with Claude"
        description="Click the Talk button (sound waves) in a chat's message box to talk: Claude answers out loud, asks what it needs, and when you agree to its plan (say “yes, go ahead”) it starts working. Click again to stop. Headphones keep Claude from hearing itself."
      >
        <SettingRow
          label="Pause that ends your turn"
          description="How long you stay quiet before Claude answers."
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
        <div className="px-4 py-3" data-testid="settings-speech-how-to-talk">
          <div className="text-sm text-fg">How to talk with Claude</div>
          <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4 text-xs text-muted">
            <li>
              In a chat, click the Talk button (sound waves, beside the microphone) or + → Talk with Claude.
              The talking window opens over the chat.
            </li>
            <li>
              Speak; the waves follow your voice and the sentence shows as you say it. Stay quiet for the
              pause above and it is sent.
            </li>
            <li>
              Claude answers out loud and can look at the code to help you plan. Start talking to interrupt
              it; Conversation shows everything said so far.
            </li>
            <li>
              The chat is in plan mode: Claude asks what it needs, then shows its plan. Say “yes, go ahead” or
              press Go ahead: Claude starts working, talking ends, and a soft sound plays while it works.
            </li>
            <li>Say “bye” or press End talking to stop talking; the chat and Claude's work go on.</li>
          </ol>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Reading aloud"
        description="Claude writes text; Jig reads it aloud with your system's voices, on this computer. The same voice and speed are used for Read aloud (the speaker on Claude's messages) and when talking with Claude. Code blocks are skipped."
      >
        <SettingRow
          label="Voice"
          description="The voices installed on your system. To get more, see “Adding voices” below."
        >
          <Select
            value={s.voice}
            aria-label="Voice"
            disabled={!voices}
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
        <div className="px-4 py-3" data-testid="settings-speech-more-voices">
          <div className="text-sm text-fg">Adding voices</div>
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
