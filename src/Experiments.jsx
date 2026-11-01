import React, { useEffect, useState } from "react";
const seconds = (n) => (n == null ? "—" : (n / 1000).toFixed(2) + "s");
export function ExperimentResults() {
  const [report, setReport] = useState(null);
  useEffect(() => {
    fetch("/experiments.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .catch(() => {});
  }, []);
  if (!report) return null;
  return (
    <section className="card host-report">
      <div className="card-header">
        <div>
          <h2>What we actually tried</h2>
          <p>{report.hardware} · browser experiments</p>
        </div>
        <span className="tag">MEASURED</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Configuration</th>
              <th>First TTS chunk</th>
              <th>TTS RTF</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {report.experiments.map((e) => (
              <tr key={e.name}>
                <td>
                  <strong>{e.name}</strong>
                  <small>{e.note}</small>
                </td>
                <td>{seconds(e.firstTtsMs)}</td>
                <td>{e.rtf?.toFixed(2)}×</td>
                <td className={e.pass ? "green" : ""}>
                  {e.pass ? "Meets this test target" : "Misses target"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ paddingTop: 16 }}>
        Target: first chunk ≤ 3 seconds and RTF &lt; 1. These are short sample
        runs, not p95 guarantees. Earlier single-thread/native runs overlapped
        in time, so treat their comparison as directional. Final prewarmed tests
        ran without another speech benchmark. Phone and human listening tests
        remain open.
      </p>
      {report.longResponse && (
        <p>
          <strong>20-sentence check:</strong> first audio in{" "}
          {seconds(report.longResponse.firstAudio)};{" "}
          {report.longResponse.chunks} chunks played; RTF{" "}
          {report.longResponse.rtf.toFixed(2)}×. Speech started before the
          entire answer was synthesized.
        </p>
      )}
      <p>
        <strong>Microphone pipeline:</strong>{" "}
        {report.microphone
          ? `STT ${seconds(report.microphone.stt)}, first audio ${seconds(report.microphone.firstAudio)} after recording completion, using a prerecorded microphone fixture and scripted text reply.`
          : "Not yet measured."}
      </p>
    </section>
  );
}
