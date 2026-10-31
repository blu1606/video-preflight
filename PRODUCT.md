# Video Preflight

## Người dùng và mục tiêu

Seller đưa video bán hàng lên trước khi đăng, chọn shop/SKU và nền tảng, rồi xem nội dung cần sửa cùng bằng chứng. Luồng cho ban giám khảo đi từ kết quả tới câu hỏi, feature và nguồn, trong cùng ứng dụng.

## Quyết định đã chốt

- UI tiếng Việt, giữ thuật ngữ Hook, CTA, Viral, Conversion, Policy, Decisions, trace, coverage, SKU và GMV.
- Bằng chứng có trạng thái REAL / MOCK / MISSING / INFERRED. Thiếu dữ liệu không thành điểm 0; dữ liệu MOCK chỉ xem trong Kho dữ liệu, không đưa vào readiness.
- Backend tính overall theo Viral 0,35 / Conversion 0,45 / SKU 0,20. Shop health là bối cảnh; hiệu suất sau đăng tách riêng; Policy là gate riêng.
- Một chế độ vận hành. Nguồn và mức xác minh xem trong Kho dữ liệu, không giả số liệu hoặc kết quả để lấp UI.
- Mọi lượt có phí cần xác nhận trước; có cache theo nội dung và version. Bản hiện tại chưa nối provider.
- Stack: Python/uv + FastAPI 8100; json-server 3101; React/Vite/TypeScript + Tailwind/shadcn/Recharts 5180. `pnpm lab` chạy ba dịch vụ local.

## Trạng thái đã kiểm chứng

Upload thật, đo metadata và trích frame local; trace/SSE/lịch sử/cache; tạo shop/SKU; đọc bộ 39 câu và 9 nhóm dataset. Policy hiện chỉ triage text có quote, chưa đọc nội dung video hoặc xác minh lại baseline.

Chưa có vision, ASR, Decisions inference, reviewer LLM, dự báo hiệu suất, nhạc hoặc localization. Tổng điểm sẽ chưa chấm khi chưa có kết quả nội dung đủ bằng chứng. Ngưỡng coverage chỉ là mốc tạm tự đặt.

## Thiết kế và tài sản

Studio ba cột: luồng xử lý, video/5 panel đầu vào, kết quả có radar và ba tab. Mockup-v2 vẫn là mục tiêu thiết kế khi được cung cấp; chưa có trong checkout này.

Dataset nhập có sẵn được giữ provenance ở `docs/data-layout.md`. Không trình bày dữ liệu nhập hoặc cache lịch sử là kết quả mới chạy hôm nay. Source code ứng dụng được viết mới trong repo này; các helper script được nhập cùng archive giữ làm tài sản tham chiếu, không được thực thi bởi ứng dụng mới.

Xem `README.md` và `docs/development-log.md` cho bằng chứng cụ thể. Kịch bản đầy đủ tiếp tục ở `rebuild-plan.md`.
