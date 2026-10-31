> **Tài liệu tham chiếu nhập trước khi triển khai.** Các mô tả backend, API và file dưới đây là đặc tả/bối cảnh cũ, không phải bằng chứng các chức năng đó đã chạy ở repo mới. Xem [runtime contract hiện tại](runtime-contract.md), [README](../README.md) và [development log](development-log.md). UI mới dùng tiếng Việt; trọng số đã chốt 35/45/20, shop health tách riêng.

# UI/UX requirements: Video Intelligence Lab

Mục tiêu: dựng lại giao diện của Lab thành một sản phẩm demo được trong **24 giờ**, code thẳng bằng React trong `web/`. Backend đã chạy đủ. Tài liệu này mô tả **cần hiển thị gì và lấy dữ liệu ở đâu**. Phong cách, bố cục và chọn desktop/mobile là do bạn quyết.

## 1. Sản phẩm làm gì

Seller upload một video bán hàng **trước khi đăng**, gắn với một SKU trong shop của họ. AI xem video (frames, lời thoại), đối chiếu với dữ liệu shop/SKU, dữ liệu thị trường đã cào (TikTok Shop qua FastMoss, Google Shopping qua SerpAPI) và chính sách các nền tảng. Kết quả là **điểm, lý do và việc cần sửa**. Mọi con số đều truy được về nguồn.

## 2. Người dùng: 2 lớp giao diện

| Lớp | Ai | Cần gì |
|---|---|---|
| **Seller view** (mặc định) | Chủ shop, người làm content | Một điểm tổng dễ hiểu, điểm từng phần, vài việc cần sửa có mốc thời gian trong video, cảnh báo chính sách. Không có thuật ngữ kỹ thuật. |
| **Audit view** ("How was this scored?") | Ban giám khảo, người muốn kiểm chứng | Luồng agent chạy thế nào, AI đã xem gì, Decisions API hỏi gì và trả lời gì, đối chiếu chéo, code tính điểm, nguồn dữ liệu. |

Seller view là màn chính. Audit view mở ra từ seller view (nút, tab hoặc drawer), không phải một ứng dụng riêng.

**Ngôn ngữ UI: tiếng Anh.** Lưu ý dữ liệu nội dung (tên sản phẩm, lời thoại, claim) vẫn là tiếng Việt.

## 3. Màn hình và ưu tiên

**P0** là bắt buộc cho demo, **P1** là nên có, **P2** là nếu còn giờ.

### 3.1 Upload (P0): `/upload`
Đang có ở `web/src/pages/upload-page.jsx`, giữ nguyên logic và làm lại giao diện.
- File video (mp4/mov/webm/mkv) kèm tiến trình upload.
- **Product**: chọn Shop, rồi chọn SKU sẽ gắn giỏ hàng (mặc định). Chế độ phụ: tự nhập listing (tên, link, giá…).
- **Where will it be posted**: chọn nhiều trong `tiktok_shop_video`, `tiktok_ads`, `shopee_listing`, `meta_ads`.
- **Who posts**: `own_shop` / `affiliate` / `sponsored`. **Commercial label**: checkbox "will turn on the paid-partnership label".
- **Goal** (select), ngân sách, chiến dịch (tùy chọn), **Question** (3 câu chọn nhanh + ô gõ tự do).
- Submit gọi `POST /py/videos/upload`, xong chuyển sang trang kết quả `?video=<id>`.

### 3.2 Kết quả, seller view (P0): `/analyze?video=<id>`
Thứ tự thông tin trên màn:
1. **Overall score 0–100** to và rõ, kèm nhãn trạng thái (xem §5) và coverage (đã chấm được bao nhiêu % tiêu chí).
2. **Điểm theo phần**: Viral, Conversion, SKU & market, Policy. Shop health tách riêng, ghi rõ là điểm của shop chứ không phải của video.
3. **Top fixes**: 3 tiêu chí yếu nhất, mỗi cái kèm lý do bằng ngôn ngữ dễ hiểu và **mốc thời gian bấm được để tua video** (nếu có).
4. **Policy per platform**: mỗi nền tảng đã chọn có verdict `needs_review` / `no_issue_detected` / `unknown` và danh sách rule bị dính.
   - **Hợp nền tảng** (hàng riêng trong bảng theo nền tảng): đếm đạt / không đạt / nên sửa / chưa xác minh / chưa đo theo checklist thông số chính thức; bấm để xem từng check, với nguồn mở trong tab mới. Không tính vào điểm, và `chưa xác minh` không hiển thị như lỗi.
5. Video player cạnh kết quả. Bấm vào mốc thời gian ở bất kỳ đâu thì video tua đến đó.
   - **Nhạc nền** (dưới caption, trên khung điện thoại): `♪ Tên bài · nghệ sĩ` khi ShazamIO nhận diện được (API không chính thức, có thể đổi hoặc bị chặn), hoặc `♪ chưa nhận diện được nhạc`. Màn không bao giờ nói bài nhạc được phép hay không được phép dùng; quyền sử dụng luôn hiện `chưa xác minh`.
6. Nút **Analyze / Re-analyze**, với các tùy chọn nâng cao: rubric `v2|v1`, các ô tick gọi API tốn phí. Các tùy chọn nâng cao thu gọn mặc định.
7. **Lịch sử các lần chạy** của video (chọn để xem lại).

### 3.3 Tiến trình khi đang chạy (P0)
Một lần phân tích mất **khoảng 3 giây (dùng cache) đến khoảng 95 giây (trích xuất VLM mới)**. Không dùng spinner trơn. Cần hiển thị **từng bước đang chạy**: tên bước, agent, tool, trạng thái (đang chạy / xong / bỏ qua / lỗi), thời gian, và một dòng tóm tắt kết quả. Hợp đồng dữ liệu ở §6.3.

### 3.4 Audit view (P0 cho 1–3, P1 cho phần còn lại)
Đã có bản chức năng trong `analyze-page.jsx`; cần làm lại cho rõ ràng và đẹp.
1. **Agent flow**: sơ đồ theo 7 chặng (Request → Gather data → Checks → Decisions API → Cross-check → Scoring → Verdict). Mỗi node là một tool call; bấm vào thì xem input/output JSON. Có thể phát lại theo thời gian. Tham khảo `components/agent-flow.jsx` và `run-trace.jsx`.
2. **What the AI saw**: lưới frames (1 frame/giây, viền màu cho frame AI đánh dấu), lời thoại có timestamp, cây JSON features. Model, số token, thời gian và trạng thái cache. Tham khảo `extraction-view.jsx`.
3. **Decisions API**: theo từng phần (viral/conversion/sku/shop/policy/meta), mỗi hàng là *khối dữ liệu đầu vào → câu hỏi → điểm phần*. Bấm một câu thì xem nội dung câu hỏi, **% cho từng level**, độ tin cậy và dữ liệu đã gửi. Tham khảo `decisions-map.jsx`.
4. **Cross-check (P1)**: câu bị chấm dưới 40 hiện cạnh điểm rule (code) và điểm agent LLM, kèm `agree` / `conflict`. Tham khảo `cross-check-panel.jsx`.
5. **Score breakdown (P1)**: mỗi tiêu chí có giá trị đầu vào và nhãn nguồn, phép tính điểm nhóm bằng số thật, nút "view code". Tham khảo `run-results.jsx`.
6. **Market evidence (P1)**: đối thủ đã cào, có link TikTok / FastMoss / Google để kiểm tra. Tham khảo `market-evidence.jsx`.
7. **Trust checklist (P1)**: "Can I trust this?": trạng thái cache, số lượng REAL/MOCK, coverage, số câu mâu thuẫn, policy, kết quả thật (nếu có).

### 3.5 Dashboard shop và thị trường (P1, làm gọn)
Đang có `overview-page.jsx`, `shop-page.jsx`, `data-explorer-page.jsx`.
- Danh sách 9 shop (scenario, GMV, đơn, rating). Trang shop có chart GMV/đơn và traffic theo nguồn, bảng SKU, bảng video, nút "Diagnose shop".
- Thị trường theo SKU: giá đối thủ, số bán 28 ngày, số video, nguồn kèm ngày cào.
- Data explorer giữ dạng công cụ (P2 nếu thiếu giờ).

## 4. Trạng thái bắt buộc phải có
Loading, empty (chưa có lần chạy nào, video chưa được trích xuất), error (API lỗi, kèm thông điệp từ `detail`), và `not_scored` (tiêu chí thiếu dữ liệu: hiện "–" kèm lý do, **không bao giờ hiện 0**). Video seed không có file thì không có player.

## 5. Overall score (đã chốt 29/10/2026)
Điểm tổng chỉ do backend tính (`result.overall`, `core/overall.py`); frontend chỉ hiển thị số và công thức trả về cùng kết quả (`web/src/lib/overall-view.js`), không tính lại:
- `overall = Σ(w × score) / Σ(w)` trên các nhóm **có điểm** trong ba nhóm trước đăng: viral_potential 0.35, conversion_potential 0.45, sku_market 0.20. Tổng bằng 1, nên khi thiếu nhóm thì chia lại trên các nhóm còn lại.
- Không tính vào điểm tổng: `shop_health` (bối cảnh của shop: 5 câu H01–H05, đối chiếu với tiêu chí shop H/Q/E, dùng để chẩn đoán lỗi nằm ở video hay ở shop); `post_publish_performance` (số đo sau khi đăng: V7 completion, C8 CTR/CVR, hiển thị riêng là "Hiệu suất thực"); `policy_compliance` (là cổng, xem dưới).
- Điểm từng nhóm hiện dần theo stream. **Điểm tổng chỉ hiện khi run xong.**
- Nhãn theo điểm: **≥ 75 "Sẵn sàng đăng"**, **50–74 "Sửa rồi đăng"**, **< 50 "Làm lại"**. Policy không che nhãn.
- Luôn hiện coverage. Thiếu nhóm nào thì có cảnh báo từ backend (warnings), ví dụ "Thiếu nhóm …: điểm tổng chỉ tính trên …".
- Nút **"Duyệt đăng"**: có policy `needs_review` thì popup liệt kê rule và mốc giờ, phải tick xác nhận. Xác nhận thì ghi `PATCH /api/videos/{id}` field `publish_review {status: approved, approved_at, analysis_id, overall, label, policy_acknowledged[]}`. App không tự đăng lên sàn.

## 6. Dữ liệu và API

### 6.1 Chạy local
```bash
cd video_understanding/demo/web
pnpm install
pnpm lab            # json-server :3101 + FastAPI :8100 + Vite :5180
# or split: pnpm db  +  pnpm lab:api-web
```
Vite proxy: `/api/*` đi tới json-server (dữ liệu), `/py/*` và `/media/*` đi tới FastAPI. Stack: React 19, Vite, Tailwind v4, shadcn/ui (`components/ui`), Recharts, lucide-react. Helper fetch nằm trong `src/lib/api.js`; hook `useFetch` nằm trong `src/hooks/use-fetch.js`.

### 6.2 Endpoint
| Việc | Gọi |
|---|---|
| Danh sách shop / SKU / video | `GET /api/shops`, `/api/skus?shopId=`, `/api/videos?shopId=`; video upload có id bắt đầu bằng `UPL-` |
| Upload | `POST /py/videos/upload` (multipart). Field: `file`, `shop_id`, `sku_id`, `platforms` (lặp lại), `sponsorship`, `disclosure_enabled`, `goal`, `budget_vnd`, `campaign`, `user_query`, `caption` (≤ 2200 ký tự), `hashtags` (lặp lại hoặc một chuỗi cách nhau dấu phẩy/khoảng trắng, `#` tuỳ ý, tối đa 30); hoặc nhóm listing `name, url, title, description, price_vnd, list_price_vnd`. Trả về video record (`post.caption`, `post.hashtags` đã bỏ `#` và trùng lặp). |
| Sửa thông tin đăng | `PATCH /py/videos/{id}/post` JSON `{caption?, hashtags?, platforms?, sponsorship?: own_shop\|affiliate\|sponsored, disclosure_enabled?, goal?}`. Chỉ key gửi lên mới đổi, `null` xoá key đó; key lạ hoặc body rỗng trả 400/422. Dùng cho cả video seed lẫn upload; trả về video record đã cập nhật. Lần phân tích sau mới đọc, analysis cũ giữ nguyên. |
| Bộ câu Decisions | `GET /py/questions` → `{version, model, questions[{id, group: viral_potential\|conversion_potential\|sku_market\|shop_health\|null, domain, dimension, type: score\|choice\|predicate, weight, instructions, levels[{label, description}], required_features[], eligibility, asked}]}`. `group` chỉ có ở câu `score`; `asked:false` (M04–M06) là câu pipeline không bao giờ gửi. Thêm `scoring{group_weights, thresholds{ready, fix}}` lấy từ `core/overall.py`. |
| Cache trước khi chạy | `GET /py/videos/{id}/cache-status?rubric=` → `{extraction{state: missing\|changed\|stale\|current\|unavailable, …}, decisions{cached, answered, eligible, cache_key}, policy_review{cached, cache_key}, localize{cached}, insights{cached}}`. Dựng lại pipeline với mọi bước trả phí tắt (chỉ đọc cache, không lưu, thường < 1 s). `cached: null` = chưa biết trước khi chạy, kèm `reason` (vd. localize/insights đọc marker và điểm sẽ đổi khi Decisions hoặc policy reviewer chưa cache trả lời: `depends_on[]`); `needed: false` = bước này không gọi model. |
| Dữ liệu tham chiếu | `GET /py/reference/{calibration\|restricted_categories\|policy_sources\|fix_templates\|question_bank}`: JSON fixture nguyên bản + `_file` (đường dẫn trong `demo/`); `policy_sources` lồng `provenance.json` vào key `provenance`. Tên lạ trả 404. |
| AI quick-fill caption | `POST /py/videos/{id}/caption-suggest[?model=]` → `{caption, hashtags[3–8], rationale, policy_flags[], model, source: "live call"\|"cache", token_usage{prompt_tokens, completion_tokens}, inputs, cache_file}`. Một lần gọi LLM (tính phí; bấm nút là hành động xác nhận), cache theo input + model + prompt, chỉ cache câu trả lời hợp lệ. 404 khi video chưa trích xuất; 502 khi OpenAI lỗi hoặc câu trả lời không dùng được. `policy_flags[{check, outcome: needs_review\|candidate, rule_ids[], severity, summaries[], evidence[]}]` là kết quả detector copy chạy trên bản nháp; hiện ra, không giấu, không bao giờ nghĩa là "đạt". |
| Link Shopee → listing | `POST /py/listings/resolve` JSON `{url}` (dạng `…-i.<shop>.<item>`, `/product/<shop>/<item>`, shortlink `shp.ee`/`s.shopee.vn` theo redirect một lần) → `{listing{title, price_vnd, list_price_vnd, rating, rating_count, sold, description, images[], category, url, item_id, shop_id, …}, source: live\|crawled, fetched_at\|crawled_at, crawled_from?, attempts[{method, ok, error}]}`. Thử fetch live một lần (timeout 6 s), lỗi thì tra dữ liệu đã cào trong db (`shopeeListings`, `marketSnapshots`, `skus`); field mà bản cào đánh dấu mock bị bỏ (null). 400 nếu không phải link sản phẩm Shopee; 404 `detail{message (tiếng Việt: nhập tay), attempts}` khi không nguồn nào có. Thực tế Shopee chặn fetch live (HTTP 403), nên thường ra `crawled` hoặc 404. Agent tool: `scrape_product_page` (`product_scout`). |
| Phân tích (đầy đủ, có trace) | `POST /py/videos/{id}/analyze?rubric=v2\|v1&extract=auto\|force\|never&decisions=&cross_check_agent=&claims_llm=&localize=&insights=&policy_llm=&music=`; trả về `{id, result, ...}` và lưu vào `/api/analyses` |
| Phân tích dạng stream | `GET /py/videos/{id}/analyze/stream?<cùng tham số>`: Server-Sent Events, xem §6.3 |
| Lịch sử chạy | `GET /api/analyses?targetId={id}&kind=video_run&_sort=createdAt&_order=desc` |
| Trạng thái trích xuất + JSON features | `GET /py/videos/{id}/features`; trả 404 nếu chưa trích xuất. Field `extraction_status.state` là `missing\|changed\|stale\|current`. Trả nguyên bản extraction: `transcript`, `transcript_segments[{start, end, text}]`, `features.key_moments[{timestamp_sec, event, description}]`, `token_usage`, `benchmark_latency`. |
| Frames | `GET /py/videos/{id}/frames` trả về `{frames:[{sec,url}]}`. Keyframe gửi cho Decisions là ảnh cắt riêng ở đúng giây, phục vụ tại `/py/frames/keyframes/<video_stem>/<segment>_<sec>.jpg` (xem `decisions.keyframes`) |
| Video file | `/media/{local_file}` |
| Code tính điểm | `GET /py/rubrics` |
| Thị trường theo SKU | `GET /api/marketSnapshots/{sku_id}` |
| Chẩn đoán shop | `POST /py/shops/{shop_id}/diagnose` |

**Chi phí:** `extract=force` (khoảng 14k token), `decisions=true` (khoảng 10k), caption-suggest (khoảng 1.5k), `localize=true` (khoảng 1.5k–4k, một lần gọi VLM cho tối đa 8 issue: mỗi issue có mốc gửi 3 frame, khoảng/toàn video dùng chung một contact sheet), `insights=true` (khoảng 5k, ~25 giây, AI tóm tắt cho bản đơn giản), `cross_check_agent=true` và `claims_llm=true` đều gọi OpenAI có tính tiền. API để tắt hết; UI bật sẵn `insights` (vẫn hỏi xác nhận phí). `localize` và `insights` luôn dùng cache nếu đã có. Dùng `extract=auto` (chỉ trích xuất khi chưa có cache hoặc file video đã đổi).

### 6.3 Tiến trình theo bước
Kết quả đã có sẵn `result.trace`: mảng `{name, kind: tool|functional|reasoning, agent, tool, input, output, status: ok|skipped|error, started_ms, duration_s}`.
`GET /py/videos/{id}/analyze/stream?<cùng tham số với POST>` trả về Server-Sent Events (`api.py → analyze_video_stream`). Phân tích chạy trong một worker thread; client ngắt kết nối thì stream dừng nhưng lần chạy vẫn hoàn tất và được lưu. Cứ 15 giây có một dòng comment `: heartbeat` để proxy không cắt kết nối trong lúc trích xuất. Các sự kiện:
- `step_started {name, kind, agent, tool, started_ms}`
- `step_progress {name, phase, label, done, total, detail}`: phát ra giữa `step_started` và `step_finished` của cùng step, không lưu vào trace. `done`/`total` null khi không đếm được; `detail` nhỏ. Phase hiện có: `extract_video_content` (`frames` n/N, `whisper` gửi/nhận, `vlm` gửi kèm số frame / nhận kèm token, `pacing`), `ask_decisions_api` (`request` n câu + n keyframe, `sent`, `received`, hoặc `cache`), `check_policy`, `localize_issues`, `summarize_insights` (`sent`, `received` hoặc `cache`).
- `step_finished`: nguyên bản ghi của step `{name, kind, agent, tool, input, output, status, started_ms, duration_s, tokens}`. `tokens` chỉ có ở step dùng câu trả lời model (null ở step khác): `{input, output, total, cached?, reasoning?, model?, source: live call|cache, cached_cost?}`. `total` là token lần chạy này trả; dùng cache thì `total = 0` và `cached_cost` ghi chi phí gốc của câu trả lời cache (null nếu cache cũ không ghi). Whisper tính phí theo phút audio nên không có trong `tokens`. Output của một số step đã đủ để UI hiện kết quả tạm:
  - `check_policy.output.targets`: verdict và findings theo nền tảng.
  - `ask_decisions_api.output.questions`: các câu Decisions, mỗi câu `{id, group, domain, dimension, type, weight, instructions, levels[{label, description}], required_features[], status, value, inputs[], answer{probabilities[{label, probability, value}], confidence, score|choice|probability}|reason}`. Đây là **một lần gọi batch**, các câu về cùng lúc; UI muốn hiện lần lượt thì tự giãn nhịp và ghi rõ như vậy. `output.source` là `live call|cache|not run`. `output.keyframes[{sec, segment: hook|demo|cta, url}]` là ảnh thật đã gửi kèm request (rỗng khi không có câu trả lời); `keyframes_scope: "batch"`: mọi ảnh đi cùng mọi câu, nên mỗi câu đã trả lời có `keyframes_used[sec]` giống nhau. `output.cache_key` là key của request đã cho câu trả lời.
  - `score_rubric.output`: `{group: {score, coverage, mock_dependency, scored[], not_scored[]}}`.
- `done {analysis}`: bản ghi đã lưu, giống response của POST.
- `error {message, status}`

Nếu stream lỗi kết nối, UI gọi POST rồi phát lại `result.trace` theo `started_ms`.

Thứ tự các bước thường gặp: `get_video, get_shop, extract_video_content, get_video_features, load_shop_data, load_video_features, load_real_metrics, load_product_listings, load_shop_and_sku, load_market_snapshot, load_post_context, load_post_copy, check_claims_vs_listing, check_policy, check_platform_fit, ask_decisions_api, cross_check_low_answers, score_rubric, quality_gate, compare_real_outcome, diagnose_shop, localize_issues, compose_verdict, summarize_insights`.

### 6.4 Các key chính trong `result`
- `scores[]`: `{name, score|null, coverage 0–1, mock_dependency, criteria[{id, name, weight, score|null, inputs[], reason}]}`.
- `verdict`: `{groups, weakest[3], strongest[3], quality_gate, policy}`.
- `features{}`: `{status: REAL|MOCK|INFERRED|MISSING, value, source, evidence[]}`. Chuỗi evidence dạng `"MM:SS …"` là mốc thời gian, có thể tua video tới đó.
- `policy.targets{<platform>: {verdict, score, findings[{rule_id, severity, outcome, summary, evidence[], source_url}]}}`.
- `decisions.questions[]`: giống `ask_decisions_api.output.questions` ở §6.3. Mọi tên trong `inputs[]` đều có trong `features{}` (drill câu hỏi → feature → evidence trích xuất); `required_features[]` là tên feature theo ngôn ngữ của bộ câu (vd. `video.on_screen_text`), `inputs[]` là feature thật của dự án đã gửi đi (vd. `post.caption`).
- `features["post.caption"]` (string) và `features["post.hashtags"]` (list, không `#`): REAL, `source: "seller"`, có cho mọi video khi seller đã nhập, MISSING kèm lý do khi chưa. Decisions đọc caption ở các câu về chữ người xem đọc (`video.on_screen_text`: caption + hashtag; `video.claims`, `video.offer`: caption). Policy detector copy (TTA-001/META-001 lời hứa tuyệt đối, SHP-003 từ quảng cáo, SHP-005 liên hệ ngoài sàn, META-002) quét cả caption/hashtag với evidence dạng `caption: «…»` / `hashtags: «…»` (không có mốc giờ).
- `fixes[]`: mỗi việc có thêm `in_caption` (bool). `true` khi trích dẫn của finding nằm trong caption/hashtag: tiêu đề và hành động nói sửa caption, không có `timestamps`.
- `cross_check[]`, `quality_gate{status, flags[]}`, `benchmark`, `revenue_funnel`, `shop_name`, `trace[]`.
- `markers[]` (`core/markers.py`): mốc trên timeline video `{id, t_start, t_end, precise, localizable, time_label, quote, lane: policy|conversion|viral|structure, severity, kind: issue|ghost|beat|cut, title, comment, source{type, ref}, evidence[]}`.
  - `precise: true` là mốc đo được (lời nói, chữ trên màn hình, before/after). `precise: false` là khoảng: `time_label` như `Cả đoạn mở đầu 0–3s` hoặc `Toàn video`, vẽ thành thanh trên timeline.
  - Feature có `structural: true` (cửa sổ mở đầu 00:00–00:03, demo vắng) không cho mốc. Tiêu chí chỉ dựa vào cửa sổ đó thành khoảng; không có mốc nào mà còn căn cứ hình ảnh thì thành toàn video; còn lại không có marker. Policy finding `needs_review` có evidence `MM:SS` vẫn là mốc đo được.
  - `localizable: true` khi lỗi dựa trên hình (chữ trên màn hình, sản phẩm, demo, overlay, before/after, AI media). Lỗi chỉ về lời nói (`spoken`) không được khoanh: `quote` là câu thoại có giây.
  - `ghost` là gợi ý vị trí cho thứ video thiếu (CTA, ưu đãi), không phải lỗi tìm thấy trong video.
  - `region {box:[x,y,w,h] chuẩn hoá 0–1 | null, frame_sec, label, observation, fix_here, confidence, covered_by[], estimated:true}` chỉ có khi đã chạy `localize` (`sources/localizer.py`). Mỗi issue localizable gửi 3 frame (t-1, t, t+1) hoặc một contact sheet mọi giây lấy mẫu cho khoảng/toàn video; model chọn giây, box, quan sát và cách sửa tại chỗ. Trả lời bị bỏ khi giây không nằm trong frame đã gửi, box không hợp lệ, confidence dưới 0.4 hoặc chữ rỗng/quá dài. `covered_by` là các overlay của app (thanh trên, cột nút, caption, thẻ sản phẩm, thanh dưới) mà box nằm dưới: ước lượng theo khung app (`APP_OVERLAYS_PX_ESTIMATE`, trạng thái placeholder), không phải quy định của nền tảng. Đây là ước lượng của AI và UI phải ghi rõ như vậy.
- `insights` (`sources/insights.py`, step `summarize_insights`): lớp đọc của bản đơn giản `{headline, summary, insights[{text, tone: good|bad|info, cites[], refs[], t, candidate, lens}], policy, shop, groups: {}, fixes: [], model, source}`, hoặc `null` khi tắt/lỗi (UI dùng giải thích template). `groups` và `fixes` luôn rỗng: điểm nhóm và việc cần sửa đã có trên màn hình, lấy từ kết quả chấm.
  - Code tạo trước các gợi ý ứng viên (`sources/insight_candidates.py`): phễu sau khi đăng, lệch đối tượng với khách mua SKU, giá trong video khác listing, claim mâu thuẫn, ước tính điểm khi làm các việc đầu, video mẫu cùng sản phẩm, lỗi lặp lại ở shop. Mỗi gợi ý chỉ được tạo khi có dữ liệu; có `facts` (số được phép dùng) và `cites` (nơi mở nguồn: `criterion`, `metric`, `dataset`, `fix`, `time`, `claims`, `policy`).
  - AI chỉ chọn gợi ý theo `candidate` và viết 1–2 câu; không tự thêm gợi ý hay nguồn. Ý chỉ nhắc lại thứ đã hiện trên màn hình bị loại; ý có id lạ, id trùng, hoặc số không nằm trong `facts` của gợi ý đã chọn cũng bị loại. `cites` và `t` luôn lấy từ gợi ý, không từ model. UI gắn chip nguồn (Câu, Rule, Việc cần sửa, mốc thời gian, Kho dữ liệu). Trace ghi `facts_sent` (không có `cites`), `candidates`, `kept`, `dropped`, `token_usage`.
  - Cache theo gợi ý + model + prompt; chỉ cache câu trả lời dùng được.

## 7. Nguyên tắc nội dung
- Mỗi điểm số phải đi kèm coverage, và nếu điểm dựa trên dữ liệu giả lập thì phải có dấu hiệu "simulated".
- Dữ liệu seed shop/SKU là **synthetic**: luôn có banner nhỏ ghi điều đó (dùng `meta.warning` lấy từ `/api/meta`).
- Số liệu FastMoss chịu điều khoản hạn chế hiển thị công khai; cần thống nhất với owner trước khi trình chiếu (xem `docs/market-data-provenance.md`).
- Policy là **cần xem lại**, **không phát hiện vi phạm** (`no_issue_detected`, chip xám) hoặc **chưa đủ dữ liệu** (`unknown`), không bao giờ là "approved". Rule engine đang là bản baseline, sẽ cải tiến; UI ghi rõ điều này.
- Benchmark Clipcat gắn nhãn **"chưa kiểm chứng"** (số công bố thật, chưa tự xác minh), không phải "giả lập".

## 8. Tiêu chí nghiệm thu (demo)
1. Upload một video mới gắn SKU và chọn 2 nền tảng, rồi được chuyển thẳng sang trang kết quả.
2. Bấm Analyze thì thấy tiến trình từng bước, xong hiện overall score, các phần, top fixes và policy theo nền tảng.
3. Bấm một mốc thời gian thì video tua đúng chỗ.
4. Mở Audit view thì thấy agent flow, frames và lời thoại, Decisions theo phần có % từng level.
5. Không có màn trắng nào khi API lỗi hoặc khi thiếu dữ liệu.

## 9. Câu hỏi mở
- ~~Duyệt công thức overall score và các nhãn ở §5?~~ Đã chốt 29/10/2026 (§5).
- Có trình chiếu số liệu FastMoss công khai trong demo không?
- ~~Ai làm endpoint SSE ở §6.3?~~ Đã có (`GET /py/videos/{id}/analyze/stream`).
- Đã chốt (29/10/2026): UI viết tiếng Việt, giữ keyword tiếng Anh. Điểm và câu hỏi theo backend (không có hệ 7 chiều hay 44 câu của mockup). Hiển thị số liệu FastMoss dưới dạng chart, kèm nguồn và ngày cào.
