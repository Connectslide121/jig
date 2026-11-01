/// <reference lib="webworker" />
/**
 * Runs Whisper (transformers.js on WebAssembly) off the UI thread (D-208). Model files come from
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

let loaded: { repo: string; asr: Promise<AutomaticSpeechRecognitionPipeline> } | undefined;

function load(repo: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (loaded?.repo === repo) return loaded.asr;
  const asr = pipeline("automatic-speech-recognition", repo, {
    device: "wasm",
    dtype: "q8",
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  loaded = { repo, asr };
  asr.catch(() => {
    if (loaded?.asr === asr) loaded = undefined;
  });
  return asr;
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      await load(request.repo);
      reply({ type: "ready", id: request.id });
      return;
    }
    const asr = await load(request.repo);
    const output = await asr(request.audio, {
      language: request.language || undefined,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const text = (Array.isArray(output) ? output.map((o) => o.text).join(" ") : output.text).trim();
    reply({ type: "text", id: request.id, text });
  } catch (error) {
    reply({ type: "error", id: request.id, message: error instanceof Error ? error.message : String(error) });
  }
};
