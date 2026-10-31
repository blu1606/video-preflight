> **Ghi nhận nguồn từ gói dữ liệu được nhập ngày 31/10/2026.** Mô tả crawler, chi phí và các số liệu bên dưới được giữ từ tài liệu gốc, chưa được chạy/xác minh lại trong phiên dựng repo mới. Đường dẫn legacy được ánh xạ theo [data layout](data-layout.md); dữ liệu hiện ở `data/fixtures/`. Ứng dụng mới chỉ đọc snapshot, chưa gọi crawler/provider.

# Nguồn dữ liệu thị trường (evidence)

Dữ liệu thị trường của 45 SKU seed được **cào thật** ngày **2026-10-27**. Đây không phải dữ liệu mock: mỗi con số có nhãn `REAL` (quan sát được) hoặc `INFERRED` (tính từ số quan sát được, công thức nằm trong evidence). Mỗi số đều truy được về công cụ, câu truy vấn, ngày cào và response gốc.

- Dữ liệu đã chuẩn hóa nằm ở `fixtures/market/market_snapshots.json`. Mỗi dòng đối thủ và mỗi khối TikTok có trường `provenance`.
- Response gốc nằm ở `fixtures/market/raw/`. Thư mục này bị git-ignore vì là dữ liệu bên thứ ba.
- `db/build_db.py` nạp file đã chuẩn hóa vào collection `marketSnapshots`. `sources/providers.py → MarketProvider` biến nó thành feature `market.*`; mỗi feature mang dòng trích nguồn `<provider> <tool> q=<truy vấn> @<ngày> raw=<file>`.

## Công cụ đã dùng

| Nguồn | Công cụ / endpoint | Cào gì | Khối lượng | Script |
|---|---|---|---|---|
| **FastMoss** (phân tích TikTok Shop) | MCP `https://mcp.fastmoss.com/mcp`, tool `product_search` (region=VN, sắp theo số bán 28 ngày, 10 kết quả) | Sản phẩm cùng ngành trên TikTok Shop VN: giá, rating, **số bán 7/28/90 ngày, GMV**, **số video và creator đang bán** | 45 SKU theo từ khóa ngành + 14 SKU theo thương hiệu thật, tổng 450 dòng | `fixtures/market/crawl_fastmoss.py`, `fastmoss_client.py` |
| FastMoss | tool `market_category_analysis` (basic_metrics, tháng 2026-09) | Quy mô ngành hàng cấp 1 ở VN: GMV, số bán, số video/creator/live, tăng trưởng tháng trước và năm trước | 1 lần cho mỗi ngành cấp 1 | như trên |
| **SerpAPI** (Google Shopping, Việt Nam) | `https://serpapi.com/search.json`, `engine=google_shopping`, `gl=vn`, `hl=vi`, `location=Vietnam` | Listing trên Shopee, Lazada, Tiki và web shop: giá, rating, số đánh giá, link | 45 lượt tìm, 20 kết quả mỗi lượt, tổng 867 dòng | `fixtures/market/crawl_market.py` |

Chi phí: FastMoss 1 credit cho mỗi lần `product_search`, phân tích ngành và kiểm tra số dư tốn thêm; còn 12/100 credit dùng thử. SerpAPI tốn 45 lượt, còn khoảng 203/250 lượt mỗi tháng. Apify không được dùng.

## Từ dữ liệu cào ra feature

| Feature | Trạng thái | Cách tính | Tiêu chí |
|---|---|---|---|
| `market.competitor_prices_vnd` | REAL | Giá các listing **cùng loại** từ cả hai nguồn | S2, S03 |
| `market.category_benchmark` | INFERRED | Trung vị / p25 / p75 của giá, rating trung bình, số bán 28 ngày trung vị, cộng quy mô và tăng trưởng của ngành (FastMoss) | H03 |
| `market.demand_index` | INFERRED | `log10(tổng số bán 28 ngày của đối thủ cùng loại trên TikTok + 1) / 6 × 100` | S5, S05 |
| `market.similar_video_count` | REAL | Tổng `linked_video_count` (FastMoss) của đối thủ cùng loại | S6 |
| `market.trend_score` | INFERRED | `50 × (số bán 7 ngày × 4 / số bán 28 ngày)`; 50 là đi ngang, trên 50 là đang tăng | V5 |
| `market.own_product_tiktok` | REAL | Listing TikTok Shop bán chạy nhất của chính thương hiệu SKU (14 SKU có tên thương hiệu thật) | hiển thị |

**Thế nào là "cùng loại"** (`like_for_like`, đây là heuristic, có ghi trong từng dòng):
- **TikTok:** tìm theo từ khóa ngành, và giá nằm trong khoảng 0,4–2,5 lần giá của mình.
- **Google Shopping:** tiêu đề chứa ít nhất 50% từ khóa, và giá nằm trong khoảng 0,4–2,5 lần.

Từ khóa ngành của từng SKU khai báo trong `crawl_fastmoss.py → KEYWORDS`.

## Giới hạn đã biết

- Google Shopping **không hiển thị số đã bán**, nên `sold_count` của các dòng này là null. Số bán chỉ đến từ FastMoss.
- Có 3 SKU không có đối thủ TikTok nào cùng loại theo giá: SHOP005-SKU05 mũ lưỡi trai, SHOP007-SKU04 bàn phím mini, SHOP009-SKU04 móc dán tường. Các SKU này chỉ có giá từ Google Shopping.
- Heuristic "cùng loại" vẫn còn lẫn. Ví dụ bộ kit serum của TeaShell, hay nồi lẩu mini khi tìm "nồi điện đa năng". Muốn chặt hơn thì phải có thêm quy cách sản phẩm (dung tích, khối lượng), hiện chưa có.
- Ngưỡng của S6 trong rubric (`SATURATION_VIDEOS_FOR_ZERO = 1000`) được đặt cho dữ liệu mock. Với số video thật (hàng nghìn đến hàng chục nghìn), hầu hết SKU sẽ ra 0 điểm. Cần chỉnh lại ngưỡng này.
- `sku.category_fit` (S1) vẫn MISSING, vì cần tỷ trọng bán qua video của từng ngành mà chưa lấy.

## Dữ liệu có sẵn đã xem nhưng không dùng

| Dữ liệu (`D:/CODE/Hackathon/SEAxshopee/data`) | Lý do không dùng |
|---|---|
| `sku-intelligence/bundles/final-v1` (622 dòng Yody / Coolmate / Juno / Cocoon / Allbirds) | Danh mục khớp duy nhất là "Quần jeans nữ" (cho SHOP005-SKU03), nhưng 16 dòng đó không có giá. Các dòng có giá không nối được về danh mục. |
| `fastmoss/private/reference-batch-v2`, `serpapi-sample-v1` | Truy vấn cho sản phẩm khác (Cocoon, Juno, Yody), không phải SKU của mình |
| `demo-video-cases` (3 video kèm context) | Dùng để **test luồng upload**, không phải dữ liệu thị trường |

## Thông số nền tảng (platform specs v1)

Bộ thông số video chính thức dùng cho checklist "Hợp nền tảng" (`core/platform_fit.py`). Không tính vào điểm.

- **Ai thu, khi nào, bằng gì:** người dùng thu bằng ChatGPT browsing các trang chính thức (TikTok Seller VN, TikTok Ads help, Shopee Help VN, Meta Ads guide) ngày 2026-10-30. Bản gốc 197 dòng nằm nguyên văn tại `fixtures/platform_specs_v1/raw/platform_video_specs_vn_2026-10-30.json`.
- **Bản code đọc:** `fixtures/platform_specs_v1/platform_specs.json`. Mỗi giá trị có `source_url`, `quote`, `page_title`, `accessed`, `status` (`official`, `not_found`, `login_required`), `conflict`, `spot_check`. Chỉ giữ dòng mà check dùng, kèm dòng `not_found` / `login_required` của cùng nền tảng để UI hiện "chưa xác minh".
- **Kiểm tra lại ngày 2026-10-30:** 8 URL official được WebFetch. 8 trang truy cập được, 7 trích dẫn khớp, 1 PDF không đọc được (`Top_Tips_One_Pager_SMB.pdf`, dòng 21–34 s), nên dòng đó bị hạ thành `unverified`. Việc kiểm tra dựa trên model tóm tắt, không so khớp chuỗi tuyệt đối.
- **Khoảng trống đã biết:**
  - TikTok Shop: độ dài, tỉ lệ khung, độ phân giải, dung lượng và định dạng đều `not_found`.
  - TikTok Ads (đấu giá Non-Spark): không có độ dài tối thiểu. Độ dài khuyến nghị mâu thuẫn giữa Reservation 9–15 s và tài liệu SMB 21–34 s; cả hai hiện như gợi ý.
  - Shopee: dung lượng ghi "30Mb", đơn vị không rõ, nên hiện nguyên văn và không đạt/không đạt.
  - Meta: mọi trang yêu cầu đăng nhập, nên mọi check là `chưa xác minh`.
  - `safe_zone`: không có số trên mọi nền tảng, không giả định giá trị nào.
  - Nhạc (CML): có quy định trong bộ thông số. Khi ShazamIO nhận diện được bài nhạc, check hiện tên bài với trạng thái `chưa xác minh` (xem mục Nhạc nền); khi không nhận diện được, hiện `chưa đo`.
- **Đo cục bộ, không gọi API:** `video.width_px`, `video.height_px` (OpenCV), `video.file_size_bytes`, `video.container` (file system). "500 MB" đọc là 10^6 byte, tức chặt hơn.

## Nhạc nền (ShazamIO)

- **Nhận diện bài nhạc (miễn phí, bật bằng `music`):** thư viện `shazamio` (`uv add shazamio`) gọi API web không chính thức của Shazam. Không có khóa và không có cam kết dịch vụ; Shazam có thể đổi hoặc chặn. Mỗi kết quả ghi `tool: "ShazamIO (unofficial Shazam API)"`. Feature `video.music` có nhãn `REAL`, nguồn `shazamio`. Không nhận diện được thì ghi `no_match`.
- **Đoạn audio:** một đoạn 12 s cắt bằng ffmpeg, thử đầu video trước rồi đến giữa video; đoạn đầu tiên khớp thì dừng. Video ngắn hơn 12 s dùng cả video làm một đoạn.
- **Cache:** `output/music/<video_stem>.json` (kết quả nhận diện của video). Chạy lại dùng cache thì không gọi Shazam. Lỗi không được cache, nên lần sau thử lại.
- **Quyền sử dụng:** hệ thống không kết luận bài nhạc được phép hay vi phạm bản quyền. Hợp nền tảng hiện `chưa xác minh quyền sử dụng` ngay cả khi đã nhận diện được bài nhạc; luật nền tảng (TikTok Shop CML, Shopee Video) là nguồn chính thức trong `platform_specs.json`, và trích dẫn không khớp trang khi kiểm tra lại thì không hiện làm nguồn.

## Quyền sử dụng

- **Điều khoản FastMoss** (mục 3, bản 10/03/2026) yêu cầu đồng ý bằng văn bản trước khi tải hàng loạt, chuyển cho bên thứ ba hoặc hiển thị công khai. Lần cào này là tra cứu có giới hạn (chỉ đúng 45 SKU), lưu riêng. **Cần xin phép FastMoss trước khi trình chiếu công khai các số liệu này.**
- **SerpAPI** chỉ trả về kết quả tìm kiếm công khai. Bản quyền của từng listing vẫn thuộc sàn hoặc người bán.
- Key API đọc từ `D:/CODE/Hackathon/SEAxshopee/data/fastmoss/.env`, không được in ra hay lưu lại. Response nào chứa key thì bị từ chối, không lưu.
