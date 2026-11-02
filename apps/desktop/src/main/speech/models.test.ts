import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEECH_COMMON_FILES, speechFiles, VOICE_MODEL_FILES } from "../../shared/speech";
import { parseModelUrl, SpeechModels } from "./models";

const URL_BASE = "jig-speech://hf/onnx-community/whisper-base";

describe("parseModelUrl", () => {
  it("accepts Jig's speech models and their files", () => {
    expect(parseModelUrl(`${URL_BASE}/config.json`)).toEqual({
      model: "base",
      repo: "onnx-community/whisper-base",
      file: "config.json",
    });
    expect(parseModelUrl(`${URL_BASE}/onnx/encoder_model_quantized.onnx`)?.file).toBe(
      "onnx/encoder_model_quantized.onnx",
    );
  });

  it("refuses other repos, revisions, traversal and other schemes", () => {
    expect(parseModelUrl("jig-speech://hf/someone/else/config.json")).toBeUndefined();
    expect(parseModelUrl(`${URL_BASE}/%2E%2E/%2E%2E/secret`)).toBeUndefined();
    expect(parseModelUrl(`${URL_BASE}/onnx/..%2F..%2Fx`)).toBeUndefined();
    expect(parseModelUrl(`${URL_BASE}/a/b/c.json`)).toBeUndefined();
    expect(parseModelUrl("https://hf/onnx-community/whisper-base/config.json")).toBeUndefined();
    expect(parseModelUrl("jig-speech://other/onnx-community/whisper-base/config.json")).toBeUndefined();
    expect(parseModelUrl(`${URL_BASE}/%E0%A4%A`)).toBeUndefined();
  });
});

describe("SpeechModels", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "jig-speech-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("downloads a file once, passes it on and serves it from disk afterwards", async () => {
    const fetch = vi.fn(async () => new Response("weights", { headers: { "content-length": "7" } }));
    const progress = vi.fn();
    const models = new SpeechModels(root, fetch, progress, "https://models.test");
    const first = await models.serve(`${URL_BASE}/onnx/encoder_model_quantized.onnx`);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-length")).toBe("7");
    expect(await first.text()).toBe("weights");
    expect(fetch).toHaveBeenCalledWith(
      "https://models.test/onnx-community/whisper-base/resolve/main/onnx/encoder_model_quantized.onnx",
    );
    expect(progress).toHaveBeenLastCalledWith("base", 7, 7);
    const second = await models.serve(`${URL_BASE}/onnx/encoder_model_quantized.onnx`);
    expect(await second.text()).toBe("weights");
    expect(fetch).toHaveBeenCalledTimes(1);
    const file = join(root, "onnx-community", "whisper-base", "onnx", "encoder_model_quantized.onnx");
    expect(await readFile(file, "utf8")).toBe("weights");
  });

  it("answers 404 for files the model doesn't have, and 502 when the download fails", async () => {
    const missing = new SpeechModels(root, async () => new Response("", { status: 404 }));
    expect((await missing.serve(`${URL_BASE}/added_tokens.json`)).status).toBe(404);
    const offline = new SpeechModels(root, async () => {
      throw new Error("offline");
    });
    expect((await offline.serve(`${URL_BASE}/config.json`)).status).toBe(502);
    for (const file of SPEECH_COMMON_FILES) {
      const path = join(root, "onnx-community", "whisper-base", file);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "x");
    }
    // With its description files there, a JSON file it lacks is optional: no going online…
    expect((await offline.serve(`${URL_BASE}/processor_config.json`)).status).toBe(404);
    // …but missing weights (the other variant's) are still downloaded.
    expect((await offline.serve(`${URL_BASE}/onnx/encoder_model.onnx`)).status).toBe(502);
    expect((await offline.serve("jig-speech://hf/other/repo/x.json")).status).toBe(404);
  });

  it("is downloaded per variant when every file is there, and can be removed", async () => {
    const models = new SpeechModels(root, async () => new Response("", { status: 404 }));
    expect((await models.status("base")).downloaded).toBe(false);
    const dir = join(root, "onnx-community", "whisper-base");
    for (const file of speechFiles("cpu")) {
      await mkdir(join(dir, file, ".."), { recursive: true });
      await writeFile(join(dir, file), "x");
    }
    const status = await models.status("base");
    expect(status).toEqual({
      model: "base",
      downloaded: true,
      variants: ["cpu"],
      bytes: speechFiles("cpu").length,
    });
    for (const file of speechFiles("gpu")) await writeFile(join(dir, file), "x");
    expect((await models.status("base")).variants).toEqual(["gpu", "cpu"]);
    expect((await models.list()).map((m) => m.downloaded)).toEqual([false, true, false]);
    await models.remove("base");
    expect((await models.status("base")).downloaded).toBe(false);
  });

  it("downloads the natural voice's model and a voice once, and removes them", async () => {
    const fetch = vi.fn(async () => new Response("x", { headers: { "content-length": "1" } }));
    const progress = vi.fn();
    const models = new SpeechModels(root, fetch, progress, "https://models.test");
    expect(await models.voiceStatus()).toEqual({ downloaded: false, bytes: 0 });
    await models.ensureVoice("af_heart");
    expect(fetch).toHaveBeenCalledTimes(VOICE_MODEL_FILES.length + 1);
    expect(fetch).toHaveBeenCalledWith(
      "https://models.test/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/af_heart.bin",
    );
    expect(progress).toHaveBeenCalledWith("voice", 1, 1);
    expect(await models.voiceStatus()).toEqual({ downloaded: true, bytes: VOICE_MODEL_FILES.length + 1 });
    await models.ensureVoice("af_heart");
    expect(fetch).toHaveBeenCalledTimes(VOICE_MODEL_FILES.length + 1);
    await models.ensureVoice("ef_dora");
    expect(fetch).toHaveBeenCalledTimes(VOICE_MODEL_FILES.length + 2);
    await models.removeVoice();
    expect(await models.voiceStatus()).toEqual({ downloaded: false, bytes: 0 });
  });
});
