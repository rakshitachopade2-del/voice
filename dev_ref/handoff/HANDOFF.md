# Voice Lab — complete handoff for the next AI chat

**Prepared:** 21 November 2026, Asia/Kolkata.  
**Workspace:** `/Users/rakshitchopade/Downloads/stt_tts1`  
**Repository:** https://github.com/rakshitachopade2-del/voice  
**Verified application baseline:** `main`, commit `55c4276850de7aa24ebe12033855b3be60472cb9` (`55c4276`).  
**Purpose:** Continue the existing project without losing the user's agenda, completed work, experimental evidence, limitations, or outstanding work. This document is a handoff, not a claim that every proposed next step has already been implemented.

## 1. Read this first

We built **Voice Lab**, a working browser proof of concept for inexpensive voice interaction:

> Local Whisper speech recognition → optional streamed text model → local chunked Kokoro speech generation.

It includes a polished responsive dashboard, isolated speech tests, recording/upload, an optional system voice alternative, benchmark exports, a cost calculator, and reproducible test/profiling scripts. Local speech inference requires no speech API key. The optional text model is a separate server-side integration.

The desktop implementation works. We have measured real browser and native inference and a roughly five-minute browser resource test. **We have not demonstrated reliable operation on a ₹12,000 phone, tested a physical Android/iPhone, or completed a one-hour endurance test.** These are central remaining goals, not minor footnotes.

The next useful direction is to qualify a lower-resource configuration, improve setup/lifecycle behavior, and establish a repeatable physical-phone test. Preserve the working desktop baseline while comparing alternatives. Do not restart the project from zero or present a proposed engine as already integrated.

### Immediate state at this handoff

- Local `main` and the remote `main` both resolved to the full commit above when checked on 21 November 2026.
- The existing tracked working tree was clean before adding this handoff.
- This handoff was created locally at the user's requested path. It has not been committed or pushed as part of the handoff task.
- `node_modules`, `.cache`, and `dist` exist locally, but are excluded from Git.
- Node observed today: `v24.13.0`; npm: `11.6.2`. README requires Node 22+.
- There is **no local `.env` file** at this handoff. Environment variables supplied externally could still configure a subsequently started process; do not print secrets to check this.
- **No listener was found on port 5173**, and a localhost request was refused. Do not tell the user that the dashboard is currently running. Start it when resuming interactive work.
- There is **no `/api/health` route** in the current server. Use `/api/config` and the root document for service checks. In development, an unknown GET may fall through to the SPA and return HTML.
- `npm test` was rerun on 21 November 2026: **7/7 passed**. Production build passed during the prior repository-push task; it was not rerun for this documentation-only handoff.
- Historical model benchmarks below were not rerun today. Their dates remain October 2026.

## 2. The user's actual goal and working preferences

The user wants speech interaction that feels reasonably close to ChatGPT while keeping recurring speech costs extremely low. They explicitly accept compromises such as local RAM/CPU consumption if the resulting experience is usable. They want both a website and eventually a mobile app, with general affordable smartphones in mind.

Their intended pipeline is STT → text LLM → TTS because they expect text-model usage to be easier to afford than continual cloud speech APIs. They are concerned about someone using the product for **an hour a day, every day**. The motivating question is economic and experiential feasibility, not simply whether a model can execute once.

Important user requirements:

1. Speech API/cloud cost should be near zero or very low. Account for remaining text-model, hosting, distribution, and battery costs honestly.
2. Speech quality and responsiveness matter. The user accepted roughly 2–3 seconds for the text model and roughly 1–3 seconds for TTS startup; this is not a promise that the entire interaction fits into 3 seconds.
3. Long generated answers must begin speaking before the whole answer is synthesized. Waiting 20 seconds to prepare 20 sentences is unacceptable.
4. A clear, attractive dashboard should expose useful information and make manual experiments understandable.
5. Compare realistic options, record drawbacks, and retain useful experiments. The user gave broad latitude to implement, download, research, and test alternative approaches.
6. Prefer action and autonomous investigation. Do not repeatedly ask the user to choose routine implementation details or approve work already authorized. Ask for information only where it materially changes the result or where an actual external requirement blocks progress.
7. Do not confuse “most currently available automation is done” with “the entire product is finished.” Additional automated improvements and tests remain possible; physical-device and listening validation need user/device participation.

The user has not provided an exact phone model, chipset, physical RAM, Android version, primary deployment framework, or paid text-provider credentials. A previous optional question about phone hardware received no answer. **4 GB physical RAM was an assessment assumption**, not a confirmed device specification. ₹12,000 is a budget category, not a performance specification. Do not treat virtual/extended RAM as equivalent to physical RAM.

## 3. What is done, what is partial, and what is absent

| Area | Current status | Evidence / qualification |
|---|---|---|
| Responsive web dashboard | Implemented | React UI, desktop and mobile-viewport checks |
| Local Whisper Tiny English Q8 | Implemented and tested | Browser WASM and native Node runs |
| Local Whisper Base English Q8 | Implemented; native test recorded | Not an established phone alternative |
| Whisper WebGPU selection | Implemented as opt-in | No comparable qualification result recorded |
| Kokoro 82M Q8 | Implemented and tested | Browser WASM, four voice choices, load-time warm-up |
| OS/browser system TTS | Implemented alternative | Locality/quality depends on selected installed voice; resource comparison not established |
| Mic recording + endpointing | Implemented for short utterances | Simple energy gate, 20-second hard cap |
| Uploaded audio STT | Implemented | 30-second decoded duration / 20 MB input limit |
| Text streaming proxy | Implemented, fixture-tested | No real paid provider validation recorded |
| Chunked speech + lookahead | Implemented and exercised | 20-sentence test begins early |
| Stop/interruption control | Implemented | Discards output; cannot preempt active ONNX computation |
| Metrics/history/export | Implemented | Browser-local, last 100 runs; no live OS RAM/CPU widget |
| Desktop resource profiler | Implemented and checked | macOS-only process-tree profiler and raw data |
| Five-minute mixed workload | Completed | 315.4 seconds, six cycles, no reported errors |
| Continuous hour-long microphone transcription | Absent | No streaming partial STT / rolling capture session |
| One-hour endurance | Not performed | Script can request it; capability is not a completed test |
| Physical budget Android/iOS testing | Not performed | Responsive viewport does not count |
| Native Android/iOS app | Absent | No APK/IPA/native speech adapter |
| Automatic acoustic barge-in | Absent | Current flow requires Stop, then a new recording |
| Trained VAD | Absent | Current RMS threshold is intentionally simple |
| Hindi/Hinglish/multilingual qualification | Absent | Existing ASR models are English-only |
| Fully offline installed PWA | Absent | No app-shell offline installation guarantee |
| Public production deployment | Not completed | No auth, quotas, or rate limiting on proxy |

## 4. Repository map and ownership of behavior

All paths below are relative to the repository root. Links from this document go up two directories.

| File / directory | Purpose |
|---|---|
| [README.md](../../README.md) | Setup, architecture, metric definitions, limitations, source links |
| [package.json](../../package.json), `package-lock.json` | Pinned dependencies and commands |
| [server.mjs](../../server.mjs) | Express server, isolation headers, config endpoint, streamed text proxy, Vite/static hosting |
| [src/main.jsx](../../src/main.jsx) | Main UI, state, engine loading, speech pipeline orchestration, history/export, cost controls |
| [src/audio.js](../../src/audio.js) | Worker RPC wrapper, audio decode/resample, recording, playback, system speech |
| [src/speech.worker.js](../../src/speech.worker.js) | Whisper/Kokoro model initialization and inference |
| [src/core.mjs](../../src/core.mjs) | Incremental text chunking, WER, cost arithmetic, SSE parsing |
| [src/Experiments.jsx](../../src/Experiments.jsx) | Display of historical experiment comparisons |
| [src/style.css](../../src/style.css) | Dashboard styling and responsive layouts |
| `index.html`, `vite.config.js`, `public/favicon.svg` | App entry/build configuration/branding |
| `public/samples/jfk.wav` | 11-second clean English STT fixture |
| `public/samples/kokoro.wav` | Generated native TTS sample |
| `public/benchmark.json`, `public/experiments.json` | Historical reports served to dashboard |
| [tests/core.test.mjs](../../tests/core.test.mjs) | Chunking, WER, costing, SSE tests |
| [tests/server.test.mjs](../../tests/server.test.mjs) | Fake-provider integration, validation, origin check, key handling |
| [scripts/browser-test.mjs](../../scripts/browser-test.mjs) | Installed-Chrome UI and optional real-model browser tests |
| [scripts/benchmark.mjs](../../scripts/benchmark.mjs) | Native ONNX model benchmark |
| [scripts/summarize-experiments.mjs](../../scripts/summarize-experiments.mjs) | Aggregate historical engine experiments |
| [scripts/profile-resources.mjs](../../scripts/profile-resources.mjs) | Isolated-Chrome macOS resource profiler |
| [scripts/macos-process-metrics.c](../../scripts/macos-process-metrics.c) | libproc process memory and CPU counter helper |
| [scripts/check-process-metrics.mjs](../../scripts/check-process-metrics.mjs) | Independent CPU counter sanity check |
| [scripts/summarize-resources.mjs](../../scripts/summarize-resources.mjs) | Derive resource summary, CSV, assessment from raw measurements |
| `reports/` | Raw/derived evidence and logs; inspect before making claims |
| `.cache/` | Ignored model files, test browser profiles, helper binaries |
| `.env.example` | Empty credential/configuration template; safe to track |

Pinned major components: React `19.0.0`, Vite `6.4.5`, Express `5.1.0`, Transformers.js `3.8.1`, kokoro-js `1.2.1`, Playwright `1.56.1`, lucide-react `0.468.0`, dotenv `16.6.1`. A `sharp` override at `0.35.5` was added during earlier dependency cleanup. Historical audit passed then; this is not a current dependency-security certification. Avoid upgrading the entire stack before preserving the baseline and identifying a specific need.

## 5. Architecture and behavioral details

### 5.1 Recognition and capture

- Model IDs: `onnx-community/whisper-tiny.en` (default) and `onnx-community/whisper-base.en`.
- Both use Q8. Default backend is WASM CPU; WebGPU is selectable for STT.
- Each engine has its own `SpeechEngine` instance / worker. The shared worker module can handle both kinds of action, but the app loads STT and TTS in separate instances.
- Worker RPC actions are serialized through a promise queue per worker. Progress and results are sent by message ID.
- `recordAudio()` requests echo cancellation, noise suppression, and automatic gain control.
- It uses `MediaRecorder`, an analyser, RMS threshold `0.018`, and a 50 ms polling interval.
- End-silence choices: 500, 700 (default), 1,000, 1,500 ms, or Manual only.
- **Manual only disables silence stopping; it does not disable the 20-second hard cap.**
- If no speech crossed the energy threshold, the UI reports no speech detected instead of running STT.
- After recording, the blob is decoded and resampled to 16 kHz mono. Recognition starts after this step, not while the user is still talking.
- `decodeAudio()` rejects decoded clips longer than 30 seconds. The upload path additionally rejects files above 20,000,000 bytes. The duration check occurs after decoding, so the file-size limit alone is not a complete decoded-memory bound.
- Whisper inference passes `chunk_length_s: 20`, `stride_length_s: 3`, and no timestamps. These are internal inference options; they do not make microphone capture a streaming hour-long feature.
- Uploads transcribe without automatically replying. Mic recording uses the “Reply automatically after recording” checkbox.

### 5.2 Speech generation and scheduling

- TTS model: `onnx-community/Kokoro-82M-v1.0-ONNX`, Q8, WASM.
- Choices: `af_heart` (default), `af_bella`, `am_michael`, `bf_emma`.
- Load Kokoro includes a real inference warm-up: “A good voice assistant should feel easy to talk to.” Warm-up has been moved out of the first user reply; it has not been eliminated as work.
- Changing the Kokoro voice disposes its worker and requires loading/warming again.
- `takeChunk()` emits text at punctuation/clause boundaries when possible, otherwise bounds long text. The opening chunk maximum is **64 characters**, later chunks **160 characters**. These are character limits, not seconds or token counts.
- Punctuation before character index 24 is not used as the preferred boundary. An extremely short streamed opening can wait for more text or final flush; no timeout-based partial flush is implemented.
- `speakStream()` starts synthesis once a bounded chunk exists. A generation chain and a playback chain allow **one audio chunk to be synthesized ahead of playback**. It does not synthesize all 20 sentences before starting speech.
- The rest of the text/promise queue can still grow for a very large response. Audio lookahead is bounded; do not assume all text/history allocations are bounded for arbitrary hour-long output.
- Playback uses `AudioContext` buffers. The next chunk is started after the prior playback promise completes; average RTF alone does not establish gap-free transitions. There is no measured audible gap/jitter metric yet.
- System TTS uses `SpeechSynthesisUtterance`, English voices, and a 15-second start timeout. Local/network labels use the browser's reported `localService` value; default voice locality is unknown.
- App initialization currently accesses `speechSynthesis` without a capability guard. Broad-browser support should include graceful handling when this API is unavailable; do not infer universal support from the Chrome test.
- Switching the **engine selector** from Kokoro to system voice currently only updates selection. It **does not unload an already loaded Kokoro worker**. Refresh and choose system voice before loading Kokoro for a fair lower-memory test until lifecycle behavior is improved.

### 5.3 Threads, model loading, and caching

- WASM threads are `min(4, navigator.hardwareConcurrency || 2)` when `crossOriginIsolated` is true; otherwise one.
- The server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- Preserve these headers through any reverse proxy or hosting setup. Losing isolation degraded TTS substantially in the recorded experiment.
- Workers fetch model assets through the libraries. `env.allowLocalModels = false` in the browser worker is a library loading setting; inference still runs locally. It does not mean inference is sent to a server.
- Browser model caches and native `.cache/models` are different. Browser test profiles also differ from the user's interactive profile.
- Reloading the page generally requires model session initialization again even if weights are cached. Cache presence is not a guarantee of offline startup or zero loading time.
- Browser storage can be evicted. No explicit offline installer/cache management workflow exists.

### 5.4 Text model and server

`server.mjs` binds to `127.0.0.1:5173` by default. Development uses Vite middleware; production serves `dist`.

- `GET /api/config`: reports `configured: Boolean(LLM_MODEL)` and the model name. It does **not** verify credentials, provider health, billing, or model availability.
- `POST /api/chat`: accepts user/assistant messages, forwards to an OpenAI-compatible `/chat/completions` stream, emits simplified SSE text events plus `[DONE]`.
- `.env` variables: `LLM_BASE_URL`, `LLM_MODEL`, optional `LLM_API_KEY`, `PORT`, `HOST`.
- The API key stays on the server. Do not put it in `VITE_*`, frontend code, browser localStorage, a report, or Git.
- The default base URL is OpenAI's API. A separately installed local Ollama compatible endpoint is also possible; **no local text model was installed or benchmarked as part of this work**.
- Demo mode deliberately emits a fixed explanation one word at a time with a 25 ms delay. It is not an intelligent model and its first-token timing is not a provider benchmark.
- Live conversation history keeps the last 12 user/assistant messages, or six completed exchanges, in memory. The next request appends the current user message. Refresh loses this context.
- Server validation allows 1–24 messages, user/assistant roles only, each content string up to 6,000 characters. The request JSON limit is 32 KB; repeated history can hit this combined limit before every message reaches its individual limit.
- The system instruction asks for concise conversational English, a short first sentence, plain text, and usually fewer than 100 words. This is a prompt preference, not an enforced provider output-token cap.
- Provider request timeout: 90 seconds; client disconnect triggers abort. SSE parser handles split network frames and UTF-8.
- Origin checking is present, but it is not authentication or abuse protection. Do not expose a paid-key deployment publicly without quotas/auth/rate limiting and operational review.
- Typed live prompts have a local configuration preflight. The mic auto-reply route can finish recognition then discover a missing text provider. This is a known UX inconsistency to improve.

### 5.5 Cancellation, persistence, and data boundaries

- Stop increments a run identifier, aborts an active text request, cancels playback/system speech, stops recording, and discards stale results.
- It cannot interrupt an ONNX kernel already running. A new request can wait behind old in-flight work; do not promise immediate CPU reclamation.
- There is no acoustic barge-in or simultaneous “listen while assistant speaks” conversation design.
- Completed runs, transcripts, and outputs are saved in `localStorage` under `voice-lab-runs`, capped at 100 records. This is separate from the memory-only live LLM history.
- Audio recordings are not persisted by the app. Exported JSON includes text/metrics and user-agent metadata; treat real user transcripts as user data before publishing reports.
- UI history clearing exists. No server database, accounts, cross-device history, or cloud audio storage exists.
- Local models receive audio on-device. Live mode sends transcript/history text to the configured text provider. System voices may use a network service. Do not make a blanket offline/privacy claim that ignores selected engine behavior.

## 6. What the dashboard exposes

- **Playground:** mic, Stop, audio upload, typed prompt, demo/live toggle, transcript/reply, isolated TTS text box, engine settings, model progress/error notifications.
- **Metric cards:** speech API fee indicator, STT processing, first TTS chunk, turn-to-first-audio.
- **Benchmarks:** saved runs, reference transcript for WER, JSON export, clear history, historical host measurements.
- **Compare engines:** alternative architecture tradeoffs and recorded experiments. Suggestions shown here are not all integrated implementations.
- **Cost calculator:** editable usage, speech-minute rates, token volumes/prices. Defaults are illustrative, not current provider pricing.

The UI is responsive and the browser check verifies no horizontal overflow at a 390×844 viewport. This proves layout behavior on desktop Chrome, not inference performance, touch audio behavior, RAM safety, or thermal endurance on a phone.

The RAM/CPU assessment currently lives in reports. There is no comprehensive live process-memory/CPU meter in the dashboard; browser JS heap alone would also be an incomplete measurement of WASM/worker/process use.

## 7. Evidence: measurements already completed

### 7.1 Metric definitions that must be preserved

| Metric | What is measured | What it does not establish |
|---|---|---|
| STT processing | Worker inference after decode/resample | Recording duration, silence timeout, overall turn latency |
| First TTS chunk | Kokoro phonemization/synthesis time for first chunk | Full-response synthesis time, first install/download, hardware audible onset |
| System-voice first chunk | Time to speech start event | A separately measured synthesis phase |
| Turn → first audio | From text submission timing or recording callback to buffer scheduling / system speech start | Endpoint silence, recorder finalization before callback, actual speaker output delay |
| TTFT | Time to first text token in this pipeline | Real-provider latency when using scripted demo |
| TTS RTF | Sum of synthesis times / generated audio duration | Worst-case chunk gap, naturalness, startup p95 |
| WER | Reference/hypothesis word-edit distance after normalization | General accuracy from one clean sample |
| Physical footprint | macOS process accounting summed over isolated Chrome tree | Android PSS, model-only memory, exact minimum phone RAM |

RTF below 1 means generation keeps up on average. RTF can exceed 1 if synthesis is too slow; reducing first-chunk size may help startup while leaving later playback stalls unresolved. WER can exceed 100% when there are many insertions; it is not clamped to an “accuracy percentage.”

### 7.2 Final browser resource test — most relevant RAM/CPU evidence

Source of truth: [resource-assessment.md](../../reports/resource-assessment.md), [resource-summary.json](../../reports/resource-summary.json), [resource-profile.json](../../reports/resource-profile.json), [resource-samples.json](../../reports/resource-samples.json), [resource-timeline.csv](../../reports/resource-timeline.csv).

Recorded on Apple M4 Pro, 12 logical CPUs, 24 GiB RAM, Chrome `156.0.8078.73`, Whisper Tiny English Q8 + Kokoro Q8 / Heart, WASM with up to four threads per engine. Report date is 29 October 2026 India time; underlying UTC timestamps include 28 October. Loads were cached. No paid text API or local text LLM was included.

| Measurement | Recorded result |
|---|---:|
| Whole isolated-browser observed peak physical footprint | **1.988 GiB** |
| Renderer/workers observed peak footprint | **1.591 GiB** |
| Both models loaded idle median | **1.205 GiB** |
| Sustained mixed-workload median / peak | **about 1.114 / 1.386 GiB** |
| Post-soak idle median | **1.116 GiB** |
| Baseline dashboard median footprint | **about 0.379 GiB** |
| Sustained average CPU | **1.698 logical-core equivalents** |
| Sustained p95 sampled CPU | **3.334 core equivalents** |
| CPU bursts | **around four core equivalents**, some short-TTS samples above four |
| STT median on 11-second JFK clip, both models loaded, n=5 | **418.825 ms** |
| Short first TTS chunk median, n=3 | **2,431.940 ms** |
| Same short TTS opening after soak | **2,451.125 ms** |
| Short TTS median RTF | **0.6831** |
| Sustained workload | **315.416 seconds; six complete cycles** |
| Long-text first/final cycle first-chunk synthesis | **2.675 / 2.625 seconds** |
| Sustained first/last minute median footprint | **1.107 / 1.134 GiB** |
| Recorded errors | **None** |

Interpretation:

- This short desktop run showed no obvious runaway memory growth or latency deterioration. It does not prove an absence of leaks or one-hour stability.
- 100% process CPU here means one logical CPU fully occupied; 400% means four. It is not 400% of the entire computer and does not map directly to four phone cores.
- Whole-browser memory includes browser, renderers/workers, GPU/UI, and utilities; excludes the web server, test driver, other Chrome sessions, and OS. A GPU/UI process exists even though speech uses CPU.
- Peak summed RSS was 2.609 GiB, recorded for diagnostics. Shared pages can be counted repeatedly; **do not replace the physical-footprint result with “2.61 GiB unique RAM.”**
- The high Whisper-only “idle” window immediately followed loading and included background initialization/compilation. It is not steady-state idle CPU.
- Samples target 250 ms plus overhead. Shorter spikes may be missed. CPU work in short-lived processes between samples can also escape interval accounting. These are observed measurements, not exact worst-case bounds.
- The helper converts Mach CPU ticks with `mach_timebase_info`. An independent `process.cpuUsage()` cross-check agreed within **0.0219%**; see [cpu-counter-check.json](../../reports/cpu-counter-check.json). Earlier unconverted dry runs were discarded. Do not remove this conversion when refactoring.
- RTF ≈0.683 leaves roughly **1.46× slowdown** before this workload reaches RTF 1. This is arithmetic throughput headroom, **not a predicted phone slowdown factor**.

### 7.3 Browser latency experiments and why the current approach was selected

See [experiments.json](../../reports/experiments.json) and the three underlying browser reports.

| Experiment | Representative first-chunk result | RTF / decision |
|---|---:|---|
| WASM one thread | Warm 5.242 s; initial run about 7.19 s | ≈1.46; missed latency and throughput targets |
| WASM up to four threads, before explicit warm-up | Warm 2.450 s; cold first run about 3.82 s | ≈0.686; faster, but first inference needed attention |
| Four threads + load-time warm-up | Short first audio about 2.409 s | ≈0.674 in representative short test |
| Twenty short sentences | First audio 2.147 s; 20 chunks | ≈0.684; did not block on whole response |
| Uploaded full JFK sample | STT 0.462 s | 11-second clip |
| Prerecorded microphone fixture + scripted reply | STT 0.375 s; first audio 2.872 s | Capture stopped after 3.24 s at a pause |

The fixture microphone test ending at 3.24 seconds is an important limitation: it did **not** transcribe the entire 11-second fixture. It showed the endpoint gate can cut off at a natural pause. The full uploaded-clip test is separate.

Some earlier single-thread/native experiments overlapped other development work; the dashboard notes that these comparisons are directional, not controlled statistical benchmarks. The later resource run is the stronger footprint evidence. All timing samples are small and do not establish p95 latency guarantees.

### 7.4 Native Node CPU measurements — useful comparison, different runtime

Source: [benchmark.json](../../reports/benchmark.json).

| Engine | Warm median | Reported process RSS snapshot |
|---|---:|---:|
| Kokoro Q8 / Heart | 1.126 s, RTF ≈0.315 | 484.3 MiB |
| Whisper Tiny English Q8, 11-second clip | 0.212 s | 770.7 MiB |
| Whisper Base English Q8, same clip | 0.332 s | 867.0 MiB |

These RSS snapshots include previously allocated runtime state and, for STT, Kokoro still resident. They are not isolated per-model requirements, browser peak memory, or native Android measurements. Tiny and Base both had 0 WER on this single clean English fixture; this does not establish equal real-world accuracy.

### 7.5 Storage, cost, and manual observations

- Logical cached model/config payload measured: Tiny **41.52 MiB**, Kokoro **88.09 MiB**, combined **129.61 MiB**, plus voice data, ≈20.6 MiB ONNX WASM, application assets, and cache overhead.
- Earlier `du` numbers of roughly 43 + 96 MiB referred to allocated disk blocks. Do not mix those with logical payload or exact first-download totals.
- The dashboard Kokoro hint still says “About 96 MB.” The detailed resource report clarifies the storage accounting; neither number is a measured RAM requirement. Updating the hint is a small documentation/UI consistency task.
- Model filesize is not live RAM use. Initialization and runtime allocations were much larger.
- Speech inference API fee is $0 for local Whisper/Kokoro. Model distribution, hosting, support, device electricity/battery, and text tokens are separate.
- The calculator's illustrative one-user example is 60 minutes/day × 30 days, 60 turns/hour, 1,000 input + 100 output tokens/turn, $0.25/$2 per million input/output tokens → **$0.81/month in text tokens**. This is arithmetic using assumed prices and usage, not a quote. Repeated conversation history belongs in input-token estimates.
- User screenshots showed first-TTS/first-audio results around **1.62 s** and, with a longer paragraph, **2.97 / 2.98 s**. These are useful manual observations, not repeated controlled benchmarks.
- A TTS-only result displays STT as “—”. It does not indicate STT failed; that path did not invoke recognition.

## 8. Current conclusion for ₹12,000 phones

**Do not certify the full browser Whisper + Kokoro path as a reliably fast default for a general 4 GB budget phone based on these Mac results.** It may run, but startup survival, sustained throughput, battery drain, and three-second TTS startup have not been demonstrated on that class of hardware. A 6 GB phone offers more memory headroom but does not guarantee faster inference.

The next lower-resource candidate is **Whisper Tiny + an installed offline system voice**. It can avoid Kokoro's allocations if Kokoro is never loaded or is properly disposed. Voice quality, offline behavior, STT cost, and overall latency still require testing. This is a candidate for evaluation, not a measured phone recommendation.

Native approaches such as whisper.cpp or sherpa-onnx are also candidates. Their APIs/platform support were researched, but **no native mobile integration exists here**. Do not claim that the faster native Mac result proves native Android will meet the target.

Price alone cannot settle the choice. A physical-phone result must record model, chipset, physical RAM, OS/browser versions, chosen speech models/voices, network/cache state, and test workload.

## 9. Reproduce and operate the current POC

### 9.1 Start the dashboard

```sh
cd /Users/rakshitchopade/Downloads/stt_tts1
npm ci
npm run dev
```

`npm ci` is for a clean dependency installation; skip it when the installed locked dependencies are already usable. It may need network access. Open `http://127.0.0.1:5173` and keep the server process alive while the user tests.

For production-mode local serving:

```sh
npm run build
npm start
```

Do not start a second service on an occupied port or kill an existing user server indiscriminately. Check the port first. If a tool sandbox prevents binding or network access, use that environment's proper approval mechanism; do not diagnose permission failures as app defects.

Service checks:

```sh
curl --fail --silent http://127.0.0.1:5173/api/config
curl --head http://127.0.0.1:5173/
```

There is no health endpoint. A successful `/api/config` response establishes server availability, not working provider credentials.

### 9.2 Short user test procedure

1. Leave **Scripted demo** selected for key-free full-loop testing.
2. Load Whisper for mic/upload recognition.
3. Load Kokoro for local neural voice. Wait for warm-up to finish.
4. Test voice in isolation first; then test an uploaded sample or microphone.
5. Use a longer silence setting or Manual only for hesitant speech, remembering the 20-second cap.
6. For STT alone, disable automatic reply or upload a short audio file.
7. In Benchmarks, provide a reference transcript to calculate WER and export runs before changing experimental conditions.
8. For a system-only test, refresh, choose system voice before loading Kokoro, choose an installed voice reported local, and verify actual offline behavior after required assets have loaded.

### 9.3 Configure real text only when needed

Create `.env` from `.env.example` only if no user configuration already exists. Set a valid provider base URL/model/key, then restart the server and refresh the app. Never overwrite an existing configuration blindly.

For a separately installed compatible local server, the example base URL is `http://127.0.0.1:11434/v1`; its model must already be installed. Running a local text LLM would change the overall CPU/RAM footprint and was not included in the reported figures.

### 9.4 Tests and report generation

```sh
npm test
npm run build
# Requires the dashboard at 127.0.0.1:5173 and installed Google Chrome:
npm run test:browser
# Uses real models and can take several minutes:
TEST_MODELS=1 npm run test:browser
# Native CPU benchmark; downloads assets if necessary:
npm run benchmark
npm run reports
```

- `npm test` currently runs six core tests plus one proxy integration test. The latter starts a temporary provider and an app server on **5179**. It must have localhost binding permission and a free port.
- Browser tests use the installed Google Chrome channel, headless mode, and an isolated persistent `.cache/browser-test` profile. They do not use or reset the user's normal browser profile.
- Real-model browser tests exercise short TTS, scripted text streaming, full uploaded STT, fake-mic capture, 20 sentences, and Stop. Headless audio confirms generation/scheduling, not listening quality.
- The long-response test uses a loose `<20 seconds` startup assertion to catch whole-response blocking; it does **not** assert the user's ≤3-second target or a percentile SLA.
- The Stop browser check verifies that controls become enabled again. It does not measure audible silence onset or prove that active model computation stopped.
- Browser tests overwrite `reports/browser-benchmark.json` when model mode runs; native benchmarking overwrites native reports, public benchmark JSON, and sample WAVs. Aggregators overwrite derived reports. Preserve baseline artifacts before new experiments.

### 9.5 Resource profiling (macOS only)

Prerequisites: installed Google Chrome and macOS Command Line Tools (`xcrun clang`). Start a separate production server so a user's dashboard is not disturbed:

```sh
npm run build
PORT=5180 NODE_ENV=production node server.mjs
# In a second terminal:
npm run profile:resources
npm run profile:report
```

Profiler options:

```sh
PROFILE_URL=http://127.0.0.1:5180 SOAK_SECONDS=300 npm run profile:resources
# Future hour-long Mac test, not previously completed:
SOAK_SECONDS=3600 npm run profile:resources
```

The soak finishes its final cycle, so wall duration exceeds the requested minimum. It runs STT uploads followed by TTS playback; it is not one hour of uninterrupted microphone recording, acoustic full duplex, or a real paid-LLM conversation.

The profiler compiles `.cache/bin/process-metrics`, launches `.cache/resource-profile`, identifies its owned Chrome tree, samples resources, runs load/idle/STT/TTS/soak phases, writes reports, and closes its browser. It excludes unrelated browser sessions and reads process IDs/parents rather than capturing unrelated command lines.

Optional independent CPU-counter check, after the helper exists:

```sh
node scripts/check-process-metrics.mjs
```

Preserve old results before rerunning; scripts write fixed filenames. Run one resource benchmark at a time. The resource summarizer rejects incomplete profiles, but its report title currently hardcodes **29 October 2026**, and `completedAt` in the derived summary is generation time. Fix provenance/dating when extending reporting; do not relabel old measurements as new just by regenerating summaries.

### 9.6 Phone connection prerequisites

- The default server is loopback-only. Opening `127.0.0.1` on a phone targets the phone, not the development Mac.
- `HOST=0.0.0.0` exposes a LAN listener but does not provide HTTPS. Real microphone access generally requires a secure context.
- Prepare a trusted HTTPS path or a deliberate device development setup, and verify microphone permission, isolation headers, workers, and audio playback on the actual phone.
- Do not publicly expose the paid-key text proxy as a shortcut. A demo-only controlled test can avoid paid-provider credentials.
- Android ADB/Perfetto/PSS tooling has not been integrated. The last resource investigation had no actual phone and no available adb installation; recheck tools/device availability when resuming rather than assuming that old environment state persists.

## 10. Known user-facing issues and troubleshooting history

| User observation | Explanation established so far | Action / remaining improvement |
|---|---|---|
| “127.0.0.1 refused to connect” | Local server was not running | Start server, verify route, keep process alive for user testing; no auto-start service exists |
| “Load the Whisper model in Engine setup first” | Speak was clicked before explicit engine load | Load Whisper; improve readiness/onboarding because button affordance was confusing |
| “Configure your text provider in .env first” | Live Text model mode selected without provider config | Use Scripted demo for key-free testing or configure provider; this is not STT failure |
| “Is it just five seconds?” / pauses end recording | Silence endpoint triggered; hard cap is 20 s | Explain the two separate limits; longer silence/manual may help, continuous mode remains absent |
| Longer paragraph starts at about 2.98 seconds | Bounded first-chunk synthesis, not whole paragraph completion | Evidence of acceptable startup on that machine, not guaranteed future latency |
| “Will an hour stay equally fast?” | No hour-long measured result yet | Distinguish repeated short turns, continuous dictation, and long TTS; qualify thermals/memory |
| “Can a ₹12,000 phone bear it?” | Mac footprint/CPU are a warning signal, not phone measurements | Run actual-device comparison; consider lighter voice path |

Do not claim these UX issues were fixed merely because they were explained. In particular, engine readiness remains explicit, continuous recording is still absent, and no paid provider is preconfigured.

## 11. Automated work remaining — recommended order

These are proposed next tasks, not completed features. The user gave broad latitude to improve the POC; choose reasonable details autonomously and keep evidence for each experiment.

### Priority 1: Make the current experiment reliable and easy to test

1. **Improve readiness and configuration UX.** Make Speak/Test voice clearly guide loading or load on demand with visible progress. Separate downloading, initializing, warming, ready, and failed states. Apply provider readiness checks consistently to typed and mic auto-reply paths. Keep STT-only available without a text provider. Acceptance: a fresh user can reach a key-free successful speech test without unexplained prerequisite toasts; missing provider fails before wasting a full conversational attempt.
2. **Explicit model lifecycle/release.** Dispose Kokoro when switching to a lighter mode if that is the chosen policy; reset readiness coherently; consider an explicit unload control. Test switching/reloading/canceling without stale output or unresolved promises. Acceptance: system-only profiling no longer accidentally includes an unused resident Kokoro worker. Memory reclamation may lag, so measure rather than promise instant release.
3. **Preserve report provenance.** Write new runs to timestamped/configuration-specific locations, record code commit, hardware/browser/runtime, input set, warm/cold state, thread/isolation settings, errors, and actual run duration. Correct hardcoded report dating. Keep the October baseline available. Acceptance: another AI can compare runs without silently overwriting or mixing them.
4. **Strengthen performance reporting.** Add repeated p50/p95 latency, actual first-audio scheduling, chunk durations/gaps, throughput, failures, and longer-session memory trends. Do not label a JS-heap measurement as whole-app RAM. For desktop OS profiling use the existing helper; for Android use platform tools. Acceptance: dashboard/export distinguishes per-run samples, aggregated evidence, and target failures.

### Priority 2: Evaluate the lower-resource route

5. **Whisper Tiny + system voice comparison.** Run fresh isolated sessions, with Kokoro never loaded, and record voice identity/locality, cold and warm behavior, quality observations, STT footprint, and overall process cost. Repeat on an actual phone when available. Acceptance: an evidence-based tradeoff table, not just “system voice is lighter.”
6. **Long-session desktop regression.** After immediate lifecycle issues are addressed, use the existing hour-duration option or improve it to mimic actual duty cycles. Include engine switching and cancellation as separate stress tests. Acceptance: complete raw results, bounded memory assessment, early/late latency, and clear exclusion of phone/battery claims.
7. **Representative speech set.** Expand beyond JFK: several speakers, accents relevant to the user, pauses, noise, quiet speech, numbers, names, and varying lengths. Capture references and WER, plus endpoint cutoff/false-trigger counts. Use appropriately shareable fixtures; do not publish private speech accidentally. Acceptance: quality claims based on a small but varied documented test set.
8. **Compare other engine/runtime candidates if results justify it.** Native whisper.cpp/sherpa-onnx, other smaller local TTS, quantization/backends, or system speech interfaces can be evaluated. Research current primary docs/licenses before implementation; historical suggestions are not current compatibility guarantees. Compare total resource cost and voice quality as well as startup. Do not add a dependency merely because it is popular.

### Priority 3: Build conversation behavior beyond a short-utterance POC

9. **Continuous/session capture.** Build bounded rolling audio buffers, a real VAD or improved endpoint design, incremental recognition/overlap reconciliation, backpressure, and session transcript accumulation if continuous dictation or hands-free conversation is selected. Do not simply change the 20-second cap to 3,600 seconds and buffer an hour before inference. Acceptance: ongoing capture stays bounded, recognizes during the session, preserves speech across pauses/chunk boundaries, and shows meaningful lag.
10. **Interruption and background behavior.** Evaluate acoustic barge-in only with echo handling and real-device testing. Handle app background/resume, suspended AudioContext, permission denial/revocation, and interrupted model loads. Acceptance: the UI recovers cleanly and does not speak stale responses.
11. **Streaming failure cleanup.** Audit provider error/disconnect paths while audio is already playing or queued, then add focused failure tests. Existing Stop behavior is not proof that every upstream failure cancels queued playback. Add bounded text-output/queue policies for unusually long responses. Acceptance: a failed stream leaves a coherent state with no unexpected stale speech.

### Priority 4: Integration and deployment readiness

12. **Real text provider smoke test.** Once a provider/model is selected and credentials are available, validate actual streamed text and full-loop timings at controlled cost. Record provider first-token, chunk availability, TTS, and total latency separately. Existing fixture integration does not establish a particular provider's compatibility.
13. **Phone testing support.** Automate export/session IDs, a trusted test-serving setup, and Android resource collection where possible. Create a repeatable test checklist that the user can run with minimal guidance. Actual on-device permission, cables, listening, and battery conditions remain physical tasks.
14. **Native mobile app, if required by qualification results.** Select a native/wrapper architecture based on measured browser limits and platform needs. No framework choice has been committed. A WebView wrapper alone is not proof of lower inference RAM or better performance.
15. **Deployment controls.** Add auth, quotas, abuse protection, error hygiene, HTTPS/isolation verification, appropriate data retention controls, and licensing/distribution review before public use. Add deployment files/CI if a hosting target is selected. No deployment platform or domain is currently agreed.

## 12. Manual/device work and decisions that remain

The AI should prepare everything it can first. The following cannot be truthfully completed by another desktop-only benchmark:

| Needed input or action | Why it matters | Work the AI can do before asking |
|---|---|---|
| Exact target phone model, chipset, physical RAM, OS/browser | Defines realistic compatibility/performance target | Prepare results schema, testing workflow, lighter engine mode |
| Physical phone access, USB debugging if profiling, microphone permission | Required for actual capture, resource and lifecycle observations | Prepare app serving and scripts; explain only needed setup |
| Listening to chosen voices | Naturalness, pronunciation, accents, chunk transitions are perceptual | Produce fixed comparison samples/text and a short rating sheet |
| 30–60 minute real device session | Heat, battery drain, throttling, app switching, tab survival | Automate workload timing/export; record initial conditions |
| Acceptable voice-quality/locality compromise | System voice can vary by platform and installation | Demonstrate candidate voices and measured resource differences |
| Main languages and accents | English-only setup cannot qualify Hinglish/Hindi | Document current scope and prepare multilingual candidate investigation |
| Repeated short conversation vs continuous dictation | These require different capture/context behavior | Preserve short-turn flow and design bounded continuous mode |
| Text provider/model and available credentials | Needed for real dynamic replies and real token budget | Keep working demo/fixture tests; prepare server configuration |
| Hosting/mobile delivery target | Affects HTTPS, model delivery, isolation, native packaging | Keep modular code and document deployment requirements |

Do not ask all of these at once. Ask the smallest question that unblocks the next meaningful task. The current handoff request itself does not require the user to decide any of them.

### Suggested phone qualification gates

These are proposed engineering acceptance criteria, not past achievements:

- First installation/load succeeds with normal background apps and without tab/process death; record actual downloads and startup time.
- Warm TTS first-audio p95 ≤3 seconds across a documented reply set; separately record text-provider and STT latency.
- TTS RTF stays below 1 with margin; ≤0.7 is a useful proposed target, not a universal standard.
- STT accuracy and endpointing are acceptable on relevant speakers/noise/pauses; establish a dataset-specific acceptance target rather than inventing one from JFK.
- Memory remains bounded over 30–60 minutes, including app switching and resume. Capture Android PSS for all relevant Chrome/isolated renderer processes, not only the main PID.
- Record battery before/after, temperature/thermal state where available, screen brightness/network/charging state, and early/late latency. Agree on acceptable battery/heat limits after seeing actual measurements.
- Test a genuinely offline installed voice with network disabled after required assets are present; do not infer offline operation from a generic “system voice” label.
- No repeated model reloads, stale speech, runaway queues, or unrecoverable microphone/audio state in realistic use.

## 13. Claims the next AI must not make

- “This is production-ready / phone-ready / ChatGPT-equivalent.” None is established.
- “The app uses only ~130 MB RAM.” That is an approximate model payload, not runtime RAM.
- “771 MiB is the browser footprint.” It was a native cumulative process snapshot.
- “A 4 GB phone will definitely run it smoothly because 2 GiB is less than 4 GB.” OS, other apps, runtime differences, peaks, CPU, and thermals matter.
- “Six GB RAM guarantees faster speech.” RAM capacity and compute speed are different constraints.
- “The five-minute run proves one-hour battery/thermal stability.” No physical-device power test exists.
- “All audio is guaranteed offline in every mode.” System voices can be remote; initial model distribution also uses network.
- “Demo TTFT is the real LLM latency.” It is a scripted stream.
- “Manual only supports unlimited recording.” The hard cap remains 20 seconds.
- “Whisper's internal chunk options provide live STT.” Capture is currently utterance-based.
- “Zero WER means excellent recognition for all users.” One clean sample is not representative.
- “Warm-up removed first-load cost.” It moved inference work into setup.
- “Switching to system TTS frees Kokoro.” Not in the baseline code.
- “A completed mobile screenshot is phone validation.” It is desktop layout testing.
- “The selected repository is deployed as a live service.” GitHub stores code; no production hosting was completed.

## 14. Git, secrets, and publishing continuity

The initial code was pushed at the user's explicit request to `origin/main`. Verified full commit: `55c4276850de7aa24ebe12033855b3be60472cb9`. The repository contains application code, lockfile, tests, scripts, documentation, JSON/log/CSV benchmark artifacts, and the two sample WAVs.

`.gitignore` excludes `node_modules/`, `dist/`, `.cache/`, `.env`, `.env.*` except `.env.example`, `.DS_Store`, and `reports/*.png`. Historical dashboard screenshots may exist locally but are not on GitHub. Do not upload browser profiles, credentials, model caches, or private user recordings/transcripts. Review generated reports before publication.

This document adds no API credentials and requires no new hosted service. A later AI should check current Git status before edits, preserve user changes, and report whether any new work has actually been committed/pushed. Do not treat the old successful push as proof that future local edits are already remote.

No `AGENTS.md` was found in the repository during this handoff audit. A future environment may introduce instructions; inspect them if present. Tool/sandbox permissions and installed plugins can differ between chats. Respect the new session's actual environment rather than relying on old tool IDs or previously running shell sessions.

## 15. Sources and how to update this document

For current implementation and measurements, prefer the local source and reports linked above. Existing historical external references include:

- Transformers.js backend guide: https://huggingface.co/docs/transformers.js/guides/webgpu
- Kokoro model: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- Whisper Tiny: https://huggingface.co/onnx-community/whisper-tiny.en
- Whisper Base: https://huggingface.co/onnx-community/whisper-base.en
- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- sherpa-onnx: https://k2-fsa.github.io/sherpa/onnx/index.html
- Android memory: https://developer.android.com/topic/performance/memory-management
- Android dumpsys: https://developer.android.com/tools/dumpsys
- Android voice network requirement: https://developer.android.com/reference/android/speech/tts/Voice#isNetworkConnectionRequired()

These are research entry points retained from prior work, not a fresh November dependency/pricing survey. Recheck primary documentation before choosing new versions, pricing, models, licenses, or a native integration. The original repo has no project LICENSE file; review code/model/runtime/phonemizer/voice redistribution obligations before shipping. A permissive model-weight license does not settle every dependency's obligations.

When new work is completed, update status, code commit, evidence paths, actual test environment, and remaining blockers here. Keep measured results separate from estimates and proposals. Archive old data instead of rewriting history.

## 16. Copy-and-paste prompt for the new AI chat

> Continue the Voice Lab project in `/Users/rakshitchopade/Downloads/stt_tts1`. First read `dev_ref/handoff/HANDOFF.md`, then inspect the current Git state, README, and resource assessment. Preserve the working Whisper Tiny + Kokoro browser POC and its measured baseline. My goal is very low recurring speech cost with good STT/TTS responsiveness for web and affordable smartphones, including about one hour of daily use. The desktop POC works, but budget-phone suitability, continuous STT, native mobile integration, and one-hour physical-device endurance are not proven. Take routine implementation and testing decisions yourself, keep the dashboard clear, compare alternatives with actual evidence, and clearly distinguish completed tests from assumptions. Start with the highest-value unfinished automated work in the handoff, especially engine lifecycle/readiness and a fair lower-resource system-voice comparison, while preparing physical-phone qualification. Ask only for device access, credentials, or preferences that genuinely block the next step. Keep progress and evidence documented, and do not claim phone readiness from Mac measurements.

## 17. Where to start and when to stop

**Start:** read this document → verify repo/process state → inspect the existing reports → select one small next experiment or fix with a measurable outcome. If interactive testing is needed, start the dashboard and verify it is reachable before handing the URL to the user. Do not rerun every expensive benchmark just to rediscover the existing baseline.

**Next useful milestone:** a fair comparison of the full local neural stack versus a genuinely lower-resource voice path, with correct model unloading, repeatable results, and a ready-to-run physical-phone procedure.

**Broader POC completion:** a documented recommended configuration (or explicit fallback decision), representative accuracy/listening results, actual target-device resource/latency/endurance evidence, and a usable deployment/integration path with remaining costs and limitations explained. If target hardware cannot satisfy both cost and UX constraints, report that tradeoff clearly with the measured alternatives.

**Current stopping point:** documentation is complete; implementation remains the pushed desktop baseline. No phone has been certified, no one-hour test has been completed, and no new architecture was silently substituted while writing this handoff.
