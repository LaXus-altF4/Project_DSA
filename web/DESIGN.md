# BẢN THIẾT KẾ GIAO DIỆN WEB (web/DESIGN.md)
> **Dự án:** Phần mềm quản lý mượn trả thiết bị và gợi ý đồ dùng thực hành — HCMUS  
> **Sinh viên:** Lê Trường Khải — MSSV: 25300003  
> **Tài liệu tham chiếu:** `docs/web-ui-spec.md`, `AGENTS.md`, `docs/api.md`  
> **Trạng thái:** Đã duyệt kèm các điều chỉnh nghiệp vụ.

---

## 1. NGUYÊN TẮC BẮT BUỘC KHI TRIỂN KHAI

1. **Dữ liệu 100% từ API:** Mọi số liệu (số lượng kho, thời gian còn lại, thứ tự hàng đợi, gợi ý mượn kèm) được lấy trực tiếp từ API. Tuyệt đối không hard-code dữ liệu nghiệp vụ vào giao diện. Wireframe chỉ mang tính chất định vị khung nhìn (layout).
2. **Tiền phạt & quá hạn từ API:** Số ngày trễ (`lateDays`) và tiền phạt (`fine`, `fineFinal`) được tính toán bởi lõi C++ và lấy từ API `/api/records` hoặc `/api/records/{id}` (xem trước khi trả). Frontend không tự tính tiền phạt hay ngày trễ.
3. **Biểu đồ mượn nhiều nhất bằng CSS thuần:** Không sử dụng thư viện `Chart.js`. Biểu đồ thanh ngang (Horizontal Bar Chart) được dựng bằng HTML + CSS thuần, sử dụng thanh tỷ lệ phần trăm và biến CSS của theme sáng/tối để đảm bảo nhẹ, tải nhanh và dễ tùy biến.
4. **Đối chiếu chặt chẽ với `docs/api.md`:** Mọi nút bấm, form, hành động trên giao diện phải ánh xạ chính xác tới endpoint trong `docs/api.md`. Nếu giao diện cần thêm endpoint hoặc trường dữ liệu mới: dừng lại, ghi đề xuất vào `web/API_REQUESTS.md` để backend xử lý ở giai đoạn 8, không tự ý bịa endpoint.
5. **Xử lý lỗi từ server:** Các kiểm tra hợp lệ phía frontend chỉ nhằm mục đích nâng cao trải nghiệm (UX hint). Hệ thống luôn lắng nghe mã lỗi (`error.code`), thông điệp tiếng Việt (`error.message`) và chi tiết (`error.details`) từ API để hiển thị toast/alert cho người dùng.
6. **Môi trường chạy offline:** Không sử dụng CDN, không Google Fonts online. Mọi thư viện JS, icon và font được lưu trữ cục bộ trong `web/vendor/` và `web/assets/fonts/`.

---

## 2. HỆ THỐNG THIẾT KẾ (DESIGN SYSTEM)

### 2.1. Bảng màu Sáng / Tối (Light & Dark Theme)

| Biến CSS / Thành phần | Giao diện Sáng (Light) | Giao diện Tối (Dark) | Mô tả & Công dụng |
|---|---|---|---|
| `--color-bg-canvas` | `#F8FAFC` (Slate 50) | `#0B0F17` (Deep Dark) | Nền toàn trang, chống mỏi mắt |
| `--color-bg-surface` | `#FFFFFF` | `#151D2A` (Slate 900) | Nền thẻ (card), thanh điều hướng, modal |
| `--color-bg-muted` | `#F1F5F9` (Slate 100) | `#1E293B` (Slate 800) | Nền phụ, header của bảng, vùng code |
| `--color-border` | `#E2E8F0` (Slate 200) | `#26354A` (Slate 700) | Đường viền mảnh 1px phân tách các khối |
| `--color-primary` | `#3B82F6` (Blue 500) | `#60A5FA` (Blue 400) | Nút bấm chính, tab đang chọn, link |
| `--color-primary-hover` | `#2563EB` (Blue 600) | `#3B82F6` (Blue 500) | Trạng thái hover của nút chính |
| `--color-text-primary` | `#0F172A` (Slate 900) | `#F8FAFC` (Slate 50) | Chữ tiêu đề, nội dung quan trọng |
| `--color-text-secondary`| `#475569` (Slate 600) | `#94A3B8` (Slate 400) | Chữ mô tả, nhãn phụ, ngày giờ |
| `--color-text-muted` | `#94A3B8` (Slate 400) | `#64748B` (Slate 500) | Placeholder, icon disabled |

### 2.2. Màu sắc trạng thái thiết bị & thanh tỷ lệ (Quy tắc M1)

Giao diện trực quan hóa 3 trạng thái danh mục thiết bị và hiển thị con số `onHold` trên thanh tỷ lệ kho:

| Trạng thái / Đại lượng | Ý nghĩa nghiệp vụ | Nền & Viền (Light) | Nền & Viền (Dark) | Màu thanh tỷ lệ (Progress Bar) |
|---|---|---|---|---|
| **Sẵn sàng** (`available`) | Còn đơn vị có thể mượn trực tiếp | `#ECFDF5` / `#A7F3D0` (`#065F46`) | `#064E3B` / `#059669` (`#6EE7B7`) | `#10B981` (Emerald 500) |
| **Đang mượn** (`borrowed`) | Thiết bị đang được sinh viên mượn | `#FFFBEB` / `#FDE68A` (`#92400E`) | `#78350F` / `#D97706` (`#FCD34D`) | `#F59E0B` (Amber 500) |
| **Đang giữ** (`onHold`) | Giữ chỗ 24h cho hàng đợi | `#EFF6FF` / `#BFDBFE` (`#1E40AF`) | `#1E3A8A` / `#3B82F6` (`#93C5FD`) | `#3B82F6` (Blue 500) |
| **Bảo trì** (`maintenance`) | Đang hỏng / trong xưởng kiểm tra | `#FEF2F2` / `#FECACA` (`#991B1B`) | `#450A0A` / `#DC2626` (`#FCA5A5`) | `#EF4444` (Red 500) |

*Ghi chú: Luôn đảm bảo bất biến: `available + borrowed + onHold + maintenance == total`.*

### 2.3. Typography

- **Phông chữ hệ thống:** `Be Vietnam Pro` (tải về local dạng `.woff2`, hỗ trợ hoàn hảo tiếng Việt có dấu).
- **Phông hiển thị số / mã:** `ui-monospace`, `Consolas`, `monospace` kết hợp `font-variant-numeric: tabular-nums` để ngày giờ, mã phiếu, mã SV không làm xô lệch bảng.
- **Thang cỡ chữ (Type Scale):**
  - **H1 (Tiêu đề trang):** `24px` / Line-height `32px` / Font-weight `700`
  - **H2 (Tiêu đề mục / Thẻ):** `18px` / Line-height `26px` / Font-weight `600`
  - **H3 (Tiêu đề bảng / Form):** `14px` / Line-height `20px` / Font-weight `600`
  - **Body Text:** `14px` / Line-height `22px` / Font-weight `400`
  - **Caption / Badge / Time:** `12px` / Line-height `16px` / Font-weight `500`
  - **Metric Display (Số liệu to):** `28px` / Line-height `36px` / Font-weight `700`

### 2.4. Khoảng cách, Bo góc & Bóng đổ

- **Khoảng cách (Spacing scale):** `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`.
- **Bo góc (Border radius):**
  - `sm: 4px` (Badge, chip, nhãn nhỏ)
  - `md: 8px` (Nút bấm, ô input, dropdown, thanh tiến trình)
  - `lg: 12px` (Thẻ card, panel trượt, modal popup)
  - `xl: 16px` (Khung bao lớn, widget biểu đồ)
  - `full: 9999px` (Nút bo tròn, status pill dot)
- **Bóng đổ (Shadows):**
  - Light mode: `shadow-sm: 0 1px 2px rgba(0,0,0,0.05)`, `shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07)`, `shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1)`.
  - Dark mode: `border: 1px solid rgba(255, 255, 255, 0.08)` kết hợp `shadow-dark: 0 8px 24px -4px rgba(0,0,0,0.45)`.

---

## 3. BỐ CỤC CÁC MÀN HÌNH VÀ ÁNH XẠ API

### 3.0. Thanh đỉnh (Top Bar) & Khung điều hướng chung

- **Đồng hồ giả lập:** Hiển thị `dd/MM/yyyy HH:00` lấy từ `GET /api/clock`.
- **Nút tua thời gian:**
  - `+1 giờ`: `POST /api/clock/advance` với `{ "hours": 1 }`.
  - `+24 giờ`: `POST /api/clock/advance` với `{ "hours": 24 }`.
  - `+N giờ…`: Bấm mở popover nhập số giờ tuỳ chọn (1–8760).
  - Sau mỗi lần tua, tự động gọi `GET /api/notifications` để hiện toast các sự kiện phát sinh (`hold_granted`, `missed`, `removed`), đồng thời nạp lại dữ liệu trang hiện tại.
- **Nút chuyển đổi Theme (Dark / Light):** Lưu trạng thái vào `localStorage` (`theme: 'light' | 'dark'`).

---

### 3.1. Màn hình 1: Tổng quan (Dashboard — `#/dashboard`)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Thẻ: Tổng thiết bị & Đơn vị] [Thẻ: Đang mượn / Tỷ lệ] [Thẻ: Quá hạn / Tiền phạt] [Thẻ: Chờ & Giữ]│
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│ 📈 TOP THIẾT BỊ MƯỢN NHIỀU NHẤT        │ ⏱️ SẮP HẾT HẠN GIỮ NHẬN (< 6 giờ)             │
│ (Dựng bằng CSS thuần Flexbox/Bar)      │ (Danh sách từ expiringHolds)                  │
│ Kính VR (VR01)    [████████████] 13    │ • Kính VR (VR01) — Phạm Gia Huy (25120103)   │
│ Tay cầm (TC01)    [██████████  ] 10    │   Còn lại: 4 giờ (Hạn: 04/03 08:00)           │
│ Nguồn DC (PSU01)  [████████    ] 8     │   [Vòng đếm ngược 4h/24h] [Đi tới hàng đợi]   │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```
- **API sử dụng:** `GET /api/stats?within=6&top=5`.
- **Cơ chế biểu đồ CSS thuần:** Mỗi thanh là một phần tử `div` có `width: calc(timesBorrowed / maxBorrowed * 100%)`, chuyển động `transition: width 0.35s ease-out` kết hợp stagger animation theo thứ tự xuất hiện.
- **Quy chuẩn hiển thị tiền phạt:** Số tiền phạt ở thẻ "Phiếu quá hạn" bắt buộc giữ trên cùng một dòng với đơn vị tiền tệ (`white-space: nowrap;` và khoảng trắng cứng `\u00A0đ`), không để chữ "đ" bị rớt xuống dòng riêng biệt.

---

### 3.2. Màn hình 2: Danh mục Thiết bị (Devices — `#/devices`) & Panel trượt

```
┌───────────────────────────────────────────────────────────┬────────────────────────────┐
│ [🔍 Tìm mã/tên...]  [Lọc: Tất cả ▼]  [+ Thêm thiết bị mới] │ PANEL TRƯỢT: CHI TIẾT      │
├───────────────────────────────────────────────────────────┤ ━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Mã    Tên           Trạng thái  Tỷ lệ kho      Lượt  H.đợi│ Tên: Kính thực tế ảo (VR01)│
│ ───────────────────────────────────────────────────────── │ Kho: 0 sẵn / 1 mượn / 1 giữ│
│ VR01  Kính VR       [Đang mượn] [■■■■□□□□]     13    2    │ [Sửa thông tin] [Bảo trì]  │
│ TC01  Tay cầm VR    [Sẵn sàng]  [■■■■■■■■]     10    0    │ ────────────────────────── │
│                                                           │ 🌟 TOP 3 MƯỢN KÈM:         │
│ (Bấm 1 dòng mở Panel trượt bên phải ─────────────────────►│ 1. Tay cầm VR (10 lần)     │
│  Thanh tỷ lệ màu: Xanh lá / Vàng / Xanh dương / Đỏ)       │ 2. Cáp Type-C (5 lần)      │
│                                                           │ ────────────────────────── │
│                                                           │ ⏳ HÀNG ĐỢI HIỆN TẠI:      │
│                                                           │ 1. Phạm Gia Huy (Giữ 16h)  │
│                                                           │ 2. Lê Minh Châu (Vị trí 2) │
└───────────────────────────────────────────────────────────┴────────────────────────────┘
```
- **API sử dụng:**
  - Danh sách: `GET /api/devices?query=&status=`.
  - Chi tiết panel: `GET /api/devices/{id}`.
  - Thêm mới: `POST /api/devices` (modal).
  - Sửa tên / tổng số: `PUT /api/devices/{id}` (modal).
  - Chuyển sang bảo trì: `POST /api/devices/{id}/maintenance` (modal nhập `qty`).
  - Hoàn tất bảo trì: `POST /api/devices/{id}/maintenance/finish`.
  - Xoá thiết bị: `DELETE /api/devices/{id}` (kiểm tra điều kiện không còn phiếu mượn/hàng đợi).

---

### 3.3. Màn hình 3: Lập phiếu mượn (Borrow — `#/borrow`)

```
┌────────────────────────────────────────┬───────────────────────────────────────────────┐
│ 📝 THÔNG TIN PHIẾU MƯỢN                │ 🔍 THÊM THIẾT BỊ VÀO GIỎ                      │
│ MSSV: [ 25120199           ]           │ [ Tìm thiết bị có sẵn...                    ] │
│ Họ tên: [ Trần Văn An      ]           │ • Tay cầm VR (TC01) (Còn 2)       [+ Thêm]    │
│ Số ngày mượn: [ 3 ] ngày (1–30 ngày)   │ • Kính VR (VR01) (HẾT HÀNG)       [Đăng ký chờ│
│ ────────────────────────────────────── ├───────────────────────────────────────────────┤
│ 🛒 GIỎ THIẾT BỊ ĐÃ CHỌN (Tối đa 1 món):│ 💡 GỢI Ý MƯỢN KÈM VỚI GIỎ (suggestForBasket): │
│ 1. Kính VR (VR01)                  [x] │ 🎮 Tay cầm VR (TC01) • 10 lần cùng giỏ        │
│                                        │    Trạng thái: Sẵn sàng (còn 2)   [+ Thêm]    │
│ [ ✔️ XÁC NHẬN TẠO PHIẾU ]               │                                               │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```
- **API sử dụng:**
  - Gợi ý cho giỏ: `GET /api/suggestions?ids={id1,id2}&k=3` (tính trên toàn giỏ hiện tại).
  - Tạo phiếu: `POST /api/borrow` với `{ studentId, studentName, deviceIds, days }`.
  - Nếu báo lỗi `OUT_OF_STOCK` (kèm `details.unavailableIds`): hiển thị danh sách món hết hàng và nút dẫn ngay sang đăng ký hàng đợi.

---

### 3.4. Màn hình 4: Trả phiếu mượn (Return — `#/return`)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔍 TÌM KIẾM PHIẾU MƯỢN: [ Nhập mã phiếu PM..., MSSV hoặc Tên SV...                   ] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ CHI TIẾT PHIẾU CHỌN TRẢ: #PM0055                                                       │
│ Sinh viên: Nguyễn Thị Lan (MSSV: 25120104)                                             │
│ Thiết bị: Nguồn DC điều chỉnh (PSU01), Đồng hồ vạn năng (DMM01)                        │
│ Hạn trả: 25/02/2026 12:00 (Tính đến đúng giờ)                                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠️ THÔNG TIN QUÁ HẠN & TIỀN PHẠT (LẤY TỪ API RECORD PREVIEW):                          │
│ • Trạng thái: Quá hạn 9 ngày (lateDays từ API)                                         │
│ • Tiền phạt tạm tính: 648.000 VNĐ (fine từ API, fineFinal = false)                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ↩️ XÁC NHẬN TRẢ TOÀN BỘ PHIẾU ]                                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **API sử dụng:**
  - Tra cứu / Xem trước: `GET /api/records/{id}` (đọc trực tiếp `lateDays`, `fine`, `fineFinal` từ server, frontend không tự tính).
  - Trả phiếu: `POST /api/return` với `{ recordId }`.
  - Khi trả thành công, tự động gọi `GET /api/notifications` để hiện toast nếu có lượt chuyển giữ hàng (`hold_granted`) cho người chờ.

---

### 3.5. Màn hình 5: Hàng đợi đặt trước (Reservations — `#/reservations`)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Chọn thiết bị xem hàng đợi: [ VR01 - Kính thực tế ảo (Hết hàng - Đang chờ: 2)        ▼]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐  ┌────────────────────────────────────────┐ │
│ │ 👑 VỊ TRÍ 1: ĐANG GIỮ HÀNG             │  │ 👤 VỊ TRÍ 2: ĐANG CHỜ PHỤC VỤ          │ │
│ │ Sinh viên: Phạm Gia Huy (25120103)     │  │ Sinh viên: Lê Minh Châu (25120150)      │ │
│ │ ────────────────────────────────────── │  │ ─────────────────────────────────────── │ │
│ │ ⏳ CÒN LẠI: 16 GIỜ (Vòng tròn đếm SVG) │  │ Đăng ký lúc: 02/03/2026 10:00           │ │
│ │ Lỡ hẹn: 0/2 lần                        │  │ Lỡ hẹn: 0/2 lần                        │ │
│ │ [ 🎁 Nhận thiết bị ]   [ Huỷ đăng ký ] │  │ [ Huỷ đăng ký ]                         │ │
│ └────────────────────────────────────────┘  └────────────────────────────────────────┘ │
│ ➕ ĐĂNG KÝ HÀNG ĐỢI (Chỉ bật khi kho hết hàng):                                        │
│ MSSV: [ 25120188        ]  Tên: [ Hoàng Nhật Minh     ]   [ + Thêm vào hàng đợi ]      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **API sử dụng:**
  - Lấy danh sách hàng đợi: `GET /api/reservations/{deviceId}`.
  - Đăng ký hàng đợi: `POST /api/reservations/{deviceId}` với `{ studentId, studentName }` (chỉ khi `available == 0`).
  - Nhận thiết bị (Claim): `POST /api/reservations/{deviceId}/claim` với `{ studentId, days }` (chỉ người đang có `holding == true`, mở popup chọn số ngày 1–30, mặc định 7).
  - Huỷ đăng ký: `DELETE /api/reservations/{deviceId}/{studentId}`.

---

### 3.6. Màn hình 6: Quá hạn & Lịch sử (Records — `#/records`)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [ Tất cả (57) ]  [ ⚠️ Quá hạn (2) ]  [ 🟢 Đang mượn (4) ]  [ 📁 Đã trả (51) ]           │
│ 🔍 Tìm kiếm: [ Nhập mã phiếu, MSSV, tên SV...                                       ]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Mã phiếu  Sinh viên        Thiết bị        Ngày mượn       Hạn trả / Trả   Tiền phạt   │
│ ────────────────────────────────────────────────────────────────────────────────────── │
│ PM0055    Nguyễn Thị Lan   PSU01, DMM01    21/02 12:00     25/02 (Trễ 9d)  648.000 đ*  │
│ PM0012    Võ Thị Hạnh      DMM01           10/02 09:00     Đã trả 14/02    0 đ         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ (* Tiền phạt tạm tính)                             Trang [ 1 ] / 3    [Trước] [Sau]    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **API sử dụng:** `GET /api/records?status={all|open|overdue|returned}&query=&page=1&pageSize=20`.
- Hiển thị dấu hiệu phân biệt: `fineFinal == false` (tạm tính), `fineFinal == true` (đã chốt).

---

### 3.7. Màn hình 7: Đồ thị mượn kèm (Graph — `#/graph`)

```
┌───────────────────────────────────────────────────────────┬────────────────────────────┐
│ 🕸️ BẢN ĐỒ QUAN HỆ MƯỢN KÈM (vis-network)                  │ 📌 CHI TIẾT ĐỈNH           │
│ [ Kéo thả đỉnh / Lăn chuột để phóng to / thu nhỏ ]        │ ━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                           │ Thiết bị: Kính VR (VR01)   │
│             (TC01) ──[Trọng số 10]── (VR01)               │ Đã mượn: 13 lần            │
│               │                         │                 │                            │
│           [w: 3]                      [w: 5]              │ 🌟 TOP 3 LIÊN KẾT NHẤT:    │
│               │                         │                 │ 1. Tay cầm VR (w = 10)     │
│             (BAT01) ──[w: 2]───────── (CAB01)             │ 2. Cáp Type-C (w = 5)      │
│                                                           │ 3. Pin sạc DP (w = 2)      │
└───────────────────────────────────────────────────────────┴────────────────────────────┘
```
- **API sử dụng:**
  - Toàn bộ mạng đồ thị: `GET /api/graph` (trả về `{ nodes, edges }`).
  - Khi nhấp vào 1 đỉnh: gọi `GET /api/suggestions/{id}` để hiển thị danh sách Top 3 láng giềng liên kết nhất ở thanh bên phải, đồng thời làm mờ các đỉnh/cạnh không kết nối trực tiếp.

---

## 4. DANH SÁCH 12 ANIMATION CHUẨN VÀ QUY CÁCH KỸ THUẬT

> **Ràng buộc hiệu năng:** Chỉ animate `transform` và `opacity` (đạt chuẩn 60fps mượt mà, không gây layout reflow giật lag), thời lượng mỗi hiệu ứng ≤ 400ms, tự động vô hiệu hoá khi người dùng bật `prefers-reduced-motion: reduce`. Toàn bộ hiệu ứng được tập trung tại `web/css/animations.css` và `web/js/ui/motion.js` để tái sử dụng xuyên suốt toàn web.

| # | Tên Animation | Vị trí áp dụng | Quy cách kỹ thuật & Thời lượng | Mục đích Demo & Trải nghiệm |
|---|---|---|---|---|
| 1 | **Page Transition** | Toàn bộ các trang khi đổi route | Fade + `translateY(8px) -> 0` trong **200ms** | Chuyển trang mượt mà, tạo cảm giác ứng dụng nhẹ và tức thì |
| 2 | **Entrance Staggering** | Thẻ số liệu & khối nội dung khi vào trang | Xuất hiện lần lượt (`stagger 60ms/phần tử`), tổng ≤ 350ms | Tránh tải đột ngột, dẫn mắt người nhìn vào từng khối số liệu |
| 3 | **Metrics Count-up & Diff Floating** | Số liệu thống kê ở Dashboard | Đếm số `requestAnimationFrame` (350ms); khi đổi số nháy màu + hiện nhãn `+N` / `-N` bay lên | Trực quan hóa biến động số liệu sau mỗi thao tác mượn/trả/tua |
| 4 | **Bar Chart Stagger Fill** | Biểu đồ thanh Top mượn | Thanh giãn từ `scaleX(0)` đến `scaleX(1)` trong **350ms**, stagger theo thứ tự | Hiển thị đồ thị sinh động mà không cần Chart.js |
| 5 | **Clock Mechanical Roll & Spin** | Đồng hồ giả lập trên Topbar | Chữ số giờ lăn kiểu đồng hồ cơ (`clock-roll`, 300ms) + icon xoay (`rotate(720deg)`, 400ms) | Báo hiệu rõ ràng thời gian giả lập vừa được tua |
| 6 | **Overdue Pulse Red** | Thẻ "Phiếu quá hạn" ở Dashboard | Viền đỏ nhấp nháy phát sáng 2 lần (`pulseRedBorder`, 400ms x 2) khi số phiếu tăng | Thu hút chú ý ngay lập tức tới các vi phạm trễ hạn |
| 7 | **Sidebar Active & Hover** | Menu điều hướng bên trái | Chỉ báo trượt co giãn (`scaleY`, 200ms); hover dịch nhẹ `translateX(3px)` (150ms) | Phản hồi điều hướng xúc giác, xác định rõ vị trí màn hình |
| 8 | **Card Lift & Button Press** | Các thẻ Card & Nút bấm | Card hover nhấc lên `translateY(-2px)` + bóng đậm hơn; Nút co nhẹ `scale(0.97)` khi nhấn | Tạo chiều sâu vật lý (tactile depth) cho giao diện |
| 9 | **Theme Toggle Smooth Transition** | Nút đổi Theme Sáng / Tối | Toàn bộ màu nền/chữ chuyển mượt trong **250ms**; Icon xoay 360 độ (300ms) | Chuyển đổi theme êm dịu, không gây chớp mắt đột ngột |
| 10 | **Refresh Button Spin** | Nút "Làm mới" trên trang | Icon xoay tròn liên tục (`spinInfinite`, 400ms) trong thời gian fetch API | Phản hồi trạng thái đang nạp dữ liệu cho người dùng |
| 11 | **SVG Checkmark Stroke Draw** | Trạng thái rỗng (Empty state) | Đường viền nét vẽ tự vẽ bằng `stroke-dashoffset` từ 60 về 0 trong **400ms** | Mang lại cảm giác sạch sẽ, hoàn tất khi không có phát sinh lỗi |
| 12 | **Toast Countdown Progress** | Thông báo nổi góc màn hình | Thanh tiến trình co dần từ `scaleX(1)` về `scaleX(0)` theo thời gian đếm ngược của toast | Báo hiệu chính xác cho người dùng khi nào thông báo sẽ tự đóng |

*Tất cả animation đều được bao bọc kiểm tra `@media (prefers-reduced-motion: reduce)` trong `animations.css` và `motion.js` để tôn trọng cấu hình hỗ trợ tiếp cận của hệ điều hành.*

---

## 5. THƯ VIỆN LOCAL TẢI VỀ `web/vendor/`

Chỉ sử dụng 2 thư viện JavaScript cực nhẹ và 1 bộ font cục bộ, hoạt động 100% offline không cần kết nối mạng hay công cụ đóng gói:

1. **`web/vendor/vis-network.min.js` (~350 KB):**
   - *Mục đích:* Dựng đồ thị lực mượn kèm ở màn hình `#/graph`.
   - *Lý do:* Chuyên biệt cho cấu trúc Graph (nodes, edges), thuật toán vật lý lực hút/đẩy tự nhiên, hỗ trợ sẵn kéo thả node, zoom/pan và bắt sự kiện click node cực kỳ ổn định.
2. **`web/vendor/lucide.min.js` (~80 KB):**
   - *Mục đích:* Render icon vector toàn bộ hệ thống (đồng hồ, menu, trạng thái, chuông...).
   - *Lý do:* Bộ icon hiện đại, tự động quét và render thẻ SVG cục bộ không cần nạp font icon qua internet.
3. **`web/assets/fonts/BeVietnamPro-*.woff2` (~120 KB):**
   - *Mục đích:* Font chữ chuẩn quốc tế hiển thị tiếng Việt trọn vẹn, không lỗi dấu.
   - *Lý do:* Khai báo qua `@font-face` cục bộ trong CSS, đảm bảo tính thẩm mỹ đồng bộ trên mọi máy chấm điểm.

---
*(Bản thiết kế này đã sẵn sàng để chuyển sang Prompt 7B theo lộ trình).*
