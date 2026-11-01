// Bounded incremental chunks: punctuation first; long sentences never block all speech.
export function takeChunk(buffer, flush = false, max = 160) {
  const match = [
    ...buffer.matchAll(/[.!?](?:["')]*)(?=\s|$)|[,;:](?=\s)/g),
  ].find((m) => m.index >= 24);
  if (match && match.index + match[0].length <= max) {
    const end = match.index + match[0].length;
    return [buffer.slice(0, end).trim(), buffer.slice(end).trimStart()];
  }
  if (buffer.length >= max) {
    const space = buffer.lastIndexOf(" ", max);
    const end = space > 25 ? space : max;
    return [buffer.slice(0, end).trim(), buffer.slice(end).trimStart()];
  }
  return flush && buffer.trim() ? [buffer.trim(), ""] : [null, buffer];
}
export function wordErrorRate(reference, hypothesis) {
  const words = (s) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const a = words(reference),
    b = words(hypothesis);
  if (!a.length) return null;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length] / a.length;
}
export function estimateCost({
  users,
  minutes,
  days,
  inputShare,
  sttRate,
  ttsRate,
  turnsPerHour,
  inputTokens,
  outputTokens,
  inputPrice,
  outputPrice,
}) {
  const totalMinutes = users * minutes * days;
  const turns = (totalMinutes / 60) * turnsPerHour;
  return {
    speech: totalMinutes * (inputShare * sttRate + (1 - inputShare) * ttsRate),
    text:
      (turns * (inputTokens * inputPrice + outputTokens * outputPrice)) / 1e6,
  };
}
// SSE frames can cross arbitrary byte boundaries. Keep the final unterminated frame.
export async function* readSSE(body) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  const extract = (frame) =>
    frame
      .split("\n")
      .filter((x) => x.startsWith("data:"))
      .map((x) => x.slice(5).trimStart())
      .join("\n");
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r/g, "");
      let i;
      while ((i = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        const data = extract(frame);
        if (data) yield data;
      }
      if (done) {
        const data = extract(buffer);
        if (data) yield data;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export const SAMPLE_TEXT =
  "A good voice assistant should feel easy to talk to. Speech runs on your device, while a text model handles the answer. Short chunks let the first sentence play before the rest is ready.";
