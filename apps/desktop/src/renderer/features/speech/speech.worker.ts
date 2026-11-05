/// <reference lib="webworker" />
/**
 * Runs Whisper (transformers.js, on the graphics card with WebGPU or else WebAssembly) off the UI
 * thread (D-208). Model files come from
 * `jig-speech:` as "local" models (the main process downloads, keeps and serves them, and reports
 * the download's progress itself); the WebAssembly runtime is bundled.
 */
import { type AutomaticSpeechRecognitionPipeline, env, pipeline } from "@huggingface/transformers";
import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import type { WorkerReply, WorkerRequest } from "./protocol";

env.allowLocalModels = true;
env.localModelPath = "jig-speech://hf/";
env.allowRemoteModels = false;
env.useBrowserCache = false;
env.useWasmCache = false;
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
if (onnx.wasm) {
  onnx.wasm.wasmPaths = {
    mjs: new URL(ortMjs, self.location.href).href,
    wasm: new URL(ortWasm, self.location.href).href,
  };
  // Threads need a cross-origin isolated page, which Jig's isn't.
  onnx.wasm.numThreads = 1;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
const reply = (message: WorkerReply) => scope.postMessage(message);

type Asr = AutomaticSpeechRecognitionPipeline;
let loaded: { key: string; asr: Promise<{ asr: Asr; device: "gpu" | "cpu" }> } | undefined;

async function hasGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  return Boolean(await gpu?.requestAdapter().catch(() => null));
}

async function build(repo: string, gpu: boolean): Promise<{ asr: Asr; device: "gpu" | "cpu" }> {
  if (gpu && (await hasGpu())) {
    try {
      const asr = (await pipeline("automatic-speech-recognition", repo, {
        device: "webgpu",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
      })) as Asr;
      // The first run compiles the graphics card's shaders: do it now, not on your first words.
      await asr(new Float32Array(16_000));
      return { asr, device: "gpu" };
    } catch {
      // A card WebGPU can't use: the processor works everywhere.
    }
  }
  const asr = (await pipeline("automatic-speech-recognition", repo, { device: "wasm", dtype: "q8" })) as Asr;
  await asr(new Float32Array(16_000));
  return { asr, device: "cpu" };
}

function load(repo: string, gpu: boolean) {
  const key = `${repo}:${gpu}`;
  if (loaded?.key === key) return loaded.asr;
  const asr = build(repo, gpu);
  loaded = { key, asr };
  asr.catch(() => {
    if (loaded?.asr === asr) loaded = undefined;
  });
  return asr;
}

/**
 * Whisper's own way of being told what came before (D-389): `<|startofprev|>` and the text, then the
 * usual start. transformers.js has no `prompt_ids` option (4.3: commented out in `generate`), but
 * `decoder_input_ids` reaches it through the pipeline.
 */
function promptIds(asr: Asr, prompt: string, language: string): number[] | undefined {
  const tokenizer = asr.tokenizer as unknown as {
    convert_tokens_to_ids(tokens: string[]): Array<number | undefined>;
    encode(text: string, options: { add_special_tokens: boolean }): number[];
  };
  const special = tokenizer.convert_tokens_to_ids([
    "<|startofprev|>",
    "<|startoftranscript|>",
    `<|${language || "en"}|>`,
    "<|transcribe|>",
    "<|notimestamps|>",
  ]);
  if (special.some((id) => typeof id !== "number")) return undefined;
  const [prev, start, lang, task, noTimestamps] = special as number[];
  return [
    prev!,
    ...tokenizer.encode(prompt, { add_special_tokens: false }),
    start!,
    lang!,
    task!,
    noTimestamps!,
  ];
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const { asr, device } = await load(request.repo, request.gpu);
    if (request.type === "load") {
      reply({ type: "ready", id: request.id, device });
      return;
    }
    // Whisper reads 30 seconds at a time; longer recordings go in overlapping pieces.
    const long = request.audio.length > 30 * 16_000;
    const prompt = request.prompt && !long ? promptIds(asr, request.prompt, request.language) : undefined;
    const output = await asr(request.audio, {
      language: request.language || undefined,
      task: "transcribe",
      ...(long ? { chunk_length_s: 30, stride_length_s: 5 } : {}),
      ...(prompt ? { decoder_input_ids: prompt } : {}),
    } as Parameters<Asr>[1]);
    let text = (Array.isArray(output) ? output.map((o) => o.text).join(" ") : output.text).trim();
    // The prompt comes back in front of what was said.
    if (request.prompt && text.startsWith(request.prompt.trim()))
      text = text.slice(request.prompt.trim().length).trim();
    reply({ type: "text", id: request.id, text });
  } catch (error) {
    reply({ type: "error", id: request.id, message: error instanceof Error ? error.message : String(error) });
  }
};
