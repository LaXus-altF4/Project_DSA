# YÊU CẦU BỔ SUNG / ĐIỀU CHỈNH API (web/API_REQUESTS.md)

> **Kênh giao tiếp giữa Web UI (Antigravity) và Backend/Server (Claude Code)**  
> Căn cứ theo quy tắc dự án trong `AGENTS.md` và tài liệu hợp đồng `docs/api.md`.  
> Ngày tạo: 05/11/2026.

---

## 1. Yêu cầu cho Màn hình Quá hạn & Lịch sử (`#/records`)

### 1.1. Bổ sung trường `counts` (số lượng phiếu theo từng tab) trong `GET /api/records`

> ✅ **Đã xử lý** (05/11/2026): `GET /api/records` trả thêm `counts {all, open, overdue, returned}`. `open` gồm cả phiếu quá hạn (nên `all = open + returned`, `overdue ⊂ open`); có `query` thì đếm trên tập khớp; `total == counts[status]`. Xem `docs/api.md` mục 4.3.

- **Endpoint hiện tại:** `GET /api/records?status={status}&query={query}&page={page}&pageSize={pageSize}`
- **Tài liệu tham chiếu:** `docs/api.md` mục 4.3; `web/DESIGN.md` mục 2.6 và 3.6.

#### Vấn đề hiện tại:
Response hiện tại của server chỉ trả về `total` của riêng trạng thái được chọn qua query param `status`:
```json
{
  "page": 1,
  "pageSize": 20,
  "total": 57,
  "totalPages": 3,
  "records": [ ... ]
}
```
Theo thiết kế giao diện chuẩn trong `web/DESIGN.md` mục 3.6:
```
[ Tất cả (57) ]  [ ⚠️ Quá hạn (2) ]  [ 🟢 Đang mượn (4) ]  [ 📁 Đã trả (51) ]
```
Giao diện bắt buộc hiển thị số lượng thống kê trực quan trên từng thẻ Tab lọc (Tất cả, Quá hạn, Đang mượn, Đã trả) lấy trực tiếp từ API.

Nếu frontend phải gửi 4 request đồng thời (`status=all`, `status=overdue`, `status=open`, `status=returned` với `pageSize=1`) ở mỗi lần tải trang, tìm kiếm hoặc tua đồng hồ thì:
1. Làm tăng đột biến số lượng HTTP request không cần thiết (x4 lần).
2. Dễ phát sinh tình trạng lệch dữ liệu giữa các tab nếu đồng hồ hoặc trạng thái thay đổi giữa chừng.
3. Không tối ưu hiệu năng và đi lệch nguyên tắc phân tách trách nhiệm (backend lõi C++ vốn đã có toàn bộ dữ liệu khi duyệt `forEachRecord`).

#### Đề xuất bổ sung vào response của `GET /api/records`:
Thêm object `counts` vào response:
```json
{
  "page": 1,
  "pageSize": 20,
  "total": 57,
  "totalPages": 3,
  "counts": {
    "all": 57,
    "overdue": 2,
    "open": 4,
    "returned": 51
  },
  "records": [
    ...
  ]
}
```

#### Quy tắc nghiệp vụ tính `counts`:
1. **Khi không có `query` (tìm kiếm rỗng):**
   - `counts.all`: Tổng số phiếu mượn toàn hệ thống.
   - `counts.overdue`: Số phiếu đang mở và quá hạn (`isOpen() && isOverdue()`).
   - `counts.open`: Số phiếu đang mở (`isOpen()`).
   - `counts.returned`: Số phiếu đã hoàn tất trả (`!isOpen()`).
   *(Bất biến: `counts.open + counts.returned == counts.all`, và `counts.overdue <= counts.open`).*

2. **Khi có `query` (tìm theo mã phiếu, MSSV, họ tên):**
   - Các trường trong `counts` phản ánh số lượng phiếu khớp với chuỗi `query` tương ứng theo từng trạng thái.
   - Ví dụ: Tìm "Lan" khớp 3 phiếu đã trả, 1 phiếu đang mượn (quá hạn) -> `counts: { "all": 4, "overdue": 1, "open": 1, "returned": 3 }`.

3. **Tính nhất quán:**
   - Trường `total` trong response luôn bằng `counts[status]` (với `status` tương ứng là `all`, `overdue`, `open`, `returned`).

---

## 2. Trạng thái các API khác phục vụ `#/records`
- `GET /api/records/{id}`: Đầy đủ, hoạt động tốt.
- `POST /api/return`: Đầy đủ, hoạt động tốt.
- Điều hướng sang `#/return?id={recordId}`: Giao diện `web/js/pages/return.js` đã hỗ trợ sẵn đọc tham số `id` từ hash URL.
- Đồng hồ giả lập & tua thời gian: `web/js/ui/clock.js` đã phát sự kiện `lab:time-advanced` để màn hình tự nạp lại dữ liệu.

---
*Ghi chú: Antigravity đã dừng lại theo đúng quy tắc AGENTS.md sau khi ghi nhận thiếu sót API này.*
