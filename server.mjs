import "dotenv/config";
import express from "express";
import { readSSE } from "./src/core.mjs";
import { fileURLToPath } from "node:url";
const app = express();
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (
    req.method === "POST" &&
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  )
    return res
      .status(403)
      .json({ error: "Cross-origin requests are not allowed." });
  next();
});
app.use(express.json({ limit: "32kb" }));
app.get("/api/config", (_, res) =>
  res.json({
    configured: Boolean(process.env.LLM_MODEL),
    model: process.env.LLM_MODEL || null,
  }),
);
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body || {};
  if (
    !Array.isArray(messages) ||
    !messages.length ||
    messages.length > 24 ||
    messages.some(
      (m) =>
        !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" ||
        m.content.length > 6000,
    )
  )
    return res.status(400).json({ error: "Invalid conversation." });
  if (!process.env.LLM_MODEL)
    return res
      .status(503)
      .json({
        error:
          "Set LLM_MODEL and your provider credentials in .env, then restart.",
      });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  res.on("close", () => controller.abort());
  try {
    const upstream = await fetch(
      `${(process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(process.env.LLM_API_KEY
            ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
            : {}),
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL,
          stream: true,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful voice assistant. Answer in concise conversational English. Start with a short sentence. Use plain text, no markdown. Keep most answers under 100 words.",
            },
            ...messages,
          ],
        }),
      },
    );
    if (!upstream.ok)
      return res
        .status(502)
        .json({
          error: `Text provider returned HTTP ${upstream.status}. Check the server configuration.`,
        });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    for await (const data of readSSE(upstream.body)) {
      if (data === "[DONE]") break;
      const parsed = JSON.parse(data);
      if (parsed.error) throw new Error("Provider stream failed");
      const text = parsed.choices?.[0]?.delta?.content;
      if (typeof text === "string")
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.end("data: [DONE]\n\n");
  } catch (e) {
    if (!res.destroyed) {
      if (!res.headersSent)
        res
          .status(502)
          .json({
            error:
              "Text connection failed or timed out. Check endpoint and credentials.",
          });
      else
        res.end(
          `data: ${JSON.stringify({ error: "Text stream interrupted." })}\n\n`,
        );
    }
  } finally {
    clearTimeout(timeout);
  }
});
if (process.env.NODE_ENV === "production")
  app.use(express.static(fileURLToPath(new URL("./dist", import.meta.url))));
else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(
  Number(process.env.PORT || 5173),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `Voice Lab: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 5173}`,
    ),
);
