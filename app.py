"""Streamlit UI for the e-commerce video scorecard.

Run (from video_understanding/demo):
    uv run streamlit run app.py
"""

import json
from pathlib import Path

import pandas as pd
import streamlit as st

from sources.extractor import VISION_MODEL, find_cached, run_extraction
from sources.benchmark import find_row
from main import SEED_PATH, build_report, seed_videos, short, to_json
from sources.providers import load_seed
from core.schema import Mode

HERE = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = HERE.parent / "data"
FIXTURES_DIR = HERE / "fixtures"
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv"}
STATUS_COLOR = {"REAL": "#d4edda", "MOCK": "#fff3cd", "MISSING": "#f8d7da", "INFERRED": "#d1ecf1"}

st.set_page_config(page_title="Video Scorecard", layout="wide")
st.title("E-commerce Video Scorecard")
st.session_state.setdefault("features_path", {})

# ---------- Sidebar: inputs ----------
with st.sidebar:
    data_dir = Path(st.text_input("Thư mục video", str(DEFAULT_DATA_DIR)))
    videos = sorted(p for p in data_dir.glob("*") if p.suffix.lower() in VIDEO_EXT) if data_dir.is_dir() else []
    if not videos:
        st.warning(f"Không có video trong {data_dir}")
        st.stop()
    video = st.selectbox("Video", videos, format_func=lambda p: p.name)

    source = st.radio("Dữ liệu SKU / hiệu suất", ["Dữ liệu shop nội bộ (Shopee)", "Fixture JSON"],
                      help="Đối chiếu video với hiệu suất của một shop trong dữ liệu nội bộ.")
    fixture = shop_id = seed_video = None
    if source == "Fixture JSON":
        fixtures = sorted(d for d in FIXTURES_DIR.iterdir() if (d / "sku.json").is_file())
        fixture = st.selectbox("Mock fixture (SKU / Market / Performance)", fixtures, format_func=lambda p: p.name)
    else:
        bench_row = find_row(video)
        shops = {s["shop_id"]: s["shop_name"] for s in load_seed(SEED_PATH)["shops"]}
        shop_ids = list(shops)
        default_shop = (bench_row or {}).get("synthetic_shop_id_analogy") or shop_ids[0]
        shop_id = st.selectbox("Shop", shop_ids, index=shop_ids.index(default_shop),
                               format_func=lambda s: f"{s} · {shops[s]}")
        slots = seed_videos(shop_id)
        default_slot = bench_row["seed_video_id"] if bench_row and bench_row["seed_video_id"] in slots else slots[0]
        seed_video = st.selectbox("Ghép với hiệu suất của video", slots, index=slots.index(default_slot),
                                  help="Nội dung lấy từ video thật (VLM), số liệu views/CTR/CVR lấy từ video này trong dữ liệu shop.")
        if bench_row and not bench_row["seed_video_id"]:
            st.caption(f"Benchmark Clipcat: **{bench_row['video_label']}** chưa được gán shop "
                       "(hết slot cùng ngành hàng); đang ghép tạm với shop đầu tiên.")
        elif bench_row:
            st.caption(f"Benchmark Clipcat: **{bench_row['video_label']}** → mặc định {bench_row['seed_video_id']} "
                       "(ghép với shop nội bộ, video thật không thuộc shop này).")



    cached = find_cached(video)
    st.caption(f"Cache features: `{cached.name}`" if cached else "Chưa có cache, bấm Chạy sẽ gọi OpenAI.")
    force = st.checkbox("Trích xuất lại (gọi OpenAI, tốn token)", disabled=cached is None)
    model = st.text_input("Vision model", VISION_MODEL)
    run = st.button("Chạy", type="primary", width="stretch")

# ---------- Run extraction (only when needed) ----------
key = str(video)
if run:
    if cached is None or force:
        with st.status("Đang trích xuất features từ video...", expanded=True) as status:
            try:
                path = run_extraction(video, model, on_step=st.write)
            except Exception as e:  # surface API/ffmpeg errors in the UI
                status.update(label="Trích xuất thất bại", state="error")
                st.exception(e)
                st.stop()
            status.update(label="Trích xuất xong", state="complete", expanded=False)
    else:
        path = cached
    st.session_state.features_path[key] = str(path)

col_video, col_main = st.columns([1, 3])
with col_video:
    st.video(str(video))

features_path = st.session_state.features_path.get(key)
if not features_path:
    col_main.info("Chọn video ở sidebar và bấm **Chạy**.")
    st.stop()

report = build_report(Path(features_path), Mode.SIMULATION, fixture, shop_id, seed_video)
raw = json.loads(Path(features_path).read_text(encoding="utf-8"))
data_label = fixture.name if fixture else f"{shop_id} / {seed_video}"

# ---------- Summary ----------
with col_main:
    st.caption(f"Features: `{features_path}` | Data: `{data_label}`")

    cols = st.columns(len(report["scores"]) + 1)
    for c, g in zip(cols, report["scores"]):
        c.metric(g.name.replace("_", " ").title(), "not_scored" if g.score is None else f"{g.score}/100")
        c.progress(g.coverage, text=f"coverage {g.coverage:.0%}")

    funnel = report["revenue_funnel"]
    if funnel["status"] == "not_scored":
        cols[-1].metric("Expected GMV", "not_scored")
        cols[-1].caption(funnel["reason"])
    else:
        cols[-1].metric("Expected GMV", f"{funnel['expected_gmv_vnd']:,} đ")
        cols[-1].caption(f"{funnel['status']} · {funnel['orders']} đơn")

tab_scores, tab_policy, tab_shop, tab_sources, tab_video, tab_json = st.tabs(
    ["Điểm chi tiết", "Policy", "Shop & đối chiếu", "Nguồn dữ liệu", "Video features", "JSON"]
)

with tab_policy:
    policy = report["policy"]
    st.caption(f"Baseline v{policy['baseline_version']}: bộ rule rút gọn, diễn giải lại từ trang chính sách chính thức. "
               "Kết quả là cần xem lại / chưa đủ dữ liệu, không phải nền tảng phê duyệt.")
    for target, t in policy["targets"].items():
        st.subheader(f"{target}: {t['verdict']} · {t['score'] if t['score'] is not None else 'not_scored'}")
        st.dataframe(
            [{"rule": f["rule_id"], "mức": f["severity"], "kết quả": f["outcome"],
              "tính điểm": f["counted"], "bằng chứng": " | ".join(f["evidence"]), "nguồn": f["source_url"]}
             for f in t["findings"]],
            hide_index=True, width="stretch",
            column_config={"nguồn": st.column_config.LinkColumn("nguồn")},
        )

with tab_shop:
    bench = report["benchmark"]
    if bench:
        st.subheader(f"Đối chứng thực tế (Clipcat): {bench['label']}")
        st.caption(f"Số liệu Clipcat công bố, chưa kiểm chứng · cờ: **{bench['source_quality_flag']}** · "
                   "sales là số lượng bán, không phải số đơn.")
        c = st.columns(6)
        c[0].metric("Viral score (model)", bench["model_viral_score"] or "not_scored")
        c[1].metric("Conversion score (model)", bench["model_conversion_score"] or "not_scored")
        c[2].metric("Views", f"{bench['views']:,}")
        c[3].metric("Sales", f"{bench['sales']:,}")
        c[4].metric("Sales / 1K views", bench["sales_per_1k_views"])
        c[5].metric("GMV USD / 1K views", bench["gmv_usd_per_1k_views"])
        st.divider()
    shop = report["shop"]
    if shop is None:
        st.info("Chọn nguồn **Dữ liệu shop nội bộ (Shopee)** ở sidebar để đối chiếu video với hiệu suất shop.")
    else:
        for c, g in zip(st.columns(len(shop["scores"])), shop["scores"]):
            c.metric(g.name.replace("_", " ").title(), "not_scored" if g.score is None else f"{g.score}/100")
        d = shop["diagnosis"]
        if d["status"] == "not_scored":
            st.warning(f"Chẩn đoán shop: not_scored ({d['reason']})")
        else:
            st.subheader(f"Chẩn đoán: {d['primary_issue']} · độ tin cậy {d['confidence']}")
            if d["confidence"] == "low":
                st.warning("Dữ liệu chưa đủ: các tín hiệu bên dưới chỉ là sơ bộ, không kết luận shop yếu.")
            for f in d["findings"] + d["tentative"]:
                tentative = " · sơ bộ" if f in d["tentative"] else ""
                with st.expander(f"[{f['priority']}] {f['area']}{tentative}: {f['root_cause']}", expanded=True):
                    for e in f["evidence"]:
                        st.write(f"- {e}")
                    st.markdown(f"**Hành động:** {f['action']}")
        st.subheader("Video vs shop: lỗi nằm ở video hay ở SKU/shop?")
        st.dataframe(pd.DataFrame(shop["videos"]).assign(
            content_notes=lambda df: df.content_notes.map(" ".join),
            paired=lambda df: df.video_id.eq(seed_video).map({True: "◀ video đang xem", False: ""}),
        ), hide_index=True, width="stretch")
        for c, g in zip(st.columns(len(shop["scores"])), shop["scores"]):
            c.dataframe(pd.DataFrame([{"criterion": x.name, "score": x.score} for x in g.criteria]),
                        hide_index=True, width="stretch")

with tab_scores:
    for g in report["scores"]:
        st.subheader(f"{g.name.replace('_', ' ').title()}: "
                     f"{'not_scored' if g.score is None else g.score} · coverage {g.coverage:.0%}")
        df = pd.DataFrame([{
            "id": c.id,
            "criterion": c.name,
            "weight": c.weight,
            "score": c.score,
            "inputs / reason": c.reason or ", ".join(c.inputs),
        } for c in g.criteria])
        st.dataframe(
            df, hide_index=True, width="stretch",
            column_config={"score": st.column_config.ProgressColumn("score", min_value=0, max_value=100, format="%.1f")},
        )

with tab_sources:
    features = report["features"]
    counts = pd.Series([f.status.value for f in features.values()]).value_counts()
    for c, status in zip(st.columns(4), STATUS_COLOR):
        c.metric(status, int(counts.get(status, 0)))
    df = pd.DataFrame([{
        "feature": name,
        "status": f.status.value,
        "source": f.source or "-",
        "evidence": ", ".join(f.evidence),
        "value": short(f.value, 80),
    } for name, f in features.items()])
    st.dataframe(
        df.style.map(lambda s: f"background-color: {STATUS_COLOR.get(s, '')}", subset=["status"]),
        hide_index=True, width="stretch", height=600,
    )

with tab_video:
    f = raw["features"]
    c1, c2 = st.columns(2)
    c1.markdown("**Latency (s)**")
    c1.json(raw.get("benchmark_latency", {}))
    c2.markdown("**Token usage**")
    c2.json(raw.get("token_usage", {}))
    st.markdown("**Transcript**")
    st.write(raw.get("transcript") or "_(không có lời thoại)_")
    st.markdown("**Key moments**")
    st.dataframe(pd.DataFrame(f.get("key_moments", [])), hide_index=True, width="stretch")
    reasons = f.get("scoring", {}).get("rubric_reasons", {})
    c1, c2 = st.columns(2)
    c1.markdown("**Điểm mạnh (VLM)**")
    for s in reasons.get("strengths", []):
        c1.write(f"- {s}")
    c2.markdown("**Điểm yếu (VLM)**")
    for s in reasons.get("weaknesses", []):
        c2.write(f"- {s}")

with tab_json:
    data = to_json(report)
    st.download_button(
        "Tải report JSON",
        json.dumps(data, ensure_ascii=False, indent=2),
        file_name=f"{video.stem}_{report['video_id']}_simulation.json",
        mime="application/json",
    )
    st.json(data, expanded=False)
