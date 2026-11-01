import { pipeline, env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { wordErrorRate, takeChunk, SAMPLE_TEXT } from "../src/core.mjs";
env.cacheDir = ".cache/models";
await mkdir("reports", { recursive: true });
await mkdir("public/samples", { recursive: true });
const report = {
  createdAt: new Date().toISOString(),
  runtime: "Node / ONNX CPU",
  hardware: `${os.cpus()[0].model}, ${os.arch()}, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM`,
  note: "Native CPU runtime; these are not browser or phone timings. Warm medians use three runs.",
  results: [],
};
const save = async () => {
  await writeFile("reports/benchmark.json", JSON.stringify(report, null, 2));
  await writeFile("public/benchmark.json", JSON.stringify(report, null, 2));
};
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const progress = (p) => {
  if (p.status === "done") console.log("Downloaded", p.file);
};
const text = takeChunk(SAMPLE_TEXT)[0];
console.log("Loading Kokoro q8");
let start = performance.now();
const tts = await KokoroTTS.from_pretrained(
  "onnx-community/Kokoro-82M-v1.0-ONNX",
  { dtype: "q8", device: "cpu", progress_callback: progress },
);
const loadMs = performance.now() - start;
const times = [];
let generated;
for (let i = 0; i < 4; i++) {
  start = performance.now();
  generated = await tts.generate(text, { voice: "af_heart" });
  times.push(performance.now() - start);
  console.log("TTS", i, Math.round(times.at(-1)), "ms");
}
await generated.save("public/samples/kokoro.wav");
report.results.push({
  engine: "Kokoro q8 · Heart",
  loadMs,
  coldMs: times[0],
  warmMedianMs: median(times.slice(1)),
  samplesMs: times,
  text,
  audioSeconds: generated.audio.length / generated.sampling_rate,
  detail: `RTF ${(median(times.slice(1)) / ((generated.audio.length / generated.sampling_rate) * 1000)).toFixed(3)} · short first chunk`,
  processRssMB: process.memoryUsage().rss / 2 ** 20,
});
await save();
const response = await fetch(
  "https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav",
);
if (!response.ok) throw Error("Fixture download failed");
const wav = Buffer.from(await response.arrayBuffer());
await writeFile("public/samples/jfk.wav", wav);
let offset = 12,
  data,
  sampleRate,
  channels,
  bits,
  format;
while (offset + 8 <= wav.length) {
  const id = wav.toString("ascii", offset, offset + 4),
    len = wav.readUInt32LE(offset + 4);
  if (id === "fmt ") {
    format = wav.readUInt16LE(offset + 8);
    channels = wav.readUInt16LE(offset + 10);
    sampleRate = wav.readUInt32LE(offset + 12);
    bits = wav.readUInt16LE(offset + 22);
  }
  if (id === "data") data = wav.subarray(offset + 8, offset + 8 + len);
  offset += 8 + len + (len % 2);
}
if (format !== 1 || bits !== 16 || channels !== 1 || sampleRate !== 16000)
  throw Error(
    `Unexpected fixture format ${format}/${bits}/${channels}/${sampleRate}`,
  );
const samples = Float32Array.from(
  { length: data.length / 2 },
  (_, i) => data.readInt16LE(i * 2) / 32768,
);
const reference =
  "And so my fellow Americans ask not what your country can do for you ask what you can do for your country";
for (const model of ["whisper-tiny.en", "whisper-base.en"]) {
  console.log("Loading", model);
  start = performance.now();
  const asr = await pipeline(
    "automatic-speech-recognition",
    `onnx-community/${model}`,
    { dtype: "q8", device: "cpu", progress_callback: progress },
  );
  const load = performance.now() - start;
  const timings = [];
  let output;
  for (let i = 0; i < 4; i++) {
    start = performance.now();
    output = await asr(samples, { return_timestamps: false });
    timings.push(performance.now() - start);
    console.log(model, i, Math.round(timings.at(-1)), "ms", output.text);
  }
  report.results.push({
    engine: model + " q8",
    loadMs: load,
    coldMs: timings[0],
    warmMedianMs: median(timings.slice(1)),
    samplesMs: timings,
    reference,
    transcript: output.text,
    clipSeconds: samples.length / 16000,
    wer: wordErrorRate(reference, output.text),
    detail: `WER ${(wordErrorRate(reference, output.text) * 100).toFixed(1)}% · ${(samples.length / 16000).toFixed(1)} s JFK clip`,
    processRssMB: process.memoryUsage().rss / 2 ** 20,
  });
  await save();
  await asr.dispose();
}
console.log("Saved reports/benchmark.json");
