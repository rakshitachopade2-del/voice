# Voice Lab

A working, local-first speech POC with a responsive dashboard. The experiment is **Whisper STT → streamed text → chunked Kokoro TTS**, with a system-voice alternative. Speech inference runs in browser workers. No speech API key is required.

## Run

Requires Node.js 22+ and a modern browser. Chrome is the tested browser.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. For a production build served locally:

```sh
npm run build
npm start
```

1. Click **Load Whisper**, then **Load Kokoro**. Loading Kokoro includes a real inference warm-up; changing its voice requires loading again. Initial downloads can take a while; progress appears at the bottom right. Browser model caches and the native benchmark cache are separate.
2. Click **Test voice** for isolated TTS, or **Start speaking** for the full scripted loop. Recording stops after a short silence, on a second click, or after 20 seconds. Choose **Manual only** under End silence for speech with long pauses.
3. **Scripted demo** deliberately returns a fixed response. It exercises real speech inference without pretending to be an LLM. Switch to **Text model** after configuring a real provider.
4. Upload a short audio file to test STT alone. This repository includes `public/samples/jfk.wav`. Clips are limited to 30 seconds / 20 MB; compressed formats depend on browser decoders.
5. In **Benchmarks**, enter a reference transcript before recording/uploading to measure word error rate. Export results as JSON. History and transcripts are saved in browser local storage, capped at 100 runs; audio is not saved.
6. **Stop** cancels playback and discards pending results. It does not preempt an ONNX kernel already executing. There is no automatic acoustic barge-in; stop, then start recording again.

## Optional text model

Copy `.env.example` to `.env`, set `LLM_MODEL`, `LLM_API_KEY`, and `LLM_BASE_URL`, then restart. Any compatible `/chat/completions` streaming endpoint can be used. The key stays on the Node server. Nothing is sent to the text provider in scripted mode. For a separately installed Ollama server, use `LLM_BASE_URL=http://127.0.0.1:11434/v1`, an installed model name, and no API key.

The live connection sends transcript text and up to six previous conversation turns. Conversation context is memory-only and resets on refresh. Model availability and charges depend on your provider. A real paid provider was not called during validation; the streaming proxy is tested against a local fixture server.

## What is implemented

- Whisper Tiny English and Base English, quantized Q8, with WASM CPU (up to four threads when cross-origin isolated) by default and an opt-in WebGPU backend.
- Kokoro 82M Q8 in a dedicated worker, four selectable English voices, and an OS/browser voice fallback.
- Microphone capture with echo cancellation, noise suppression, energy-based endpoint detection, and 16 kHz mono resampling.
- Incremental sentence/clause splitting, with a maximum opening chunk of 64 characters and subsequent chunks of 160 characters. One upcoming audio chunk is synthesized while the current chunk plays. Long responses do not wait for all sentences to be analyzed.
- Playback interruption, model progress/errors, reference-based WER, exportable measurements, runtime comparisons, and an editable cost calculator.
- Server-side text credentials, streaming SSE parsing across arbitrary network boundaries, bounded conversation input, disconnect cancellation, and a 90-second provider timeout.

## Measurements and limits

`reports/benchmark.json` contains native ONNX CPU results. `reports/browser-benchmark.json` contains real headless Chrome WASM measurements when the model browser test is run. These runtime results must not be conflated. The dashboard includes the development-machine report separately from your own browser runs.

- **STT processing:** inference only, after audio decode/resampling. Recording and end-of-speech detection are excluded.
- **First TTS chunk:** phonemization + synthesis for the first bounded chunk. For system voices it measures time to the start event, not a separate synthesis phase.
- **Turn → first audio:** from text submission or recording completion to scheduling the first audio buffer / receiving the system voice start event. Includes decode and STT for microphone input. Excludes endpoint silence (default 700 ms), microphone stop/encoding finalization, and hardware output latency.
- **TTS RTF:** total synthesis time divided by generated audio duration. Below 1 is necessary to keep up on average; worst-case chunks can still cause gaps.
- **First inference** in the native/earlier browser reports includes model warm-up. The final browser implementation prewarms Kokoro in its Load step. **Load time** can include download, disk/browser cache reads, and session initialization. A second run is not a cold-start benchmark.
- Headless audio playback verifies buffer generation and scheduling; it does not replace listening to naturalness, pronunciation, or clicks/gaps.
- WER on one clean JFK clip is a smoke test, not a representative accuracy score. English-only models here do not establish Hindi/Hinglish or other language suitability.

The POC uses utterance-based STT, not streaming partial transcripts, and a simple energy gate, not a trained VAD. The automated microphone fixture ended at its first long pause (3.24 seconds), illustrating why silence settings need real-speaker testing; the separate uploaded STT test uses the full 11-second clip. It is not a recreation of ChatGPT's private architecture or its emotional/prosodic capabilities.

## Mobile path

The UI is responsive; mobile browser inference is implemented through the same WASM path. A native mobile app is **not** included. Actual iOS/Android performance, sustained heat/battery behavior, and memory pressure have not been verified. Retain the server's `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers when hosting. Without cross-origin isolation, the engine falls back to one WASM thread, which missed the latency target in our test. WebGPU is optional and adapter/model support can vary; select CPU if GPU loading fails.

For phone testing, serve the production app through HTTPS on your own trusted network. Microphone access on a plain HTTP LAN address generally will not work. The server binds to loopback by default. Setting `HOST=0.0.0.0` alone does not solve HTTPS. Do not publicly expose the text proxy with a paid key: this local POC has no user auth, quotas, or rate limiting. Add those before deployment.

For a native release, evaluate [sherpa-onnx](https://k2-fsa.github.io/sherpa/onnx/index.html) for native streaming ASR/TTS or [whisper.cpp](https://github.com/ggml-org/whisper.cpp) for native Whisper. Their platform support is documented; performance with your selected models must still be measured. A system TTS fallback trades voice consistency for lower memory use. Neither native adapter is claimed to be implemented here.

## Cost interpretation

Local STT/TTS has **$0 per-minute speech inference API fees**. That excludes model distribution, application hosting, device battery/electricity, support, and text-model charges. Browser storage can evict cached models; offline operation requires all assets/models/selected voices to remain available. This app is not an offline-installable PWA.

The calculator's default prices are deliberately labeled illustrative, not live pricing. At 60 minutes/day for 30 days, 60 turns/hour, 1,000 input and 100 output tokens/turn, and illustrative $0.25/$2 per million input/output tokens, text alone is $0.81 per user/month. Include all repeated history in input token estimates and replace the prices with your chosen provider's rates.

Browser system voices may be remote. The selector marks reported local/network voices; default voice locality is unknown. Browser `SpeechRecognition` is not used because implementation support and server dependence make it unsuitable as a guaranteed offline default.

## Verification

```sh
npm test                      # chunk boundaries, WER, costs, SSE, proxy integration
npm run build                 # production bundling
npm run benchmark             # real models in native Node CPU; downloads cached in .cache
npm run test:browser           # UI, responsive layout, errors, navigation, calculator
TEST_MODELS=1 npm run test:browser  # real browser TTS, STT, playback queue, stop
```

Start the app first for browser tests. Tests use the installed Google Chrome; change Playwright's `channel` if needed. `npm run benchmark` downloads model weights and a public JFK speech sample, writes WAV output, and saves machine-readable reports. Browser tests also exercise the microphone path with a prerecorded device fixture and a 20-sentence response. Native process RSS measurements include all allocated state, not model-only RAM. Model benchmarking is resource intensive; run one benchmark at a time for comparison-quality results.

## Sources and licenses

Research checked 28 October 2026. Pinned dependency versions are in `package-lock.json`.

- [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu): local inference and backend support.
- [Kokoro ONNX model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX): model, voices, quantizations, Apache-2.0 weights.
- [Kokoro JS package](https://www.npmjs.com/package/kokoro-js): supported runtime and streaming interfaces.
- [Whisper Tiny model](https://huggingface.co/onnx-community/whisper-tiny.en) and [Whisper Base model](https://huggingface.co/onnx-community/whisper-base.en): model artifacts and licenses.
- [OpenAI streaming documentation](https://developers.openai.com/api/docs/guides/streaming-responses): optional streamed text API; no claim about ChatGPT's internal voice implementation.
- [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition): browser support and server-side implementations.
- [whisper.cpp JFK fixture](https://github.com/ggml-org/whisper.cpp/tree/master/samples): clean speech smoke-test input.

Review the selected model, runtime, phonemizer, voice assets, and distribution obligations before shipping a commercial native/bundled version. Kokoro's JavaScript path depends on an eSpeak-based phonemizer; do not assume that a permissive model-weight license covers every dependency.

## Browser RAM and CPU measurements

The native RAM snapshots above are not browser peak memory. A separate macOS profiler measures the production browser's full process tree (including workers and utility processes), with cached loading, isolated STT, short TTS, and a five-minute mixed workload. It leaves the regular dashboard session untouched.

See [the resource assessment](reports/resource-assessment.md), [summary JSON](reports/resource-summary.json), and [raw timeline CSV](reports/resource-timeline.csv). The assessment separates measured Mac results from the unverified budget-Android suitability judgment.

```sh
# Start a separate production instance after npm run build:
PORT=5180 NODE_ENV=production node server.mjs
# In another terminal:
npm run profile:resources
npm run profile:report
```

Requires Google Chrome and macOS Command Line Tools. `SOAK_SECONDS=3600 npm run profile:resources` requests an hour-long run; the default is 300 seconds, finishing its final full cycle. Do not mistake a successful Mac run, a mobile viewport, or desktop CPU throttling for validation on a physical phone.
