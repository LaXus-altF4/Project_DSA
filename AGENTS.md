# AGENTS.md — Đồ án CTDL & GT: Phần mềm quản lý mượn trả thiết bị và gợi ý đồ dùng thực hành

> Quy tắc dự án dùng chung cho **Claude Code** (đọc qua `CLAUDE.md`) và **Google Antigravity** (tự đọc `AGENTS.md`). Đặt ở thư mục gốc repo.
> Phân công: **Claude Code** làm lõi, console, server, đóng gói, báo cáo. **Antigravity** chỉ làm giao diện `web/`.
> Đặc tả giao diện web nằm ở `docs/web-ui-spec.md`; hợp đồng giữa backend và web là `docs/api.md`.

## 1. Bối cảnh
- Môn: Thực hành Cấu trúc dữ liệu & Giải thuật — HCMUS. GV: ThS. Trần Tuấn Kiệt.
- Đồ án đề số 3, **làm một mình**: Lê Trường Khải — MSSV 25300003 — phụ trách toàn bộ.
- Hạn nộp: **cuối tháng 01/2027** (khoảng 12 tuần kể từ 04/11/2026).
- Mục tiêu chấm điểm: **tự cài đặt đúng CTDL** và giải thích được độ phức tạp, chứ không phải viết app cho đẹp.

## 2. Yêu cầu đề bài (chép nguyên ý)
**Mô tả:** Hệ thống quản lý mượn trả các thiết bị thực hành công nghệ/sách hiếm tại các phòng Lab của trường, có gợi ý thông minh dựa trên lịch sử mượn.

**CTDL khuyến nghị:** Danh sách liên kết kép (lưu danh mục thiết bị), Đồ thị vô hướng (lưu quan hệ mượn kèm giữa các thiết bị), Hàng đợi đặt trước (Reservation Queue).

**Chức năng:**
1. *Quản lý thiết bị & người mượn:* lưu thông tin thiết bị (mã, tên, số lượng, trạng thái Sẵn sàng / Đang mượn / Bảo trì); lưu thông tin người mượn và ngày hẹn trả.
2. *Hàng đợi đặt trước có thời hạn:* thiết bị hết số lượng sẵn có thì người mượn tiếp theo vào Reservation Queue. Khi thiết bị được trả, hệ thống báo cho người đầu hàng; người này có 24 giờ để đến nhận. Quá 24 giờ chưa nhận thì dequeue người đó, đẩy xuống cuối hàng và chuyển quyền cho người kế tiếp.
3. *Gợi ý thiết bị đi kèm:* đồ thị có đỉnh là thiết bị; trọng số cạnh giữa hai thiết bị tăng 1 mỗi lần một sinh viên mượn cả hai cùng lúc (ví dụ: Kính thực tế ảo thường mượn kèm Tay cầm điều khiển). Khi chọn thiết bị A, duyệt đồ thị và hiện 3 thiết bị thường được mượn kèm A nhiều nhất.

**Mức cơ bản:** quản lý danh sách thiết bị bằng Doubly Linked List; mượn/trả, tính ngày quá hạn; giao diện hiển thị rõ trạng thái thiết bị.
**Mức nâng cao:** Reservation Queue tự động loại người chờ quá 24h; Graph phân tích lịch sử mượn để gợi ý thiết bị mượn kèm.

## 3. Quy ước nghiệp vụ đã chốt
(Đề không nói rõ những điểm này; mọi code phải theo đúng quy ước bên dưới, và báo cáo phải ghi lại.)
- **Mượn cùng lúc** = các thiết bị nằm trong *cùng một phiếu mượn*. Một phiếu có k thiết bị thì cộng +1 cho mọi cặp trong k thiết bị đó.
- **Quá 24h chưa nhận:** đẩy xuống cuối hàng và tăng `missCount`. Khi `missCount == 2` thì loại hẳn khỏi hàng. (Cách này thoả cả "đẩy xuống cuối" lẫn "tự động loại bỏ".)
- **Món được giữ cho hàng đợi** không tính vào `available`. Bất biến phải luôn đúng:
  `available + borrowed + onHold + maintenance == total`.
- **Thời gian:** dùng *đồng hồ giả lập* (class `Clock`, đơn vị giờ), có lệnh "Tua thời gian +N giờ" (menu console và nút trên web) để demo được logic 24h và quá hạn. Không gọi `time()` trong logic nghiệp vụ.
- **Tiền phạt quá hạn:** 36.000 đồng/ngày quá hạn, mỗi thiết bị tính riêng (phiếu 2 thiết bị trễ 3 ngày = 2 × 3 × 36.000 = 216.000đ). Trễ chưa tròn ngày vẫn tính 1 ngày. Lưu tiền bằng `long long` (đơn vị đồng), không dùng `double`.
- **Không xoá cứng** thiết bị còn phiếu mượn hoặc còn người trong hàng đợi; chỉ được chuyển sang trạng thái Bảo trì.

**Bổ sung (chốt ngày 04/11/2026, mã M1–M19):**

*Thiết bị & trạng thái*
- **M1. Trạng thái suy ra từ số lượng:** `maintenance == total` → Bảo trì; `available > 0` → Sẵn sàng; còn lại → Đang mượn. `onHold` là con số (hiển thị trên thanh tỷ lệ), không phải trạng thái.
- **M2. Bảo trì theo số đơn vị:** `sendToMaintenance(id, qty)` chỉ lấy từ `available`; `finishMaintenance(id, qty)` trả về `available` rồi phục vụ hàng đợi.
- **M3. Sửa `total`:** chỉ cho phép `newTotal ≥ borrowed + onHold + maintenance`; tăng `total` thì phục vụ hàng đợi.
- **M4. Xoá thiết bị** (khi đủ điều kiện): xoá cả đỉnh và các cạnh trong Graph; phiếu lịch sử giữ nguyên mã thiết bị, hiển thị "đã xoá".
- **M5. Mã và tên** không được chứa `,`, `|` hay xuống dòng (lõi kiểm tra), để CSV không cần quoting.

*Mượn / trả*
- **M6. Phiếu nguyên tử:** phiếu nhiều thiết bị mà có món hết hàng → thất bại cả phiếu, thông điệp liệt kê món hết; không cập nhật đồ thị.
- **M7.** Mỗi thiết bị tối đa 1 đơn vị trong một phiếu; không trùng mã trong phiếu.
- **M8. Trả cả phiếu** một lần (không trả từng món).
- **M9.** Số ngày mượn hợp lệ: 1–30. Không giới hạn số phiếu của một sinh viên.
- **M10.** Không có bảng sinh viên riêng; thông tin sinh viên (MSSV, họ tên) nằm trong phiếu và trong hàng đợi.

*Hàng đợi*
- **M11. Giữ hàng nhiều người:** mỗi đơn vị rảnh được giữ cho người *chưa được giữ* đứng đầu tiếp theo, nên có thể nhiều người cùng đang giữ; những người đang giữ luôn là một đoạn đầu của hàng.
- **M12.** Không cho đặt trước khi `available > 0` (phải mượn trực tiếp). Một sinh viên không được đứng 2 lần trong cùng một hàng.
- **M13. Nhận thiết bị (claim):** tạo phiếu 1 thiết bị; số ngày mượn nhập lúc nhận, mặc định 7, hợp lệ 1–30 như M9. Phiếu 1 món không cộng cạnh đồ thị.
- **M14.** Người bị đẩy xuống cuối mà hàng chỉ còn mình họ thì được giữ lại 24h mới; lỡ lần thứ 2 thì bị loại, đơn vị trở về `available`.
- **M15. Hết hạn dây chuyền:** khi tua nhiều giờ, người kế nhận quyền giữ tính từ thời điểm người trước hết hạn (`holdUntil` cũ), không phải từ "bây giờ"; lặp đến khi không còn ai hết hạn ≤ thời điểm hiện tại.
- **M16.** Có thao tác huỷ đăng ký hàng đợi; nếu người huỷ đang giữ thì chuyển quyền cho người kế.

*Đồ thị & khác*
- **M17. Top 3:** trọng số giảm dần, hoà thì mã thiết bị tăng dần; ít hơn 3 láng giềng thì trả ít hơn. Top 3 bỏ qua thiết bị đang Bảo trì (lấy láng giềng kế tiếp); thiết bị hết hàng vẫn gợi ý kèm cờ hết hàng. Chức năng xem toàn bộ láng giềng thì hiện cả thiết bị bảo trì kèm trạng thái.
- **M18. Đồng hồ:** `Clock` đếm giờ kể từ 01/01/2026 00:00. Giờ hiện tại và bộ đếm mã phiếu lưu trong `data/meta.csv`.
- **M19.** Phiếu đang mở đã quá hạn: hiển thị số ngày quá hạn và tiền phạt tạm tính theo đồng hồ hiện tại; tiền phạt chốt lúc trả.

## 4. Kiến trúc & ràng buộc kỹ thuật
```
 ┌─────────────────────────────┐        ┌──────────────────────────────┐
 │ Web UI        (giai đoạn 7) │        │ Console       (giai đoạn 5)  │
 │ HTML + CSS + JavaScript     │        │ C++: src/main.cpp + UI.h/.cpp│
 │ thư mục: web/               │        │ menu, bảng, màu ANSI         │
 └──────────────┬──────────────┘        └──────────────┬───────────────┘
                │ HTTP + JSON (localhost:8080/api/...)  │ gọi trực tiếp
 ┌──────────────▼──────────────┐                       │
 │ API server    (giai đoạn 6) │                       │
 │ C++ + cpp-httplib + json    │                       │
 │ thư mục: server/            │                       │
 └──────────────┬──────────────┘                       │
                │ chỉ gọi API công khai của LabManager  │
 ┌──────────────▼───────────────────────────────────────▼───────────────┐
 │ Lõi (giai đoạn 1–4) — C++, CTDL tự cài, phần được chấm điểm          │
 │ include/ + src/: DoublyLinkedList, LinkedQueue, Graph, LabManager    │
 └──────────────────────────────────┬───────────────────────────────────┘
                                    │ đọc/ghi
                             data/*.csv
```
- C++17. **Tự cài đặt** `DoublyLinkedList`, `LinkedQueue`, `Graph` (danh sách kề). **Trong lõi không** dùng `std::list`, `std::queue`, `std::map`, `std::priority_queue`, `std::vector`.
  Lõi **được** dùng: `std::string`, `<fstream>/<sstream>/<iomanip>`, `<functional>` (callback), `std::swap/std::min/std::max`.
  Lõi **không** dùng `std::sort` hay container STL nào: danh sách kề của `Graph` cũng là DSLK tự cài; sắp xếp láng giềng để lấy top 3 tự viết (VD chọn k lần lớn nhất, O(k·d), hoặc insertion sort).
  Lý do: đề chấm CTDL tự cài — dùng STL ở lõi dễ bị xem là né yêu cầu.
- **Lõi tách khỏi giao diện (bắt buộc từ giai đoạn 1):** lõi không dùng `cout`/`cin`/`printf`, không biết gì về HTTP/JSON. Hàm lõi nhận tham số, trả kết quả có cấu trúc (VD `BorrowResult` gồm `enum class ErrorCode` + thông điệp). Danh sách trả ra qua CTDL tự cài hoặc `forEachDevice(callback)`.
- Sự kiện (VD "đến lượt SV X nhận thiết bị Y", "SV X lỡ hạn, bị đẩy xuống cuối") lõi đẩy vào `LinkedQueue<Notification>`; console/web tự lấy ra hiển thị.
- **Tầng server** (`server/`): `cpp-httplib` + `nlohmann/json` (đều header-only, đặt trong `third_party/`). Tầng này được dùng STL thoải mái vì chỉ là lớp chuyển đổi, không chứa logic nghiệp vụ. Phục vụ luôn file tĩnh trong `web/`, nên chạy `LabApp.exe` là tự mở trình duyệt vào `http://localhost:8080`.
- **Hợp đồng API** `docs/api.md`: mọi endpoint, request/response JSON mẫu, mã lỗi. Đây là ranh giới duy nhất giữa backend và web — đổi API thì phải cập nhật file này trước, rồi mới sửa server và web.
- Web chạy **offline hoàn toàn** (lúc demo có thể không có mạng): không dùng CDN, mọi thư viện JS/CSS/font tải về để trong `web/vendor/`.
- Lưu dữ liệu bằng CSV trong `data/`: đọc khi khởi động, ghi sau mỗi thao tác thay đổi. Gồm 4 file: `devices.csv`, `borrow_records.csv`, `reservations.csv`, `meta.csv`.
  Chỉ lưu dữ liệu gốc; những gì suy ra được thì tính lại khi nạp:
  `available/borrowed/onHold` (từ phiếu đang mở và hàng đợi), **đồ thị mượn kèm và `timesBorrowed`** (không có `graph.csv`).
  `Storage::load`: tạo đỉnh cho mọi thiết bị trong `devices.csv`, duyệt các phiếu để dựng lại cạnh (`addCoBorrow`) và đếm `timesBorrowed`; mã thiết bị đã xoá thì bỏ qua; cuối cùng gọi `checkInvariants()`.
- Comment và chuỗi giao diện bằng tiếng Việt. **Tên class/hàm/biến/file bằng tiếng Anh, rõ nghĩa** (camelCase cho hàm/biến, PascalCase cho class), VD `borrowDevice()`, `returnDevice()`, `suggestCompanions()`, `dueDate`, `overdueDays`. Trạng thái: `enum class DeviceStatus { Available, Borrowed, Maintenance }`; JSON dùng chuỗi `"available" | "borrowed" | "maintenance"`, giao diện hiển thị tiếng Việt.
- Mỗi hàm thao tác CTDL ghi Big-O trong comment.

## 5. Môi trường
- Windows 11, PowerShell trong VS Code. `g++` = MinGW-W64 13.2.0. Không có `make`.
- Build bằng `build.ps1` (console), `build_server.ps1` (LabApp), `build_test.ps1` (test). Ví dụ:
  ```powershell
  g++ -std=c++17 -Wall -Wextra -g -Iinclude (Get-ChildItem src -Filter *.cpp).FullName -o build/app.exe
  ```
  Server cần thêm `-Ithird_party -lws2_32` (cpp-httplib trên Windows cần Winsock).
- MinGW **không hỗ trợ** `-fsanitize=address`; bắt lỗi bộ nhớ bằng test + `checkInvariants()`.
- Console tiếng Việt: `SetConsoleOutputCP(65001); SetConsoleCP(65001);`, mọi file nguồn UTF-8.

## 6. Cấu trúc thư mục
```
include/      DoublyLinkedList.h  LinkedQueue.h  Graph.h  Models.h  Clock.h  LabManager.h  Storage.h  UI.h
src/          main.cpp  Graph.cpp  LabManager.cpp  Storage.cpp  UI.cpp
server/       server_main.cpp  JsonMapper.{h,cpp}  Routes.{h,cpp}
third_party/  httplib.h  json.hpp
web/          index.html  css/  js/  assets/  vendor/
tests/        test_main.cpp  (assert thuần)  +  api_smoke.ps1 (gọi thử API)
data/         devices.csv  borrow_records.csv  reservations.csv  meta.csv
docs/         requirements.png  api.md  web-ui-spec.md  demo-script.md
report/       LaTeX báo cáo
AGENTS.md  README.md  build*.ps1
```

## 7. Cách làm việc với agent
- **Làm theo từng giai đoạn ở mục 8. Hết mỗi giai đoạn thì DỪNG**, tóm tắt, chạy build + test, chờ tôi duyệt. Giải thích ngắn gọn mỗi phần vừa viết (để tôi hiểu code và viết báo cáo).
- Mọi thay đổi build được không warning (`-Wall -Wextra`).
- Sau mỗi thao tác mượn/trả/hàng đợi, gọi `checkInvariants()` ở chế độ debug.
- Không tự ý đổi quy ước ở mục 3. Gặp chỗ chưa rõ thì hỏi.
- **Ranh giới công cụ:** Claude Code không sửa `web/`; Antigravity chỉ sửa `web/`. Hai bên giao tiếp qua `docs/api.md` và `web/API_REQUESTS.md`.
- **Mỗi phiên chỉ làm một tầng.** Khi làm web (giai đoạn 7) **không sửa** `include/`, `src/`, `server/`; thiếu API thì ghi vào `web/API_REQUESTS.md` và dừng lại. Khi làm lõi/server **không sửa** `web/`.
- Không tự tính nghiệp vụ ở frontend (quá hạn, gợi ý, hàng đợi) — mọi số liệu lấy từ API.
- Trước khi sửa code: tạo kế hoạch (implementation plan) để tôi duyệt. Sau khi xong: walkthrough ngắn + kết quả build/test.
- Commit Git sau mỗi giai đoạn đã duyệt, message tiếng Anh ngắn gọn.
- Không viết thêm tính năng ngoài đề (đăng nhập, mã hoá...) trừ khi được yêu cầu.

## 8. Lộ trình (làm một mình, hạn cuối 01/2027)
| # | Thời gian | Giai đoạn | Công cụ |
|---|---|---|---|
| 1 | 05–18/11 | **CTDL lõi:** `DoublyLinkedList<T>`, `LinkedQueue<T>`, `Graph` + unit test | Claude Code |
| 2 | 19–25/11 | **Mượn/trả cơ bản:** `Device`, `BorrowRecord`, `Clock`, quá hạn, bất biến | Claude Code |
| 3 | 26/11–02/12 | **Reservation Queue:** giữ hàng, `expireReservations()`, lỡ hạn 2 lần | Claude Code |
| 4 | 03–09/12 | **Graph gợi ý:** cập nhật theo phiếu, top 3 | Claude Code |
| 5 | 10–16/12 | **Storage CSV + console** hoàn chỉnh + dữ liệu mẫu (≥ 15 thiết bị, ≥ 30 phiếu) | Claude Code |
| 6 | 17–23/12 | **API server + `docs/api.md`** + `api_smoke.ps1` | Claude Code |
| 7 | 24/12–13/01 | **Web UI** theo `docs/web-ui-spec.md` (dùng trình duyệt tích hợp để tự kiểm tra) | Antigravity |
| 8 | 14–20/01 | **Ghép nối & hoàn thiện:** xử lý `API_REQUESTS.md`, sửa lỗi tích hợp, đóng gói thư mục chạy được | Claude Code (+ Antigravity sửa web) |
| 9 | 21–27/01 | **Demo + README + báo cáo LaTeX** | Claude Code |
| — | 28–31/01 | Dự phòng | |

- Báo cáo viết dần: xong giai đoạn nào ghi phần CTDL đó luôn.
- **Mốc an toàn:** hết giai đoạn 5 là đã có bản console nộp được. Web là phần nâng điểm; nếu trễ (thi cuối kỳ, Tết dương lịch) thì nộp console.

## 9. Màn hình web (đặc tả chi tiết ở `docs/web-ui-spec.md`)
Tổng quan, Thiết bị, Mượn, Trả, Hàng đợi, Quá hạn & lịch sử, Đồ thị mượn kèm, cùng thanh đồng hồ giả lập có nút tua. API ở giai đoạn 6 phải đủ dữ liệu cho các màn hình này.
