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
| 10 | **Refresh / Relayout Spin** | Nút "Làm mới" & "Sắp xếp lại lực" | Icon xoay 1 vòng mượt (`spinOnceSmooth`, `600ms`, hữu hạn 1 lần) | Phản hồi thao tác làm mới / sắp xếp lại mà không gây chóng mặt |
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

## 6. GIAO DIỆN SINH ĐỘNG & 3D

> **Mục tiêu nâng cấp:** Đưa giao diện lên mức *"sinh động, cao cấp"* với chiều sâu không gian và điểm nhấn 3D hiện đại, nhưng **số liệu nghiệp vụ luôn sắc nét, tương phản cao** và **giữ nguyên 100% chức năng, luồng demo cũng như hợp đồng `docs/api.md`**.  
> **Nguyên tắc triển khai:** Thực hiện tuần tự theo **5 đợt độc lập (Đợt A → Đợt E)**; kết thúc mỗi đợt đều tự kiểm tra và **commit Git riêng** trước khi sang đợt tiếp theo.

### 6.1. Ràng buộc kỹ thuật & Bảo toàn hiệu năng bắt buộc

1. **Công tắc toàn cục `"Hiệu ứng 3D"` trên Topbar (`#topbar .topbar-right`):**
   - Đặt nút gạt `#btn-fx-toggle` cạnh nút đổi Theme Sáng/Tối, điều khiển thuộc tính gốc `<html data-fx="3d" | "flat">` thông qua module trung tâm `web/js/ui/fx.js`.
   - Lưu lựa chọn vào `localStorage` (`lab_fx_3d: 'on' | 'off'`), mọi thao tác đọc/ghi `localStorage` và `sessionStorage` đều bọc trong `try { ... } catch (_) {}`.
   - **Khi tắt (`data-fx="flat"`):** Toàn bộ quy tắc trong `web/css/effects-3d.css` (được neo dưới selector `html[data-fx="3d"]`), vòng lặp WebGL `requestAnimationFrame`, listener chuột của Tilt/Ripple, Flip-Clock 3D, Confetti và Splash đều dừng/ẩn ngay lập tức — giao diện **trở về đúng 100% giao diện phẳng hiện tại** mà không cần tải lại trang.
2. **Mục tiêu 60fps trên laptop i7 đời thấp (iGPU tích hợp) & máy chiếu `1366×768`:**
   - Giới hạn cứng tỷ lệ điểm ảnh cho mọi canvas WebGL/2D: `Math.min(window.devicePixelRatio || 1, 1.5)`.
   - Không dùng hậu kỳ nặng (`EffectComposer`, `UnrealBloomPass`), không bật đổ bóng thời gian thực (`shadowMap.enabled = false`) trong Three.js.
   - Lắng nghe `document.addEventListener('visibilitychange', ...)`: tạm dừng toàn bộ vòng lặp render 3D ngay khi tab ẩn (`document.hidden === true`) và khôi phục mượt khi quay lại tab (reset `clock.getDelta()` tránh giật khung hình).
   - Tôn trọng tuyệt đối `@media (prefers-reduced-motion: reduce)` và `window.matchMedia('(prefers-reduced-motion: reduce)')` (cả lúc khởi tạo lẫn khi người dùng đổi cấu hình hệ điều hành đang chạy).
   - Bọc `try/catch` khi khởi tạo `WebGLRenderer` và lắng nghe `webglcontextlost`: nếu máy chấm tắt tăng tốc phần cứng (Hardware Acceleration), hệ thống tự động hạ cấp êm về nền CSS tĩnh mà không báo lỗi hay vỡ khung.
3. **Độ tương phản chữ & Bảo toàn màn hình Đồ thị 2D:**
   - Mặt kính mờ (`glassmorphism`) luôn giữ độ đục nền cao (`rgba(255, 255, 255, 0.86–0.90)` ở Sáng; `rgba(21, 29, 42, 0.84–0.88)` ở Tối) để chữ chính và con số `tabular-nums` đạt tỷ lệ tương phản **≥ 11:1** (chuẩn WCAG AAA), nhìn rõ trên máy chiếu `1366×768` nhiều sáng. Mọi lớp hạt và confetti đều đặt `pointer-events: none` và không bao giờ che nội dung hay bảng biểu (không sử dụng lớp spotlight/vệt sáng chạy theo con trỏ chuột).
   - Màn hình **`#/graph` ("Minh hoạ CTDL Đồ thị") giữ nguyên 2D** (`vis-network` hiện tại): tuyệt đối **không** gắn biến đổi CSS 3D (`rotateX/Y`, `perspective`) lên `.graph-canvas-panel` để bảo toàn chính xác 100% toạ độ con trỏ 2D khi kéo/chọn đỉnh; bổ sung kính mờ, viền tinh tế và bóng đổ nhiều lớp cho các panel xung quanh (`.graph-toolbar-panel`, `.graph-detail-panel`, `.graph-grader-note`, `.graph-floating-tooltip`), kết hợp hệ thống hiệu ứng Canvas 2D trực quan hoá danh sách kề (điều khiển đồng bộ qua công tắc `"Hiệu ứng 3D"` và `prefers-reduced-motion`).
4. **100% Offline & Không đụng tầng Backend:**
   - Thư viện bên thứ ba duy nhất bổ sung là `web/vendor/three.module.min.js` (nạp động bằng `import()` để không chặn lần vẽ đầu tiên), ghi đầy đủ nguồn tải + phiên bản + giấy phép MIT vào `web/vendor/README.md`.
   - Không sửa `web/js/api.js` về mặt hợp đồng, không tự tính nghiệp vụ ở frontend, không chạm vào `include/`, `src/`, `server/`, `data/`.

---

### 6.2. Đề xuất chi tiết theo 5 đợt (A → E)

#### Đợt A — Nền & Không khí (kèm hạ tầng Công tắc 3D & Vendor `three.js`)
*Phạm vi commit Đợt A:* Tải `web/vendor/three.module.min.js`, cập nhật `web/vendor/README.md`, tạo `web/js/ui/fx.js` (công tắc `"Hiệu ứng 3D"` trên `#topbar`), `web/css/effects-3d.css` và nền Gradient Mesh + Three.js hạt/lưới mờ phía sau nội dung *(đã lược bỏ hiệu ứng đèn Spotlight/vệt sáng theo con trỏ chuột và listener `mousemove` toàn trang để giao diện trong trẻo, không gây rối mắt)*.

##### A.1. Nền Gradient Mesh chuyển động chậm + Lớp hạt / lưới 3D mờ (`three.js`) phía sau nội dung
- **Thiết kế & Hiển thị:**
  - Đặt khung nền cố định `#ambient-bg-root` (`position: fixed; inset: 0; z-index: 0; pointer-events: none`) nằm dưới `#main-wrapper` (khi bật 3D, `#page-container` dùng nền trong suốt để lộ lớp không khí phía sau):
    1. *Gradient Mesh chậm (`.bg-gradient-mesh`):* 3 quầng màu lớn hài hoà theo bảng màu hệ thống (Light: lam dịu `rgba(59,130,246,0.09)`, ngọc lục bảo `rgba(16,185,129,0.07)`, chàm nhạt `rgba(99,102,241,0.06)` trên `#F8FAFC`; Dark: lam sâu `rgba(37,99,235,0.16)`, lục bảo tối `rgba(5,150,105,0.10)`, chàm `rgba(79,70,229,0.12)` trên `#0B0F17`), trôi cực chậm chu kỳ `24–31s` chỉ bằng `transform: translate3d(...) scale(...)` (tự động tạm dừng khi ẩn tab).
    2. *Lưới sóng & hạt bụi 3D mờ (`<canvas id="bg-3d-canvas">`):* Dựng bằng Three.js gồm một mặt lưới dây phối cảnh (`PlaneGeometry(38, 22, 26, 16)` wireframe uốn sóng sin rất chậm ở nửa dưới khung nhìn) kết hợp `~70` hạt ánh sáng lơ lửng (`THREE.Points` với sprite tròn tạo bằng Canvas 2D trong bộ nhớ) và nhịp trôi máy quay tự nhiên không phụ thuộc con trỏ chuột. Độ mờ khống chế thấp (`opacity: 0.22` ở Light, `0.32` ở Dark), tự động đồng bộ bảng màu khi đổi Theme Sáng/Tối.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - Thư viện cục bộ: `web/vendor/three.module.min.js` (Three.js `r160` ES Module, **~668 KB** minified, MIT License — nạp bất đồng bộ bằng dynamic `import()` sau khi giao diện chính đã khởi tạo, dùng chung cho cả A.1 và B.1).
  - Mã tự viết: `web/js/ui/bg-scene.js` (**~4.5 KB**) + `web/js/ui/fx.js` (**~2.5 KB**) + CSS trong `web/css/effects-3d.css` (**~1.5 KB**).
- **Ảnh hưởng hiệu năng:**
  - Rất nhẹ (~`0.6–1.2 ms/frame` trên iGPU Intel HD 520/620 ở `1366×768`): tổng cộng chỉ **2 draw calls** (~460 đỉnh lưới + 70 điểm hạt), tắt `antialias: false`, tắt `depthTest` cho hạt, `powerPreference: 'low-power'`, khoá `devicePixelRatio ≤ 1.5`. Tự động dừng `requestAnimationFrame` ngay khi `document.hidden === true`.
- **Cách tắt:**
  - Bấm công tắc **"Hiệu ứng 3D"** trên Topbar sang Tắt (`data-fx="flat"`): dừng ngay `requestAnimationFrame`, ẩn `display: none` toàn bộ `#ambient-bg-root` và khôi phục nền phẳng `--color-bg-canvas` đặc.
  - Tự động tắt khi `prefers-reduced-motion: reduce` hoặc khi trình duyệt không hỗ trợ WebGL.

---

#### Đợt B — Khối 3D trang trí
*Phạm vi commit Đợt B:* Mô hình 3D Board phát triển STM32 kiểu "Blue Pill" (`STM32F103`) dựng thủ tục có thể thu gọn ở đầu trang Tổng quan (`#/dashboard`) — kèm ảnh tĩnh SVG thay thế khi tắt 3D — và đồng hồ lật số Flip-Clock 3D trên Topbar khi tua thời gian.

##### B.1. Tổng quan (`#/dashboard`): Mô hình 3D Board phát triển STM32 "Blue Pill" (`STM32F103`) dựng thủ tục, có thể thu gọn & fallback SVG tĩnh
- **Thiết kế & Hiển thị:**
  - Thêm khối giới thiệu `.dashboard-hero-3d` gọn gàng (cao `~156px` khi mở, `~40px` khi thu gọn) ngay trên 4 thẻ số liệu của `#/dashboard`, cân đối cho khung chiếu `1366×768`:
    - *Cột trái:* Tiêu đề chào mừng Phòng Lab Thực hành Nhúng & Công nghệ HCMUS + huy hiệu tóm tắt nhịp vận hành lấy trực tiếp từ dữ liệu `GET /api/stats` sẵn có + lối tắt nhanh sang `#/borrow` và `#/graph`.
    - *Cột phải (Stage `~300×132px`, nền trong suốt hoà với thẻ):* Mô hình 3D **Board phát triển STM32 kiểu "Blue Pill"** dựng thủ tục 100% từ hình khối cơ bản, **không tải tệp mô hình ngoài**, **không dùng logo ST hay nhãn hiệu thương mại** (trên lưng chip chỉ khắc đúng chữ `"STM32F103"`):
      1. **PCB xanh dương mờ bo góc** (`ExtrudeGeometry` vát mép nhẹ) kèm lớp phủ mạch đồng mảnh (trace) và ký hiệu silkscreen kỹ thuật trên mặt board.
      2. **Chip trung tâm LQFP48 đen** đặt xoay `45°`, khắc chữ `"STM32F103"`, với **48 chân kim loại gull-wing ở 4 cạnh**; đi kèm **tinh thể thạch anh 8MHz** vỏ kim loại bầu dục, **nút nhấn Reset**, **2 cầu jumper vàng `BOOT0`/`BOOT1`**, **cổng Micro-USB** kim loại ở một đầu (kèm IC nguồn LDO), **2 hàng chân header mạ vàng dọc hai cạnh dài** (+ hàng chân nạp SWD ở đầu đối diện), và **2 đèn LED SMD**: LED nguồn đỏ (`PWR`) sáng liên tục + LED `PC13` xanh lá nhấp nháy chu kỳ `~1 Hz`.
      3. **Hiệu ứng tương tác & tín hiệu:** Board tự xoay chậm quanh trục đứng (`~30 giây/vòng`, không nhấp nhô), nghiêng nhẹ theo chuột (parallax `lerp`), kèm LED `PC13` xanh nhấp nháy `~1 Hz` và các **"xung tín hiệu" nhẹ** chạy dọc 8 đường mạch từ chân chip `STM32F103` ra hai hàng header vàng; khi rê chuột (hover) vào thẻ → viền board và quầng sáng gầm phát sáng dịu. Ánh sáng 3 điểm (`HemisphereLight` + 2 `DirectionalLight`) tự cân chỉnh cường độ và sắc độ cho cả Theme Sáng và Theme Tối.
    - *Nút thu gọn / mở rộng:* Nút `Thu gọn` / `Mở giới thiệu` ở góc phải trên khối Hero, lưu trạng thái `lab_hero_collapsed` vào `localStorage` (bọc `try/catch`).
- **Kỹ thuật / Thư viện & Dung lượng:**
  - Tái sử dụng `web/vendor/three.module.min.js` từ Đợt A (**0 KB** thư viện cộng thêm; dựng thủ tục hoàn toàn bằng `ExtrudeGeometry`, `BoxGeometry`, `CylinderGeometry`, `PlaneGeometry`, `LineSegments`, `Points`, `CanvasTexture` — không cần `GLTFLoader` hay tệp `.glb`/`.gltf`).
  - Dùng `THREE.InstancedMesh` gom toàn bộ 48 chân chip LQFP48, 50 chân header vàng và 44 vòng hàn xuyên lỗ vào 3 lệnh vẽ instanced.
  - Ảnh tĩnh thay thế khi tắt 3D: `web/assets/stm32-bluepill.svg` (**~8.8 KB** vector thuần cục bộ, cùng thiết kế Blue Pill chỉ ghi `"STM32F103"`).
  - Mã tự viết: `web/js/ui/lab-hero-3d.js` (**~28 KB** mã nguồn có chú thích, **< 10 KB** gzip) + CSS bố cục trong `web/css/effects-3d.css` (**~2.2 KB**).
- **Ảnh hưởng hiệu năng:**
  - Rất nhẹ (~`0.6–1.1 ms/frame`): khung vẽ nhỏ (`300×132` CSS px, giới hạn `devicePixelRatio ≤ 1.5`), tổng hình học chỉ **~3.300 tam giác** (**<< giới hạn 20.000 tam giác**), tắt hoàn toàn `shadowMap`, giữ duy nhất 1 `WebGLRenderer` tái gắn kết để tránh vượt giới hạn ngữ cảnh WebGL khi làm mới dữ liệu.
  - Quản lý vòng đời nghiêm ngặt: **tự động dừng vòng lặp render ngay khi tab ẩn (`visibilitychange`), khi thẻ bị thu gọn (`is-collapsed`), khi cuộn thẻ ra khỏi khung nhìn (`IntersectionObserver`), hoặc khi chuyển sang màn hình khác**.
- **Cách tắt:**
  - *Tắt toàn cục:* Gạt công tắc **"Hiệu ứng 3D"** trên Topbar sang Tắt → dừng ngay WebGL và **hiện ảnh tĩnh SVG (`assets/stm32-bluepill.svg`) của board STM32F103 thay thế** trên thẻ giới thiệu (cũng tự động kích hoạt fallback SVG này nếu máy không có WebGL).
  - *Tắt riêng khối:* Bấm nút **Thu gọn** ở góc thẻ (ẩn vùng board, dừng render WebGL tức thì, ghi nhớ vào `localStorage`).
  - Khi `prefers-reduced-motion: reduce` → dừng vòng lặp chuyển động, chỉ kết xuất 1 khung hình tĩnh duy nhất.

##### B.2. Đồng hồ giả lập trên Topbar: Chữ số lật kiểu Flip-Clock 3D khi tua giờ
- **Thiết kế & Hiển thị:**
  - Chuỗi thời gian từ API `GET /api/clock` (`"dd/MM/yyyy HH:00"`, VD `"03/03/2026 16:00"`) trên `#topbar` được trình bày thành các ô thẻ số cơ học mini (Split-Flap Tiles) có đường rãnh mảnh chia đôi ngang, dùng `tabular-nums` giữ cố định độ rộng và độ tương phản cao ở cả Sáng/Tối.
  - Mỗi khi tua `+1h`, `+24h`, `+Nh…` (`POST /api/clock/advance`), những cụm số thay đổi (giờ, ngày, tháng, năm) sẽ thực hiện chuyển động **lật cánh 3D quanh trục X (`perspective: 320px`, nửa trên gập `0° → -90°`, nửa dưới mở `90° → 0°` kèm bóng chuyển tiếp)** trong `360ms` kết hợp icon đồng hồ quay nhanh. Giữ đầy đủ `aria-label` chuỗi giờ gốc cho trình đọc màn hình.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - CSS 3D Transforms thuần (`perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden`, `rotateX`) + JS thuần cập nhật trong `web/js/ui/clock.js` & `web/js/ui/motion.js`. Không dùng thư viện ngoài.
  - Mã tự viết: **~2.5 KB** JS + **~2.0 KB** CSS.
- **Ảnh hưởng hiệu năng:**
  - **`0%` tải khi đứng yên** (chỉ là DOM tĩnh). Khi bấm nút tua giờ, chỉ animate `transform` và `opacity` trên vài thẻ số nhỏ trong `360ms` bằng GPU compositor, không gây reflow thanh Topbar, đạt 60fps tuyệt đối.
- **Cách tắt:**
  - Tắt công tắc **"Hiệu ứng 3D"** trên Topbar → hiển thị chuỗi chữ phẳng `--/--/---- --:00` và dùng hiệu ứng `triggerRollDigit()` cũ.
  - Khi `prefers-reduced-motion: reduce` → đổi số tức thì không lật cánh 3D.

---

#### Đợt C — Chiều sâu cho thành phần
*Phạm vi commit Đợt C:* Tilt 3D theo chuột, kính mờ (glassmorphism), bóng đổ nhiều lớp, viền phát sáng theo màu trạng thái trên các thẻ/panel; nút bấm chiều sâu kèm Ripple và thanh chỉ báo Sidebar phát sáng.

##### C.1. Thẻ số liệu, thẻ/panel thiết bị, thẻ hàng đợi: Tilt 3D theo chuột + Kính mờ (Glassmorphism) + Bóng nhiều lớp + Viền phát sáng theo màu trạng thái
- **Thiết kế & Hiển thị:**
  - *Tilt 3D tinh tế:* Áp dụng cho `.metric-card` (`#/dashboard`), `.queue-card` (`#/reservations`), `.companion-card` / `.suggestion-card` / `.return-record-item` với góc nghiêng khống chế nhỏ (`±4°` cho thẻ nhỏ, `±2°` cho thẻ vừa: `perspective(900px) rotateX(...) rotateY(...)`), tự trả mượt về `0°` khi rời chuột. **Không** tilt bảng dữ liệu lớn `.data-table` (`#/devices`, `#/records`), biểu mẫu nhập liệu hay `.graph-canvas-panel` (`#/graph`) để đảm bảo đọc bảng, gõ phím và kéo đỉnh đồ thị 2D chính xác tuyệt đối.
  - *Kính mờ (Glassmorphism) & Bóng nhiều lớp:* Áp dụng nền bán trong suốt độ đục cao (`0.86–0.90` Light / `0.84–0.88` Dark) + `backdrop-filter: blur(10px) saturate(135%)` + đường viền bắt sáng đỉnh `inset 0 1px 0` + bóng 3 lớp tạo độ nổi vật lý cho các `.card`, `.metric-card`, `.queue-card`, `.side-panel` trượt bên phải và các panel điều khiển/chi tiết của màn `#/graph`.
  - *Viền phát sáng theo màu trạng thái (Quy tắc M1):* Khi hover hoặc khi thẻ mang trạng thái đặc biệt, viền toả hào quang mảnh đúng ngữ nghĩa: Lục bảo (`available`), Hổ phách (`borrowed` / `missCount == 1`), Lam điện (`onHold` / `.queue-card-holding`), Đỏ cảnh báo (`maintenance` / quá hạn `.is-overdue` / `#card-metric-overdue` khi có phiếu trễ).
- **Kỹ thuật / Thư viện & Dung lượng:**
  - CSS3 (`backdrop-filter`, multi-layer `box-shadow`, `perspective`, `transform`) + JS thuần `web/js/ui/tilt.js` (không gắn `mousemove` toàn trang; chỉ gắn `pointermove` cục bộ trên đúng thẻ đang hover qua `rAF` và gỡ ngay lúc `pointerleave`, tự nhường quyền khi thẻ đang chạy hiệu ứng FLIP hoặc pulse). Không dùng thư viện ngoài.
  - Mã tự viết: **~2.2 KB** JS + **~3.5 KB** CSS.
- **Ảnh hưởng hiệu năng:**
  - Thấp (~`0.2–0.4 ms` khi rê chuột trên thẻ): khống chế bán kính `blur(10px)` vừa phải để không gây nghẽn fill-rate trên iGPU đời thấp ở độ phân giải `1366×768`; chỉ cấp phát `will-change: transform` lúc `pointerenter` và gỡ ngay sau `pointerleave` để tiết kiệm VRAM compositor.
- **Cách tắt:**
  - Tắt công tắc **"Hiệu ứng 3D"** trên Topbar → tắt toàn bộ `backdrop-filter`, bóng đa lớp, viền glow và phép nghiêng `rotateX/Y`, khôi phục mặt thẻ phẳng `--color-bg-surface` và `--shadow-sm`.
  - Khi `prefers-reduced-motion: reduce` → tắt nghiêng Tilt 3D theo chuột, chỉ giữ giao diện tĩnh.

##### C.2. Nút bấm: Hiệu ứng nhấn có chiều sâu + Ripple; Sidebar: Thanh chỉ báo phát sáng
- **Thiết kế & Hiển thị:**
  - *Nút bấm (`.btn`):* Bổ sung độ dày vật lý với viền sáng mép trên `inset 0 1px 0 rgba(255,255,255,0.28)` và bóng đế có chiều sâu; khi nhấn (`:active`), nút lún xuống `translateY(1.5px) scale(0.98)` thu bóng đế thật tay. Khi nhấp chuột, hiệu ứng sóng nước sáng (`.btn-ripple`) lan tròn từ tâm điểm click (`scale(0 → 2.4)`, `opacity: 0.35 → 0` trong `420ms`) rồi tự thu dọn.
  - *Sidebar (`#sidebar`):* Thanh chỉ báo dọc của mục đang chọn (`.nav-item.active::before`) phát sáng neon dịu (`box-shadow: 0 0 12px var(--color-primary)`), nền mục active có dải chuyển sắc ngang tinh tế giúp nhận diện tức thì màn hình đang đứng lúc thuyết trình.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - CSS (`linear-gradient`, `box-shadow`, `transform`) + JS thuần uỷ quyền sự kiện `pointerdown` ở `document` trong `web/js/ui/ripple.js`. Không dùng thư viện ngoài.
  - Mã tự viết: **~1.2 KB** JS + **~1.8 KB** CSS.
- **Ảnh hưởng hiệu năng:**
  - Không đáng kể (`< 0.1 ms` chỉ phát sinh đúng khoảnh khắc nhấp nút; thẻ `<span class="btn-ripple">` chỉ dùng `transform` + `opacity` và tự xoá khỏi DOM sau `420ms`).
- **Cách tắt:**
  - Tắt công tắc **"Hiệu ứng 3D"** trên Topbar → ngừng sinh sóng ripple, tắt phát sáng thanh chỉ báo Sidebar và đưa nút về kiểu phẳng hiện tại.
  - Khi `prefers-reduced-motion: reduce` → không tạo sóng ripple khi bấm nút.

---

#### Đợt D — Chuyển động có ý nghĩa
*Phạm vi commit Đợt D:* Chuyển trang phối cảnh 3D mượt, lật 3D thẻ hàng đợi lỡ hạn trước khi trượt xuống cuối, hiệu ứng Confetti khi mượn thành công + rung nhẹ thẻ tiền phạt khi quá hạn, biểu đồ thanh phẳng bo tròn ở Tổng quan (kèm đếm số & tooltip) và chuỗi hiệu ứng 2D trực quan hoá danh sách kề ở màn Đồ thị (`#/graph`).

##### D.1. Chuyển trang kiểu phối cảnh (Perspective) mượt
- **Thiết kế & Hiển thị:**
  - Đặt `perspective: 1200px` trên `#page-container`. Khi đổi route trong `router.js`, khung `.page` xuất hiện theo chiều sâu không gian từ `opacity: 0; transform: translateY(10px) translateZ(-28px) rotateX(2.5deg)` tiến về mặt phẳng chuẩn trong **`260ms` `cubic-bezier(0.16, 1, 0.3, 1)`**.
  - Sau khi hoàn tất `260ms`, gỡ class hiệu ứng để `transform` của `.page` trở về `none` hoàn toàn, đảm bảo không tạo stacking context ảnh hưởng tới modal/tooltip hay canvas đồ thị 2D.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - CSS `@keyframes pagePerspectiveEnter` + tinh chỉnh dọn class trong `web/js/router.js`. Không dùng thư viện ngoài.
  - Mã tự viết: **~0.6 KB** CSS + **~0.3 KB** JS.
- **Ảnh hưởng hiệu năng:**
  - Chỉ chạy 1 lần trong `260ms` lúc chuyển màn hình trên GPU compositor (`transform` + `opacity`), đạt 60fps.
- **Cách tắt:**
  - Tắt công tắc **"Hiệu ứng 3D"** → dùng lại hiệu ứng `.page-enter` phẳng hiện tại (`translateY(8px)` 200ms).
  - Khi `prefers-reduced-motion: reduce` → chuyển trang tức thì không hiệu ứng.

##### D.2. Thẻ hàng đợi lật 3D khi người đầu lỡ hạn trước khi trượt xuống cuối (`#/reservations`)
- **Thiết kế & Hiển thị:**
  - Nâng cấp kịch bản demo trọng tâm trong `reservations.js` (`onTimeAdvanced` khi tua `+25h` có sự kiện `type === "missed"` từ `GET /api/notifications`):
    - *Pha 1 — Lật 3D báo lỡ hạn (`320ms`):* Thẻ `.queue-card` của người đầu hàng vừa hết hạn 24h nháy viền hổ phách/đỏ và xoay lật 3D quanh trục Y (`perspective(800px) rotateY(0deg → 360deg)`).
    - *Pha 2 — Trượt FLIP xuống cuối hàng (`420ms`):* Ngay khi lật xong, nạp hàng đợi mới từ API và kích hoạt kỹ thuật FLIP đưa thẻ (nay mang huy hiệu `Lỡ hạn 1 lần`) trượt mượt từ đầu hàng xuống cuối hàng, đồng thời thẻ người kế tiếp phát sáng nhận quyền giữ 24h! *(Nếu lỡ lần 2 bị loại `removed`: nháy đỏ + nghiêng rơi 3D nhẹ `rotateX(-18deg) scale(0.85)` mờ dần trước khi xoá).*
- **Kỹ thuật / Thư viện & Dung lượng:**
  - Web Animations API (`card.animate(...)`) nối chuỗi `Promise` trước bước đo FLIP trong `web/js/pages/reservations.js` + CSS hỗ trợ. Không dùng thư viện ngoài.
  - Mã tự viết: **~1.8 KB** JS + **~1.0 KB** CSS.
- **Ảnh hưởng hiệu năng:**
  - Chỉ tác động lên đúng thẻ phát sinh sự kiện `missed` trong `~740ms` tổng cộng (`320ms` lật + `420ms` trượt), thuần `transform`/`opacity` trên GPU, 60fps mượt mà.
- **Cách tắt:**
  - Tắt công tắc **"Hiệu ứng 3D"** → bỏ Pha 1 lật 3D, chỉ giữ hiệu ứng trượt phẳng FLIP hiện tại.
  - Khi `prefers-reduced-motion: reduce` → bỏ cả lật và trượt, cập nhật vị trí mới ngay lập tức.

##### D.3. Mượn thành công: Hiệu ứng Confetti / Particle ngắn; Trả quá hạn: Rung nhẹ thẻ tiền phạt
- **Thiết kế & Hiển thị:**
  - *Mượn thành công:* Khi `POST /api/borrow` (`#/borrow`) hoặc `POST /api/reservations/{id}/claim` nhận thiết bị trả về `201`, tung một chùm **~50 hạt giấy/tia sáng (Confetti)** nhỏ gọn theo 4 màu chủ đạo (`#3B82F6`, `#10B981`, `#60A5FA`, `#F59E0B`) từ khu vực nút xác nhận, rơi tự nhiên và tan sạch sau **`900ms`** (`pointer-events: none`, không che Toast mã phiếu).
  - *Trả quá hạn:* Ở màn `#/return`, khi chọn phiếu có `overdue === true` (`lateDays > 0`, `fine > 0` từ API), khối `#penalty-box` thực hiện nhịp **rung cảnh báo ngang giảm dần biên độ (`translate3d(±5px, 0, 0) rotateZ(±0.4deg)` trong `380ms`)** đi kèm nháy viền đỏ, thu hút sự chú ý ngay vào khoản tiền phạt trước khi bấm thu hồi.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - Canvas 2D tạm thời trong module tự viết `web/js/ui/confetti.js` (chỉ gắn `<canvas>` lúc nổ hạt, tự gỡ `canvas.remove()` ngay sau `900ms`, `dpr ≤ 1.5`) + CSS `@keyframes penaltyShake3D`. Không dùng thư viện ngoài.
  - Mã tự viết: **~2.4 KB** JS + **~0.7 KB** CSS.
- **Ảnh hưởng hiệu năng:**
  - Siêu nhẹ (`< 0.3 ms/frame` trong `0.9s` cho 50 hạt 2D, sau đó giải phóng 100% DOM/RAM; rung thẻ phạt chỉ chạy `380ms` trên compositor).
- **Cách tắt:**
  - Tắt công tắc **"Hiệu ứng 3D"** → không bắn confetti, thẻ tiền phạt chỉ nháy viền đỏ không rung.
  - Khi `prefers-reduced-motion: reduce` → tắt hoàn toàn cả confetti và hiệu ứng rung.

##### D.4. Biểu đồ "Top thiết bị mượn nhiều nhất" ở Tổng quan (`#/dashboard`): Thanh phẳng bo tròn, đếm số lượt & Tooltip hover
- **Thiết kế & Hiển thị:**
  - Giữ thiết kế **thanh phẳng tối giản, rõ số liệu** từ mảng `topBorrowed` của `GET /api/stats` (không dùng khối lăng trụ 3D vát cạnh hay bóng đổ dày): mỗi thanh `.css-bar-track` bo tròn hoàn toàn (`border-radius: var(--radius-full)`), cao **`8px`**, nền rãnh nhạt tinh tế, phần đầy `.css-bar-fill` dùng dải chuyển sắc nhẹ màu chủ đạo (`linear-gradient(90deg, var(--color-primary), #60A5FA)` ở Sáng; `#2563EB → #60A5FA` ở Tối).
  - Khi tải trang, các thanh kéo dài từ `0` lên giá trị thực (`scaleX(0 → 1)` trong `400ms`, `stagger 70ms`/dòng) đồng bộ cùng hiệu ứng **đếm số lượt mượn tăng dần (`animateCountUp`)** trên nhãn `"x lượt"`.
  - Khi hover vào một dòng (`.css-bar-item:hover`): thanh sáng nhẹ lên (`brightness(1.14)` + quầng sáng lam dịu) và hiện tooltip nổi `"x lượt"` tương phản cao cho cả Theme Sáng và Theme Tối.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - HTML + CSS thuần (`pages.css`, `animations.css`) + `animateCountUp` sẵn có trong `web/js/ui/motion.js`. Không dùng thư viện ngoài.
  - Mã tự viết: **~1.4 KB** CSS + **~0.8 KB** JS.
- **Ảnh hưởng hiệu năng:**
  - Bằng `0` sau `~400ms` nạp trang ban đầu (tối đa 5 thanh theo tham số `top=5`).
- **Cách tắt:**
  - Khi `prefers-reduced-motion: reduce` → hiện ngay chiều dài thanh và con số cuối cùng không chạy animation kéo dài/đếm số.

##### D.5. Màn "Minh hoạ CTDL Đồ thị" (`#/graph` — 2D `vis-network`): Hiệu ứng trực quan hoá danh sách kề
- **Thiết kế & Hiển thị (giữ nguyên không gian 2D `vis-network`):**
  - *Mở trang:* Các đỉnh xuất hiện lần lượt (`scale` từ `0 → 1`, stagger theo thứ tự), các cạnh vẽ dần dọc đường nối ngay sau đó; mô phỏng lực chạy ngắn (`~880ms`) để dàn đều bố cục rồi tự động dừng hẳn (`physics: false`).
  - *Hover đỉnh:* Đỉnh phóng to nhẹ, viền toả hào quang theo đúng màu trạng thái thiết bị (Xanh lục `available`, Vàng cam `borrowed`, Đỏ `maintenance`), đồng thời các cạnh nối trực tiếp sáng lên rõ nét.
  - *Chọn đỉnh:* Camera zoom mượt tới đỉnh (`380ms`); các đỉnh/cạnh không liên quan mờ dần mượt mà (`transition` nội suy màu `240ms`); trên các cạnh nối trực tiếp phát 2 đợt **"xung tín hiệu" sáng hữu hạn (`~2.3s`) chạy dọc cạnh từ đỉnh đang chọn toả ra các láng giềng** rồi dừng (minh hoạ trực quan thao tác duyệt danh sách kề `DoublyLinkedList<Edge>` ở lõi C++); **3 láng giềng Top 3** (từ API `GET /api/suggestions/{id}?k=3`) được gắn huy hiệu đánh số **`1` – `2` – `3`** trực tiếp trên đỉnh.
  - *Nút "Sắp xếp lại lực":* Bình thường icon đứng yên hoàn toàn; chỉ khi bấm mới xoay 1 vòng (`600ms`), mô phỏng lực chạy ngắn (`~950ms`, tối đa `< 2s`) rồi tự tắt ngay.
  - *Đỉnh Đang mượn / Bảo trì:* Có vòng sáng nhấp nháy rất nhẹ xung quanh (chu kỳ rất chậm `~3.9s`, độ mờ thấp `0.05–0.17`) báo hiệu thiết bị đang bận/bảo trì mà không gây rối mắt.
  - *Kéo thanh lọc trọng số `≥ N`:* Các cạnh bị lọc ẩn sẽ mờ dần mượt (`250ms`) thay vì biến mất đột ngột.
  - *Tua giờ / dữ liệu thay đổi:* Khi tua đồng hồ giả lập (`onTimeAdvanced`), bấm `"Làm mới"` hoặc quay lại sau khi phát sinh phiếu mượn kèm mới, cạnh nào có trọng số thay đổi sẽ **nháy sáng 1 lần** (`720ms`) tại chỗ mà không làm xáo trộn vị trí các đỉnh.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - Tận dụng hook Canvas 2D world-space (`beforeDrawing`, `afterDrawing`) của `web/vendor/vis-network.min.js` kết hợp bộ điều phối `requestAnimationFrame` thông minh trong `web/js/ui/graph-renderer.js` (**0 KB** thư viện cộng thêm).
  - Mã tự viết: **~9.5 KB** JS trong `graph-renderer.js` & `graph.js`.
- **Ảnh hưởng hiệu năng:**
  - Rất nhẹ (~`0.3–0.6 ms/frame` trên Canvas 2D cho quy mô 15–30 thiết bị): đọc trực tiếp toạ độ đỉnh O(1) từ `network.body.nodes`, tự hạ nhịp xuống `~30fps` khi chỉ có vòng thở tĩnh của đỉnh mượn/bảo trì, **tự ngắt gọi `redraw` phụ khi người dùng đang kéo thả (`dragStart` → `dragEnd`)** để đảm bảo kéo thả mượt tuyệt đối không giật, và huỷ toàn bộ `rAF`/listener trong `destroy()` ngay khi rời trang `#/graph`.
- **Cách tắt:**
  - Tắt công tắc **"Hiệu ứng 3D"** trên Topbar hoặc bật `prefers-reduced-motion: reduce` → dừng ngay vòng lặp `rAF`, tắt toàn bộ hiệu ứng intro, xung sáng, vòng thở, zoom tự động và chuyển về đồ thị 2D tĩnh tức thì.

---

#### Đợt E — Hoàn thiện
*Phạm vi commit Đợt E:* Favicon cục bộ + Logo động nhỏ trên Sidebar và màn hình chờ (Splash screen) ~1 giây khi mở ứng dụng.

##### E.1. Favicon + Logo động nhỏ trên Sidebar
- **Thiết kế & Hiển thị:**
  - *Favicon cục bộ:* Tạo tệp vector `web/assets/icons/favicon.svg` hình khối lập phương vi mạch Lab tông xanh lam – lục bảo sắc nét, khai báo `<link rel="icon" type="image/svg+xml" href="assets/icons/favicon.svg">` trong `web/index.html` (khắc phục triệt để lỗi thiếu `/favicon.ico` khi chạy offline).
  - *Logo động nhỏ (`.sidebar-logo-icon`):* Nâng cấp huy hiệu góc trên trái Sidebar thành biểu tượng khối vi mạch nhiều lớp có nhịp sáng dịu ở đường mạch; khi rê chuột vào `.sidebar-header`, khối logo nghiêng phối cảnh 3D (`rotateY(18deg) rotateX(-12deg)`) kèm vệt ánh kim lướt qua bề mặt (`450ms`), bình thường đứng êm không gây xao nhãng.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - SVG thuần cục bộ (`web/assets/icons/favicon.svg`, **~1.2 KB**) + CSS 3D/SVG trong `web/css/effects-3d.css` (**~1.0 KB**). Không dùng thư viện ngoài.
- **Ảnh hưởng hiệu năng:**
  - Xấp xỉ `0%` CPU/GPU (chỉ biến đổi `transform` và `opacity` khi hover).
- **Cách tắt:**
  - Tắt công tắc **"Hiệu ứng 3D"** → tắt hiệu ứng nghiêng 3D & vệt sáng trên logo Sidebar (favicon tĩnh trên tab trình duyệt vẫn giữ nguyên).
  - Khi `prefers-reduced-motion: reduce` → tắt mọi chuyển động trên logo.

##### E.2. Màn hình chờ (Splash Screen) ~1 giây khi mở web
- **Thiết kế & Hiển thị:**
  - Khi mới mở tab ứng dụng, hiển thị màn chào `#app-splash` (`position: fixed; inset: 0; z-index: 200`) đồng bộ ngay lập tức với Theme Sáng/Tối đã lưu trong `localStorage` (không gây chớp trắng ở chế độ Tối):
    - Trung tâm là **Khối Lập Phương Vi Mạch 3D bằng CSS thuần (`preserve-3d`)** xoay hợp nhất nhẹ nhàng, bên dưới là tiêu đề **Lab Manager — HCMUS**, thông tin đồ án CTDL & GT và thanh tia sáng khởi động mượt (`~850ms` hiển thị + `150ms` tan mờ phối cảnh = **tổng đúng ~1.0 giây**, sau đó tự `remove()` hoàn toàn khỏi DOM).
    - **Không làm trễ dữ liệu:** Bên dưới màn chờ, `initClock()`, `initRouter()` và các lời gọi API trang đầu tiên vẫn chạy song song ngay từ `0ms`, nên khi màn chờ vừa mở ra ở giây thứ 1 thì số liệu đã sẵn sàng. Ghi cờ vào `sessionStorage` (`lab_splash_shown`, bọc `try/catch`) để không lặp lại gây phiền nếu người dùng F5 liên tục trong cùng phiên, đồng thời cho phép nhấp chuột bất kỳ để bỏ qua ngay lập tức.
- **Kỹ thuật / Thư viện & Dung lượng:**
  - HTML + CSS 3D Cube thuần (không phụ thuộc chờ tải `three.js`, hiện tức thì ở khung hình đầu tiên) + `web/js/ui/splash.js`. Không dùng thư viện ngoài.
  - Mã tự viết: **~1.8 KB** JS + **~2.0 KB** CSS.
- **Ảnh hưởng hiệu năng:**
  - Không làm chậm API hay FCP; chỉ chạy `1.0s` đầu trên GPU compositor rồi xoá hẳn khỏi cây DOM (`0 KB` bộ nhớ duy trì về sau).
- **Cách tắt:**
  - Nếu người dùng đã tắt công tắc **"Hiệu ứng 3D"** (`lab_fx_3d === 'off'`) hoặc bật `prefers-reduced-motion: reduce`: bỏ qua hoàn toàn `#app-splash` ngay từ đầu (`0ms`), vào thẳng giao diện chính. Có thể click chuột để đóng sớm bất kỳ lúc nào.

---

### 6.3. Bảng tổng hợp Kỹ thuật, Dung lượng, Hiệu năng & Kế hoạch Commit (Đợt A → E)

| Đợt & Commit riêng | Hạng mục | Kỹ thuật / Thư viện cục bộ | Dung lượng ước tính | Ảnh hưởng hiệu năng (1366×768, i7 cũ) | Cơ chế tắt / Thoái lui |
|---|---|---|---|---|---|
| **Đợt A**<br>`feat(web): add 3D fx toggle, ambient mesh & three.js background` | **A.0** Công tắc 3D + **A.1** Nền Mesh & Hạt/Lưới 3D | `web/vendor/three.module.min.js` (r160, MIT, dynamic `import()`) + CSS Mesh | Vendor: **~668 KB**<br>Code: **~8.5 KB** | Nhẹ (~0.6–1.2 ms/frame, 2 draw calls, `dpr ≤ 1.5`, dừng khi ẩn tab) | Công tắc `"Hiệu ứng 3D"` → ẩn canvas & dừng `rAF`; `prefers-reduced-motion`; fallback khi thiếu WebGL |
| **Đợt B**<br>`feat(web): add collapsible 3D STM32 Blue Pill hero & 3D flip clock` | **B.1** Board 3D STM32F103 "Blue Pill" ở `#/dashboard` (+ SVG tĩnh) | Tái sử dụng `three.module.min.js` (Procedural + `InstancedMesh`, không `.glb`, không logo ST) + `assets/stm32-bluepill.svg` | Code & SVG: **~39 KB** (thô)<br>(0 KB vendor thêm) | Nhẹ (~0.6–1.1 ms/frame, stage `300×132`, ~3.3k tam giác << 20k, `dpr ≤ 1.5`, dừng khi ẩn/ra khỏi viewport) | Công tắc `"Hiệu ứng 3D"` → hiện ảnh tĩnh SVG thay thế; nút **Thu gọn** (`localStorage`); `IntersectionObserver` + `visibilitychange` + `reduced-motion` |
| *(cùng Đợt B)* | **B.2** Đồng hồ giả lập Flip-Clock 3D | CSS 3D Split-Flap (`rotateX`, `preserve-3d`) + JS thuần | Code: **~4.5 KB**<br>(0 KB vendor) | **0%** khi đứng yên; chỉ chạy `360ms` trên GPU khi bấm tua giờ | Công tắc `"Hiệu ứng 3D"` → về chữ phẳng + `triggerRollDigit`; `prefers-reduced-motion` |
| **Đợt C**<br>`feat(web): add card 3D depth, glassmorphism, glow & tactile controls` | **C.1** Tilt 3D, Kính mờ, Bóng đa lớp, Viền sáng trạng thái (kể cả panel `#/graph` 2D) | CSS `backdrop-filter: blur(10px)` + `perspective` + JS `tilt.js` (chỉ gắn khi hover thẻ) | Code: **~5.2 KB**<br>(0 KB vendor) | Thấp (~0.2–0.3 ms chỉ khi hover thẻ con; giữ phẳng bảng lớn & canvas `#/graph` 2D) | Công tắc `"Hiệu ứng 3D"` → về thẻ đặc phẳng `--color-bg-surface`; `prefers-reduced-motion` tắt tilt |
| *(cùng Đợt C)* | **C.2** Nút nhấn 3D + Ripple & Sidebar chỉ báo sáng | CSS multi-shadow/glow + JS uỷ quyền sự kiện `ripple.js` | Code: **~3.0 KB**<br>(0 KB vendor) | Không đáng kể (< 0.1 ms chỉ tại lúc click, tự huỷ DOM sau `420ms`) | Công tắc `"Hiệu ứng 3D"`; `prefers-reduced-motion` |
| **Đợt D**<br>`feat(web): add perspective transitions, 3D queue flip, confetti & graph 2D fx` | **D.1** Chuyển trang phối cảnh (Perspective) | CSS 3D `@keyframes` (`260ms`, trả về `transform: none` sau khi xong) | Code: **~0.9 KB**<br>(0 KB vendor) | Chỉ chạy `260ms` lúc đổi trang, 60fps compositor | Công tắc `"Hiệu ứng 3D"` → về `.page-enter` 2D; `prefers-reduced-motion` |
| *(cùng Đợt D)* | **D.2** Thẻ hàng đợi lật 3D khi lỡ hạn + trượt FLIP | Web Animations API (`rotateY` `320ms`) nối tiếp FLIP (`420ms`) | Code: **~2.8 KB**<br>(0 KB vendor) | Chỉ chạy trên thẻ bị `missed` trong `740ms` khi tua giờ, 60fps | Công tắc `"Hiệu ứng 3D"` → chỉ trượt FLIP 2D; `prefers-reduced-motion` |
| *(cùng Đợt D)* | **D.3** Confetti khi mượn xong & Rung nhẹ thẻ phạt quá hạn | Canvas 2D tạm thời (`confetti.js`, tự gỡ sau `900ms`) + CSS Shake `380ms` | Code: **~3.1 KB**<br>(0 KB vendor) | Siêu nhẹ (< 0.3 ms/frame trong `0.9s` cho ~50 hạt, `0` RAM duy trì) | Công tắc `"Hiệu ứng 3D"`; `prefers-reduced-motion` |
| *(cùng Đợt D)* | **D.4** Biểu đồ Top mượn thanh phẳng `8px` + đếm số + tooltip | CSS phẳng (`pages.css`) + `animateCountUp` (`motion.js`) | Code: **~2.2 KB**<br>(0 KB vendor) | Bằng `0` sau `400ms` mọc thanh & đếm số ban đầu | `prefers-reduced-motion` → hiện tức thì không chạy animation |
| *(cùng Đợt D)* | **D.5** Hiệu ứng 2D `vis-network` màn Đồ thị (`#/graph`) | Canvas 2D hooks (`beforeDrawing`/`afterDrawing`) trong `graph-renderer.js` | Code: **~9.5 KB**<br>(0 KB vendor) | Nhẹ (~0.3–0.6 ms/frame, tự dừng `redraw` phụ khi kéo thả, `destroy()` khi rời trang) | Công tắc `"Hiệu ứng 3D"` & `prefers-reduced-motion` → về đồ thị 2D tĩnh |
| **Đợt E**<br>`feat(web): add local svg favicon, animated 3D logo & 1s splash screen` | **E.1** Favicon cục bộ + Logo động nhỏ Sidebar | `web/assets/icons/favicon.svg` + CSS 3D hover sheen | Code & SVG: **~2.2 KB**<br>(0 KB vendor) | ~0% CPU/GPU (chỉ kích hoạt khi hover logo) | Công tắc `"Hiệu ứng 3D"`; `prefers-reduced-motion` |
| *(cùng Đợt E)* | **E.2** Màn hình chờ (Splash) ~1 giây khi mở web | CSS 3D Isometric Cube + `splash.js` (chạy song song không chặn API, tự gỡ DOM) | Code: **~3.8 KB**<br>(0 KB vendor) | 0 ảnh hưởng tải dữ liệu; tự huỷ hoàn toàn sau `1.0s` | Tự bỏ qua (`0ms`) khi tắt `"Hiệu ứng 3D"`, khi `prefers-reduced-motion`, hoặc khi click bỏ qua |

---
*(Đã hoàn thành toàn bộ Đợt A, B, C, D, E theo đúng kế hoạch; toàn bộ mã nguồn nằm gọn trong web/, không vi phạm ranh giới hệ thống).*
