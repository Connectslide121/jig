/**
 * Speech (D-208): dictation runs Whisper on this computer (transformers.js in a worker); the model
 * is downloaded once by the main process into `~/.jig/models` and served to the worker over
 * `jig-speech://hf/<org>/<model>/<file>`. Reading aloud uses the system's voices.
 */

export const SPEECH_MODELS = {
  tiny: { repo: "onnx-community/whisper-tiny", label: "Small and fast", size: "about 40 MB" },
  base: { repo: "onnx-community/whisper-base", label: "Balanced", size: "about 80 MB" },
  small: { repo: "onnx-community/whisper-small", label: "Most accurate, slower", size: "about 250 MB" },
} as const;

export type SpeechModel = keyof typeof SPEECH_MODELS;
export const SPEECH_MODEL_IDS = Object.keys(SPEECH_MODELS) as SpeechModel[];

/** Files the worker needs for 8-bit weights on WebAssembly; all present = the model is downloaded. */
export const SPEECH_REQUIRED_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
] as const;

/** Languages offered in Settings (Whisper knows more; empty = recognise the language). */
export const SPEECH_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "", label: "Recognise the language" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "eu", label: "Basque" },
  { code: "ca", label: "Catalan" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "pl", label: "Polish" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
];

export interface SpeechModelStatus {
  model: SpeechModel;
  downloaded: boolean;
  /** Bytes on disk for this model. */
  bytes: number;
}

/** Microphone access the system gives Jig (macOS asks once; Windows has a privacy switch). */
export type MicrophoneAccess = "granted" | "denied" | "restricted" | "not-determined" | "unknown";
