let cancelSystemSpeech = null;
export class SpeechEngine {
  constructor(onProgress) {
    this.worker = new Worker(new URL("./speech.worker.js", import.meta.url), {
      type: "module",
    });
    this.pending = new Map();
    this.id = 0;
    this.onProgress = onProgress;
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      if (data.progress) {
        this.onProgress?.(data.progress);
        return;
      }
      this.pending.delete(data.id);
      data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values())
        p.reject(
          Error(e.message || "Speech worker failed. Reload the engine."),
        );
      this.pending.clear();
    };
  }
  call(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, action, payload });
    });
  }
  dispose() {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(Error("Cancelled"));
    this.pending.clear();
  }
}
export async function decodeAudio(file) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > 30)
      throw Error(
        "Use an audio clip of 30 seconds or less for interactive testing.",
      );
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * 16000),
      16000,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    await context.close();
  }
}
export class Player {
  async unlock() {
    this.context ||= new AudioContext();
    await this.context.resume();
  }
  play(samples, sampleRate, onStart) {
    return new Promise((resolve, reject) => {
      try {
        if (this.context.state !== "running")
          throw Error(
            "Audio playback is suspended. Click Stop, then try again.",
          );
        const buffer = this.context.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples, 0);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context.destination);
        this.source = source;
        source.onended = () => {
          if (this.source === source) this.source = null;
          resolve();
        };
        source.start();
        onStart?.();
      } catch (e) {
        reject(e);
      }
    });
  }
  stop() {
    this.source?.stop();
    this.source = null;
    cancelSystemSpeech?.();
    globalThis.speechSynthesis?.cancel();
  }
}
export async function recordAudio({ onLevel, onFinish, silenceMs = 700 }) {
  if (!navigator.mediaDevices?.getUserMedia)
    throw Error("Microphone access needs localhost or HTTPS.");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const context = new AudioContext(),
    source = context.createMediaStreamSource(stream),
    analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  let stopped = false,
    heard = false,
    silenceAt = 0;
  const started = performance.now();
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    context.close();
  };
  recorder.onstop = () =>
    onFinish(new Blob(chunks, { type: recorder.mimeType }), heard);
  recorder.start(100);
  const timer = setInterval(() => {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    const rms = Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length);
    onLevel(Math.min(1, rms * 7));
    const now = performance.now();
    if (rms > 0.018) {
      heard = true;
      silenceAt = 0;
    } else if (heard) {
      silenceAt ||= now;
      if (silenceMs > 0 && now - silenceAt > silenceMs) stop();
    }
    if (now - started > 20000) stop();
  }, 50);
  return stop;
}
export function systemSpeak(text, voiceName, onStart) {
  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.voice =
      speechSynthesis.getVoices().find((v) => v.name === voiceName) || null;
    const cleanup = () => {
      clearTimeout(timer);
      if (cancelSystemSpeech === finish) cancelSystemSpeech = null;
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      speechSynthesis.cancel();
      reject(
        Error(
          "System voice did not start. Choose another voice or use Kokoro.",
        ),
      );
    }, 15000);
    cancelSystemSpeech = finish;
    u.onstart = () => {
      clearTimeout(timer);
      onStart?.();
    };
    u.onend = finish;
    u.onerror = (e) => {
      cleanup();
      if (e.error === "interrupted" || e.error === "canceled") resolve();
      else reject(Error(`System voice: ${e.error}`));
    };
    speechSynthesis.speak(u);
  });
}
