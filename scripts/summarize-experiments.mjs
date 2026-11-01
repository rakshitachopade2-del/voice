import { readFile, writeFile } from "node:fs/promises";
const read = async (name) =>
  JSON.parse(await readFile("reports/" + name, "utf8"));
const native = await read("benchmark.json");
const cases = [
  [
    "browser-single-thread.json",
    "WASM · 1 thread",
    "Warm inference; rejected for this device",
  ],
  [
    "browser-four-thread-before-warmup.json",
    "WASM · 4 threads",
    "Warm inference; cold first run was slower",
  ],
  [
    "browser-benchmark.json",
    "WASM · 4 threads + warm-up",
    "Warm-up happens during Load Kokoro",
  ],
];
const experiments = [];
for (const [file, name, note] of cases) {
  const report = await read(file);
  const run = report.runs.find(
    (r) => r.kind === "tts" && r.input.startsWith("A good voice"),
  );
  experiments.push({
    name,
    note,
    firstTtsMs: run.tts,
    rtf: run.rtf,
    pass: run.tts <= 3000 && run.rtf < 1,
    source: file,
  });
}
const final = await read("browser-benchmark.json");
const report = {
  hardware: native.hardware,
  generatedAt: new Date().toISOString(),
  experiments,
  longResponse: final.runs.find((r) => r.chunks === 20),
  microphone: final.runs.find(
    (r) => r.kind === "conversation" && r.stt != null,
  ),
};
await writeFile("public/experiments.json", JSON.stringify(report, null, 2));
await writeFile("reports/experiments.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
