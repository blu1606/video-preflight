# Nhật ký phát triển mới

## Mốc trước triển khai

- Ghi nhận: 2026-10-31T03:17:25Z (10:17:25, Việt Nam), từ đồng hồ hệ thống; đây là ghi nhận local, không phải chứng thực thời gian độc lập.
- HEAD repo chính: `40eae065dea7e9aa9a61e03f4bdad80f4287db11`.
- Git theo dõi đúng ba file: `PRODUCT.md`, `docs/uiux-requirements.md`, `docs/market-data-provenance.md`. Working tree sạch.
- Repo tham chiếu: `/Users/minhhai/workspace/backend/Personal/SEAxshopee`, HEAD `7d8261be1ffacc430bb93c2ec29a7efb7571bdb0`.
- Repo tham chiếu đã có thay đổi local ở `plans/261020-2214-video-intelligence/openai-demo/streamlit-demo/test_providers.py`; không thuộc công việc này.
- Đã đọc README, danh sách file, cấu trúc rubric và cách gate bằng chứng của backend tham chiếu. Bộ đó có 44 câu/7 chiều, khác bộ 39 câu trong kịch bản. Chỉ dùng để hiểu nguyên tắc missingness/coverage, không chuyển rubric hay lịch sử Git.
- Chủ repo xác nhận ưu tiên nền ứng dụng trước; dữ liệu/mockup làm sau. Không nhập dữ liệu, dotenv, cache hoặc tài sản từ repo cũ.

Nhật ký và manifest SHA-256 giúp kiểm tra thay đổi nội dung trong phiên này; không chứng minh độc lập quyền tác giả hoặc điều kiện hợp lệ của cuộc thi. Lịch sử Git gốc được giữ nguyên.

## T0.1 — Lõi bằng chứng và hợp đồng điểm

- Viết mới `core/evidence.py`, `core/scoring.py`, `tests/test_domain.py`; không nhập code/commit từ repo tham chiếu.
- Bốn trạng thái dữ liệu; bằng chứng bắt buộc cho giá trị có dữ liệu, thiếu giữ null. Dữ liệu MOCK không được chấm readiness.
- Trọng số mới theo kịch bản: Viral 0,35 / Conversion 0,45 / SKU 0,20. Shop health và performance không thuộc điểm trước đăng.
- Hợp đồng 5 mức có xác suất được kiểm tra tổng xác suất và khoảng giá trị. Chưa tích hợp API hay bộ 39 câu.
- Ngưỡng coverage 70% / tối thiểu mỗi nhóm 50% là **mốc tạm tự đặt** cho việc hiển thị, chưa hiệu chỉnh; khai báo nguồn trong code.
- Kiểm: `uv run python -m unittest discover -s tests -v` — 9/9 qua; không gọi provider.
- Theo chỉ đạo mới của chủ repo: commit theo từng prompt/feature kể từ mốc này. Không sửa ngày commit.

## T0.2 / lưu trữ — Khung DB, chưa nhập dataset

- `db/template.json` và `db/build_seed.py` tạo DB trống có thể dựng lại, không tự ghi đè DB đã tồn tại.
- json-server là bên duy nhất ghi DB; middleware sao lưu trước POST/PUT/PATCH/DELETE. Nếu backup lỗi, chặn thay đổi.
- Không có bản ghi MOCK trong DB khởi tạo. Bộ 9 shop/24 video và crawler được để sau theo chỉ đạo người dùng.
- Kiểm `node --test tests/db.test.mjs`: chạy json-server thật ở cổng ngẫu nhiên trong thư mục tạm; kiểm snapshot trước POST và PATCH, nội dung trước thay đổi được giữ nguyên.
- Đã pin dependency và tạo lockfile cho lab; chưa có provider SDK, không đọc khóa từ repo tham chiếu.

## T0.4–T0.6 / backend — Upload, cache, SSE

- API mới: shop/SKU tự nhập, upload file local, sửa context, media Range, cache-status, start run, lịch sử, SSE, tool registry.
- FFprobe đo thời lượng/kích thước/format/dung lượng/audio từ file thật; FFmpeg trích tối đa 6 frame theo thời gian đo được. Không suy ra nội dung ảnh từ timestamp/hash.
- 8 chặng pipeline cố định, 4 vai trò agent, registry 13 tool có cờ implemented. Chưa có agent LLM đang chạy. Các chặng Decisions/Policy/cross-check giữ skipped với lý do.
- Cache media theo SHA-256 + version; kiểm hash frame trước khi dùng. Cache analysis theo video + context + dữ liệu shop/SKU/market + version pipeline. Context đổi thì không dùng lại kết quả cũ.
- Lượt chạy lưu local, có trace input/output/thời gian/token null; client ngắt stream không hủy worker. Trùng request cùng input dùng chung run; restart không tự gọi inference.
- Video trước đăng không nhận outcome; video đã đăng có outcome nhập tay, ghi rõ chưa xác minh. SKU phải thuộc shop chọn. Provider trả phí chưa tích hợp và bị chặn tại API.
- Kiểm `pnpm test:python`: 15/15 qua, gồm upload thật bằng fixture video 2 giây được sinh trong thư mục tạm, trích frame/cache/tamper/SSE/HTTP Range, ownership, lỗi file và invalidation. Không lưu fixture vào DB demo.

## T0.4 / frontend — Studio đầu tiên

- React/Vite tiếng Việt, ba cột pipeline/video/kết quả; 5 panel đầu vào, shop/SKU tự nhập trong Kho dữ liệu, upload có tiến độ.
- SSE hiển thị trạng thái và trace JSON, keyframe bấm tua video; điểm/radar trống khi chưa có Decisions. Ba tab Nền tảng/Bằng chứng/Hiệu suất.
- API chưa có provider; không có kết quả AI, số bán hay chính sách được bịa để lấp màn hình.
- `pnpm test`: 5/5 Node test qua; `pnpm lint` và `pnpm build` qua. Đã mở browser local và xem ảnh ở 1440px, có một lỗi favicon đã bổ sung file để sửa.
- Đây là UI mới để vận hành nền local; chưa nhận/chuyển mockup-v2, chưa nghiệm thu thiết kế T2/T3.

## Tích hợp công việc song song trên cùng repo

- Fetch khi chuẩn bị push phát hiện remote có `9289181` (dataset), `2d52e1b` (React TS), `83e4a1e` (Tailwind/shadcn/Recharts), phát triển từ cùng base `40eae06`.
- Giữ các commit remote và công việc mới ở local, tích hợp bằng merge thật; không force-push, không thay đổi ngày hoặc nhập lịch sử `SEAxshopee`.
- Dữ liệu/cache trong commit remote là tài sản nhập có sẵn của luồng khác. Không coi chúng là lượt phân tích được thực hiện trong phiên này.

### Nối scaffold TypeScript/Tailwind/shadcn

- Một pnpm workspace và root lockfile là nơi cài/chạy cả repo; `web` vẫn build qua TypeScript và Vite.
- Giữ cấu hình Tailwind, Recharts và component shadcn đã có trên remote. Nối Button thực tế vào Studio; chuyển entry sang `main.tsx`, component ứng dụng mới ở `Studio.jsx` qua `App.tsx`.
- Bỏ Vite config/entry trùng do hai luồng cùng dựng nền; giữ một config TS có proxy `/py` và `/api`.
- Dùng font Geist Vietnamese local từ dependency có sẵn; không tải Google Fonts trong runtime.
- Kiểm lại: 15/15 Python, 5/5 Node, lint qua; TypeScript + Vite build qua sau sửa xung đột tên file `App.jsx` / `App.tsx`.

## T1 / hợp đồng dữ liệu và Policy sơ bộ

- Sau merge, xác nhận dataset có 39 câu (28 score / 7 choice / 4 predicate), 16 rule, 54 constants và 40 thông số đã chuẩn hoá. Không gọi 39 câu là 39 câu chấm điểm 5 mức: schema phân biệt ba loại thực tế.
- Adapter mới chỉ đọc JSON, không chạy helper Python được nhập trong archive. Kho dữ liệu xem được nguồn, hash và từng bản ghi; nhãn MOCK được giữ ở đây.
- Batch planner loại câu thiếu bằng chứng/MOCK và tách shop/outcomes khỏi readiness. Preview không phải request đã gửi; provider chưa tích hợp.
- Triage Policy chỉ dùng vài detector text mới; trích dẫn kiểm khớp chuỗi, timestamp lấy từ nguồn. LLM chưa chạy. Validator có hợp đồng không cho reviewer gỡ rule findings hoặc bịa quote/mốc giờ.
- Baseline và link nhập chưa được kiểm lại hiện hành; không có match vẫn là `unknown`, không báo policy clear. Các detector keyword là heuristic chưa hiệu chỉnh.
- Sửa cache analysis để kiểm hash frame, thiếu/hỏng artifact không dùng lại run hoàn tất.
- Kiểm `pnpm check`: 25/25 Python, 5/5 Node, oxlint và TypeScript/Vite build qua. Các test source/bank/policy không gọi mạng hay provider.
