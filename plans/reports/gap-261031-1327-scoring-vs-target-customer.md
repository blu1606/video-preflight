# Gap: cách chấm hiện tại so với người duyệt video KOC của brand ngành nhạy cảm

Ngày 31/10/2026. Khách hàng mục tiêu: `docs/target_customer.md`.

## Kết luận
Pipeline đã có phần lớn nguyên liệu: claim, policy, disclosure, timestamp, danh sách sửa xếp lỗi policy lên đầu. Nhưng **kết luận cuối cùng đang trả lời câu hỏi của seller ("đăng được chưa, video có viral không"), chưa trả lời câu hỏi của người duyệt ("duyệt được không, có rủi ro pháp lý không")**. Ba việc quan trọng nhất cần sửa:

1. Policy phải chặn được kết luận.
2. Bộ luật phải có luật quảng cáo Việt Nam, không chỉ luật của sàn.
3. Claim phải được đối chiếu với danh sách claim được phép của brand, không chỉ với listing.

## A. Cần sửa (đang lệch với khách hàng)

| # | Hiện tại | Vấn đề với người duyệt | Sửa thành | File |
|---|---|---|---|---|
| A1 | Nhãn kết luận "Sẵn sàng đăng / Sửa rồi đăng / Làm lại" chỉ dựa vào điểm. Policy gate "never changes the label" | Video viral, điểm 80 nhưng có claim "trị mụn dứt điểm" vẫn hiện "Sẵn sàng đăng". Với brand, đây là lỗi nguy hiểm nhất. | Tách hai trục. **Quyết định duyệt** (Duyệt / Trả về creator / Cần người xem lại): policy `review` mức high/critical buộc kết quả là "Trả về", không bao giờ "Duyệt". **Điểm hiệu quả** (0–100) giữ như cũ, chỉ để tham khảo. | `core/overall.py` (THRESHOLDS, LABELS_VI, policy_gate) |
| A2 | Policy baseline có 16 luật, đều của TikTok, Shopee, Meta. Không có luật Việt Nam. | Rủi ro lớn nhất với brand là luật quảng cáo Việt Nam (phạt, liên đới, hình sự), không phải luật sàn. | Thêm luật Việt Nam vào `fixtures/policy_baseline_v01` (hoặc v02), mỗi luật có URL văn bản gốc. Xem B1–B4. | `fixtures/policy_baseline_v01/*`, `core/policy_check.py` |
| A3 | `claims.py` so lời nói trong video với **listing** | Listing chính là thứ hay nói quá. Người duyệt cần so với **claim brand cho phép**: brief, phiếu công bố, nội dung quảng cáo đã được xác nhận. | Thêm "danh sách claim được phép" theo SKU (tên claim, giấy tờ chứng minh). Claim nằm ngoài danh sách thì gắn cờ. Listing vẫn là nguồn phụ. | `sources/claims.py`, `C09`, `P02`, `P05` |
| A4 | Trọng số điểm: Viral 0.35, Conversion 0.45, SKU & market 0.20. Trust không có nhóm riêng. | Người duyệt quan tâm trước hết "có đúng sự thật không", sau đó mới "có bán được không". | Đưa **Trust/Compliance** thành chiều riêng, hiển thị đầu tiên (C06 trust_evidence, C09, P02, P03). Không cộng vào điểm hiệu quả, vì đã là cổng duyệt ở A1. | `core/overall.py`, `core/rubric.py` |
| A5 | `sponsorship` chỉ có `own_shop / affiliate / sponsored`. Không biết ai là creator. | Brand cần biết video của KOC nào, hợp tác theo hình thức nào (booking / barter / affiliate) để chấm công khai quảng cáo và theo dõi creator. | Thêm `creator_id` / tên kênh và `barter`. | `api.py` (Sponsorship, upload form) |
| A6 | Danh sách sửa tối đa 5 mục, câu chữ viết cho seller tự sửa | Người duyệt cần gửi cho creator một phiếu sửa ngắn, đúng thứ tự, sao chép được | Giữ thứ tự hiện tại (policy trước, rồi theo điểm tăng thêm), thêm lớp "phiếu trả về": lời nhắn cho creator, kèm mốc thời gian. | `core/fixes.py`, `fixtures/fix_templates_v1.json` |
| A7 | Shopee chỉ có luật cho **listing**, chưa có luật cho **video** | Nền tảng mục tiêu là Shopee Video | Bổ sung luật nội dung video của Shopee, có nguồn chính thức. | `fixtures/policy_baseline_v01` |

## B. Yếu tố cần thêm vào quá trình chấm

| # | Yếu tố | Vì sao | Cách kiểm | Nguồn cần đối chiếu |
|---|---|---|---|---|
| B1 | **Câu khuyến cáo bắt buộc của thực phẩm bảo vệ sức khỏe** ("Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh") | Thiếu khuyến cáo là lỗi phổ biến và dễ kiểm | Tìm trong transcript, chữ trên màn hình và caption. Chỉ áp cho SKU thuộc ngành TPBVSK. | Nghị định 15/2018 và văn bản thay thế; Thư viện Pháp luật |
| B2 | **Mỹ phẩm quảng cáo như thuốc** ("trị", "chữa", "đặc trị", "khỏi hẳn", "100%") | Bị phạt riêng (tổ chức 30–40 triệu theo Nghị định 38/2021) | Bộ từ khóa tiếng Việt và câu hỏi Decisions. Đã có một phần trong `P02`, `TTA-001`. | LSVN; Nghị định 38/2021 |
| B3 | **Nội dung quảng cáo TPBVSK phải đúng bản đã được xác nhận** | Nói thêm một câu ngoài bản đăng ký là có nguy cơ vi phạm | So video với nội dung quảng cáo đã xác nhận, lưu theo SKU (A3) | Thủ tục xác nhận nội dung quảng cáo; từ 01/07/2026 do UBND tỉnh xác nhận |
| B4 | **Công khai quảng cáo và gắn nhãn** (Luật 75/2025) | Áp cho cả KOL và brand | Đã có `commercial_disclosure_check` và `TTC-002`, nhưng chỉ cho TikTok. Mở rộng cho Shopee Video, Facebook và Instagram theo luật Việt Nam. | Luật 75/2025/QH15 |
| B5 | **Bằng chứng creator đã dùng sản phẩm** | Luật 75/2025: KOL không được giới thiệu sản phẩm chưa dùng hoặc chưa hiểu rõ | Một phần đã có ở `C03 demonstration_clarity`. Thêm câu hỏi "video có cho thấy sản phẩm được dùng thật không". | Luật 75/2025 |
| B6 | **Before/after** | Rủi ro cao với mỹ phẩm và giảm cân | Đã có `P03`, `TTA-002`. Cần áp cho cả video Shopee, không chỉ ads TikTok. | Chính sách sàn + luật Việt Nam |
| B7 | **Bám brief**: ý bắt buộc, câu cấm, hình phải có | Người duyệt duyệt theo brief | Mỗi chiến dịch có một brief; mỗi dòng trong brief là một mục đạt / chưa đạt, có mốc thời gian | Quy trình booking KOC (`docs/target_customer.md` phần 4) |
| B8 | **Giá và ưu đãi nói trong video khớp với listing** | Sai giá là khiếu nại và lừa dối khách hàng | Đã có `C07 offer_communication`, `C09`, `SHP-001`. Nâng thành lỗi chặn khi lệch giá. | |
| B9 | **Nội dung AI** (giọng AI, người ảo) | Sàn hạn chế, nhiều brand cấm | Đã có `TTC-001`. Thêm cấu hình "brand không cho phép AI". | `docs/target_customer.md` [8] |
| B10 | **Trẻ em trong video mẹ & bé**, nhắc đối thủ, nội dung nhạy cảm | An toàn thương hiệu | Câu hỏi Decisions mới, mức "cần xem lại" | Cần nguồn chính thức trước khi thêm |
| B11 | **Hồ sơ duyệt**: ai duyệt, lúc nào, dựa trên bằng chứng nào | Luật yêu cầu lưu trữ và cung cấp hồ sơ khi được yêu cầu | Lưu mỗi lần duyệt vào `analyses`: người duyệt, kết luận, phiên bản video, bản snapshot luật | Luật 75/2025 |
| B12 | **Sức khỏe creator** | Thay cho shop health | Lịch sử vi phạm và kết quả các video trước của creator. Chưa có dữ liệu thật, cần gắn nhãn mô phỏng. | |

## C. Cân nhắc khi chấm (cách ra quyết định)

1. **Hai câu hỏi, hai câu trả lời.** "Duyệt được không" là cổng, phải bảo thủ: thiếu dữ liệu thì "Cần người xem lại", không bao giờ "Duyệt". "Bán có tốt không" là điểm, có coverage, chỉ để tham khảo.
2. **Ngưỡng theo ngành hàng.** Mỹ phẩm, TPBVSK, mẹ & bé dùng ngưỡng chặt hơn: một claim y tế chưa có giấy tờ là chặn ngay. Ngành khác chỉ là "cần xem lại".
3. **Bỏ sót đắt hơn báo nhầm.** Với khách hàng này, để lọt một claim sai tốn nhiều hơn nhiều so với một lần báo nhầm. Ngưỡng của `P02` và `P03` nên nghiêng về "cần xem lại", và UI phải cho người duyệt bỏ qua cờ kèm ghi chú lý do.
4. **Mọi cờ phải có câu trích và mốc thời gian.** Người duyệt phải chuyển được nguyên văn cho creator. Không có trích dẫn thì không được chặn.
5. **Không tự ra kết luận pháp lý.** Giữ nguyên tắc hiện tại: không bao giờ ghi "đạt" hay "hợp pháp", chỉ "không phát hiện vi phạm trên dữ liệu đang có".
6. **Đo đúng thứ khách hàng quan tâm.** Benchmark nên báo tỷ lệ bắt được claim sai (recall) trên một bộ video có gắn nhãn vi phạm, không chỉ độ tương quan giữa điểm và doanh số. Bộ 24 video Clipcat hiện chưa có nhãn vi phạm.
7. **Demo đúng ngành.** Seed có 9 shop, nhưng chỉ SHOP001 (beauty), SHOP006 (mẹ & bé), SHOP008 (health & fitness) đúng khách hàng mục tiêu. Demo nên dùng các shop này.

## Quyết định của user (31/10/2026, 13:36)
- **Giữ nguyên các pillar chấm điểm.** Không tách thành 4 lớp, không đổi trọng số nhóm.
- **Làm:**
  - Luật Việt Nam vào bộ kiểm (A2, B1–B4, thêm danh mục cấm quảng cáo của mẹ & bé ở cấp SKU).
  - Phiếu trả về gộp để dán Zalo (A6, issue #7).
- **Ngoài phạm vi:** so sánh bản 1 với bản 2.
- **Chưa quyết:** tách quyết định duyệt khỏi điểm (A1). Mục này không đổi pillar, chỉ đổi nhãn kết luận khi policy gate là `review`.

## Đề xuất thứ tự làm (trước khi có quyết định trên)
1. A1: tách quyết định duyệt khỏi điểm. Thay đổi nhỏ, tác động lớn nhất.
2. A2 + B1 + B2 + B4: thêm 3–5 luật Việt Nam có nguồn.
3. A3 + B3: danh sách claim được phép theo SKU (seed cho 3 shop ngành nhạy cảm).
4. A6: phiếu trả về cho creator. Trùng issue #7.
5. A5, B11: thông tin creator và hồ sơ duyệt.
