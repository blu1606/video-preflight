# Dựng lại Video Preflight — 31/10/2026

Mục tiêu: viết mới ứng dụng trong repo này; đối chiếu nghiệp vụ với `SEAxshopee`, giữ lịch sử hiện tại. Ưu tiên app chạy được, dữ liệu và mockup làm sau theo chỉ đạo của chủ repo.

- [x] T0.1: model bằng chứng REAL/MOCK/MISSING/INFERRED, tính điểm có coverage; 9 test domain qua.
- [ ] T0.2–T0.3: hợp đồng dữ liệu và script dựng DB; bộ 9 shop/24 video và crawler để sau, không tự tạo số liệu bán hàng.
- [ ] T0.4: FastAPI 8100 + json-server 3101 + React/Vite 5180 bằng `pnpm lab`; upload và xem video/SKU/shop.
- [ ] T0.5: pipeline cố định extract → gather → claims → Decisions → policy → cross-check → scoring → verdict; trace và SSE.
- [ ] T0.6: upload trước đăng / video đã đăng, gắn shop/SKU, hiển thị dữ liệu thiếu và provenance.
- [ ] T1: tích hợp đúng bộ 39 câu và baseline 16 policy khi có dữ liệu; provider trả phí chỉ sau xác nhận. Không thay bằng bộ 44 câu ở repo tham chiếu.
- [ ] T2–T3: mockup-v2, drill chi tiết, insight, platform specs, nhạc và khoanh vùng theo thứ tự prompt sau khi nền chạy ổn.
- [ ] T4: test Python/Node, oxlint, build, chạy lab và kiểm UI ở 1440/1920; cập nhật tài liệu đúng thực tế.

Mỗi mốc cập nhật `docs/development-log.md` với bằng chứng kiểm tra thực tế. Chủ repo đã cho phép commit theo từng prompt/feature trong phiên này; commit ở thời điểm thực tế, không dựng lại ngày giờ lịch sử. Chưa yêu cầu push. Các bước phụ thuộc tài sản chưa có phải ghi rõ, không giả kết quả hoàn thành.
