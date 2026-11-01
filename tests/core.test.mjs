import test from "node:test";
import assert from "node:assert/strict";
import {
  takeChunk,
  wordErrorRate,
  estimateCost,
  readSSE,
} from "../src/core.mjs";
test("incremental long sentence starts speaking before text ends and preserves words", () => {
  let input = "";
  const parts = [];
  const source = Array.from({ length: 100 }, (_, i) => "word" + i).join(" ");
  for (const c of source) {
    input += c;
    let part;
    while (([part, input] = takeChunk(input))[0]) parts.push(part);
  }
  assert.ok(parts.length > 0);
  assert.ok(parts.every((p) => p.length <= 160));
  const [last] = takeChunk(input, true);
  if (last) parts.push(last);
  assert.equal(parts.join(" "), source);
});
test("sentence chunks preserve punctuation, short preamble and final remainder", () => {
  const text =
    "Hi. A voice assistant should respond promptly. This is the next sentence.";
  let remaining = text,
    parts = [];
  for (;;) {
    const [part, rest] = takeChunk(remaining, true);
    if (!part) break;
    parts.push(part);
    remaining = rest;
  }
  assert.equal(parts.join(" "), text);
});
test("WER counts insertions, deletions, substitutions, and normalizes text", () => {
  assert.equal(wordErrorRate("Hello, WORLD!", "hello world"), 0);
  assert.equal(wordErrorRate("one two three", "one four"), 2 / 3);
  assert.equal(wordErrorRate("one", "one two three"), 2);
  assert.equal(wordErrorRate("", "hello"), null);
});
test("cost separates speech minutes and accumulated text context", () => {
  const result = estimateCost({
    users: 1,
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
  assert.ok(Math.abs(result.speech - 16.2) < 1e-9);
  assert.equal(result.text, 0.81);
});
test("SSE handles split UTF-8, CRLF, multiline data, and final frame", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"text":"héllo"}\r\n\r\ndata: second\ndata: line\n\ndata: [DONE]',
  );
  const body = new ReadableStream({
    start(c) {
      for (const b of bytes) c.enqueue(Uint8Array.of(b));
      c.close();
    },
  });
  const output = [];
  for await (const s of readSSE(body)) output.push(s);
  assert.deepEqual(output, ['{"text":"héllo"}', "second\nline", "[DONE]"]);
});

test("full long text with punctuation still respects the opening chunk bound", () => {
  const source = Array(100).fill("longword").join(" ") + ".";
  const [first, rest] = takeChunk(source, false, 64);
  assert.ok(first.length <= 64);
  assert.ok(rest.length > 700);
  assert.equal(first + " " + rest, source);
  const [preamble] = takeChunk(
    "Yes, this is a useful short opening. More will follow.",
  );
  assert.equal(preamble, "Yes, this is a useful short opening.");
});
