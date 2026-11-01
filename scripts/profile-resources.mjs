import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
const exec = promisify(execFile),
  MiB = 2 ** 20;
const url = process.env.PROFILE_URL || "http://127.0.0.1:5180";
const soakSeconds = Number(process.env.SOAK_SECONDS || 300);
await mkdir("reports", { recursive: true });
await mkdir(".cache/bin", { recursive: true });
if (process.platform !== "darwin")
  throw Error(
    "This profiler uses macOS libproc. Android needs adb/dumpsys/perfetto.",
  );
await exec("xcrun", [
  "clang",
  "-O2",
  "scripts/macos-process-metrics.c",
  "-o",
  ".cache/bin/process-metrics",
]);
const context = await chromium.launchPersistentContext(
  ".cache/resource-profile",
  {
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ["--autoplay-policy=no-user-gesture-required"],
  },
);
const browser = context.browser();
const cdp = await browser.newBrowserCDPSession();
const page = context.pages()[0] || (await context.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let phase = "startup",
  running = true,
  previous = null;
const samples = [],
  phases = [],
  runs = [];
const rootPid = (await cdp.send("SystemInfo.getProcessInfo")).processInfo.find(
  (p) => p.type === "browser",
).id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {
  createdAt: new Date().toISOString(),
  hardware: {
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    ramGiB: os.totalmem() / 2 ** 30,
    os: os.release(),
  },
  browser: await browser.version(),
  url,
  configuration: {
    stt: "whisper-tiny.en q8",
    tts: "Kokoro 82M q8 Heart",
    backend: "WASM CPU, up to 4 threads per engine",
    soakSeconds,
  },
  methodology: {
    memory:
      "macOS proc_pid_rusage physical-footprint and resident bytes of this isolated Chrome process tree. Includes browser/renderer/GPU/utilities; server and test driver excluded. Renderer includes dedicated workers. Sampled peaks are lower bounds, not Android PSS or JS heap.",
    cpu: "Delta of process user+system CPU time / wall time. 100% means one logical CPU fully occupied; 400% means four CPU equivalents. Not a percentage transferable to phones.",
    sampling:
      "250 ms target interval plus collection overhead. Normal playback; inference overlaps playback. Load includes available network/cache and warm-up.",
    limits:
      "Mac headless Chrome, not a phone emulator, no energy/temperature measurement. Five-minute soak is not an hour-long validation.",
  },
  phases,
  runs,
  errors,
};
async function persist() {
  await writeFile(
    "reports/resource-profile.json",
    JSON.stringify(report, null, 2),
  );
}
async function sample() {
  const t = performance.now();
  const info = (await cdp.send("SystemInfo.getProcessInfo")).processInfo;
  const { stdout: tree } = await exec("ps", ["-axo", "pid=,ppid="]);
  const pairs = tree
    .trim()
    .split("\n")
    .map((s) => s.trim().split(/\s+/).map(Number));
  const owned = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of pairs)
      if (owned.has(ppid) && !owned.has(pid)) {
        owned.add(pid);
        changed = true;
      }
  }
  const { stdout } = await exec(
    ".cache/bin/process-metrics",
    [...owned].map(String),
  );
  const processes = JSON.parse(stdout).map((p) => ({
    ...p,
    type: info.find((x) => x.id === p.pid)?.type || "utility",
  }));
  let cpuDelta = 0,
    rendererDelta = 0;
  const deltaMs = previous ? t - previous.t : 0;
  for (const p of processes) {
    const old = previous?.processes.find((q) => q.pid === p.pid);
    const d = old ? Math.max(0, p.cpuSeconds - old.cpuSeconds) : 0;
    cpuDelta += d;
    if (p.type === "renderer") rendererDelta += d;
  }
  const sum = (key, subset = processes) =>
    subset.reduce((s, p) => s + p[key], 0);
  const renderers = processes.filter((p) => p.type === "renderer");
  const entry = {
    t,
    phase,
    intervalMs: deltaMs,
    cpuSecondsDelta: cpuDelta,
    cpuPercent: deltaMs ? (cpuDelta / (deltaMs / 1000)) * 100 : 0,
    rendererCpuPercent: deltaMs ? (rendererDelta / (deltaMs / 1000)) * 100 : 0,
    footprintMiB: sum("footprintBytes") / MiB,
    rssMiB: sum("rssBytes") / MiB,
    rendererFootprintMiB: sum("footprintBytes", renderers) / MiB,
    processes,
  };
  samples.push(entry);
  previous = entry;
}
const monitor = (async () => {
  while (running) {
    try {
      await sample();
    } catch (e) {
      errors.push("sampling: " + e.message);
    }
    await sleep(250);
  }
})();
async function measure(name, fn) {
  phase = name;
  const start = performance.now();
  console.log("START", name);
  const value = await fn();
  const end = performance.now();
  const data = samples.filter(
    (s) => s.phase === name && s.t >= start && s.t <= end,
  );
  const vals = (k) => data.map((s) => s[k]).sort((a, b) => a - b);
  const percentile = (k, p) => {
    const a = vals(k);
    return a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? null;
  };
  const summary = {
    name,
    wallSeconds: (end - start) / 1000,
    samples: data.length,
    peakFootprintMiB: percentile("footprintMiB", 1),
    medianFootprintMiB: percentile("footprintMiB", 0.5),
    endFootprintMiB: data.at(-1)?.footprintMiB,
    peakRssMiB: percentile("rssMiB", 1),
    peakRendererFootprintMiB: percentile("rendererFootprintMiB", 1),
    meanCpuPercent:
      (data.reduce((s, x) => s + x.cpuSecondsDelta, 0) /
        Math.max(0.001, data.reduce((s, x) => s + x.intervalMs, 0) / 1000)) *
      100,
    p95CpuPercent: percentile("cpuPercent", 0.95),
    maxSampleCpuPercent: percentile("cpuPercent", 1),
    ...value,
  };
  phases.push(summary);
  console.log("END", JSON.stringify(summary));
  await persist();
}
async function done(text) {
  await page.getByText(text, { exact: true }).waitFor({ timeout: 300000 });
  if (await page.getByRole("alert").count())
    throw Error(await page.getByRole("alert").innerText());
}
async function captureRun(label) {
  const r = await page.evaluate(
    () => JSON.parse(localStorage.getItem("voice-lab-runs") || "[]")[0],
  );
  if (!r) throw Error("No run saved");
  const { input, output, ...metrics } = r;
  runs.push({ label, ...metrics });
  console.log(
    "RUN",
    JSON.stringify({
      label,
      stt: metrics.stt,
      tts: metrics.tts,
      firstAudio: metrics.firstAudio,
      rtf: metrics.rtf,
    }),
  );
  return metrics;
}
async function stt(label) {
  await page
    .locator("input[type=file]")
    .setInputFiles("public/samples/jfk.wav");
  await done("Transcript ready · edit it before sending if needed");
  return captureRun(label);
}
async function tts(text, label) {
  await page.getByLabel("TTS test text").fill(text);
  await page.getByRole("button", { name: "Test voice", exact: true }).click();
  await done("Complete · measurements saved on this device");
  return captureRun(label);
}
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.removeItem("voice-lab-runs"));
  await page.reload();
  await page
    .getByRole("heading", { name: "Good conversations. Less cloud." })
    .waitFor();
  report.crossOriginIsolated = await page.evaluate(() => crossOriginIsolated);
  await measure("dashboard_idle", () => sleep(10000));
  await measure("load_whisper", async () => {
    await page
      .getByRole("button", { name: "Load Whisper", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Whisper ready", exact: true })
      .waitFor({ timeout: 300000 });
  });
  await measure("whisper_only_idle", () => sleep(10000));
  await measure("stt_without_kokoro", async () => {
    for (let i = 0; i < 3; i++) await stt("stt_only_" + i);
  });
  await measure("load_kokoro_and_warmup", async () => {
    await page
      .getByRole("button", { name: "Load Kokoro", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Kokoro ready", exact: true })
      .waitFor({ timeout: 300000 });
  });
  await measure("both_models_idle", () => sleep(15000));
  await measure("stt_both_loaded", async () => {
    for (let i = 0; i < 5; i++) await stt("stt_both_" + i);
  });
  const short =
    "A good voice assistant should feel easy to talk to. This second sentence tests queued playback.";
  await measure("short_tts_with_playback", async () => {
    for (let i = 0; i < 3; i++) await tts(short, "short_tts_" + i);
  });
  const long =
    "The best way to test a voice assistant is to give it something useful to say. Imagine that we are planning a relaxed Saturday, with enough time to enjoy ourselves and no pressure to follow a perfect schedule. We could begin with breakfast at home, open the windows, and listen to the sounds of the neighborhood waking up. Someone is walking a dog outside, a delivery driver is looking for the right address, and a few birds are arguing over a small piece of bread. After breakfast, we might take a walk through the park and decide what to do next. Would you prefer to visit a museum, explore a bookstore, or find a quiet cafe? There is no wrong answer, because the purpose of the day is simply to slow down and pay attention.";
  await measure("sustained_mixed_stt_tts", async () => {
    const until = performance.now() + soakSeconds * 1000;
    let cycles = 0;
    while (performance.now() < until) {
      await stt("soak_stt_" + cycles);
      await tts(long, "soak_tts_" + cycles);
      cycles++;
    }
    return { cycles };
  });
  await measure("post_soak_short_tts", async () => {
    await tts(short, "post_soak_tts");
  });
  await measure("post_soak_idle", () => sleep(15000));
  report.completed = true;
} catch (e) {
  report.completed = false;
  report.failure = e.message;
  console.error(e.message);
  await page
    .screenshot({ path: "reports/resource-profile-error.png" })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  running = false;
  await monitor;
  await persist();
  await writeFile("reports/resource-samples.json", JSON.stringify(samples));
  await context.close();
  console.log("Saved resource-profile.json and resource-samples.json");
}
