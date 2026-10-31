# Video Preflight

Ứng dụng local kiểm tra video trước khi đăng. Bản nền được viết mới từ 31/10/2026; lịch sử và các mốc kiểm chứng nằm ở [development log](docs/development-log.md).

## Chạy

Yêu cầu Node >=22.12, pnpm 11.25, Python 3.12 qua uv, FFmpeg và FFprobe trong PATH.

```sh
pnpm install --frozen-lockfile
uv sync --locked
pnpm lab
```

Mở **http://127.0.0.1:5180**. API: http://127.0.0.1:8100/docs; json-server: http://127.0.0.1:3101. Backend không auto-reload: Ctrl+C rồi chạy lại `pnpm lab` sau khi sửa Python. Runner kiểm tra cổng trước, không tự tắt dịch vụ khác.

`/` là studio nối backend local để upload và chạy pipeline mới. `/demo` là seller workspace từ luồng frontend song song, đọc catalog và kết quả đã lưu trong snapshot; đây không phải lượt inference mới. Browser verification trong đợt này áp dụng cho studio `/`, chưa nghiệm thu `/demo`.

## Hiện đã chạy được

- Tạo shop/SKU, upload MP4/MOV/WebM/MKV tối đa 50 MiB / 120 giây; thông tin nhập tay được ghi nguồn, chưa xác minh với nền tảng.
- FFprobe đo file; FFmpeg trích frame local và kiểm SHA-256. Keyframe bấm tua video, xem feature JSON và trace.
- Pipeline cố định 8 chặng, SSE, lưu lịch sử và cache. Ngắt browser không hủy worker; restart không tự chạy lại inference.
- Xem 9 nhóm dữ liệu nhập trong Kho dữ liệu. Bộ Decisions có 39 câu thực tế: 28 score, 7 choice, 4 predicate.
- Preview batch chỉ lấy câu đủ bằng chứng, không đưa performance/shop vào điểm nội dung. Điểm thiếu giữ null. Trọng số Viral/Conversion/SKU là 35/45/20; shop health và Policy tách riêng.
- Policy text triage có quote nguyên văn. Kết quả chỉ là gợi ý cần xem lại; thiếu dữ liệu hoặc chưa xác minh nguồn hiện hành giữ unknown.
- DB backup trước mọi ghi qua json-server. Dữ liệu phát sinh nằm ở `db/db.json`, video upload trong `data/`, cache/run trong `.runtime/`; đều không commit.

## Giới hạn hiện tại

Provider vision/ASR/Decisions, LLM Policy reviewer, insight writer và khoanh vùng chưa được tích hợp. Bản nền **không gửi dữ liệu ra provider và không gọi API có phí**. Không thể suy ra chất lượng nội dung từ frame hash hay metadata; điểm sẽ trống khi chưa có đánh giá đủ bằng chứng.

Mockup-v2 chưa có trong repo này; studio là UI mới để vận hành nền, chưa phải nghiệm thu thiết kế T2/T3. Platform specs và calibration đã đọc được trong Kho dữ liệu, chưa được xác minh lại link/hiệu chỉnh. Ngưỡng coverage hiển thị là mốc tạm tự đặt.

Dataset/cache lịch sử được một luồng khác nhập ở commit `9289181`; xem [data layout](docs/data-layout.md). App không chạy helper script cũ và không coi các cache đó là lượt phân tích vừa thực hiện. Video nguồn local-only trong archive chưa có trên máy này, nên không tái hiện demo SHOP001/SHOP002 bằng clip gốc trong đợt kiểm tra này.

## Kiểm chứng

```sh
pnpm check
pnpm audit:source
```

`pnpm check` chạy unittest, node --test, oxlint, TypeScript và Vite build. Test media sinh fixture riêng trong thư mục tạm, không cần API key. Browser artifacts QA nằm ở `output/playwright/` và không đưa vào dataset demo.

Xem [runtime contract](docs/runtime-contract.md), [kế hoạch](rebuild-plan.md) và [nhật ký](docs/development-log.md) để phân biệt phần đã chạy với phần còn cần làm.
