# Dựng lại Video Preflight — 31/10/2026

Mục tiêu: viết mới ứng dụng trong repo này; đối chiếu nghiệp vụ với `SEAxshopee`, giữ lịch sử hiện tại. Ưu tiên app chạy được, dữ liệu và mockup làm sau theo chỉ đạo của chủ repo.

- [x] T0.1: model bằng chứng REAL/MOCK/MISSING/INFERRED, tính điểm có coverage; 9 test domain qua.
- [x] T0.2–T0.3 / nền: dựng DB trống có backup, đọc dataset nhập từ luồng song song (9 shop/45 SKU/39 câu/16 rule). Chưa nối seed vào catalog làm việc, chưa có video gốc trên máy này, chưa chạy crawler.
- [x] T0.4 / nền: FastAPI 8100 + json-server 3101 + React/Vite 5180 bằng `pnpm lab`; upload, tạo/xem SKU/shop.
- [x] T0.5 / khung: 8 chặng cố định, trace/SSE, 4 vai trò/13 tool có trạng thái. Claims, inference Decisions, cross-check/LLM chưa thực thi.
- [x] T0.6 / nền: trước đăng/đã đăng, ràng buộc shop/SKU, dữ liệu thiếu và provenance. Audience nhập/lấy từ SKU; chưa suy ra từ video, chưa crawl FastMoss mới.
- [ ] T1 đầy đủ: đã nạp đúng 39 câu, eligibility/batch preview; Policy triage text/quote validation có regression. Còn vision/ASR/Decisions inference, reviewer LLM và kiểm nguồn chính thức hiện hành. Provider trả phí chỉ sau xác nhận.
- [ ] T2–T3: mockup-v2, drill chi tiết, insight, platform specs, nhạc và khoanh vùng theo thứ tự prompt sau khi nền chạy ổn.
- [ ] T4 demo đầy đủ: kiểm bản nền 29 Python/5 Node/lint/build đã qua, browser fixture QA đã chạy. Còn demo SHOP001/SHOP002 bằng video gốc, đầy đủ tab/platform skins và paid-cache acceptance sau T1–T3.

Mỗi mốc cập nhật `docs/development-log.md` với bằng chứng kiểm tra thực tế. Chủ repo đã cho phép commit/push theo từng prompt/feature, thỉnh thoảng dùng nhánh dev + PR và tự merge sau review đạt/checks qua. Dùng gh dưới tài khoản minhhai203 cho PR; connector đang là blu1606 nên không dùng để ghi. Commit ở thời điểm thực tế, không dựng lại ngày giờ lịch sử. Các bước phụ thuộc tài sản/provider chưa có phải ghi rõ, không giả kết quả hoàn thành.
