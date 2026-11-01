# Browser resource assessment — 29 October 2026

This is a measurement of the existing production browser POC on **Apple M4 Pro, 24 GiB RAM, Chrome 156.0.8078.73**, using Whisper Tiny English Q8 and Kokoro Q8 / Heart. It is **not an Android measurement or a phone-speed simulation**.

## Decision

**Do not approve the current browser Whisper + Kokoro path as a guaranteed fast default for a general ₹12,000 / 4 GB Android phone.** It may run, but neither peak memory survival nor the three-second voice-start target has been demonstrated on that hardware. A 6 GB phone has more memory headroom, but does not automatically have faster speech inference. More RAM is not evidence of CPU speed or thermal endurance.

The earlier approximately 771 MiB figure was a native Node process snapshot. It was not browser peak RAM, and should not be used to approve a phone.

## Measured results

Memory below is the sum of macOS physical-footprint accounting for the isolated Chrome process tree, including renderer/workers, browser, GPU/UI process, and utilities. It excludes the local web server, Playwright driver, other Chrome sessions, and OS memory. It is not model-only RAM. The separate renderer peak was **1.59 GiB**. The whole-browser observed peak was **1.99 GiB**.

| Phase | Median browser footprint GiB | Sampled peak GiB | Mean CPU core equivalents | p95 sampled CPU core equivalents |
|---|---:|---:|---:|---:|
| dashboard_idle | 0.38 | 0.56 | 0.05 | 0.26 |
| load_whisper | 1.18 | 1.19 | 1.64 | 2.76 |
| whisper_only_idle | 1.46 | 1.99 | 0.92 | 1.05 |
| stt_without_kokoro | 1.05 | 1.08 | 1.90 | 3.81 |
| load_kokoro_and_warmup | 1.28 | 1.46 | 2.34 | 3.53 |
| both_models_idle | 1.21 | 1.45 | 0.03 | 0.25 |
| stt_both_loaded | 1.41 | 1.45 | 2.05 | 3.95 |
| short_tts_with_playback | 1.15 | 1.45 | 1.33 | 3.36 |
| sustained_mixed_stt_tts | 1.11 | 1.39 | 1.70 | 3.33 |
| post_soak_idle | 1.12 | 1.31 | 0.02 | 0.02 |

100% CPU = one logical CPU occupied for the entire interval; 400% = four CPU equivalents. This is not a claim that four budget-phone cores perform like four M4 Pro cores. TTS phases include playback and periods waiting for playback, so their average is lower than inference-only bursts. STT phases include file decode, resampling and browser interaction. The Whisper-only idle window immediately follows loading and includes background initialization/compilation; it is not a settled-idle baseline.

| Latency / throughput metric | Result |
|---|---:|
| STT median, full 11-second JFK clip, both models loaded, n=5 | 0.419 s |
| First TTS chunk median, same short opening, n=3 | 2.432 s |
| Short TTS median synthesis/audio ratio (RTF) | 0.683 |
| Same short opening after sustained test | 2.451 s |
| Sustained mixed STT/TTS duration | 315.4 s |
| Sustained complete cycles | 6 |
| Long-text TTS first vs final cycle startup | 2.675 / 2.625 s |
| Sustained TTS median RTF | 0.683 |
| First / last minute median footprint during sustained test | 1.11 / 1.13 GiB |
| Post-test settled-idle median footprint | 1.12 GiB |

RTF below one means speech synthesis was faster than playback on average. With RTF around 0.68 on this Mac, only about 1.46× slowdown would bring this workload to RTF 1. That is an illustrative throughput boundary, **not a measured phone slowdown factor**. Shorter opening chunks can reduce startup but do not solve inadequate sustained throughput.

## Storage and other resources

Logical cached model/config payloads measured from files: Whisper Tiny **41.52 MiB**, Kokoro **88.09 MiB**; combined **129.61 MiB**, plus selected voice data, the approximately 20.6 MiB ONNX WASM binary, application JavaScript, and browser/cache overhead. The earlier 43 + 96 MiB values were allocated disk blocks reported by du, not exact download sizes. Model downloads depend on caching and voice selection. Model file size is not RAM usage.

Speech inference uses CPU/WASM in this test. A Chrome GPU process can exist for browser rendering, but the speech models are not running on GPU. No text API or local LLM was included. Network downloads were cached in this completed run; its load times do not represent a fresh first download. Phone power draw, battery drain, temperature, background suspension and one-hour endurance remain **unmeasured**.

## Interpretation for a budget phone

Assuming 4 GB physical RAM, the Mac browser footprint is a significant warning signal, rather than an exact Android RAM prediction. Android, Chrome and other apps also need memory. Android may reclaim or kill processes under pressure; a 4 GB specification does not mean an application can safely consume all 4 GB. [Android memory management](https://developer.android.com/topic/performance/memory-management).

For a concrete example of this hardware class, Motorola documents the moto g35 with **4 GB RAM and a Unisoc T760 (A76/A55 cores)**. This is a hardware example, not a verified current ₹12,000 purchase recommendation. [Motorola specifications](https://motorola-mobility-en-in--tst1.custhelp.com/app/answers/detail/a_id/187376).

The lower-resource experiment to test first is **Whisper Tiny + an installed system voice**, avoiding a loaded Kokoro model. Voice quality and CPU use still need device measurement, and only a voice that does not require a network should be counted as offline. Android exposes this through isNetworkConnectionRequired(). [Android voice API](https://developer.android.com/reference/android/speech/tts/Voice#isNetworkConnectionRequired()). In the current web POC, refresh and choose system TTS before loading engines to make a fair comparison; merely switching away from an already-loaded Kokoro does not unload its worker.

A native implementation is another candidate, but this experiment does not prove a native Android memory/latency figure. It is not safe to infer phone performance by dividing desktop timings by CPU clock speed or changing browser viewport size.

## What must pass on the actual target phone

- Cold loading succeeds without tab reloads or process death, with a normal set of background apps.
- Across representative short/long replies and accents, p95 first-audio latency meets the three-second TTS target and synthesis stays faster than playback with margin (suggested engineering target RTF <= 0.7, not a universal standard).
- Memory remains bounded through 30–60 minutes; switching to another app and back does not repeatedly reload models.
- Measure battery, temperature and late-session latency with realistic listening/speaking duty cycles. A desktop five-minute soak does not establish this.
- Capture Android PSS including Chrome renderer/isolated child processes, not only the main Chrome PID. RSS can count shared pages repeatedly. Use adb dumpsys meminfo and system profiling; document OS/browser/model versions. [Android dumpsys](https://developer.android.com/tools/dumpsys).

## Reproduce the Mac measurement

Start the built app on a separate port (does not interrupt the normal dashboard):

```sh
npm run build
PORT=5180 NODE_ENV=production node server.mjs
# In another terminal:
node scripts/profile-resources.mjs
node scripts/summarize-resources.mjs
```

SOAK_SECONDS controls the sustained duration, default 300. The last full cycle is allowed to complete, so actual duration exceeds 300 seconds. Requires installed Google Chrome and macOS Command Line Tools. Raw samples are in resource-samples.json and resource-timeline.csv. A private test profile under .cache/resource-profile is used; the user's browser session is not inspected.

Memory and CPU are sampled about every 250 ms plus collection overhead. Peaks shorter than a sample can be missed. CPU uses proc_pid_rusage with Mach timebase conversion; the helper was checked against Node's independent process.cpuUsage counter (see cpu-counter-check.json). Background desktop applications were not disabled. Sum-RSS is also recorded for diagnostics (peak **2.61 GiB**) but not treated as unique physical RAM because shared pages can be double-counted. These are observed desktop process-accounting values, not an Android PSS or hardware minimum.
