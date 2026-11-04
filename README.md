# Phần mềm quản lý mượn trả thiết bị và gợi ý đồ dùng thực hành

Đồ án môn Thực hành Cấu trúc dữ liệu & Giải thuật — HCMUS.
Sinh viên: Lê Trường Khải — MSSV 25300003.

> README đang được viết dần theo từng giai đoạn (hiện có: lõi CTDL + bản console).

## Yêu cầu
- Windows, `g++` (MinGW-W64 13.2.0 trở lên), hỗ trợ C++17.

## Build & chạy

Các script build là file PowerShell `.ps1`. Windows có thể chặn chạy script theo mặc định,
nên khi chạy **từ CMD** hãy dùng:

```bat
powershell -ExecutionPolicy Bypass -File build.ps1
```

Từ PowerShell (nếu đã cho phép chạy script) có thể gõ trực tiếp `.\build.ps1`.

| Script | Kết quả |
|---|---|
| `build.ps1` | Build `build/app.exe` — chương trình console (bật `-Wall -Wextra -Werror`) |
| `build_test.ps1` | Build `build/test.exe` và chạy unit test của lõi (CTDL, mượn/trả, hàng đợi, đồ thị, Storage, dữ liệu mẫu) |

### Chạy chương trình console

Chạy **từ thư mục gốc của repo** (đường dẫn `data` là tương đối):

```powershell
.\build\app.exe                 # dùng dữ liệu trong data/
.\build\app.exe --seed          # sinh dữ liệu mẫu, ghi đè data/ (có hỏi xác nhận)
.\build\app.exe --data D:\tmp\x # dùng thư mục dữ liệu khác
```

- Lần đầu chạy mà chưa có `data/`, chương trình hỏi có tạo dữ liệu mẫu không.
- Dữ liệu mẫu: 18 thiết bị phòng Lab, 52 phiếu mượn (từ 01/09/2026), đồng hồ giả lập dừng ở 03/11/2026 16:00.
  Có sẵn: cặp Kính VR – Tay cầm, bộ ba Arduino – Breadboard – Dây cắm, 2 phiếu quá hạn,
  Máy hàn thiếc đang bảo trì, và hàng đợi 2 người cho Kính VR (1 người đang giữ, hạn nhận 08:00 ngày 04/11/2026).
  Thử: menu 12 "Tua thời gian" +17 giờ để xem người đang giữ lỡ hạn và bị đẩy xuống cuối hàng.
- Dữ liệu **tự lưu sau mỗi thao tác thay đổi** (ghi `*.tmp` rồi đổi tên); chọn `0` để lưu & thoát.
- Màu: xanh = Sẵn sàng, vàng = Đang mượn, đỏ = Bảo trì / quá hạn. Terminal cần hỗ trợ màu ANSI
  (Windows Terminal, PowerShell hiện đại đều được).
- Nhập sai (chữ thay số, số ngoài khoảng, dòng trống) không làm treo chương trình: hỏi lại tối đa 3 lần rồi huỷ thao tác;
  Enter để trống ở bước nhập thì huỷ thao tác (hoặc lấy giá trị mặc định nếu có ghi chú).

### Menu

| # | Chức năng | # | Chức năng |
|---|---|---|---|
| 1 | Xem danh sách thiết bị | 7 | Trả thiết bị (theo mã phiếu hoặc MSSV) |
| 2 | Thêm thiết bị | 8 | Hàng đợi đặt trước (xem, đăng ký, nhận, huỷ) |
| 3 | Sửa thiết bị | 9 | Tìm kiếm / lịch sử phiếu |
| 4 | Bảo trì thiết bị | 10 | Gợi ý thiết bị mượn kèm (top 3) |
| 5 | Xoá thiết bị | 11 | Danh sách quá hạn + tiền phạt tạm tính |
| 6 | Mượn thiết bị (nhiều món một phiếu, xem bên dưới) | 12 | Tua thời gian (đồng hồ giả lập) |

**Luồng Mượn (mục 6):** nhập MSSV, họ tên, danh sách mã → chương trình **gợi ý thiết bị mượn kèm ngay** (tối đa 3,
đã loại món đang có trong phiếu, điểm cộng dồn qua các món, tính trên lịch sử hiện tại) → có thể nhập thêm mã từ gợi ý
(Enter = bỏ qua; gợi ý được tính lại sau mỗi lần thêm) → nhập số ngày → xem tóm tắt và xác nhận → tạo phiếu.
Hạn trả = giờ mượn + số ngày × 24 giờ, tính đến đúng giờ.

## Dữ liệu (`data/*.csv`)

| File | Cột |
|---|---|
| `devices.csv` | `id,name,total,maintenance` |
| `borrow_records.csv` | `recordId,studentId,studentName,deviceIds,borrowHour,dueHour,returnHour,lateDays,fine` (`deviceIds` ngăn bằng `\|`; `returnHour=-1` là phiếu đang mở) |
| `reservations.csv` | `deviceId,studentId,studentName,enqueueHour,holdUntil,missCount` (đúng thứ tự trong hàng) |
| `meta.csv` | `key,value`: `now` (giờ giả lập kể từ 01/01/2026 00:00), `nextRecordNo` |

Chỉ lưu dữ liệu gốc. Số lượng `available/borrowed/onHold`, `timesBorrowed` và đồ thị mượn kèm được tính lại khi nạp.
File thiếu hoặc dòng lỗi thì chương trình báo cảnh báo rồi bỏ qua, không crash.
