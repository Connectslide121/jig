import ortMjs from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import type { InferenceSession, Tensor } from "onnxruntime-web/webgpu";
import model from "./vad/silero_vad.onnx?url";

/**
 * Is that a voice? Silero VAD (v6, MIT, bundled in `vad/`) scores the microphone 32 ms at a time
 * on this computer, so talking with Claude starts, ends and interrupts on a human voice, not on
 * dishes, typing or a sniff (D-275). Runs on the processor (WebAssembly, under a millisecond a
 * window; the same runtime as Whisper's worker), in order: the model keeps state between windows.
 */

/** Samples per window (32 ms at 16 kHz), and the tail of the previous one the model also reads. */
const WINDOW = 512;
const CONTEXT = 64;

type Ort = typeof import("onnxruntime-web/webgpu");

export class VoiceDetector {
  private state: Tensor;
  private context = new Float32Array(CONTEXT);
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(
    private readonly ort: Ort,
    private readonly session: InferenceSession,
    private readonly rate: Tensor,
  ) {
    this.state = this.zeros();
  }

  /** The detector, or undefined when it can't run here (talking then falls back to loudness). */
  static async open(): Promise<VoiceDetector | undefined> {
    try {
      const ort = await import("onnxruntime-web/webgpu");
      ort.env.wasm.wasmPaths = {
        mjs: new URL(ortMjs, location.href).href,
        wasm: new URL(ortWasm, location.href).href,
      };
      // Threads need a cross-origin isolated page, which Jig's isn't.
      ort.env.wasm.numThreads = 1;
      const bytes = await (await fetch(model)).arrayBuffer();
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
      return new VoiceDetector(ort, session, new ort.Tensor("int64", [16_000n]));
    } catch {
      return undefined;
    }
  }

  private zeros(): Tensor {
    return new this.ort.Tensor("float32", new Float32Array(2 * 128), [2, 1, 128]);
  }

  /** How sure (0–1) the model is that `frame` holds a voice: its most voiced window. */
  score(frame: Float32Array): Promise<number> {
    const run = this.queue.then(async () => {
      let best = 0;
      for (let at = 0; at + WINDOW <= frame.length && !this.closed; at += WINDOW)
        best = Math.max(best, await this.window(frame.subarray(at, at + WINDOW)));
      return best;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async window(samples: Float32Array): Promise<number> {
    const input = new Float32Array(CONTEXT + WINDOW);
    input.set(this.context, 0);
    input.set(samples, CONTEXT);
    this.context = samples.slice(-CONTEXT);
    const out = await this.session.run({
      input: new this.ort.Tensor("float32", input, [1, input.length]),
      state: this.state,
      sr: this.rate,
    });
    if (out.stateN) this.state = out.stateN;
    const value = out.output?.data[0];
    return typeof value === "number" ? value : 0;
  }

  close(): void {
    this.closed = true;
    void this.queue.then(() => this.session.release()).catch(() => undefined);
  }
}
