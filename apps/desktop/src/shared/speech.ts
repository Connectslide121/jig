/**
 * Speech (D-208): dictation runs Whisper on this computer (transformers.js in a worker); the model
 * is downloaded once by the main process into `~/.jig/models` and served to the worker over
 * `jig-speech://hf/<org>/<model>/<file>`. Reading aloud uses a natural voice (Kokoro, D-243) or the
 * system's voices.
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

/**
 * The natural voice that reads aloud (D-243): Kokoro-82M, run on the processor by a background
 * process. The model and each voice's style file are downloaded once into `~/.jig/models`. Full
 * precision: the smaller fp16/q4f16 files give broken audio (NaN) for some voices on the processor,
 * and the 8-bit one is slower than speech.
 */
export const VOICE_MODEL = {
  repo: "onnx-community/Kokoro-82M-v1.0-ONNX",
  dtype: "fp32",
  size: "about 330 MB",
} as const;

/** The model's files; all present = downloaded. Voices (`voices/<id>.bin`, 0.5 MB) come as used. */
export const VOICE_MODEL_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model.onnx",
] as const;

/** The natural voice's output rate. */
export const VOICE_SAMPLE_RATE = 24_000;

export type VoiceLanguage = "en-us" | "en-gb" | "es";

export const VOICE_LANGUAGES: Array<{ code: VoiceLanguage; label: string }> = [
  { code: "en-us", label: "American English" },
  { code: "en-gb", label: "British English" },
  { code: "es", label: "Spanish" },
];

export interface NaturalVoice {
  id: string;
  name: string;
  language: VoiceLanguage;
  gender: "female" | "male";
}

const voice = (id: string, name: string): NaturalVoice => ({
  id,
  name,
  language: id[0] === "b" ? "en-gb" : id[0] === "e" ? "es" : "en-us",
  gender: id[1] === "f" ? "female" : "male",
});

/** Kokoro's voices that sound good, best first per language (its weakest ones are left out). */
export const NATURAL_VOICES: NaturalVoice[] = [
  voice("af_heart", "Heart"),
  voice("af_bella", "Bella"),
  voice("af_nicole", "Nicole"),
  voice("af_aoede", "Aoede"),
  voice("af_kore", "Kore"),
  voice("af_sarah", "Sarah"),
  voice("af_nova", "Nova"),
  voice("af_alloy", "Alloy"),
  voice("af_sky", "Sky"),
  voice("am_michael", "Michael"),
  voice("am_fenrir", "Fenrir"),
  voice("am_puck", "Puck"),
  voice("bf_emma", "Emma"),
  voice("bf_isabella", "Isabella"),
  voice("bm_george", "George"),
  voice("bm_fable", "Fable"),
  voice("ef_dora", "Dora"),
  voice("em_alex", "Alex"),
  voice("em_santa", "Santa"),
];

export const NATURAL_VOICE_IDS = NATURAL_VOICES.map((v) => v.id);
export const DEFAULT_NATURAL_VOICE = "af_heart";

/** A voice by id; an unknown id gets the default voice. */
export function naturalVoice(id: string | undefined): NaturalVoice {
  return NATURAL_VOICES.find((v) => v.id === id) ?? NATURAL_VOICES[0]!;
}

export interface VoiceModelStatus {
  /** All the model's files are there. */
  downloaded: boolean;
  /** Bytes on disk (model and voices). */
  bytes: number;
}

/** What is downloading: a dictation model, or the natural voice. */
export type SpeechDownload = SpeechModel | "voice";
