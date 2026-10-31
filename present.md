# USP đang có bằng chứng trong bản nền

- Video, context SKU/shop và dữ liệu thị trường có hợp đồng nguồn thống nhất; không lấy metadata làm bằng chứng về nội dung.
- Pipeline cố định với trace input/output có thể mở ngay từ studio, stream SSE và giữ run qua restart.
- Bộ 39 câu có eligibility theo từng feature; shop/outcomes được tách khỏi readiness và câu thiếu không biến thành điểm 0.
- Overall do backend tính, Policy là gate riêng; text triage có quote đối chiếu nguyên văn.
- Cache kiểm hash media/frame và version pipeline/dataset; thay đầu vào thì không dùng lại kết quả cũ.
- Kho dữ liệu cho thấy nguồn/hash/trạng thái của tài sản nhập; không nhận cache lịch sử là lượt phân tích mới.
