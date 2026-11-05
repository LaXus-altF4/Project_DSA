# Kịch bản kiểm thử & Demo 5 luồng trên trình duyệt (`docs/demo-checklist.md`)

> Tài liệu hướng dẫn bấm từng bước trên dữ liệu thật trong `data/` để kiểm tra toàn bộ giao diện `web/`, thông báo sự kiện, đồng bộ dữ liệu xuyên màn hình và hiệu ứng chuyển động trước buổi báo cáo.

---

## 0. Chuẩn bị trước khi chạy

1. **Khôi phục dữ liệu mẫu gốc (nếu đã thao tác thử từ trước):**
   Vì lõi C++ tự ghi ra `data/*.csv` ngay sau mỗi thao tác thành công, trước khi chạy lại từ đầu hãy dừng `LabApp.exe` (nếu đang mở), khôi phục 4 file CSV gốc rồi khởi động lại server:
   ```powershell
   git checkout -- data/
   .\build\LabApp.exe
   ```
2. Mở trình duyệt tại `http://127.0.0.1:8080` (không thêm `?mock=1`).
3. **Kiểm tra trạng thái khởi đầu (`#/dashboard`):**
   - Đồng hồ giả lập trên Topbar: **`03/11/2026 16:00`** (`hour = 7360`, mã phiếu tiếp theo là `PM0053`).
   - **Tổng thiết bị:** `18 mã` — `77 đơn vị (62 sẵn sàng, 3 bảo trì)`.
   - **Đang mượn:** `11 món` (5 phiếu đang mở: `PM0047`, `PM0048`, `PM0049`, `PM0050`, `PM0052`).
   - **Phiếu quá hạn:** `2 phiếu` (`PM0047` trễ 8 ngày = `576.000 đ`, `PM0048` trễ 6 ngày = `432.000 đ`) — **Phạt tạm tính: `1.008.000 đ`**.
   - **Hàng đợi đặt trước:** `2 người` (`1 người đang được giữ 24h` trên `VR01`).

---

## Luồng 1 — Mượn hết một thiết bị (`PRJ01`) → 3 sinh viên đăng ký hàng đợi

### Bước 1.1: Mượn đơn vị cuối cùng của `PRJ01` (Máy chiếu mini)
*(Trong `data/` gốc, `PRJ01` có `total = 2`, đang mượn `1` ở phiếu `PM0048`, còn đúng `1` đơn vị sẵn sàng và `0` người chờ).*

1. Bấm menu **`Lập phiếu mượn`** (`#/borrow`) ở Sidebar bên trái.
2. Ở cột phải (**Danh mục thiết bị phòng Lab**), gõ `PRJ01` vào ô tìm kiếm → thấy **`Máy chiếu mini` (`PRJ01`)** hiển thị `Còn 1/2 sẵn sàng`.
3. Bấm nút **`+ Chọn`** cạnh `PRJ01` để đưa vào giỏ (giỏ hiện `1 món`).
4. Ở cột trái (**Thông tin người mượn**), nhập:
   - **MSSV:** `25120201`
   - **Họ và tên sinh viên:** `Lê Hoàng Quân`
   - **Số ngày mượn:** `7` (giữ mặc định)
5. Bấm **`Xem lại & Xác nhận tạo phiếu`** → trong hộp thoại bấm **`Xác nhận mượn`**.
6. **Kết quả mong đợi:**
   - **Toast xanh lá:** báo tạo phiếu **`#PM0053`** thành công cho SV `Lê Hoàng Quân`, hạn trả **`10/11/2026 16:00`**.
   - Giỏ mượn tự làm trống; dòng **`PRJ01`** bên phải đổi ngay sang **`Hết hàng (Tổng: 2)`** và nút đổi thành **`Đăng ký chờ`**.

### Bước 1.2: Đăng ký 3 sinh viên vào hàng đợi của `PRJ01`
1. Ngay tại dòng `PRJ01` bên phải màn `#/borrow`, bấm nút **`Đăng ký chờ`**:
   - Hộp thoại mở ra hiển thị dòng **`Vị trí dự kiến trong hàng đợi: #1`**.
   - Nhập SV thứ 1: MSSV `25120202`, Họ tên `Trần Minh Khôi` → bấm **`Đăng ký chờ`**.
   - **Kết quả:** Toast xanh báo đứng **vị trí `#1`**; dòng `PRJ01` cập nhật nhãn `1 người chờ`.
2. Bấm lại **`Đăng ký chờ`** trên dòng `PRJ01` → bấm liên kết **`Mở toàn màn hình Hàng đợi của thiết bị này →`** để chuyển sang **`#/reservations?id=PRJ01`**.
3. Tại khung **`Đăng ký vào hàng đợi đặt trước cho Máy chiếu mini`** ở cuối trang, đăng ký tiếp 2 sinh viên:
   - **SV thứ 2:** MSSV `25120203` — Họ tên `Nguyễn Thảo Nhi` → bấm **`Đăng ký giữ chỗ`** → Toast xanh báo **vị trí `#2`**.
   - **SV thứ 3:** MSSV `25120204` — Họ tên `Vũ Gia Bảo` → bấm **`Đăng ký giữ chỗ`** → Toast xanh báo **vị trí `#3`**.
   - *(Tuỳ chọn kiểm tra quy tắc M12)*: Nhập lại `25120202` → Toast đỏ báo lỗi sinh viên đã có mặt trong hàng đợi (`ALREADY_QUEUED`).
4. **Kết quả mong đợi trên `#/reservations?id=PRJ01`:**
   - Thẻ kho hiển thị: `Tổng số: 2 | Sẵn sàng: 0 | Đang mượn: 2 | Đang giữ 24h: 0 | Bảo trì: 0 | Hàng đợi: 3 người` (thanh tỷ lệ 100% màu hổ phách).
   - 3 thẻ xếp đúng thứ tự FIFO (`#1 Trần Minh Khôi`, `#2 Nguyễn Thảo Nhi`, `#3 Vũ Gia Bảo`), cả 3 đều ở trạng thái **`Đang chờ`**, `0/2 lần lỡ`, chưa thẻ nào có nút `Nhận thiết bị`.

---

## Luồng 2 — Trả thiết bị → Toast báo người đầu hàng được giữ, vòng đếm 24h chạy

1. Bấm menu **`Trả thiết bị`** (`#/return`) ở Sidebar.
2. Ở danh sách bên trái, bấm chọn phiếu **`#PM0053`** (`Lê Hoàng Quân` — `25120201`, 1 thiết bị `PRJ01`).
   - Cột phải hiện khung xanh **`PHIẾU MƯỢN TRONG HẠN HỢP LỆ`** (`0 ngày`, `0 đ`).
3. Bấm **`Xác nhận trả toàn bộ phiếu`** → trong hộp thoại bấm **`Xác nhận trả toàn bộ`**.
4. **Kết quả mong đợi ngay trên `#/return`:**
   - **Toast 1 (xanh lá):** `"Thu hồi thành công phiếu #PM0053! Trả đúng hạn, không có tiền phạt."`
   - **Toast 2 (xanh lá — tiêu đề `Hàng đợi: Giữ chỗ 24h`):** Thông báo sự kiện từ lõi C++ báo **`Trần Minh Khôi (25120202)`** được giữ chỗ 24h cho **`PRJ01`**.
   - Phiếu `#PM0053` rút khỏi danh sách đang mở bên trái; khung chi tiết bên phải chuyển sang trạng thái **`Đã hoàn tất (Đã trả)`** và hiện nút **`Xem hàng đợi →`** ngay cạnh dòng `PRJ01`.
5. Bấm nút **`Xem hàng đợi →`** (hoặc bấm mục **`Hàng đợi đặt trước`** ở Sidebar — `PRJ01` có 3 người chờ nên tự được chọn đầu tiên):
   - **Kết quả mong đợi trên `#/reservations?id=PRJ01`:**
     - Bất biến kho cập nhật đúng: `available (0) + borrowed (1) + onHold (1) + maintenance (0) == total (2)` (thanh tỷ lệ chia đôi: 50% vàng Đang mượn + 50% xanh dương Đang giữ).
     - Thẻ **`Vị trí #1 • Đang giữ hàng`** (`Trần Minh Khôi` — `25120202`) nổi viền xanh dương, **vòng đếm ngược SVG 24h chạy hiệu ứng quét đầy lên `24h / 24h`** (`Còn lại 24 giờ`, `Hạn nhận: 04/11/2026 16:00`), xuất hiện nút **`Nhận thiết bị`**.
     - Vị trí `#2` (`Nguyễn Thảo Nhi`) và `#3` (`Vũ Gia Bảo`) vẫn ở trạng thái `Đang chờ`.

---

## Luồng 3 — Tua `+25h` → Người đầu trượt xuống cuối (`lỡ 1 lần`), người kế được giữ

1. Giữ nguyên màn hình đang mở tại **`#/reservations?id=PRJ01`**.
2. Trên thanh **Topbar** trên cùng, bấm nút **`+N giờ…`**.
3. Nhập **`25`** vào ô số giờ → bấm **`Tua ngay`**.
4. **Kết quả mong đợi:**
   - **Đồng hồ Topbar:** Icon đồng hồ xoay tít (`.spinning`), chữ số lăn cơ học từ `03/11/2026 16:00` sang **`04/11/2026 17:00`** (`hour = 7385`).
   - **Các Toast sự kiện hệ thống trượt vào góc màn hình:**
     - Toast vàng (`missed`): **`Trần Minh Khôi (25120202)`** lỡ hạn nhận `PRJ01`, bị đẩy xuống cuối hàng.
     - Toast xanh (`hold_granted`): **`Nguyễn Thảo Nhi (25120203)`** được chuyển quyền giữ `PRJ01` (hạn `05/11/2026 16:00`).
     - *(Lưu ý: đồng thời xuất hiện thêm 2 toast của `VR01` do lượt giữ sẵn có trong dữ liệu mẫu của `Phan Anh Khoa - 25120103` hết hạn lúc `04/11/2026 08:00` và chuyển sang `Đặng Hoàng Nam - 25120052` — hoàn toàn đúng logic duyệt hết hạn toàn hệ thống).*
   - **Animation & trạng thái trên dãy thẻ `PRJ01`:**
     - **FLIP Animation (`420ms`):** Thẻ **`Trần Minh Khôi (25120202)`** trượt mượt từ vị trí `#1` xuống cuối hàng (**`Vị trí #3 • Đang chờ`**), gắn nhãn cam **`⚠️ Lỡ hạn 1 lần`**.
     - **Phát sáng & Vòng đếm 24h (Quy tắc dây chuyền M15):** Thẻ **`Nguyễn Thảo Nhi (25120203)`** trượt từ `#2` lên **`Vị trí #1 • Đang giữ hàng`**, viền nháy sáng xanh 2 lần (`.pulse-glow-hold`), vòng đếm ngược hiển thị **`23h / 24h`** (`Còn lại 23 giờ`, `Hạn nhận: 05/11/2026 16:00` — tính nối tiếp từ mốc hết hạn `04/11 16:00` của người trước chứ không tính từ `17:00`).
     - Thẻ **`Vũ Gia Bảo (25120204)`** dịch từ `#3` lên **`Vị trí #2 • Đang chờ`**.

---

## Luồng 4 — Mượn `ARD01` → Gợi ý `BRD01, JMP01` → Cộng dồn giỏ → Xem Đồ thị mượn kèm

### Bước 4.1: Kiểm tra gợi ý cộng dồn theo giỏ (`suggestForBasket`) và lập phiếu 3 món
1. Bấm menu **`Lập phiếu mượn`** (`#/borrow`) ở Sidebar (nếu ô tìm kiếm còn chữ `PRJ01` thì xoá trống).
2. Tìm **`Arduino Uno R3` (`ARD01`)** (`Còn 6/6 sẵn sàng`) → bấm **`+ Chọn`**.
   - **Kết quả mong đợi (lần 1):** Khung **`Thường được mượn kèm`** chạy hiệu ứng pop-in hiển thị Top 3 của `ARD01`:
     1. **`Breadboard 830 lỗ` (`BRD01`)** — `Cùng giỏ: 10 lần` (`Còn 8 sẵn`)
     2. **`Bộ dây cắm jumper` (`JMP01`)** — `Cùng giỏ: 10 lần` (`Còn 8 sẵn`)
     3. **`Đồng hồ vạn năng` (`DMM01`)** — `Cùng giỏ: 1 lần` (`Còn 4 sẵn`)
3. Ngay trong khung **`Thường được mượn kèm`**, bấm nút **`+ Thêm`** ở thẻ **`Breadboard 830 lỗ` (`BRD01`)** (giỏ hiện có 2 món: `ARD01`, `BRD01`).
   - **Kết quả mong đợi (lần 2 — điểm cộng dồn `suggestForBasket` theo M17):**
     1. **`Bộ dây cắm jumper` (`JMP01`)** vọt lên vị trí đầu bảng với **`Cùng giỏ: 20 lần`** (`10` lần đi cùng `ARD01` + `10` lần đi cùng `BRD01`)!
     2. **`Đồng hồ vạn năng` (`DMM01`)** — `Cùng giỏ: 2 lần`
     3. **`Bộ cảm biến 37 món` (`SEN01`)** — `Cùng giỏ: 2 lần`
4. Bấm **`+ Thêm`** ở thẻ **`Bộ dây cắm jumper` (`JMP01`)** → giỏ đủ **3 món** (`ARD01`, `BRD01`, `JMP01`).
5. Nhập thông tin người mượn ở cột trái:
   - **MSSV:** `25120205`
   - **Họ và tên sinh viên:** `Đặng Minh Tuấn`
   - **Số ngày mượn:** **`2`** *(đặt 2 ngày để sang Luồng 5 khi tua 3 ngày, phiếu này cũng chuyển thành quá hạn)*.
6. Bấm **`Xem lại & Xác nhận tạo phiếu`** → **`Xác nhận mượn`**.
   - **Kết quả:** Toast xanh báo tạo thành công phiếu **`#PM0054`** (hạn trả `06/11/2026 17:00`); lõi C++ cộng `+1` cho cả 3 cặp cạnh trong phiếu.

### Bước 4.2: Minh hoạ trên màn `Minh hoạ CTDL Đồ thị` (`#/graph`)
1. Bấm mục **`Minh hoạ CTDL Đồ thị`** (`#/graph`) ở Sidebar.
2. Chờ khoảng 1 giây để mô phỏng lực ổn định rồi tự động tắt physics (đồ thị đứng yên, không rung).
3. **Quan sát và chỉ ra trên đồ thị:**
   - Nhánh **`VR01 — TC01`** (*Kính thực tế ảo — Tay cầm điều khiển VR*) nổi bật rõ với cạnh dày nhãn **`w = 10`**.
   - Cụm tam giác **`ARD01 — BRD01 — JMP01`** vừa được cộng thêm từ phiếu `#PM0054` nên cả 3 cạnh (`ARD01–BRD01`, `ARD01–JMP01`, `BRD01–JMP01`) đều đạt **`w = 11`** (dày nhất toàn đồ thị).
4. Kéo thanh trượt **`Chỉ hiện cạnh trọng số ≥ N`** trên thanh công cụ:
   - Kéo tới **`10`**: toàn mạng lọc gọn chỉ giữ lại nhánh `VR01–TC01` (`w = 10`) và cụm tam giác `ARD01–BRD01–JMP01` (`w = 11`).
   - Kéo tới **`11`**: chỉ còn đúng 3 cạnh `w = 11` của cụm `ARD01–BRD01–JMP01`. (Kéo trả lại về `1` sau khi xem).
5. Bấm chọn đỉnh **`ARD01`** trên mặt vẽ:
   - Các đỉnh và cạnh không nối trực tiếp với `ARD01` mờ đi; các cạnh kề sáng rõ kèm nhãn trọng số.
   - Panel chi tiết bên phải hiện `Đã mượn: 12 lần`, **Top 3 thường mượn kèm**: `#1 Breadboard 830 lỗ (BRD01, w = 11)`, `#2 Bộ dây cắm jumper (JMP01, w = 11)`, `#3 Đồng hồ vạn năng (DMM01, w = 1)`.

---

## Luồng 5 — Tua vài ngày → Phiếu quá hạn hiện ở Tổng quan và Quá hạn & Lịch sử, tiền phạt tăng

### Bước 5.1: Quan sát biến động trực tiếp trên `Tổng quan` (`#/dashboard`)
1. Bấm mục **`Tổng quan`** (`#/dashboard`) ở Sidebar.
   - Ghi nhận số liệu hiện tại (lúc `04/11/2026 17:00`): thẻ **`Phiếu quá hạn`** đang là **`2 phiếu`**, **`Phạt tạm tính: 1.152.000 đ`** (`PM0047` trễ 9 ngày = `648.000 đ`, `PM0048` trễ 7 ngày = `504.000 đ`).
2. Trên Topbar, bấm **`+N giờ…`** → nhập **`72`** (tương đương **3 ngày**) → bấm **`Tua ngay`** *(hoặc bấm `+24 giờ` 3 lần)*.
3. **Kết quả mong đợi ngay trên `#/dashboard` (lúc `07/11/2026 17:00`, `hour = 7457`):**
   - Đồng hồ lăn lên **`07/11/2026 17:00`** *(kèm các toast sự kiện hàng đợi của `PRJ01` và `VR01` tự động xử lý hết hạn dây chuyền M14–M15 trong 72 giờ vừa qua)*.
   - Thẻ **`Phiếu quá hạn`** nháy **viền đỏ 2 lần** (`.pulse-border-red`), con số đếm từ `2` lên **`5 phiếu`** kèm nhãn **`+3`** bay lên!
   - Dòng **`Phạt tạm tính`** đếm tăng từ `1.152.000 đ` lên **`1.980.000 đ`**.

### Bước 5.2: Đối chiếu chi tiết tại `Quá hạn & Lịch sử` (`#/records`)
1. Bấm trực tiếp vào thẻ **`Phiếu quá hạn`** trên màn Tổng quan → ứng dụng chuyển thẳng sang **`#/records?status=overdue`**.
2. **Kết quả mong đợi tại tab `Quá hạn (5)`** (sắp xếp giảm dần theo số ngày trễ, tiền phạt = `số ngày trễ × số thiết bị × 36.000 đ`, gắn nhãn `Tạm tính` `*`):
   1. **`PM0047`** (`Phạm Gia Huy` — `25120033` — `PSU01, DMM01`): Trễ **`12 ngày`** → **`864.000 đ*`** *(tăng từ `576.000 đ` lúc khởi động)*.
   2. **`PM0048`** (`Hoàng Mai Phương` — `25120071` — `PRJ01, LAP01`): Trễ **`10 ngày`** → **`720.000 đ*`** *(tăng từ `432.000 đ` lúc khởi động)*.
   3. **`PM0050`** (`Ngô Đức Thịnh` — `25120089` — `VR01, TC01`): Trễ **`3 ngày`** → **`216.000 đ*`** *(mới quá hạn)*.
   4. **`PM0049`** (`Bùi Thanh Tùng` — `25120068` — `OSC01, PRB01`): Trễ **`1 ngày`** (quá hạn 8 giờ so với mốc `07/11 09:00`, làm tròn lên 1 ngày theo M19) → **`72.000 đ*`** *(mới quá hạn)*.
   5. **`PM0054`** (`Đặng Minh Tuấn` — `25120205` — `ARD01, BRD01, JMP01`): Trễ **`1 ngày`** (3 thiết bị) → **`108.000 đ*`** *(phiếu vừa lập ở Luồng 4)*.
3. *(Tuỳ chọn khép kín)*: Bấm vào dòng **`PM0054`** trong bảng → tự mở **`#/return?id=PM0054`**, hiển thị hộp cảnh báo đỏ `1 ngày trễ × 3 thiết bị × 36.000 đ = 108.000 đ` để sẵn sàng thu hồi và chốt tiền phạt chính thức (`fineFinal = true`).
