# Runtime contract — bản nền 31/10/2026

## Hai đường dẫn giao diện

`/` mở studio nối FastAPI/json-server local. `/demo` mở seller workspace được bổ sung bởi luồng frontend song song, đọc dữ liệu và kết quả snapshot đã lưu, không chạy inference mới. Đợt kiểm browser này xác minh `/`; chưa có bằng chứng browser nghiệm thu `/demo` trong phiên này.

## Lưu trữ

`db/db.json` là catalog làm việc, được dựng từ `db/template.json` nếu chưa tồn tại. json-server là writer duy nhất; mỗi POST/PUT/PATCH/DELETE phải sao lưu trạng thái trước thay đổi vào `db/backups/`. Khi backup lỗi, chặn thay đổi.

`data/fixtures/` là dữ liệu tham chiếu đọc riêng, không tự nhập shop hoặc cache lịch sử vào catalog. Video mới trong `data/<UUID>.<ext>`. Các run ở `.runtime/runs/<UUID>.json`, frame cache ở `.runtime/artifacts/<sha256>-<version>/`.

## API (Vite proxy `/py`)

| Endpoint | Hành vi |
| --- | --- |
| GET /health | DB, ffmpeg/ffprobe, trạng thái provider |
| GET /registry | 4 vai trò agent, 13 tool và cờ implemented |
| GET /catalog | Shop/SKU/video/market/sources đang làm việc |
| POST /shops, POST /skus | Nhập thông tin, gắn provenance seller_input |
| POST /videos/upload | Multipart file + context JSON; đo file local |
| PATCH /videos/{id}/context | Thay context có validation SKU thuộc shop |
| GET /videos/{id}/media | Phát video, hỗ trợ HTTP Range |
| GET /videos/{id}/cache-status | Chỉ hit khi input, version và artifact phù hợp |
| POST /videos/{id}/runs | Tạo hoặc dùng lại run; paid_calls=true bị từ chối ở bản nền |
| GET /videos/{id}/runs | Danh sách lịch sử, gồm trạng thái gián đoạn/lỗi |
| GET /runs/{id} | Bản ghi và kết quả đầy đủ |
| GET /runs/{id}/events | SSE phát lại trace và nối tiến trình đang chạy |
| GET /datasets | Inventory 9 nhóm, nguồn/hash/count/status |
| GET /datasets/{key}?offset=0&limit=50 | Đọc có phân trang, tối đa 100 bản ghi/lượt |

## Pipeline

extract → gather → claims → Decisions → Policy → cross-check → scoring → verdict. Đây là thứ tự code cố định, tên agent là vai trò xử lý; chưa có LLM tự quyết định bước.

SSE có step_started, step_progress, step_finished, run_complete, run_error, stream_end, cùng heartbeat. Step chứa id/name/agent/tool kind/input/output/status/started_at/duration_s/tokens; bước không gọi model có tokens=null. Bước chưa có provider giữ skipped với lý do, không giả thời gian hay token.

Cache analysis fingerprint chứa toàn bộ context và version dataset/pipeline. Media phải giữ hash gốc; frame thiếu hoặc khác hash làm cache miss. Thay logic đánh giá phải tăng pipeline version. Cache không phải request mới và UI ghi rõ khi dùng lại.

## Điểm và Policy

Mỗi nhóm có score nullable, coverage, weight và criteria. Overall chỉ hiện sau khi có câu trả lời đủ bằng chứng; không đưa shop/outcome vào readiness. Ngưỡng 70% coverage và tối thiểu mỗi nhóm 50% là **mốc tạm tự đặt**, không phải benchmark ngành.

Bộ câu hỏi hiện được nạp và lập preview, chưa gửi provider. Policy baseline có 16 rule; một số text detector trả needs_review với quote. Không match không đồng nghĩa clear vì baseline chưa được kiểm lại và các modality còn thiếu. Quote/timestamp lấy từ nguồn server, reviewer không được gỡ rule findings.

Mốc thời gian chỉ hiển thị khi có nguồn theo thời gian; caption/hashtag không được gán 0s. Không vẽ box lỗi khi chưa có bằng chứng hình ảnh.
