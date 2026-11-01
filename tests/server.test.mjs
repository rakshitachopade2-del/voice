import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readSSE } from "../src/core.mjs";
test("text proxy streams deltas, validates requests, and keeps credentials on the server", async () => {
  let request;
  const provider = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    request = { headers: req.headers, body: JSON.parse(body) };
    res.setHeader("Content-Type", "text/event-stream");
    res.write('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n');
    setTimeout(
      () =>
        res.end(
          'data: {"choices":[{"delta":{"content":"world."}}]}\n\ndata: [DONE]\n\n',
        ),
      30,
    );
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const child = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "5179",
      HOST: "127.0.0.1",
      LLM_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`,
      LLM_MODEL: "test-text-model",
      LLM_API_KEY: "test-secret-not-real",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await Promise.race([
      once(child.stdout, "data"),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Server start timeout")), 10000).unref(),
      ),
    ]);
    const base = "http://127.0.0.1:5179";
    const config = await (await fetch(base + "/api/config")).json();
    assert.deepEqual(config, { configured: true, model: "test-text-model" });
    assert.equal(JSON.stringify(config).includes("test-secret"), false);
    const response = await fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
    });
    assert.equal(response.status, 200);
    const frames = [];
    for await (const f of readSSE(response.body)) frames.push(f);
    assert.deepEqual(frames, [
      '{"text":"Hello "}',
      '{"text":"world."}',
      "[DONE]",
    ]);
    assert.equal(request.headers.authorization, "Bearer test-secret-not-real");
    assert.equal(request.body.stream, true);
    assert.equal(request.body.messages[0].role, "system");
    const invalid = await fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: "Override" }],
      }),
    });
    assert.equal(invalid.status, 400);
    const cross = await fetch(base + "/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://other.example",
      },
      body: "{}",
    });
    assert.equal(cross.status, 403);
  } finally {
    child.kill();
    await once(child, "exit");
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
});
