import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AudioLines,
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  FlaskConical,
  Headphones,
  Layers,
  Mic,
  Play,
  Settings2,
  Square,
  Upload,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  SpeechEngine,
  Player,
  decodeAudio,
  recordAudio,
  systemSpeak,
} from "./audio.js";
import {
  takeChunk,
  readSSE,
  wordErrorRate,
  estimateCost,
  SAMPLE_TEXT,
} from "./core.mjs";
import "./style.css";
import { ExperimentResults } from "./Experiments.jsx";
const fmt = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(2)}s`);
const readRuns = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("voice-lab-runs") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};
function App() {
  const [tab, setTab] = useState("Playground"),
    [sttModel, setSttModel] = useState("onnx-community/whisper-tiny.en"),
    [device, setDevice] = useState("wasm"),
    [ttsType, setTtsType] = useState("kokoro"),
    [voice, setVoice] = useState("af_heart"),
    [systemVoice, setSystemVoice] = useState(""),
    [voices, setVoices] = useState([]);
  const [ready, setReady] = useState({ stt: false, tts: false }),
    [loading, setLoading] = useState(""),
    [progress, setProgress] = useState(""),
    [status, setStatus] = useState("Ready when you are"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false),
    [level, setLevel] = useState(0);
  const [text, setText] = useState("How can we make voice AI more affordable?"),
    [speechText, setSpeechText] = useState(SAMPLE_TEXT),
    [reference, setReference] = useState(""),
    [transcript, setTranscript] = useState(""),
    [reply, setReply] = useState(""),
    [mode, setMode] = useState("demo"),
    [config, setConfig] = useState({}),
    [metrics, setMetrics] = useState({}),
    [runs, setRuns] = useState(readRuns),
    [hostReport, setHostReport] = useState(null),
    [autoReply, setAutoReply] = useState(true),
    [silence, setSilence] = useState(700);
  const engines = useRef({}),
    player = useRef(new Player()),
    runId = useRef(0),
    stopRecord = useRef(null),
    abort = useRef(null),
    fileInput = useRef(null),
    history = useRef([]),
    recordCancelled = useRef(false);
  const [cost, setCost] = useState({
    users: 100,
    minutes: 60,
    days: 30,
    inputShare: 0.5,
    sttRate: 0.003,
    ttsRate: 0.015,
    turnsPerHour: 60,
    inputTokens: 1000,
    outputTokens: 100,
    inputPrice: 0.25,
    outputPrice: 2,
  });
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
    fetch("/benchmark.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setHostReport)
      .catch(() => {});
    const update = () =>
      setVoices(
        speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")),
      );
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "voice-lab-runs",
        JSON.stringify(runs.slice(0, 100)),
      );
    } catch {
      /* Storage can be disabled or full; live testing still works. */
    }
  }, [runs]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  function reportProgress(p) {
    if (p.status === "progress")
      setProgress(
        `${p.file?.split("/").pop() || "Model"} · ${Math.round(p.progress || 0)}%`,
      );
    else
      setProgress(
        p.status === "ready"
          ? "Model ready"
          : p.status === "initiate"
            ? "Fetching model files…"
            : p.status || "Preparing…",
      );
  }
  async function load(kind) {
    setError("");
    setLoading(kind);
    setProgress("Starting download…");
    try {
      engines.current[kind]?.dispose();
      const engine = new SpeechEngine(reportProgress);
      engines.current[kind] = engine;
      const result = await engine.call(`load-${kind}`, {
        model: sttModel,
        device,
        voice,
      });
      setReady((r) => ({ ...r, [kind]: true }));
      setStatus(
        `${kind.toUpperCase()} loaded in ${fmt(result.loadMs)} · ${kind === "tts" ? "voice warmed up" : "first inference may warm up"}`,
      );
    } catch (e) {
      setError(e.message);
      setReady((r) => ({ ...r, [kind]: false }));
    } finally {
      setLoading("");
      setProgress("");
    }
  }
  function changeStt(value) {
    engines.current.stt?.dispose();
    delete engines.current.stt;
    setReady((r) => ({ ...r, stt: false }));
    setSttModel(value);
  }
  function stop() {
    runId.current++;
    abort.current?.abort();
    player.current.stop();
    recordCancelled.current = true;
    stopRecord.current?.();
    stopRecord.current = null;
    setRecording(false);
    setBusy(false);
    setLevel(0);
    setStatus("Stopped · queued speech discarded");
  }
  function saveRun(data) {
    const row = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      sttModel,
      device,
      ttsEngine: ttsType,
      voice: ttsType === "kokoro" ? voice : systemVoice || "system default",
      ...data,
    };
    setRuns((r) => [row, ...r].slice(0, 100));
  }
  async function speakStream(
    stream,
    { id, started, baseMetrics = {}, kind = "conversation", input = "" },
  ) {
    const llmStarted = performance.now();
    let queuedChunks = 0;
    let buffer = "",
      answer = "",
      genChain = Promise.resolve(),
      playChain = Promise.resolve(),
      first = true,
      firstToken = null,
      firstChunkMs = null,
      firstAudio = null,
      totalGen = 0,
      audioDuration = 0,
      chunks = 0,
      queueError = null;
    const active = () => id === runId.current;
    const enqueue = (chunk) => {
      queuedChunks++;
      genChain = genChain
        .then(async () => {
          if (!active() || queueError) return;
          const t = performance.now();
          let result;
          if (ttsType === "kokoro")
            result = await engines.current.tts.call("speak", {
              text: chunk,
              voice,
            });
          if (!active()) return;
          const elapsed = result?.ms ?? null;
          totalGen += elapsed || 0;
          audioDuration += result ? result.audio.length / result.sampleRate : 0;
          chunks++;
          if (firstChunkMs === null && elapsed !== null) firstChunkMs = elapsed;
          await playChain;
          if (!active()) return;
          const onStart = () => {
            if (first) {
              first = false;
              firstAudio = performance.now() - started;
              const m = {
                ...baseMetrics,
                ttft: firstToken,
                tts: firstChunkMs,
                firstAudio,
              };
              setMetrics(m);
            }
            setStatus("Speaking · next chunk prepares in parallel");
          };
          playChain =
            ttsType === "kokoro"
              ? player.current.play(result.audio, result.sampleRate, onStart)
              : systemSpeak(chunk, systemVoice, () => {
                  if (firstChunkMs === null)
                    firstChunkMs = performance.now() - t;
                  onStart();
                });
          playChain = playChain.catch((e) => {
            queueError = e;
          });
        })
        .catch((e) => {
          queueError = e;
        });
    };
    for await (const token of stream) {
      if (!active()) return;
      if (firstToken === null) firstToken = performance.now() - llmStarted;
      answer += token;
      setReply(answer);
      buffer += token;
      let chunk;
      while (
        ([chunk, buffer] = takeChunk(
          buffer,
          false,
          queuedChunks === 0 ? 64 : 160,
        ))[0]
      )
        enqueue(chunk);
    }
    let chunk;
    while (
      ([chunk, buffer] = takeChunk(
        buffer,
        true,
        queuedChunks === 0 ? 64 : 160,
      ))[0]
    )
      enqueue(chunk);
    await genChain;
    await playChain;
    if (queueError) throw queueError;
    if (!active()) return;
    const result = {
      ...baseMetrics,
      ttft: kind === "tts" ? null : firstToken,
      tts: firstChunkMs,
      firstAudio,
      rtf: audioDuration ? totalGen / (audioDuration * 1000) : null,
      chunks,
    };
    setMetrics(result);
    saveRun({ kind, input, output: answer, ...result });
    setStatus("Complete · measurements saved on this device");
    if (kind === "conversation" && mode === "live")
      history.current = [
        ...history.current,
        { role: "user", content: input },
        { role: "assistant", content: answer },
      ].slice(-12);
  }
  async function* demoStream() {
    const s =
      "Yes, we can keep speech costs close to zero. Recognition and voice generation run right here on your device. Only the text model needs a server. This is a scripted demo, so you can measure the speech pipeline without an API key.";
    for (const t of s.match(/\S+\s*/g)) {
      await new Promise((r) => setTimeout(r, 25));
      yield t;
    }
  }
  async function* liveStream(prompt) {
    abort.current = new AbortController();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...history.current, { role: "user", content: prompt }],
      }),
      signal: abort.current.signal,
    });
    if (!response.ok) throw Error((await response.json()).error);
    for await (const data of readSSE(response.body)) {
      if (data === "[DONE]") return;
      const item = JSON.parse(data);
      if (item.error) throw Error(item.error);
      if (item.text) yield item.text;
    }
  }
  function requireTts() {
    if (ttsType === "kokoro" && !ready.tts)
      throw Error("Load the Kokoro voice in Engine setup first.");
  }
  async function runText(onlyTts = false) {
    if (busy || loading) return;
    setError("");
    const id = ++runId.current;
    try {
      requireTts();
      if (!(onlyTts ? speechText : text).trim())
        throw Error("Enter some text first.");
      if (!onlyTts && mode === "live" && !config.configured)
        throw Error("Configure your text provider in .env first.");
      await player.current.unlock();
      setBusy(true);
      setReply("");
      setMetrics({});
      setStatus(
        onlyTts ? "Generating first speech chunk…" : "Waiting for first text…",
      );
      const input = onlyTts ? speechText : text;
      await speakStream(
        onlyTts
          ? (async function* () {
              yield input;
            })()
          : mode === "demo"
            ? demoStream()
            : liveStream(input),
        {
          id,
          started: performance.now(),
          kind: onlyTts ? "tts" : "conversation",
          input,
        },
      );
    } catch (e) {
      if (id === runId.current) {
        setError(e.message);
        setStatus("Run could not complete");
      }
    } finally {
      if (id === runId.current) setBusy(false);
    }
  }
  async function transcribeFile(file, id, started, respond) {
    try {
      setStatus("Transcribing on your device…");
      const audio = await decodeAudio(file);
      if (id !== runId.current) return;
      const r = await engines.current.stt.call("transcribe", { audio });
      if (id !== runId.current) return;
      setTranscript(r.text);
      setText(r.text);
      const base = {
        stt: r.ms,
        clipSeconds: audio.length / 16000,
        wer: reference.trim() ? wordErrorRate(reference, r.text) : null,
      };
      setMetrics(base);
      if (respond && r.text) {
        requireTts();
        setStatus("Waiting for first text…");
        await speakStream(mode === "demo" ? demoStream() : liveStream(r.text), {
          id,
          started,
          baseMetrics: base,
          input: r.text,
        });
      } else {
        saveRun({ kind: "stt", input: reference, output: r.text, ...base });
        setStatus(
          r.text
            ? "Transcript ready · edit it before sending if needed"
            : "No words recognized",
        );
      }
    } catch (e) {
      if (id === runId.current) {
        setError(e.message);
        setStatus("Run could not complete");
      }
    } finally {
      if (id === runId.current) {
        setBusy(false);
        setRecording(false);
        setLevel(0);
      }
    }
  }
  async function microphone() {
    if (recording) {
      stopRecord.current?.();
      return;
    }
    if (busy || loading) return;
    setError("");
    try {
      if (!ready.stt)
        throw Error("Load the Whisper model in Engine setup first.");
      if (autoReply) requireTts();
      await player.current.unlock();
      const id = ++runId.current;
      recordCancelled.current = false;
      setBusy(true);
      setRecording(true);
      setTranscript("");
      setMetrics({});
      setStatus(
        silence
          ? "Listening · stops after a short silence"
          : "Listening · tap Finish recording when done",
      );
      const stopCapture = await recordAudio({
        onLevel: setLevel,
        silenceMs: silence,
        onFinish: (blob, heard) => {
          stopRecord.current = null;
          if (recordCancelled.current || id !== runId.current) return;
          setRecording(false);
          if (!heard) {
            setBusy(false);
            setLevel(0);
            setStatus(
              "No speech detected · move closer or try an uploaded clip",
            );
            return;
          }
          transcribeFile(blob, id, performance.now(), autoReply);
        },
      });
      if (id !== runId.current) stopCapture();
      else stopRecord.current = stopCapture;
    } catch (e) {
      setError(e.message);
      setBusy(false);
      setRecording(false);
    }
  }
  async function upload(file) {
    if (!file) return;
    setError("");
    try {
      if (!ready.stt) throw Error("Load Whisper before uploading audio.");
      if (file.size > 20e6)
        throw Error("Choose an audio file smaller than 20 MB.");
      const id = ++runId.current;
      setBusy(true);
      setTranscript("");
      setMetrics({});
      await transcribeFile(file, id, performance.now(), false);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
            runs,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "voice-lab-results.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const costs = estimateCost(cost),
    disabled = busy || !!loading;
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-icon">
            <AudioLines size={23} />
          </span>
          voice<span className="brand-light">lab</span>
          <span className="beta">POC</span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {[
            [AudioLines, "Playground"],
            [Activity, "Benchmarks"],
            [Layers, "Compare engines"],
            [Wallet, "Cost calculator"],
          ].map(([Icon, name]) => (
            <button
              className={tab === name ? "nav active" : "nav"}
              onClick={() => setTab(name)}
              key={name}
            >
              <Icon size={18} />
              {name}
              {tab === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-mark">
            <span className="dot" /> Local-first experiment
          </div>
          <p>
            Your voice. Your device.
            <br />A smaller cloud bill.
          </p>
          <div className="version">
            VOICE LAB <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} /> <span>{tab}</span>
          </div>
          <div className="header-right">
            <span className="pill">
              <span className="dot" /> Local workspace
            </span>
            <span className="avatar">VL</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">THE LOW-COST VOICE EXPERIMENT</div>
              <h1>
                {tab === "Playground" ? "Good conversations. Less cloud." : tab}
              </h1>
              <p>
                {tab === "Playground"
                  ? "Find the right balance of natural speech, fast responses, and cost."
                  : tab === "Benchmarks"
                    ? "Real measurements, with cold starts and device limits kept in view."
                    : tab === "Compare engines"
                      ? "Choose the tradeoffs that fit your users and their devices."
                      : "Model your bill before you choose your architecture."}
              </p>
            </div>
            <button className="button secondary" onClick={download}>
              <Download size={15} /> Export results
            </button>
          </div>
          {tab === "Playground" && (
            <>
              <div className="recommendation">
                <span className="recommend-icon">
                  <Zap size={19} />
                </span>
                <div>
                  <strong>Start with speech on the device</strong>
                  <p>
                    Whisper → streaming text model → Kokoro. No per-minute
                    speech API fee.
                  </p>
                </div>
                <span className="tag">RECOMMENDED EXPERIMENT</span>
              </div>
              <div className="stats">
                {[
                  ["Speech API cost", "$0", "Local engine inference"],
                  [
                    "STT processing",
                    fmt(metrics.stt),
                    "After recording is captured",
                  ],
                  ["First TTS chunk", fmt(metrics.tts), "Target ≤ 3 seconds"],
                  [
                    "Turn → first audio",
                    fmt(metrics.firstAudio),
                    "Excludes end-of-speech silence",
                  ],
                ].map(([label, value, note], i) => (
                  <div className="stat" key={label}>
                    <span>
                      {label}
                      {i === 0 ? <Wallet size={15} /> : <Activity size={15} />}
                    </span>
                    <strong className={i === 0 ? "green" : ""}>{value}</strong>
                    <small>{note}</small>
                  </div>
                ))}
              </div>
              <div className="play-grid">
                <section className="card conversation">
                  <div className="card-header">
                    <div>
                      <h2>
                        <Headphones size={18} /> Conversation studio
                      </h2>
                      <p>Speak, type, or bring your own audio.</p>
                    </div>
                    <span className="tag neutral">ENGLISH POC</span>
                  </div>
                  <div className="mode-switch">
                    <button
                      disabled={disabled}
                      className={mode === "demo" ? "selected" : ""}
                      onClick={() => setMode("demo")}
                    >
                      Scripted demo <span>No key needed</span>
                    </button>
                    <button
                      disabled={disabled}
                      className={mode === "live" ? "selected" : ""}
                      onClick={() => setMode("live")}
                    >
                      Text model{" "}
                      <span>
                        {config.configured ? config.model : "Connect in .env"}
                      </span>
                    </button>
                  </div>
                  <div
                    className={"voice-stage " + (recording ? "listening" : "")}
                  >
                    <div className="voice-orb">
                      <AudioLines size={45} strokeWidth={1.3} />
                    </div>
                    <div className="wave">
                      {Array.from({ length: 37 }, (_, i) => (
                        <i
                          key={i}
                          style={{
                            height: recording
                              ? `${8 + Math.abs(Math.sin(i * 2)) * level * 75}px`
                              : `${4 + Math.abs(Math.sin(i * 1.8)) * 12}px`,
                            opacity: recording ? 1 : 0.35,
                          }}
                        />
                      ))}
                    </div>
                    <strong aria-live="polite">{status}</strong>
                    <span>
                      {recording
                        ? "Speak naturally. Tap again to finish."
                        : "Local speech. A text-only trip to the cloud."}
                    </span>
                    <div className="record-controls">
                      <button
                        className={
                          "button primary " + (recording ? "recording" : "")
                        }
                        disabled={!!loading || (busy && !recording)}
                        onClick={microphone}
                      >
                        {recording ? <Square size={17} /> : <Mic size={18} />}{" "}
                        {recording ? "Finish recording" : "Start speaking"}
                      </button>
                      <button
                        className="icon-button"
                        onClick={stop}
                        disabled={!busy}
                        aria-label="Stop and interrupt"
                      >
                        <Square size={16} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={disabled}
                        onClick={() => fileInput.current.click()}
                        aria-label="Upload audio"
                      >
                        <Upload size={18} />
                      </button>
                      <input
                        type="file"
                        accept="audio/*"
                        hidden
                        ref={fileInput}
                        onChange={(e) => {
                          upload(e.target.files[0]);
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <small>
                      {silence
                        ? `Auto endpoint · ${silence} ms silence`
                        : "Manual endpoint"}{" "}
                      · 20 s recording limit
                    </small>
                  </div>
                  <div className="text-entry">
                    <label htmlFor="prompt">Or start with a text prompt</label>
                    <div>
                      <input
                        id="prompt"
                        value={text}
                        maxLength={2000}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && runText()}
                        placeholder="Ask something…"
                      />
                      <button
                        onClick={() => runText()}
                        disabled={disabled}
                        aria-label="Send prompt"
                      >
                        <ArrowUpRight size={20} />
                      </button>
                    </div>
                  </div>
                  {(transcript || reply) && (
                    <div className="transcript">
                      <div>
                        <span>YOU {transcript && "· TRANSCRIBED"}</span>
                        <p>{transcript || text}</p>
                      </div>
                      {reply && (
                        <div>
                          <span>
                            VOICE LAB{" "}
                            {mode === "demo" ? "· SCRIPTED RESPONSE" : ""}
                          </span>
                          <p>{reply}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="studio-footer">
                    <span>
                      <span className="dot" /> Audio stays on this device
                    </span>
                    <span>
                      {mode === "demo"
                        ? "Demo replies are scripted"
                        : "Transcripts go to your text provider"}
                    </span>
                  </div>
                </section>
                <section className="card setup">
                  <div className="card-header">
                    <div>
                      <h2>
                        <Settings2 size={18} /> Engine setup
                      </h2>
                      <p>Make the tradeoffs explicit.</p>
                    </div>
                  </div>
                  <div className="engine-section">
                    <div className="step-label">
                      <span>01</span> SPEECH TO TEXT{" "}
                      <span
                        className={"engine-state " + (ready.stt ? "ready" : "")}
                      >
                        {ready.stt ? "Loaded" : "Not loaded"}
                      </span>
                    </div>
                    <label htmlFor="stt">Recognition model</label>
                    <select
                      id="stt"
                      disabled={disabled}
                      value={sttModel}
                      onChange={(e) => changeStt(e.target.value)}
                    >
                      <option value="onnx-community/whisper-tiny.en">
                        Whisper Tiny · fastest baseline
                      </option>
                      <option value="onnx-community/whisper-base.en">
                        Whisper Base · more capacity
                      </option>
                    </select>
                    <div className="two-fields">
                      <div>
                        <label htmlFor="backend">Compute</label>
                        <select
                          id="backend"
                          value={device}
                          disabled={disabled}
                          onChange={(e) => {
                            changeStt(sttModel);
                            setDevice(e.target.value);
                          }}
                        >
                          <option value="wasm">WASM / CPU</option>
                          <option value="webgpu" disabled={!navigator.gpu}>
                            WebGPU / GPU
                          </option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="silence">End silence</label>
                        <select
                          id="silence"
                          value={silence}
                          disabled={disabled}
                          onChange={(e) => setSilence(+e.target.value)}
                        >
                          <option value={500}>500 ms</option>
                          <option value={700}>700 ms</option>
                          <option value={1000}>1,000 ms</option>
                          <option value={1500}>1,500 ms</option>
                          <option value={0}>Manual only</option>
                        </select>
                      </div>
                    </div>
                    <button
                      className="button load"
                      disabled={disabled || ready.stt}
                      onClick={() => load("stt")}
                    >
                      {ready.stt ? <Check size={15} /> : <Download size={15} />}{" "}
                      {loading === "stt"
                        ? "Loading Whisper…"
                        : ready.stt
                          ? "Whisper ready"
                          : "Load Whisper"}
                    </button>
                    <p className="hint">
                      Quantized weights · cached after download.
                      <br />
                      Tiny is lighter; Base may recognize more accurately.
                    </p>
                  </div>
                  <div className="engine-section">
                    <div className="step-label">
                      <span>02</span> TEXT TO SPEECH{" "}
                      <span
                        className={
                          "engine-state " +
                          (ready.tts || ttsType === "system" ? "ready" : "")
                        }
                      >
                        {ttsType === "system"
                          ? "Available"
                          : ready.tts
                            ? "Loaded"
                            : "Not loaded"}
                      </span>
                    </div>
                    <label htmlFor="tts">Voice engine</label>
                    <select
                      id="tts"
                      value={ttsType}
                      disabled={disabled}
                      onChange={(e) => setTtsType(e.target.value)}
                    >
                      <option value="kokoro">Kokoro 82M · neural, local</option>
                      <option value="system">
                        System voice · lightweight baseline
                      </option>
                    </select>
                    <label htmlFor="voice">Voice</label>
                    {ttsType === "kokoro" ? (
                      <select
                        id="voice"
                        disabled={disabled}
                        value={voice}
                        onChange={(e) => {
                          setVoice(e.target.value);
                          engines.current.tts?.dispose();
                          delete engines.current.tts;
                          setReady((r) => ({ ...r, tts: false }));
                        }}
                      >
                        <option value="af_heart">
                          Heart · American English
                        </option>
                        <option value="af_bella">
                          Bella · American English
                        </option>
                        <option value="am_michael">
                          Michael · American English
                        </option>
                        <option value="bf_emma">Emma · British English</option>
                      </select>
                    ) : (
                      <select
                        id="voice"
                        disabled={disabled}
                        value={systemVoice}
                        onChange={(e) => setSystemVoice(e.target.value)}
                      >
                        <option value="">
                          System default · locality unknown
                        </option>
                        {voices.map((v) => (
                          <option key={v.name} value={v.name}>
                            {v.name} · {v.localService ? "local" : "network"}
                          </option>
                        ))}
                      </select>
                    )}
                    {ttsType === "kokoro" && (
                      <button
                        className="button load"
                        disabled={disabled || ready.tts}
                        onClick={() => load("tts")}
                      >
                        {ready.tts ? (
                          <Check size={15} />
                        ) : (
                          <Download size={15} />
                        )}{" "}
                        {loading === "tts"
                          ? "Loading Kokoro…"
                          : ready.tts
                            ? "Kokoro ready"
                            : "Load Kokoro"}
                      </button>
                    )}
                    <p className="hint">
                      {ttsType === "kokoro"
                        ? "Q8 · up to 4 CPU threads · warm-up included. About 96 MB of model/voice files; RAM use is higher."
                        : "Quality and offline availability depend on the OS voice. Choose a voice marked local for offline testing."}
                    </p>
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={autoReply}
                      disabled={disabled}
                      onChange={(e) => setAutoReply(e.target.checked)}
                    />{" "}
                    Reply automatically after recording
                  </label>
                  <div className="setup-note">
                    <FlaskConical size={16} />
                    <span>
                      Load once. Test twice.
                      <br />
                      The first run includes inference warm-up.
                    </span>
                  </div>
                </section>
              </div>
              <section className="card speech-test">
                <div>
                  <div className="eyebrow">ISOLATE THE VOICE</div>
                  <h2>Listen before you connect a model.</h2>
                  <p>
                    Test TTS by itself. Long text is split into bounded chunks.
                  </p>
                </div>
                <textarea
                  aria-label="TTS test text"
                  value={speechText}
                  maxLength={6000}
                  onChange={(e) => setSpeechText(e.target.value)}
                />
                <button
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => runText(true)}
                >
                  <Play size={15} /> Test voice
                </button>
              </section>
              <div className="privacy-note">
                Model files download from Hugging Face. Speech inference runs
                locally; demo mode needs no text API. System voices may use a
                network service. Metrics are saved in this browser; audio is not
                stored.
              </div>
            </>
          )}
          {tab === "Benchmarks" && (
            <>
              <div className="recommendation">
                <Activity size={22} />
                <div>
                  <strong>Measure on the device you plan to support</strong>
                  <p>
                    Local runs below are measured in this browser. Host
                    benchmarks use a different runtime and are labeled
                    separately.
                  </p>
                </div>
              </div>
              <div className="card benchmark-controls">
                <div>
                  <h2>Recognition accuracy</h2>
                  <p>
                    Enter the exact words in your next recording, then upload or
                    record it in the playground.
                  </p>
                </div>
                <textarea
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Reference transcript for word error rate…"
                  aria-label="Reference transcript"
                />
                <p className="hint">
                  WER ignores punctuation and capitalization. Lower is better;
                  insertions can make it exceed 100%. Use several speakers,
                  accents, and noisy clips.
                </p>
              </div>
              <div className="card table-card">
                <div className="card-header">
                  <h2>
                    Browser measurements{" "}
                    <span className="count">{runs.length}</span>
                  </h2>
                  <button className="text-button" onClick={() => setRuns([])}>
                    Clear history
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Run / engine</th>
                        <th>STT</th>
                        <th>First TTS</th>
                        <th>First audio</th>
                        <th>TTS RTF</th>
                        <th>WER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>
                              {r.kind === "stt"
                                ? r.sttModel.split("/")[1]
                                : r.ttsEngine}
                            </strong>
                            <small>
                              {r.kind} · {new Date(r.at).toLocaleTimeString()} ·{" "}
                              {r.device}
                            </small>
                          </td>
                          <td>{fmt(r.stt)}</td>
                          <td
                            className={
                              r.tts != null && r.tts <= 3000 ? "green" : ""
                            }
                          >
                            {fmt(r.tts)}
                          </td>
                          <td>{fmt(r.firstAudio)}</td>
                          <td>
                            {r.rtf == null ? "—" : r.rtf.toFixed(2) + "×"}
                          </td>
                          <td>
                            {r.wer == null
                              ? "—"
                              : (r.wer * 100).toFixed(1) + "%"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!runs.length && (
                    <div className="empty">
                      <Activity size={28} />
                      <h3>Your first run starts the story.</h3>
                      <p>
                        Run a voice or transcription test in the playground to
                        collect real measurements.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => setTab("Playground")}
                      >
                        Open playground <ArrowUpRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="info-grid">
                <div className="card info">
                  <h3>What a good result looks like</h3>
                  <p>
                    First TTS chunk ≤ 3 s. Real-time factor (RTF) below 1 means
                    synthesis is faster than the audio it creates. These are
                    engineering targets, not measured promises.
                  </p>
                </div>
                <div className="card info">
                  <h3>What the timer includes</h3>
                  <p>
                    First audio runs from recording completion or text
                    submission until playback is scheduled. Silence detection
                    adds {silence} ms before that. Speaker hardware latency is
                    not measured. TTS tests have no model response time.
                  </p>
                </div>
              </div>
              <ExperimentResults />
              {hostReport && (
                <div className="card host-report">
                  <div className="card-header">
                    <h2>Development-machine benchmark</h2>
                    <span className="tag neutral">{hostReport.runtime}</span>
                  </div>
                  <p>
                    {hostReport.hardware} · {hostReport.note}
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Engine</th>
                          <th>Load incl. download</th>
                          <th>First inference</th>
                          <th>Warm median</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostReport.results?.map((r) => (
                          <tr key={r.engine}>
                            <td>{r.engine}</td>
                            <td>{fmt(r.loadMs)}</td>
                            <td>{fmt(r.coldMs)}</td>
                            <td>{fmt(r.warmMedianMs)}</td>
                            <td>{r.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="hint">
                    Synthetic voice samples and one public speech clip are smoke
                    tests. They do not establish accuracy across accents, noise,
                    or languages.
                  </p>
                </div>
              )}
            </>
          )}
          {tab === "Compare engines" && (
            <>
              <div className="engine-cards">
                {[
                  {
                    name: "Whisper + Kokoro",
                    badge: "IMPLEMENTED",
                    desc: "The quality-first local experiment",
                    pros: "No speech inference API charges. Consistent neural voice. Works in a browser without a speech server.",
                    cons: "Model downloads, RAM, battery, and warm-up. English here. Chunked STT after each utterance; not live partial captions.",
                    fit: "Start here on capable desktops; benchmark each phone.",
                  },
                  {
                    name: "Whisper + system TTS",
                    badge: "IMPLEMENTED",
                    desc: "The lighter local experiment",
                    pros: "Avoids the Kokoro model download. Low TTS compute overhead. Uses voices already offered by the OS.",
                    cons: "Voice quality varies. Some voices use a network. Voice selection and availability differ across devices.",
                    fit: "Useful fallback for memory-constrained devices.",
                  },
                  {
                    name: "Native sherpa-onnx / whisper.cpp",
                    badge: "RESEARCH CANDIDATE",
                    desc: "The mobile production direction",
                    pros: "Native iOS and Android integration. Offline inference; streaming ASR models available in sherpa-onnx.",
                    cons: "Requires a native build, model-specific license checks, thermal testing, audio routing, and device benchmarks.",
                    fit: "Recommended next experiment after browser validation.",
                  },
                  {
                    name: "Shared speech server",
                    badge: "RESEARCH CANDIDATE",
                    desc: "Offload work from weaker devices",
                    pros: "A consistent runtime. Larger models possible. Small client download.",
                    cons: "Compute, concurrency queues, bandwidth, privacy handling, and operational cost. Not almost-free at arbitrary scale.",
                    fit: "Optional fallback if device performance misses the target.",
                  },
                ].map((e) => (
                  <div className="card engine-option" key={e.name}>
                    <span className="tag neutral">{e.badge}</span>
                    <h2>{e.name}</h2>
                    <p>{e.desc}</p>
                    <h4>Why try it</h4>
                    <p>{e.pros}</p>
                    <h4>The tradeoff</h4>
                    <p>{e.cons}</p>
                    <div className="fit">
                      <ArrowUpRight size={16} />
                      {e.fit}
                    </div>
                  </div>
                ))}
              </div>
              <div className="card info">
                <h3>Why browser SpeechRecognition is not the default</h3>
                <p>
                  Browser support is inconsistent, and some implementations send
                  audio to a recognition service. That is not a dependable
                  offline architecture or a service with a contractual free
                  allowance. This POC captures audio and runs an explicit local
                  model.
                </p>
                <div className="source-links">
                  <a
                    href="https://huggingface.co/docs/transformers.js/guides/webgpu"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Transformers.js ↗
                  </a>
                  <a
                    href="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Kokoro model ↗
                  </a>
                  <a
                    href="https://k2-fsa.github.io/sherpa/onnx/index.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    sherpa-onnx ↗
                  </a>
                  <a
                    href="https://github.com/ggml-org/whisper.cpp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    whisper.cpp ↗
                  </a>
                  <a
                    href="https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Browser recognition ↗
                  </a>
                </div>
              </div>
              <div className="card info">
                <h3>Mobile readiness is a separate milestone</h3>
                <p>
                  This responsive web POC can be tested on phones over HTTPS. It
                  is not a native mobile app, and it has not passed a phone
                  performance matrix. Test cold loading, warm latency, 60-minute
                  battery/thermal behavior, interruptions, Bluetooth, memory
                  pressure, and model-cache eviction before choosing a
                  production stack.
                </p>
              </div>
            </>
          )}
          {tab === "Cost calculator" && (
            <>
              <div className="recommendation">
                <Wallet size={22} />
                <div>
                  <strong>One hour a day should be a deliberate budget.</strong>
                  <p>
                    These editable rates are illustrative assumptions, not
                    current provider quotes. Hosting, downloads, electricity,
                    and taxes are excluded.
                  </p>
                </div>
              </div>
              <div className="cost-grid">
                <div className="card cost-inputs">
                  <h2>Your usage assumptions</h2>
                  <div className="two-fields">
                    {[
                      ["users", "Active users"],
                      ["minutes", "Minutes / user / day"],
                      ["days", "Days / month"],
                      ["turnsPerHour", "Turns / hour"],
                      ["inputTokens", "Input tokens / turn¹"],
                      ["outputTokens", "Output tokens / turn"],
                      ["inputPrice", "Text input $ / 1M tokens"],
                      ["outputPrice", "Text output $ / 1M tokens"],
                      ["sttRate", "Cloud STT $ / input minute"],
                      ["ttsRate", "Cloud TTS $ / output minute"],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label htmlFor={key}>{label}</label>
                        <input
                          id={key}
                          type="number"
                          min="0"
                          step="any"
                          value={cost[key]}
                          onChange={(e) =>
                            setCost((c) => ({
                              ...c,
                              [key]: Math.max(0, Number(e.target.value)),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <label htmlFor="share">
                    Listening share · {Math.round(cost.inputShare * 100)}%
                  </label>
                  <input
                    id="share"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={cost.inputShare}
                    onChange={(e) =>
                      setCost((c) => ({ ...c, inputShare: +e.target.value }))
                    }
                  />
                  <p className="hint">
                    ¹ Include repeated conversation history and system
                    instructions in average input tokens. Speech time is split
                    into listening and speaking; this simplified estimate
                    assumes no idle time.
                  </p>
                </div>
                <div>
                  <div className="card cost-result">
                    <span className="eyebrow">ON-DEVICE SPEECH + TEXT API</span>
                    <h2>
                      $
                      {costs.text.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      <small>/ month</small>
                    </h2>
                    <p>
                      Speech inference API cost <strong>$0</strong>
                    </p>
                    <p>
                      Estimated text API cost{" "}
                      <strong>${costs.text.toFixed(2)}</strong>
                    </p>
                    <div className="cost-divider" />
                    <span className="eyebrow">
                      CLOUD SPEECH + SAME TEXT API
                    </span>
                    <h3>
                      $
                      {(costs.speech + costs.text).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                      <small>/ month</small>
                    </h3>
                    <p>
                      Estimated speech API cost{" "}
                      <strong>${costs.speech.toFixed(2)}</strong>
                    </p>
                    <div className="saving">
                      Potential speech API saving{" "}
                      <strong>${costs.speech.toFixed(2)} / month</strong>
                    </div>
                  </div>
                  <div className="card info">
                    <h3>“Local” moves the work</h3>
                    <p>
                      Users supply the compute, memory, and battery. You still
                      distribute model files and serve the application. At
                      scale, include CDN egress, support, and any paid fallback
                      traffic.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
          {loading && (
            <div className="toast progress-toast" role="status">
              <span className="spinner" />
              <div>
                <strong>
                  Preparing {loading === "stt" ? "Whisper" : "Kokoro"}
                </strong>
                <p>{progress}</p>
              </div>
            </div>
          )}
          {error && (
            <div className="toast error-toast" role="alert">
              <div>
                <strong>Something needs attention</strong>
                <p>{error}</p>
              </div>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={18} />
              </button>
            </div>
          )}
          <footer>
            <span>Built to test the tradeoffs.</span>
            <span>
              LOCAL INFERENCE <i /> STREAMED RESPONSES <i /> MEASURED LATENCY
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
