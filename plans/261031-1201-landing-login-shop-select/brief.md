# Brief: Landing → Đăng nhập Shopee → Chọn shop → Thêm video → Studio

Status: confirmed 2026-10-31 (shape). No code yet.

## Job and audience
- Seller TikTok Shop / Shopee (chủ shop hoặc người làm content) muốn kiểm video trước khi đăng.
- Trong demo, người trình bày đi luồng này trên màn chiếu (desktop 1440–1920 px); giám khảo xem từ xa.

## Flow and surfaces

| # | Route | Mode | Nội dung |
|---|---|---|---|
| 1 | `/` Landing | Persuade | Trang sản phẩm cho seller: vấn đề ("đăng rồi mới biết video dở"), sản phẩm làm gì, cách hoạt động 3 bước, điểm khác biệt (mỗi con số truy được nguồn; policy không bao giờ báo "đạt"). CTA chính duy nhất: "Đăng nhập bằng Shopee". |
| 2 | `/login` | Operate | Mô phỏng màn cấp quyền Shopee Open Platform (seller đăng nhập, bấm "Cho phép"). Nhãn "mô phỏng" luôn hiện. Không dùng logo/giao diện Shopee y hệt, không thu thập mật khẩu thật. |
| 3 | `/shops/select` | Operate | 9 shop đã cấp quyền dạng thẻ: tên, ngành hàng, mô tả ngắn, tình trạng shop (lấy từ shop diagnosis / daily metrics, ví dụ "shop mới, ít đánh giá", "GMV đang giảm"), các SKU đang bán. Ghi rõ dữ liệu là mô phỏng, chỉ để thử. |
| 4 | `/shops/:id/add-video` | Operate | Thư viện video của shop đang chọn từ `data/<SHOP_ID>/`, dạng thẻ có ảnh xem trước; bấm là chọn rồi sang Studio. Có nút tải file khác lên (lưu vào thư mục shop đó). |
| 5 | `/studio` | Operate | Studio hiện tại, giữ nguyên (chuyển từ `/`). Nhận shop + video đã chọn từ bước trước. |

Login thật (tham chiếu, không triển khai): app chuyển sang trang `shop/auth_partner` của Shopee, seller đăng nhập và cấp quyền, app đổi mã lấy token; tài khoản chính (main/merchant) có thể cấp quyền nhiều shop trong một lần. Nguồn: hướng dẫn của bên tích hợp (Rutter, Celigo, BigSeller), chưa có tài liệu chính thức của Shopee.

## Data change
- Chia `data/` thành `data/SHOP001/` … `data/SHOP009/` theo `videos[].local_file` trong `db/db.json` (3 video mỗi shop). Video tải lên (`upl-*.mp4`) vào thư mục shop của nó.
- Cập nhật nơi đọc/ghi file video (`api.py` upload + `/media`, `sources/benchmark.py`, `fixtures/shopee_seed/build_seed.py`) để tìm theo thư mục shop. Giữ `/media/...` hoạt động cho Studio.
- Sao lưu `db/db.json` trước khi đổi dữ liệu.

## Constraints
- Nội dung theo `PRODUCT.md`: UI tiếng Việt, thuật ngữ kỹ thuật tiếng Anh; không bịa testimonial, khách hàng, số liệu; dữ liệu shop luôn gắn nhãn mô phỏng.
- Stack hiện có: React 19 + Vite + Tailwind v4 + shadcn/ui trong `web/`.
- `web/public/mockup-v2/` là tham chiếu thị giác bắt buộc (kể cả phần add video).

## Anti-goals
- Không xây auth/OAuth thật, không lưu phiên đăng nhập thật.
- Không thay đổi Studio ngoài việc nhận shop/video từ luồng mới.
- Không thêm trang dashboard, lịch sử, hay trang phương pháp trong đợt này.
