/**
 * The natural voice's background process (D-243, an Electron utilityProcess): Kokoro-82M on the
 * processor with onnxruntime-node, which uses every core and keeps the UI and the main process free.
 * It reads the model from the folder the main process downloaded it to (`argv[2]`) and answers
 * `{ id, text, voice, speed }` with 24 kHz audio, one request at a time.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AutoTokenizer, env, StyleTextToSpeech2Model, Tensor } from "@huggingface/transformers";
import { phonemize } from "phonemizer";
import { naturalVoice, VOICE_MODEL } from "../../shared/speech";
import { englishPhonemes } from "./english";
import { spanishPhonemes } from "./spanish";
import { type FromVoiceHost, pieces, type ToVoiceHost } from "./voiceProtocol";

const root = process.argv[2] ?? "";
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = `${root.replace(/\\/g, "/")}/`;

type Model = Awaited<ReturnType<typeof StyleTextToSpeech2Model.from_pretrained>>;
type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

let loaded: Promise<{ model: Model; tokenizer: Tokenizer }> | undefined;
const styles = new Map<string, Float32Array>();

function load() {
  loaded ??= Promise.all([
    StyleTextToSpeech2Model.from_pretrained(VOICE_MODEL.repo, { dtype: VOICE_MODEL.dtype, device: "cpu" }),
    AutoTokenizer.from_pretrained(VOICE_MODEL.repo),
  ]).then(([model, tokenizer]) => ({ model, tokenizer }));
  loaded.catch(() => {
    loaded = undefined;
  });
  return loaded;
}

async function style(voice: string): Promise<Float32Array> {
  let s = styles.get(voice);
  if (!s) {
    const bytes = await readFile(join(root, ...VOICE_MODEL.repo.split("/"), "voices", `${voice}.bin`));
    s = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    styles.set(voice, s);
  }
  return s;
}

async function say(text: string, voiceId: string, speed: number): Promise<Float32Array> {
  const { model, tokenizer } = await load();
  const voice = naturalVoice(voiceId);
  const s = await style(voice.id);
  const chunks: Float32Array[] = [];
  for (const piece of pieces(text)) {
    const phonemes =
      voice.language === "es"
        ? spanishPhonemes(piece)
        : await englishPhonemes(piece, voice.language === "en-gb", phonemize);
    if (!phonemes.trim()) continue;
    const { input_ids } = tokenizer(phonemes, { truncation: true }) as { input_ids: Tensor };
    // The voice's style depends on how long the text is (one 256-wide row per token count).
    const row = 256 * Math.min(Math.max(input_ids.dims.at(-1)! - 2, 0), 509);
    const { waveform } = (await model({
      input_ids,
      style: new Tensor("float32", s.slice(row, row + 256), [1, 256]),
      speed: new Tensor("float32", [speed], [1]),
    })) as { waveform: Tensor };
    chunks.push(waveform.data as Float32Array);
  }
  const audio = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    audio.set(c, at);
    at += c.length;
  }
  return audio;
}

const port = process.parentPort;
let queue = Promise.resolve();
port.on("message", (event: { data: ToVoiceHost }) => {
  const request = event.data;
  if (request.t === "load") {
    queue = queue.then(() =>
      load().then(
        () => port.postMessage({ id: request.id } satisfies FromVoiceHost),
        (error: unknown) =>
          port.postMessage({ id: request.id, error: String(error) } satisfies FromVoiceHost),
      ),
    );
    return;
  }
  queue = queue.then(() =>
    say(request.text, request.voice, request.speed).then(
      (audio) => port.postMessage({ id: request.id, audio } satisfies FromVoiceHost),
      (error: unknown) =>
        port.postMessage({
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        } satisfies FromVoiceHost),
    ),
  );
});
