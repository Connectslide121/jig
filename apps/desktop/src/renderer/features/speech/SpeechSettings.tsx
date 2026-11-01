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
import { Button, confirmDialog, Select, Spinner } from "../../ui";
import { formatShortcut } from "../../workbench/shortcuts";
import { notify } from "../../workbench/toasts";
import { SettingRow, SettingsSection } from "../settings/parts";
import { DICTATION_SHORTCUT } from "./DictationButton";
import { speechVoices } from "./speak";

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/** Settings → Speech: dictation's model and language, and the voice that reads aloud (D-208). */
export function SpeechSettings() {
  const config = useConfig((s) => s.config);
  const [models, setModels] = useState<SpeechModelStatus[]>();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>();
  const refresh = () =>
    void call("speech.models")
      .then(setModels)
      .catch(() => setModels([]));
  useEffect(refresh, []);
  useEffect(() => {
    void speechVoices().then(setVoices);
  }, []);
  if (!config) return <Spinner center />;
  const s = config.speech;
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
                {SPEECH_MODELS[id].label} ({SPEECH_MODELS[id].size})
              </option>
            ))}
          </Select>
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
                    ? "Downloaded, in Jig's folder (models)."
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
        title="Reading aloud"
        description="Hover one of Claude's messages and click the speaker to hear it. It uses your system's voices; code blocks are skipped."
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
      </SettingsSection>
    </div>
  );
}
