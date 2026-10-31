import { useEffect, useState } from "react";
import { Play, Pause, ChevronRight, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Extraction, Run, Trace } from "./types";
import { groupNames, number, time } from "./types";
import { Empty, JsonView, Source, Value } from "./shared";

function stage(step: Trace) {
  if (/verdict|insights/.test(step.name)) return 6;
  if (/score|quality|diagnose|outcome/.test(step.name)) return 5;
  if (/cross_check/.test(step.name)) return 4;
  if (/decisions/.test(step.name)) return 3;
  if (/check_|localize/.test(step.name)) return 2;
  if (/load|extract|features/.test(step.name)) return 1;
  return 0;
}
export function AuditPanel({
  run,
  extraction,
  stem,
  seek,
}: {
  run: Run;
  extraction: Extraction | null;
  stem: string;
  seek: (sec: number) => void;
}) {
  const [tab, setTab] = useState("trace");
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selected, setSelected] = useState(0);
  const [domain, setDomain] = useState("all");
  const trace = run.result.trace ?? [];
  const total = Math.max(
    0,
    ...trace.map((step) => step.started_ms + step.duration_s * 1000),
  );
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setElapsed((previous) => Math.min(total, previous + 5000)),
      250,
    );
    return () => window.clearInterval(timer);
  }, [playing, total]);
  const replaying = playing && elapsed < total;
  const steps = [
    "Request",
    "Gather data",
    "Checks",
    "Decisions API",
    "Cross-check",
    "Scoring",
    "Verdict",
  ];
  const questions = run.result.decisions?.questions ?? [];
  const visibleQuestions = questions.filter(
    (q) => domain === "all" || (q.group ?? q.domain) === domain,
  );
  return (
    <section className="audit-section" aria-label="Kiểm chứng kết quả">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BẰNG CHỨNG PHÍA SAU ĐIỂM SỐ</span>
          <h2>Kiểm chứng kết quả</h2>
        </div>
        <Source>Run #{run.id} · đã lưu</Source>
      </div>
      <div className="tabs" role="tablist" aria-label="Nội dung kiểm chứng">
        {[
          ["trace", "Luồng agent"],
          ["extraction", "AI đã xem gì"],
          ["decisions", "Decisions API"],
          ["scores", "Cách chấm & nguồn"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "trace" && (
        <div className="audit-body">
          <div className="row-between">
            <p className="muted">
              Phát lại trace đã lưu ở tốc độ 20×. Không gọi AI mới.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                if (!replaying) setElapsed(0);
                setPlaying(!replaying);
              }}
            >
              {replaying ? <Pause /> : <Play />}
              {replaying ? "Dừng phát lại" : "Phát lại trace"}
            </Button>
          </div>
          <div className="pipeline">
            {steps.map((label, index) => (
              <div
                key={label}
                className={
                  trace.some(
                    (s) =>
                      stage(s) === index &&
                      (!playing || s.started_ms <= elapsed),
                  )
                    ? "stage active"
                    : "stage"
                }
              >
                <span>{index + 1}</span>
                {label}
              </div>
            ))}
          </div>
          {trace.length === 0 ? (
            <Empty>Lần chạy này chưa lưu trace.</Empty>
          ) : (
            <div className="trace-grid">
              <div className="trace-list">
                {trace.map((step, index) => (
                  <button
                    key={`${step.name}-${index}`}
                    className={selected === index ? "selected" : ""}
                    onClick={() => setSelected(index)}
                  >
                    <span
                      className={`trace-status ${playing && step.started_ms > elapsed ? "pending" : step.status}`}
                    />{" "}
                    <span>
                      <strong>{step.name}</strong>
                      <small>
                        {step.agent} · {step.tool ?? "logic"}
                      </small>
                    </span>
                    <span>{number(step.duration_s)}s</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              <div className="trace-detail">
                <h3>{trace[selected]?.name}</h3>
                <p>
                  {trace[selected]?.status} · {trace[selected]?.agent}
                </p>
                <h4>Input</h4>
                <JsonView value={trace[selected]?.input} />
                <h4>Output</h4>
                <JsonView value={trace[selected]?.output} />
                <h4>Token / cache</h4>
                <JsonView value={trace[selected]?.tokens} />
              </div>
            </div>
          )}
        </div>
      )}
      {tab === "extraction" && (
        <div className="audit-body">
          {!extraction ? (
            <Empty>Chưa có bản trích xuất cho video này.</Empty>
          ) : (
            <>
              <div className="row-between">
                <h3>Khung hình và lời thoại</h3>
                <Source>{extraction.vision_model} · bản trích xuất lưu</Source>
              </div>
              <div className="filmstrip">
                {(extraction.frame_files ?? []).map((file) => {
                  const sec = Number.parseFloat(file);
                  return (
                    <button
                      key={file}
                      onClick={() => seek(sec)}
                      aria-label={`Xem frame ${time(sec)}`}
                    >
                      <img
                        loading="lazy"
                        src={`/demo/frames/${stem}/${file}`}
                        alt={`Khung hình ${time(sec)}`}
                      />
                      <span>{time(sec)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="transcript">{!extraction.transcript_segments?.length && <p>{extraction.transcript || "Chưa có lời thoại."}</p>}
                {extraction.transcript_segments?.map((segment, index) => (
                  <button key={index} onClick={() => seek(segment.start)}>
                    <span>{time(segment.start)}</span>
                    <p>{segment.text}</p>
                  </button>
                ))}
              </div>
              <details>
                <summary>Model, token và thời gian trích xuất</summary>
                <JsonView
                  value={{
                    model: extraction.vision_model,
                    tokens: extraction.token_usage,
                    latency: extraction.benchmark_latency,
                  }}
                />
              </details>
              <details>
                <summary>JSON features</summary>
                <JsonView value={extraction.features} />
              </details>
            </>
          )}
        </div>
      )}
      {tab === "decisions" && (
        <div className="audit-body">
          <p className="notice-inline">
            Decisions API gửi một batch. Các câu dưới đây cùng thuộc kết quả đã
            lưu, không phải từng lời gọi riêng.
          </p>
          <label className="inline-field">
            Nhóm câu hỏi
            <select
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            >
              <option value="all">Tất cả ({questions.length})</option>
              {[...new Set(questions.map((q) => q.group ?? q.domain))].map(
                (key) => (
                  <option key={key} value={key}>
                    {groupNames[key] ?? key}
                  </option>
                ),
              )}
            </select>
          </label>
          {visibleQuestions.map((question) => (
            <details className="question" key={question.id}>
              <summary>
                <span className="question-id">{question.id}</span>
                <span>{question.dimension.replaceAll("_", " ")}</span>
                <Source>{question.status}</Source>
                <strong>
                  {typeof question.value === "number"
                    ? number(question.value)
                    : question.status === "MISSING"
                      ? "–"
                      : String(question.value ?? "–")}
                </strong>
              </summary>
              <div className="question-content">
                <p>
                  {question.instructions ??
                    question.reason ??
                    "Không có nội dung câu hỏi trong bản lưu."}
                </p>
                {question.answer?.confidence != null && (
                  <p className="muted">
                    Độ tin cậy: {number(question.answer.confidence * 100)}%
                  </p>
                )}
                <div className="probabilities">
                  {question.answer?.probabilities?.map((level, index) => (
                    <div key={index}>
                      <span>{level.label ?? String(level.value)}</span>
                      <meter min="0" max="1" value={level.probability} />
                      <strong>{number(level.probability * 100)}%</strong>
                    </div>
                  ))}
                </div>
                {question.levels?.map((level) => (
                  <p className="small" key={level.label}>
                    <b>{level.label}</b> · {level.description}
                  </p>
                ))}
                <h4>Dữ liệu đã gửi</h4>
                {question.inputs.map((input) => (
                  <details key={input}>
                    <summary>
                      {input}{" "}
                      <Source>
                        {run.result.features[input]?.status ?? "MISSING"}
                      </Source>
                    </summary>
                    <JsonView value={run.result.features[input]} />
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {tab === "scores" && (
        <div className="audit-body">
          <div className="notice-inline">
            <FileSearch size={18} /> Điểm và trọng số được đọc nguyên bản từ run
            #{run.id}. Frontend không tính lại.
          </div>
          <details open>
            <summary>Công thức điểm tổng được lưu</summary>
            <JsonView value={run.result.overall} />
          </details>
          {run.result.scores.map((group) => (
            <details key={group.name}>
              <summary>
                {groupNames[group.name] ?? group.name} · {number(group.score)} ·
                coverage {number(group.coverage * 100)}%
              </summary>
              {group.criteria.map((criterion) => (
                <div className="criterion" key={criterion.id}>
                  <h4>
                    {criterion.id} · {criterion.name}{" "}
                    <b>{number(criterion.score)}</b>
                  </h4>
                  <p>{criterion.reason || `Trọng số: ${criterion.weight}`}</p>
                  {criterion.inputs.map((input) => (
                    <details key={input}>
                      <summary>{input}</summary>
                      <Source>
                        {run.result.features[input]?.status ?? "MISSING"}
                      </Source>
                      <Value value={run.result.features[input]?.value} />
                      <JsonView value={run.result.features[input]} />
                    </details>
                  ))}
                </div>
              ))}
            </details>
          ))}
          <details>
            <summary>Cross-check</summary>
            <JsonView value={run.result.cross_check} />
          </details>
          <details>
            <summary>Quality gate</summary>
            <JsonView value={run.result.quality_gate} />
          </details>
          <details>
            <summary>Benchmark · kết quả công bố chưa kiểm chứng</summary>
            <JsonView value={run.result.benchmark} />
          </details>
        </div>
      )}
    </section>
  );
}
