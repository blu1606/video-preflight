import { ArrowUpRight, ShieldAlert, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, Source, SourceLink } from "./shared";
import type { Run } from "./types";
import { groupNames, number, platforms, verdictNames } from "./types";

export function ResultsPanel({
  run,
  seek,
  openAudit,
}: {
  run: Run;
  seek: (sec: number) => void;
  openAudit: () => void;
}) {
  const { result } = run;
  const scores = result.scores.filter((group) =>
    ["viral_potential", "conversion_potential", "sku_market"].includes(
      group.name,
    ),
  );
  const fixes = result.fixes ?? [];
  return (
    <div className="results">
      <section className="score-summary">
        <div className="row-between">
          <span className="eyebrow">KẾT QUẢ TRƯỚC KHI ĐĂNG</span>
          <span className="small muted">Run #{run.id} · đã lưu</span>
        </div>
        <div className="overall-row">
          <div className="overall-number">
            {number(result.overall?.score)}
            <span>/100</span>
          </div>
          <div>
            <h2>{result.overall?.label_vi ?? "Chưa có điểm tổng"}</h2>
            <p>
              Coverage{" "}
              {result.overall
                ? `${number(result.overall.coverage * 100)}%`
                : "chưa xác định"}
            </p>
          </div>
        </div>
        <p className="summary-copy">
          {result.insights?.summary ??
            "Xem từng phần và bằng chứng trước khi quyết định chỉnh sửa video."}
        </p>
        <Source>
          {scores.some((group) => group.mock_dependency)
            ? "Có phụ thuộc dữ liệu giả lập"
            : "Điểm từ kết quả pipeline đã lưu"}
        </Source>
        {result.overall?.warnings.map((warning) => (
          <p className="warning-text" key={warning}>
            {warning}
          </p>
        ))}
        <div className="score-groups">
          {scores.map((group) => (
            <div key={group.name}>
              <div className="row-between">
                <span>{groupNames[group.name]}</span>
                <strong>{number(group.score)}</strong>
              </div>
              {group.score != null && (
                <meter
                  aria-label={`${groupNames[group.name]} score`}
                  min="0"
                  max="100"
                  value={group.score}
                />
              )}
              <small>
                Coverage {number(group.coverage * 100)}%
                {group.mock_dependency ? " · simulated" : ""}
              </small>
              {group.score == null && <p>Chưa đủ dữ liệu để chấm.</p>}
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={openAudit}>
          <ScanSearch />
          Điểm này đến từ đâu?
          <ArrowUpRight />
        </Button>
      </section>
      <section className="panel fixes">
        <div className="section-heading">
          <div>
            <h2>Ưu tiên sửa trước</h2>
            <p className="muted">Đề xuất từ lần chấm đã lưu.</p>
          </div>
          <span className="count-chip">{fixes.length}</span>
        </div>
        {fixes.length === 0 ? (
          <Empty>Bản lưu chưa có danh sách việc cần sửa.</Empty>
        ) : (
          <>
            {fixes.slice(0, 3).map((fix, index) => (
              <article className="fix" key={fix.id}>
                <span className="fix-number">{index + 1}</span>
                <div>
                  <h3>{fix.title}</h3>
                  <p>{fix.action}</p>
                  <div className="time-chips">
                    {fix.in_caption && <Source>Caption</Source>}
                    {fix.timestamps?.slice(0, 4).map((stamp, i) => (
                      <button onClick={() => seek(stamp.start)} key={i}>
                        {stamp.label}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                  <details>
                    <summary>Lý do & nguồn</summary>
                    <p>{fix.why}</p>
                    {fix.refs?.map((ref) => (
                      <SourceLink key={ref} url={ref}>
                        {ref.startsWith("http") ? "Nguồn chính sách" : ref}
                      </SourceLink>
                    ))}
                  </details>
                </div>
              </article>
            ))}
            {fixes.length > 3 && (
              <details>
                <summary>Xem thêm {fixes.length - 3} đề xuất</summary>
                {fixes.slice(3).map((fix) => (
                  <article className="extra-fix" key={fix.id}>
                    <h3>{fix.title}</h3>
                    <p>{fix.action}</p>
                    {fix.timestamps?.map((stamp, i) => (
                      <button
                        className="text-link"
                        onClick={() => seek(stamp.start)}
                        key={i}
                      >
                        {stamp.label}
                      </button>
                    ))}
                  </article>
                ))}
              </details>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>
              <ShieldAlert size={20} /> Policy theo nền tảng
            </h2>
            <p className="muted">
              Baseline lưu tại thời điểm chạy. Không phải phê duyệt đăng.
            </p>
          </div>
        </div>
        {Object.entries(result.policy?.targets ?? {}).map(
          ([platform, policy]) => (
            <details className="policy-row" key={platform}>
              <summary>
                <strong>{platforms[platform] ?? platform}</strong>
                <span
                  className={
                    policy.verdict === "needs_review"
                      ? "status warning"
                      : "status"
                  }
                >
                  {verdictNames[policy.verdict] ?? "Chưa đủ dữ liệu"}
                </span>
              </summary>
              {policy.findings.map((finding, index) => (
                <div className="finding" key={`${finding.rule_id}-${index}`}>
                  <div className="row-between">
                    <b>{finding.rule_id}</b>
                    <span className="small">
                      {verdictNames[finding.outcome] ?? finding.outcome}
                    </span>
                  </div>
                  <p>{finding.summary}</p>
                  {finding.evidence.map((evidence, i) => {
                    const stamp = /^(\d{2}):(\d{2})/.exec(evidence);
                    return (
                      <p className="evidence" key={i}>
                        {stamp && (
                          <button
                            onClick={() =>
                              seek(Number(stamp[1]) * 60 + Number(stamp[2]))
                            }
                          >
                            {stamp[0]}
                          </button>
                        )}
                        {evidence}
                      </p>
                    );
                  })}
                  <SourceLink url={finding.source_url}>
                    Nguồn chính thức
                  </SourceLink>
                </div>
              ))}
              <details>
                <summary>Hợp nền tảng · không tính vào điểm</summary>
                {result.platform_fit?.targets[platform]?.checks.map((check) => (
                  <div className="fit-check" key={check.id}>
                    <b>{check.label}</b>
                    <span>{verdictNames[check.status] ?? check.status}</span>
                    <p>{check.note || check.spec}</p>
                    {check.sources?.map((source, i) => (
                      <SourceLink
                        key={i}
                        url={typeof source === "string" ? source : source.url}
                      >
                        Nguồn thông số
                      </SourceLink>
                    ))}
                  </div>
                )) ?? <p>Chưa có checklist trong lần chạy này.</p>}
              </details>
            </details>
          ),
        )}
        {!result.policy && <Empty>Chưa đủ dữ liệu Policy.</Empty>}
      </section>
    </div>
  );
}
