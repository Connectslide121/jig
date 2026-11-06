/**
 * The natural voice's background process (D-243, an Electron utilityProcess): Kokoro-82M on the
 * processor with onnxruntime-node, on up to 8 threads, which keeps the UI and the main process free.
 * It reads the model from the folder the main process downloaded it to (`argv[2]`) and answers
 * `{ id, text, voice, speed }` with 24 kHz audio piece by piece (each piece as soon as it is made),
 * one request at a time.
 */
import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { AutoTokenizer, env, StyleTextToSpeech2Model, Tensor } from "@huggingface/transformers";
import { phonemize } from "phonemizer";
import { naturalVoice, VOICE_MODEL, VOICE_SAMPLE_RATE } from "../../shared/speech";
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

/**
 * Threads one sentence is computed on. Measured on a 20-core machine (D-411): 8 is as fast as all
 * of them (0.22× the audio's length), 2 twice as slow; capping it leaves cores for Whisper and Jig.
 */
const THREADS = Math.min(8, Math.max(2, Math.floor(availableParallelism() / 2)));

function load() {
  loaded ??= Promise.all([
    StyleTextToSpeech2Model.from_pretrained(VOICE_MODEL.repo, {
      dtype: VOICE_MODEL.dtype,
      device: "cpu",
      session_options: { intraOpNumThreads: THREADS },
    }),
    AutoTokenizer.from_pretrained(VOICE_MODEL.repo),
  ]).then(([model, tokenizer]) => {
    // How long a cold start takes (the main log, debug level).
    console.log(`loaded ${Math.round(performance.now())} ms after the process started, ${THREADS} threads`);
    return { model, tokenizer };
  });
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

/** Says `text` piece by piece: each piece's audio goes to `part` as soon as it is made. */
async function say(
  text: string,
  voiceId: string,
  speed: number,
  part: (audio: Float32Array) => void,
): Promise<number> {
  const { model, tokenizer } = await load();
  const voice = naturalVoice(voiceId);
  const s = await style(voice.id);
  let parts = 0;
  // The first piece ends at a comma within about 100 characters, so it is heard after a fraction
  // of a second; the next ones are made while it plays.
  for (const piece of pieces(text, 300, 100)) {
    const started = performance.now();
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
    const audio = waveform.data as Float32Array;
    parts++;
    part(audio);
    // How fast the voice is on this computer (the main log, debug level): made in vs. spoken length.
    console.log(
      `piece ${parts}: ${piece.length} chars, ${Math.round(performance.now() - started)} ms for ${Math.round(
        (audio.length / VOICE_SAMPLE_RATE) * 1000,
      )} ms of audio`,
    );
  }
  return parts;
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
    say(request.text, request.voice, request.speed, (part) =>
      port.postMessage({ id: request.id, part } satisfies FromVoiceHost),
    ).then(
      (parts) => port.postMessage({ id: request.id, parts } satisfies FromVoiceHost),
      (error: unknown) =>
        port.postMessage({
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        } satisfies FromVoiceHost),
    ),
  );
});
