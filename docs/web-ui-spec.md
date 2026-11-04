# Đặc tả giao diện web — docs/web-ui-spec.md

> Dùng ở giai đoạn 7. Đọc cùng `AGENTS.md` (mục 2–3: nghiệp vụ) và `docs/api.md` (API).

## 1. Phạm vi
Giai đoạn này chỉ làm **giao diện web** cho phần mềm quản lý mượn trả thiết bị phòng Lab (đồ án CTDL & GT, HCMUS, SV Lê Trường Khải).
Toàn bộ logic nghiệp vụ và CTDL nằm trong lõi C++ — web **chỉ hiển thị và gọi API**.

## 2. Luật bắt buộc
- **Chỉ tạo/sửa file trong `web/`.** Không đụng `include/`, `src/`, `server/`, `data/`, `tests/`, `AGENTS.md`.
- **Không tự tính nghiệp vụ ở frontend** (không tự tính quá hạn, không tự sắp xếp gợi ý, không tự quản lý hàng đợi). Mọi số liệu lấy từ API. Frontend chỉ được định dạng, lọc và sắp xếp để hiển thị.
- **Theo đúng `docs/api.md`.** Nếu thấy thiếu endpoint/trường dữ liệu: dừng lại, ghi đề xuất vào `web/API_REQUESTS.md`, không tự bịa endpoint.
- **Chạy offline:** không CDN, không Google Fonts online. Thư viện và font tải về đặt trong `web/vendor/` và `web/assets/fonts/`.
- **Không có bước build:** HTML + CSS + JavaScript thuần (ES modules). Không npm, không React/Vue, để chỉ cần chạy `LabApp.exe` là xong.
- Toàn bộ chữ trên giao diện bằng **tiếng Việt có dấu**. Tên file, biến, hàm JS bằng tiếng Anh.
- Commit Git trước mỗi lượt làm việc lớn.

## 3. Chạy thử
- Chạy `build/LabApp.exe`, rồi mở `http://localhost:8080` (server C++ phục vụ luôn `web/`).
- Dùng trình duyệt tích hợp để tự kiểm tra: chụp màn hình trước/sau, thử từng luồng ở mục 6.
- Nếu server chưa chạy được, dùng `web/js/mock.js` (dữ liệu giả, **đúng format `docs/api.md`**) bật bằng `?mock=1` để làm UI trước.

## 4. Định hướng thiết kế
Mục tiêu: **đẹp, sinh động, nhưng rõ ràng** — người chấm phải thấy ngay trạng thái thiết bị, hàng đợi và gợi ý.
- **Phong cách:** dashboard hiện đại, có sidebar điều hướng, các thẻ (card) bo góc, bóng nhẹ. Có **chế độ sáng/tối** (lưu lựa chọn bằng localStorage, bọc try/catch).
- **Màu trạng thái nhất quán:** Sẵn sàng = xanh lá, Đang mượn = hổ phách, Đang giữ cho hàng đợi = xanh dương, Bảo trì = đỏ/xám. Màu phải đọc rõ ở cả hai chế độ; không chỉ dùng màu, kèm icon/chữ.
- **Chuyển động có mục đích:** chuyển trang mượt (fade/slide ~200ms), số liệu đếm lên khi tải, dòng bảng nháy nhẹ khi vừa thay đổi, toast trượt vào khi có thông báo. Tôn trọng `prefers-reduced-motion`.
- **Trạng thái rỗng / đang tải / lỗi** cho mọi danh sách (skeleton khi tải, minh hoạ nhỏ khi rỗng, thông báo dễ hiểu khi API lỗi).
- Font: một font sans hỗ trợ tiếng Việt tốt (VD Be Vietnam Pro hoặc Inter), tải về local.
- Responsive tối thiểu cho màn hình laptop 1366px trở lên và máy chiếu lúc demo.

## 5. Các màn hình
**Thanh trên cùng (mọi trang):** đồng hồ giả lập (ngày giờ hệ thống trong app), nút "+1 giờ", "+24 giờ", "+N giờ…". Khi tua: hiệu ứng đồng hồ quay nhanh, sau đó lấy `/api/notifications` và hiện toast cho từng sự kiện (VD "SV 2530xxxx lỡ hạn nhận Kính VR — đã chuyển xuống cuối hàng").

1. **Tổng quan:** thẻ số liệu (tổng thiết bị, đang mượn, quá hạn, người đang chờ), biểu đồ nhỏ thiết bị mượn nhiều nhất, danh sách "sắp hết hạn nhận" (người đầu hàng còn < 6 giờ).
2. **Thiết bị:** bảng/lưới thẻ có tìm kiếm, lọc theo trạng thái. Mỗi thiết bị có thanh tỷ lệ sẵn có/đang mượn/đang giữ/bảo trì. Bấm vào thiết bị → panel trượt bên phải: thông tin, **top 3 gợi ý mượn kèm** (kèm số lần), hàng đợi hiện tại. Thêm/sửa/chuyển bảo trì bằng modal.
3. **Mượn:** form MSSV + tên + số ngày mượn; chọn nhiều thiết bị dạng "giỏ". Mỗi khi thêm một thiết bị vào giỏ, khu "Thường được mượn kèm" cập nhật với hiệu ứng, có nút "+ Thêm" nhanh. Thiết bị hết hàng → hộp thoại mời đăng ký hàng đợi, hiển thị vị trí sẽ đứng.
4. **Trả:** tìm phiếu theo MSSV/mã phiếu; trước khi xác nhận hiện số ngày quá hạn (và tiền phạt nếu API trả về), nổi bật màu đỏ nếu quá hạn.
5. **Hàng đợi:** chọn thiết bị → hàng người chờ dạng danh sách có thứ tự (hoặc dãy thẻ ngang). Người đầu hàng có **vòng đếm ngược 24h** (thời gian còn lại theo đồng hồ giả lập) và số lần lỡ hạn; nút "Nhận thiết bị". Khi có người bị đẩy xuống cuối, animate thẻ di chuyển xuống cuối hàng — đây là điểm nhấn khi demo.
6. **Quá hạn & lịch sử:** bảng phiếu quá hạn (sắp xếp theo số ngày), bảng lịch sử có phân trang.
7. **Đồ thị mượn kèm:** vẽ đồ thị lực (force-directed) bằng thư viện local (VD vis-network hoặc D3); đỉnh = thiết bị, độ dày/nhãn cạnh = trọng số. Bấm một đỉnh → làm nổi bật các cạnh của nó và top 3 láng giềng. Đây là màn minh hoạ trực quan nhất cho phần Graph khi demo/báo cáo.

## 6. Luồng phải chạy được khi demo
1. Mượn hết một thiết bị → SV khác đăng ký hàng đợi (3 người).
2. Trả thiết bị → toast báo người đầu hàng, vòng đếm 24h bắt đầu.
3. Tua +25 giờ → người đầu bị đẩy xuống cuối (animation), người kế tiếp được giữ hàng.
4. Mượn "Kính VR" → gợi ý "Tay cầm điều khiển" xuất hiện; mở trang Đồ thị thấy cạnh đó dày nhất.
5. Tua thêm vài ngày → phiếu quá hạn hiện ở Tổng quan và trang Quá hạn.

## 7. Cấu trúc `web/`
```
web/
  index.html            (SPA, điều hướng bằng hash: #/dashboard, #/devices, ...)
  css/  base.css  theme.css  components.css  pages.css
  js/   main.js  router.js  api.js (mọi fetch đi qua đây)  mock.js  ui/ (toast, modal, table...)  pages/ (mỗi trang 1 file)
  assets/  fonts/  icons/  illustrations/
  vendor/  (thư viện bên thứ ba, bản local)
  API_REQUESTS.md       (đề xuất thêm API, xử lý ở giai đoạn 8)
```

## 8. API dự kiến (bản chính thức: `docs/api.md`)
| Method | Endpoint | Dùng cho |
|---|---|---|
| GET | `/api/stats` | Tổng quan |
| GET | `/api/devices?query=&status=` | Danh sách thiết bị |
| GET | `/api/devices/{id}` | Chi tiết + hàng đợi |
| POST / PUT | `/api/devices`, `/api/devices/{id}` | Thêm / sửa |
| POST | `/api/devices/{id}/maintenance` | Chuyển bảo trì |
| POST | `/api/borrow` | `{studentId, studentName, deviceIds[], days}` |
| POST | `/api/return` | `{recordId}` |
| GET | `/api/records?status=open\|overdue\|all&page=` | Phiếu mượn |
| GET / POST | `/api/reservations/{deviceId}` | Xem / đăng ký hàng đợi |
| POST | `/api/reservations/{deviceId}/claim` | Người đầu hàng nhận |
| GET | `/api/suggestions/{deviceId}?k=3` | Gợi ý mượn kèm |
| GET | `/api/graph` | `{nodes[], edges[]}` cho trang đồ thị |
| GET / POST | `/api/clock`, `/api/clock/advance` | Đồng hồ giả lập, `{hours}` |
| GET | `/api/notifications` | Lấy (và xoá) sự kiện mới |

Lỗi trả về dạng `{ "error": { "code": "OUT_OF_STOCK", "message": "..." } }` — hiện `message` cho người dùng.
