# Preflight v2 · bản UX song song

Bản prototype một file (`index.html`), làm song song với `public/mockup/` để thử hướng UI mới. Không gọi backend; dữ liệu phân tích là mẫu minh hoạ, dữ liệu thị trường lấy từ `data/` của repo (snapshot 04/10/2026).

Mở khi app đang chạy: `http://127.0.0.1:8520/mockup-v2/index.html`, hoặc mở thẳng file trong trình duyệt.

## Mở thẳng một state

Thêm `#<token>` vào URL: `catalog-low`, `catalog-pushnow`, `script`, `script-bad`, `draft`, `analyzing`, `step2`, `step2-scrolled`, `step2-playing`, `step2-score`, `step3`, `step3-v11`, `step3-v2`, `step3-score`. Thêm `?cap=1` để tắt animation khi chụp màn hình.

## Đã làm gì so với bản gốc

- Bố cục theo cấp bề mặt (trang · sheet · khối nổi/stage tối), một app bar, hai tab Kiểm tra | Sửa & so sánh thay cho thanh bước.
- Thông tin phụ thu vào ⓘ/tooltip/disclosure; trạng thái thành chip, meter, signal bar.
- Phân cấp hành động: mỗi màn một nút filled; secondary viền/tonal; tertiary ghost/link; utility icon-only có nhãn; thao tác hiếm vào menu ⋯; trạng thái đang chạy không nằm trong nút.
- Icon: Iconsax (bộ linear, `bold` cho trạng thái đặc). Giữ nguyên các hình Iconsax không có: mũi tên chia sẻ của Shopee Video, ngọn lửa "Xu hướng", dấu ✓ đơn, glyph status bar iOS, logo nền tảng.
- Điện thoại: khung Apple iPhone 16 Pro (Black Titanium, Apple Design Resources, không chỉnh sửa) phủ lên màn 402×874.

## Nguồn ảnh nhúng trong file

- Ảnh SKU thật: CDN Shopee, chụp ngày 14/10/2026.
- SKU mẫu "Áo khoác phao lửng nữ", 7 khung hình video mẫu, ảnh nền: tạo bằng AI (ghi rõ "ảnh AI" trong UI).
- Khung iPhone: Apple Product Bezels, theo App Store Marketing Artwork License — chỉ dùng nội bộ/minh hoạ, không phát hành lại riêng khung.

## `patches/`

Lịch sử thay đổi v10–v17 dưới dạng script Python áp lên file HTML (cách dựng lại, xem `patches/README.md`). Patch 15–17 cần CLI `icon` (thư viện Iconsax local) và ảnh bezel; các patch trước v10 không còn.
