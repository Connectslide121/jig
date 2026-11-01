import { Trash2 } from "lucide-react";
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
import { speechVoices } from "./speak";

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
      </SettingsSection>
      <SettingsSection
        title="Reading aloud"
        description="Hover one of Claude's messages and click the speaker to hear it. It uses your system's voices; code blocks are skipped. Talking with Claude uses the same voice."
      >
        <SettingRow
          label="Voice"
          description="Voices come from your system (Windows: Settings → Time & language → Speech)."
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
      </SettingsSection>
    </div>
  );
}
