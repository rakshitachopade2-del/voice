import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
await mkdir("reports", { recursive: true });
const browser = await chromium.launchPersistentContext(".cache/browser-test", {
  channel: "chrome",
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${process.cwd()}/public/samples/jfk.wav`,
  ],
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 1100 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("Browser:", m.text().slice(0, 240));
});
try {
  await page.goto("http://127.0.0.1:5173");
  await page.evaluate(() => localStorage.removeItem("voice-lab-runs"));
  await page.reload();
  await page
    .getByRole("heading", { name: "Good conversations. Less cloud." })
    .waitFor();
  await page.screenshot({
    path: "reports/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Test voice", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /Load the Kokoro/);
  await page.getByLabel("Dismiss error").click();
  for (const name of ["Benchmarks", "Compare engines", "Cost calculator"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
  }
  await page.locator("#users").fill("1");
  assert.match(await page.locator(".cost-result").innerText(), /0.81/);
  await page.getByRole("button", { name: "Playground", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "reports/dashboard-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "No horizontal overflow on mobile",
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  if (process.env.TEST_MODELS === "1") {
    console.log("Loading real browser Kokoro…");
    await page
      .getByRole("button", { name: "Load Kokoro", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Kokoro ready", exact: true })
      .waitFor({ timeout: 300000 });
    await page
      .getByLabel("TTS test text")
      .fill(
        "A good voice assistant should feel easy to talk to. This second sentence tests queued playback.",
      );
    for (let i = 0; i < 2; i++) {
      console.log("Browser TTS run", i);
      await page
        .getByRole("button", { name: "Test voice", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          JSON.parse(localStorage.getItem("voice-lab-runs") || "[]").length >=
          1,
        {},
        { timeout: 120000 },
      );
      await page
        .getByText("Complete · measurements saved on this device", {
          exact: true,
        })
        .waitFor({ timeout: 120000 });
      if (i === 0)
        await page.evaluate(() =>
          localStorage.setItem(
            "first-browser-run",
            localStorage.getItem("voice-lab-runs"),
          ),
        );
    }
    console.log("Testing streamed scripted reply…");
    await page.getByLabel("Send prompt").click();
    await page
      .getByText("Complete · measurements saved on this device", {
        exact: true,
      })
      .waitFor({ timeout: 120000 });
    assert.match(
      await page.locator(".transcript").innerText(),
      /scripted demo/,
    );
    console.log("Loading real browser Whisper…");
    await page
      .getByRole("button", { name: "Load Whisper", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Whisper ready", exact: true })
      .waitFor({ timeout: 300000 });
    await page
      .locator("input[type=file]")
      .setInputFiles("public/samples/jfk.wav");
    await page
      .getByText("Transcript ready · edit it before sending if needed", {
        exact: true,
      })
      .waitFor({ timeout: 120000 });
    assert.match(await page.locator(".transcript").innerText(), /country/i);
    console.log(
      "Testing real microphone capture through a prerecorded device fixture…",
    );
    await page.locator("#silence").selectOption("1000");
    await page
      .getByRole("button", { name: "Start speaking", exact: true })
      .click();
    await page
      .getByText("Complete · measurements saved on this device", {
        exact: true,
      })
      .waitFor({ timeout: 120000 });
    console.log("Testing 20-sentence speech without whole-response blocking…");
    await page
      .getByLabel("TTS test text")
      .fill(
        Array(20)
          .fill("This is a short sentence about local speech.")
          .join(" "),
      );
    await page.getByRole("button", { name: "Test voice", exact: true }).click();
    await page
      .getByText("Complete · measurements saved on this device", {
        exact: true,
      })
      .waitFor({ timeout: 180000 });
    const longRun = await page.evaluate(
      () => JSON.parse(localStorage.getItem("voice-lab-runs"))[0],
    );
    assert.equal(longRun.chunks, 20);
    assert.ok(
      longRun.firstAudio < 20000,
      "Long response should begin before all 20 sentences are synthesized",
    );
    const runs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("voice-lab-runs")),
    );
    await writeFile(
      "reports/browser-benchmark.json",
      JSON.stringify(
        {
          runtime: "Headless Chrome WASM up to 4 threads, voice prewarmed",
          crossOriginIsolated: await page.evaluate(() => crossOriginIsolated),
          hardwareConcurrency: await page.evaluate(
            () => navigator.hardwareConcurrency,
          ),
          userAgent: await page.evaluate(() => navigator.userAgent),
          runs,
        },
        null,
        2,
      ),
    );
    await page.getByRole("button", { name: "Test voice", exact: true }).click();
    await page.getByLabel("Stop and interrupt").click();
    await page.waitForTimeout(2500);
    assert.equal(
      await page
        .getByRole("button", { name: "Test voice", exact: true })
        .isEnabled(),
      true,
    );
  }
  assert.deepEqual(errors, []);
  console.log("Browser checks passed.");
} finally {
  await browser.close();
}
