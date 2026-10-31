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
