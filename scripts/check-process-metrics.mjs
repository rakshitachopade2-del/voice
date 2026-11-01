// Cross-check macOS Mach-time conversion against Node's independent CPU accounting.
import { fork, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const exec = promisify(execFile);
if (process.argv.includes("--child")) {
  process.send("ready");
  process.on("message", () => {
    const start = process.cpuUsage();
    const until = performance.now() + 1500;
    while (performance.now() < until) {}
    const usage = process.cpuUsage(start);
    process.send({ seconds: (usage.user + usage.system) / 1e6 });
  });
} else {
  const child = fork(new URL(import.meta.url), ["--child"], { silent: true });
  try {
    await once(child, "message");
    const read = async () =>
      JSON.parse(
        (await exec(".cache/bin/process-metrics", [String(child.pid)])).stdout,
      )[0];
    const before = await read();
    const done = once(child, "message");
    child.send("go");
    const [measured] = await done;
    const after = await read();
    const helperSeconds = after.cpuSeconds - before.cpuSeconds;
    const relativeDifference =
      Math.abs(helperSeconds - measured.seconds) / measured.seconds;
    assert.ok(
      relativeDifference < 0.05,
      "libproc CPU time must agree within 5% with Node process.cpuUsage",
    );
    const result = {
      nodeCpuSeconds: measured.seconds,
      libprocCpuSeconds: helperSeconds,
      relativeDifference,
      passed: true,
    };
    await writeFile(
      "reports/cpu-counter-check.json",
      JSON.stringify(result, null, 2),
    );
    console.log(result);
  } finally {
    child.kill();
  }
}
