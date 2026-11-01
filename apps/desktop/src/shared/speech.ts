/**
 * Speech (D-208): dictation runs Whisper on this computer (transformers.js in a worker); the model
 * is downloaded once by the main process into `~/.jig/models` and served to the worker over
 * `jig-speech://hf/<org>/<model>/<file>`. Reading aloud uses the system's voices.
 */

export const SPEECH_MODELS = {
  tiny: {
    repo: "onnx-community/whisper-tiny",
    label: "Small and fast",
    size: { cpu: "about 40 MB", gpu: "about 60 MB" },
  },
  base: {
    repo: "onnx-community/whisper-base",
    label: "Balanced",
    size: { cpu: "about 80 MB", gpu: "about 130 MB" },
  },
  small: {
    repo: "onnx-community/whisper-small",
    label: "Most accurate",
    size: { cpu: "about 250 MB", gpu: "about 470 MB" },
  },
} as const;

export type SpeechModel = keyof typeof SPEECH_MODELS;
export const SPEECH_MODEL_IDS = Object.keys(SPEECH_MODELS) as SpeechModel[];

/**
 * How Whisper runs: on the graphics card (WebGPU: full-precision encoder, 4-bit decoder) or on the
 * processor (WebAssembly, 8-bit weights). Each needs its own weight files.
 */
export type SpeechVariant = "cpu" | "gpu";
export const SPEECH_VARIANTS: SpeechVariant[] = ["gpu", "cpu"];

/** The model's description files, the same for both variants. */
export const SPEECH_COMMON_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
] as const;

/** Weight files per variant (names follow transformers.js' dtype suffixes). */
export const SPEECH_WEIGHT_FILES: Record<SpeechVariant, readonly string[]> = {
  cpu: ["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"],
  gpu: ["onnx/encoder_model.onnx", "onnx/decoder_model_merged_q4.onnx"],
};

/** Every file a variant needs; all present = downloaded for it. */
export function speechFiles(variant: SpeechVariant): string[] {
  return [...SPEECH_COMMON_FILES, ...SPEECH_WEIGHT_FILES[variant]];
}

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
  /** Downloaded for at least one variant. */
  downloaded: boolean;
  /** The variants it is downloaded for. */
  variants: SpeechVariant[];
  /** Bytes on disk for this model. */
  bytes: number;
}

/** Microphone access the system gives Jig (macOS asks once; Windows has a privacy switch). */
export type MicrophoneAccess = "granted" | "denied" | "restricted" | "not-determined" | "unknown";
