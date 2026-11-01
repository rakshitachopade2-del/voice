import { env, pipeline } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
env.allowLocalModels = false;
// SharedArrayBuffer requires cross-origin isolation, provided by our server.
// Four threads improved throughput; use one where isolation is unavailable.
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated
  ? Math.min(4, navigator.hardwareConcurrency || 2)
  : 1;
let asr, tts;
let queue = Promise.resolve();
self.onmessage = (event) => {
  queue = queue.then(() => handle(event));
};
async function handle({ data: { id, action, payload } }) {
  try {
    const started = performance.now();
    const progress_callback = (p) =>
      self.postMessage({
        id,
        progress: {
          status: p.status,
          file: p.file,
          progress: p.progress,
          loaded: p.loaded,
          total: p.total,
        },
      });
    let result;
    if (action === "load-stt") {
      asr = await pipeline("automatic-speech-recognition", payload.model, {
        device: payload.device,
        dtype: "q8",
        progress_callback,
      });
      result = { loadMs: performance.now() - started };
    } else if (action === "load-tts") {
      tts = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        { device: "wasm", dtype: "q8", progress_callback },
      );
      const warmupStart = performance.now();
      self.postMessage({
        id,
        progress: { status: "Warming voice before the first conversation…" },
      });
      await tts.generate(
        "A good voice assistant should feel easy to talk to.",
        { voice: payload.voice || "af_heart" },
      );
      result = {
        loadMs: performance.now() - started,
        warmupMs: performance.now() - warmupStart,
      };
    } else if (action === "transcribe") {
      if (!asr) throw Error("Load the speech recognition model first.");
      const output = await asr(payload.audio, {
        return_timestamps: false,
        chunk_length_s: 20,
        stride_length_s: 3,
      });
      result = { text: output.text.trim(), ms: performance.now() - started };
    } else if (action === "speak") {
      if (!tts) throw Error("Load the Kokoro voice first.");
      const audio = await tts.generate(payload.text, {
        voice: payload.voice,
        speed: payload.speed || 1,
      });
      result = {
        audio: audio.audio,
        sampleRate: audio.sampling_rate,
        ms: performance.now() - started,
      };
    } else throw Error("Unknown speech operation.");
    self.postMessage(
      { id, result },
      result?.audio ? [result.audio.buffer] : [],
    );
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
}
