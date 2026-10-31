import './preflight.css'
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Clapperboard,
  Film,
  Info,
  LayoutDashboard,
  Plus,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Catalog, Extraction, Run } from "./types";
import { money, number, readJson, time } from "./types";
import { Empty, Source } from "./shared";
import { ResultsPanel } from "./results-panel";
import { AuditPanel } from "./audit-panel";
const ShopPanel = lazy(() =>
  import("./shop-panel").then((module) => ({ default: module.ShopPanel })),
);
import { DraftPanel } from "./draft-panel";

export default function PreflightApp() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [shopId, setShopId] = useState("SHOP001");
  const [videoId, setVideoId] = useState(
    new URLSearchParams(location.search).get("video") ?? "SHOP001-VID01",
  );
  const [skuId, setSkuId] = useState("SHOP001-SKU01");
  const [runId, setRunId] = useState<number | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [runError, setRunError] = useState("");
  const [runReload, setRunReload] = useState(0);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [mediaAvailable, setMediaAvailable] = useState(false);
  const [tab, setTab] = useState("results");
  const [draft, setDraft] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [music, setMusic] = useState("Chưa nhận diện được nhạc");
  const [reload, setReload] = useState(0);
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const c = new AbortController();
    readJson<Catalog>("/demo/app/catalog.json", c.signal)
      .then((data) => {
        setCatalog(data);
        const requested = new URLSearchParams(location.search).get("video");
        const video =
          data.videos.find((v) => v.id === requested) ?? data.videos[0];
        setVideoId(video.id);
        setShopId(video.shopId);
        setSkuId(video.sku_id);
        setRunId(
          data.runs
            .filter((item) => item.targetId === video.id)
            .sort((a, b) => b.id - a.id)[0]?.id ?? null,
        );
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [reload]);
  const video = catalog?.videos.find((item) => item.id === videoId);
  const shop = catalog?.shops.find((item) => item.id === shopId);
  const skus = catalog?.skus.filter((item) => item.shopId === shopId) ?? [];
  const videos = catalog?.videos.filter((item) => item.shopId === shopId) ?? [];
  const histories =
    catalog?.runs
      .filter((item) => item.targetId === videoId)
      .sort((a, b) => b.id - a.id) ?? [];
  const stem = video?.local_file?.replace(/\.[^.]+$/, "") ?? "";
  useEffect(() => {
    if (!catalog || !video) return;
    const url = new URL(location.href);
    url.searchParams.set("video", video.id);
    window.history.replaceState(null, "", url);
    const c = new AbortController();
    if (stem) {
      readJson<Extraction>(`/demo/features/${stem}.json`, c.signal)
        .then(data => setExtraction({ ...data, frame_files: data.frame_files ?? video.frame_files ?? [] }))
        .catch(() => {});
      fetch(`/media/${video.local_file}`, { method: "HEAD", signal: c.signal })
        .then((response) =>
          setMediaAvailable(
            response.ok &&
              (response.headers.get("content-type") ?? "").startsWith("video/"),
          ),
        )
        .catch(() => {});
      readJson<{ title?: string; artist?: string }>(
        `/demo/music/${stem}.json`,
        c.signal,
      )
        .then((item) => {
          if (item.title)
            setMusic(`${item.title}${item.artist ? ` · ${item.artist}` : ""}`);
        })
        .catch(() => {});
    }
    return () => c.abort();
  }, [catalog, video, stem]);
  useEffect(() => {
    if (runId == null) return;
    const c = new AbortController();
    readJson<Run>(`/demo/app/runs/${runId}.json`, c.signal)
      .then(setRun)
      .catch((e) => {
        if (e.name !== "AbortError") setRunError(e.message);
      });
    return () => c.abort();
  }, [runId, runReload]);
  function chooseRun(id: number | null) {
    if (id === runId) return;
    setRunId(id);
    setRun(null);
    setRunError("");
  }
  function chooseVideo(id: string) {
    setVideoId(id);
    const selected = catalog?.videos.find((item) => item.id === id);
    if (selected) setSkuId(selected.sku_id);
    chooseRun(
      catalog?.runs
        .filter((item) => item.targetId === id)
        .sort((a, b) => b.id - a.id)[0]?.id ?? null,
    );
    setExtraction(null);
    setMediaAvailable(false);
    setCurrentTime(0);
    setDraft(false);
    setMusic("Chưa nhận diện được nhạc");
  }
  function seek(sec: number) {
    setCurrentTime(sec);
    if (player.current) player.current.currentTime = sec;
    document
      .getElementById("video-preview")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  const nearestFrame = extraction?.frame_files?.reduce<string | null>(
    (best, file) =>
      best === null ||
      Math.abs(Number.parseFloat(file) - currentTime) <
        Math.abs(Number.parseFloat(best) - currentTime)
        ? file
        : best,
    null,
  );
  if (error)
    return (
      <main className="fatal">
        <Empty>{error}</Empty>
        <Button onClick={() => (setError(""), setReload((value) => value + 1))}>
          Tải lại dữ liệu
        </Button>
      </main>
    );
  if (!catalog || !shop || !video)
    return (
      <main className="fatal" role="status">
        <div className="skeleton" />
        <p>Đang đọc dữ liệu demo…</p>
      </main>
    );
  const loading = runId != null && run?.id !== runId && !runError;
  const selectedSku = skus.find((item) => item.id === skuId);
  const savedRun = run?.targetId === videoId ? run : null;
  const health = savedRun?.result.scores.find(
    (group) => group.name === "shop_health",
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/demo">
          <span className="brand-mark">
            <Clapperboard size={23} />
          </span>
          video<span>preflight</span>
        </a>
        <nav aria-label="Điều hướng chính"><a className="text-link" href="/">Studio</a>
          <button
            className={tab !== "shop" ? "active" : ""}
            onClick={() => setTab("results")}
          >
            <Film size={17} />
            Kiểm tra video
          </button>
          <button
            className={tab === "shop" ? "active" : ""}
            onClick={() => setTab("shop")}
          >
            <LayoutDashboard size={17} />
            Shop & thị trường
          </button>
        </nav>
        <label className="shop-picker">
          <span>Shop đang xem</span>
          <select
            aria-label="Chọn shop"
            value={shopId}
            onChange={(event) => {
              const id = event.target.value;
              setShopId(id);
              const first = catalog.videos.find((item) => item.shopId === id);
              if (first) chooseVideo(first.id);
            }}
          >
            {catalog.shops.map((item) => (
              <option key={item.id} value={item.id}>
                {item.shop_name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="dataset-banner">
        <Info size={16} />
        <span>
          Shop và SKU là dữ liệu giả lập để thử nghiệm, không phản ánh shop
          thật.
        </span>
        <Source>db.json · snapshot</Source>
      </div>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <span className="breadcrumb">
              {shop.shop_name}
              <span>/</span>Kiểm tra trước khi đăng
            </span>
            <h1>Video này đã sẵn sàng?</h1>
            <p>Biết điểm yếu. Xem bằng chứng. Sửa đúng chỗ.</p>
          </div>
          <Button
            onClick={() => {
              setDraft(!draft);
              setTab("results");
            }}
          >
            <Plus />
            Chuẩn bị video
          </Button>
        </div>
        <section className="shop-context">
          <span className="shop-avatar">{shop.shop_name.slice(0, 1)}</span>
          <div>
            <strong>{shop.shop_name}</strong>
            <small>
              {shop.main_category} · <Source>MOCK</Source>
            </small>
          </div>
          <div className="context-metric">
            <small>GMV 30 ngày · giả lập</small>
            <strong>{money(shop.gmv_30d_vnd)}</strong>
          </div>
          <div className="context-metric">
            <small>Shop health · ngoài điểm video</small>
            <strong>
              {number(health?.score)}
              <span>
                {health
                  ? ` /100 · coverage ${number(health.coverage * 100)}% · simulated`
                  : " Chưa có điểm"}
              </span>
            </strong>
          </div>
          <button className="text-link" onClick={() => setTab("shop")}>
            Xem shop
            <ArrowRight size={16} />
          </button>
        </section>
        {draft && (
          <DraftPanel
            key={videoId}
            video={video}
            skus={skus}
            close={() => setDraft(false)}
          />
        )}
        <div className="selection-bar">
          <label>
            Video
            <select
              aria-label="Chọn video"
              value={videoId}
              onChange={(event) => chooseVideo(event.target.value)}
            >
              {videos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.product_label ?? item.id} · {item.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            SKU đối chiếu
            <select
              aria-label="Chọn SKU"
              value={skuId}
              onChange={(event) => setSkuId(event.target.value)}
            >
              {[...skus]
                .sort(
                  (a, b) =>
                    Number(b.id === video.sku_id) -
                    Number(a.id === video.sku_id),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id === video.sku_id ? "Gắn với video · " : ""}
                    {item.item_name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Lịch sử kết quả
            <select
              aria-label="Lịch sử kết quả"
              value={runId ?? ""}
              disabled={!histories.length}
              onChange={(event) => chooseRun(Number(event.target.value))}
            >
              {histories.length ? (
                histories.map((item) => (
                  <option key={item.id} value={item.id}>
                    Run #{item.id} ·{" "}
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString("vi-VN")
                      : "đã lưu"}
                  </option>
                ))
              ) : (
                <option value="">Chưa có lần chạy</option>
              )}
            </select>
          </label>
        </div>
        {skuId !== video.sku_id && (
          <p className="notice-inline">
            SKU này chỉ dùng xem đối chiếu thị trường. Kết quả đã lưu vẫn gắn
            với {video.sku_id}.
          </p>
        )}
        {tab === "shop" ? (
          <Suspense fallback={<p role="status">Đang tải biểu đồ shop…</p>}>
            <ShopPanel
              catalog={catalog}
              shop={shop}
              skus={skus}
              skuId={skuId}
            />
          </Suspense>
        ) : (
          <>
            <div className="analysis-layout">
              <aside className="video-column" id="video-preview">
                <div className="video-card">
                  <div className="row-between">
                    <strong>
                      <Film size={16} /> Video đang xem
                    </strong>
                    <span>{number(video.duration_sec)}s</span>
                  </div>
                  <div className="phone-preview">
                    {mediaAvailable ? (
                      <video
                        key={video.id}
                        ref={player}
                        src={`/media/${video.local_file}`}
                        controls
                        preload="metadata"
                        onTimeUpdate={(event) =>
                          setCurrentTime(event.currentTarget.currentTime)
                        }
                        onError={() => setMediaAvailable(false)}
                        poster={
                          nearestFrame
                            ? `/demo/frames/${stem}/${nearestFrame}`
                            : undefined
                        }
                      />
                    ) : nearestFrame ? (
                      <img
                        src={`/demo/frames/${stem}/${nearestFrame}`}
                        alt={`Frame đã lưu tại ${time(currentTime)}`}
                      />
                    ) : (
                      <div className="no-video">
                        <Film size={36} />
                        <p>Chưa có video hoặc frame</p>
                      </div>
                    )}
                  </div>
                  <div className="video-footer">
                    <span>
                      {time(currentTime)} / {time(video.duration_sec ?? 0)}
                    </span>
                    <Source>
                      {mediaAvailable
                        ? "Video local"
                        : nearestFrame
                          ? "Frame đã lưu"
                          : "MISSING"}
                    </Source>
                  </div>
                  {!mediaAvailable && (
                    <p className="small muted">
                      Video không có trong bản clone/build. Mốc thời gian mở
                      frame đã lưu nếu có.
                    </p>
                  )}
                  <div className="timeline-markers">
                    {savedRun?.result.markers
                      ?.filter(
                        (marker, index, all) =>
                          ["issue", "ghost"].includes(marker.kind) &&
                          all.findIndex(
                            (other) =>
                              ["issue", "ghost"].includes(other.kind) &&
                              other.t_start === marker.t_start &&
                              other.kind === marker.kind,
                          ) === index,
                      )
                      .slice(0, 14)
                      .map((marker) => (
                        <button
                          key={marker.id}
                          title={`${marker.title}: ${marker.comment}`}
                          onClick={() => seek(marker.t_start)}
                        >
                          {marker.precise === false
                            ? (marker.time_label ??
                              `${time(marker.t_start)}–${time(marker.t_end ?? video.duration_sec)}`)
                            : time(marker.t_start)}
                          {marker.kind === "ghost" ? " · gợi ý" : ""}
                        </button>
                      ))}
                  </div>
                  <p className="music">
                    ♪ {music}
                    <small>Quyền sử dụng: chưa xác minh</small>
                  </p>
                </div>
                <div className="product-brief">
                  {selectedSku && (
                    <>
                      <img
                        src={`/demo/skus/${selectedSku.id}.jpg`}
                        alt={selectedSku.item_name}
                      />
                      <div>
                        <strong>{selectedSku.item_name}</strong>
                        <p>{money(selectedSku.price_vnd)}</p>
                        <Source>SKU giả lập</Source>
                      </div>
                    </>
                  )}
                </div>
                <details className="caption">
                  <summary>Caption & hashtag của video</summary>
                  <p>{video.post?.caption || "Chưa có caption."}</p>
                  <p className="muted">
                    {video.post?.hashtags?.map((tag) => `#${tag}`).join(" ")}
                  </p>
                  <Button variant="outline" onClick={() => setDraft(true)}>
                    Sửa bản nháp
                  </Button>
                </details>
                <p className="small muted">
                  <ShieldCheck size={15} /> Chỉ đọc snapshot. Không gọi API trả
                  phí, không tự đăng lên sàn.
                </p>
              </aside>
              {loading ? (
                <section className="panel" role="status">
                  <div className="skeleton" />
                  <p>Đang đọc kết quả đã lưu…</p>
                </section>
              ) : runError ? (
                <div role="alert" className="panel">
                  <Empty>{runError}</Empty>
                  <Button
                    onClick={() => {
                      setRunError("");
                      setRunReload((value) => value + 1);
                    }}
                  >
                    Thử lại
                  </Button>
                </div>
              ) : savedRun ? (
                <ResultsPanel
                  run={savedRun}
                  seek={seek}
                  openAudit={() => {
                    setTab("audit");
                    setTimeout(
                      () =>
                        document
                          .getElementById("audit")
                          ?.scrollIntoView({ behavior: "smooth" }),
                      0,
                    );
                  }}
                />
              ) : (
                <section className="panel">
                  <Empty>
                    Video này chưa có kết quả trong db.json. Không có điểm để
                    hiển thị.
                  </Empty>
                  <p className="muted">
                    Bạn có thể xem video, SKU và chuẩn bị bản nháp. Phân tích
                    mới cần backend.
                  </p>
                  <Button variant="outline" onClick={() => setDraft(true)}>
                    Chuẩn bị bản nháp
                  </Button>
                </section>
              )}
            </div>
            {savedRun && (
              <div id="audit">
                {tab === "audit" ? (
                  <AuditPanel
                    key={savedRun.id}
                    run={savedRun}
                    extraction={extraction}
                    stem={stem}
                    seek={seek}
                  />
                ) : (
                  <button
                    className="audit-launch"
                    onClick={() => setTab("audit")}
                  >
                    <ScanSearch size={24} />
                    <span>
                      <strong>Mở hồ sơ kiểm chứng</strong>
                      <small>
                        Luồng agent, frames, lời thoại và từng câu Decisions API
                      </small>
                    </span>
                    <ArrowRight />
                  </button>
                )}
              </div>
            )}
          </>
        )}
        <footer className="footer">
          <span>Video Preflight · Dữ liệu có nguồn, quyết định có căn cứ.</span>
          <details>
            <summary>Nguồn snapshot</summary>
            <p>{catalog.provenance.source}</p>
            <code>{catalog.provenance.sha256}</code>
            <p>{catalog.meta.warning}</p>
          </details>
        </footer>
      </main>
    </div>
  );
}
