# Ghi chú cho báo cáo

> Ghi dần sau mỗi giai đoạn, làm nguyên liệu viết báo cáo LaTeX (giai đoạn 9).

## Giai đoạn 1 — CTDL lõi

Tệp: `include/DoublyLinkedList.h`, `include/LinkedQueue.h`, `include/Graph.h`, `src/Graph.cpp`; test ở `tests/test_main.cpp` (129 kiểm tra, đạt hết).

- **DoublyLinkedList:**
  - Thêm/xoá ở hai đầu là O(1) vì có cả `head_` lẫn `tail_`. Khi đã có nút trong tay, gỡ nút cũng O(1) vì nút biết `prev`, nên `erase` và `removeFirst` không phải duyệt lại từ đầu.
  - Phép gán dùng copy-and-swap nên vẫn đúng khi tự gán (`a = a`).
  - `checkIntegrity()` duyệt xuôi rồi ngược. Nó kiểm tra mọi cặp `n->next->prev == n` và số nút phải khớp `size_`. Vòng duyệt có giới hạn số bước, nên nếu chuỗi bị vòng thì hàm trả `false` thay vì treo.
- **LinkedQueue:**
  - Hàng đợi chỉ đi một chiều nên dùng liên kết đơn là đủ.
  - `moveFrontToBack()` chỉ nối lại con trỏ, không `new`/`delete`. Đây là thao tác "đẩy xuống cuối hàng" của đề, chạy O(1).
  - `removeFirst` giữ con trỏ tới nút đứng trước để nối lại. Nếu xoá đúng nút cuối thì `tail_` lùi về nút trước; có test riêng cho trường hợp này.
- **Graph:**
  - Mỗi cạnh lưu ở cả hai đầu. `addCoBorrow` cộng +1 cho mọi cặp i < j trong phiếu, tự bỏ qua mã đã xoá, mã trùng và khuyên.
  - `topNeighbors` dùng cách chọn k lần. Lần thứ i lấy cạnh tốt nhất trong các cạnh đứng sau cạnh đã chọn ở lần trước, theo thứ tự trọng số giảm, hoà thì mã tăng (M17). Độ phức tạp O(V + k·d), không cần mảng phụ hay sắp xếp.
- **Kiểm tra rò rỉ bộ nhớ:** vì MinGW không có ASan, kiểu `Tracked` đếm số đối tượng còn sống. Sau mỗi khối test số đếm về 0, chứng tỏ không rò rỉ và không huỷ hai lần.

## Giai đoạn 2 — Mượn/trả cơ bản

Tệp: `include/Clock.h`, `include/Models.h`, `include/LabManager.h`, `src/LabManager.cpp`; test thêm 97 kiểm tra ở `tests/test_main.cpp` (tổng 226, đạt hết).

- **Danh mục thiết bị** là `DoublyLinkedList<Device>`, chèn bằng `insertSorted` theo mã nên luôn có thứ tự tăng dần. Tìm theo mã O(n). Phiếu mượn nằm trong `DoublyLinkedList<BorrowRecord>`, và mỗi phiếu giữ danh sách mã thiết bị cũng bằng DSLK.
- **Mượn nguyên tử (M6):** chạy hai lượt. Lượt 1 chỉ đọc, gom mọi món lỗi (không tồn tại / trùng mã / hết hàng hoặc bảo trì) vào thông điệp. Chỉ khi không có lỗi nào, lượt 2 mới trừ `available` và tạo phiếu. Nhờ vậy không cần "hoàn tác" khi thất bại. Độ phức tạp O(k·n + k²).
- **Trả cả phiếu (M8):** ghi `returnHour`, chốt `lateDays` và `fine`, rồi trả từng thiết bị về `available`. Trả sai mã hoặc trả lần 2 trả về lỗi mà không đổi dữ liệu nào.
- **Quá hạn:** `overdueDays = ceil((trả − hẹn)/24)` bằng số nguyên `(h + 23) / 24`, 0 nếu chưa trễ. Tiền phạt = ngày × số thiết bị × 36.000 (`long long`). Phiếu đang mở dùng `previewOverdue` (M19), phiếu đã trả giữ giá trị đã chốt.
- **Đồng hồ giả lập:** `Clock` đếm giờ từ 01/01/2026, chỉ tiến. `formatHour` tự tính năm nhuận bằng vòng lặp, không dùng `time()` hay `<ctime>`.
- **`checkInvariants()`:** kiểm tra cấu trúc DSLK, mã không trùng và đúng thứ tự, `available + borrowed + onHold + maintenance == total`, `borrowed` khớp số phiếu đang mở chứa thiết bị đó, phiếu hợp lệ. Mọi thao tác thay đổi dữ liệu gọi `assert(checkInvariants())` qua `debugCheck()`; build với `-DNDEBUG` thì bỏ.
- **Chưa làm (để giai đoạn sau):** `onHold` luôn bằng 0; chưa có hàng đợi, sửa `total` (M3), xoá thiết bị (M4), cập nhật đồ thị, CSV.

## Giai đoạn 3 — Reservation Queue

Tệp: `include/Models.h` (`Reservation`, `Notification`), `include/LabManager.h`, `src/LabManager.cpp`; test thêm 112 kiểm tra (tổng 338, đạt hết).

- **Cấu trúc:** mỗi `Device` có một `LinkedQueue<Reservation>`. Thông báo đi qua `LinkedQueue<Notification>` của `LabManager`; lõi không in ra màn hình, giao diện tự `popNotification`.
- **Giữ hàng (`serveQueue`):** mỗi đơn vị rảnh được giữ cho người *chưa được giữ* đứng đầu, `onHold++`, `available--`, hạn nhận = thời điểm rảnh + 24h. Vì vậy người đang giữ luôn là một đoạn đầu của hàng (M11). Gọi từ `returnRecord`, `finishMaintenance`, `updateDevice` (khi tăng `total`), `cancelReservation` và `expireReservations`.
- **`expireReservations()`** chạy sau mỗi lần tua đồng hồ. Chỉ cần nhìn đầu hàng vì hạn giữ không giảm dọc theo đoạn đầu (bất biến được kiểm tra). Lỡ hạn thì `missCount++`; đạt 2 thì `dequeue` (loại hẳn), chưa đạt thì `moveFrontToBack()` (O(1), nối lại con trỏ). Sau đó `serveQueue` tính hạn từ `holdUntil` cũ (M15), nên tua nhiều giờ vẫn đúng dây chuyền. Hàng chỉ còn một người thì tự được giữ lại 24h mới (M14); hàng rỗng thì đơn vị ở lại `available`. Điều kiện hết hạn là `holdUntil <= now`.
- **`claimReservation`** gỡ người giữ khỏi hàng bằng `removeFirst` (O(q), kể cả khi không đứng đầu), tạo phiếu 1 thiết bị, không cộng cạnh đồ thị (M13). **`updateDevice`** (M3) đặt `available = newTotal - borrowed - onHold - maintenance`, báo lỗi nếu âm.
- **Bất biến mới:** `onHold` bằng số người đang giữ; người giữ là đoạn đầu hàng; `missCount < 2`; không trùng sinh viên trong một hàng; còn người chờ chưa giữ thì `available == 0`.

## Giai đoạn 4 — Graph gợi ý mượn kèm

Tệp: `include/Graph.h`, `src/Graph.cpp` (thêm bộ lọc), `include/Models.h` (`Companion`), `include/LabManager.h`, `src/LabManager.cpp`; test thêm 51 kiểm tra (tổng 389, đạt hết).

- **Cập nhật đồ thị:** `LabManager` sở hữu một `Graph`. `addDevice` thêm đỉnh. `borrowDevices` gọi `addCoBorrow(rec.deviceIds)` ở lượt 2, sau khi chắc chắn phiếu hợp lệ, nên phiếu thất bại (M6) không chạm đồ thị. Phiếu k thiết bị cộng +1 cho k(k−1)/2 cặp; phiếu 1 món (kể cả `claimReservation`, M13) không có cặp nào. Trả phiếu không đổi trọng số vì đồ thị ghi lịch sử mượn.
- **Top 3 (`suggestCompanions`):** dùng lại `Graph::topNeighbors` kèm bộ lọc `accept` để bỏ thiết bị Bảo trì (`maintenance == total`). Cạnh bị lọc không bao giờ được chọn nên thứ tự (trọng số giảm, hoà thì mã tăng) giữ nguyên và láng giềng kế tiếp tự lấp chỗ. Độ phức tạp O(V + k·d·n): mỗi lần xét một cạnh phải tra thiết bị trong DSLK, O(n). Thiết bị hết hàng (`status == Borrowed`) vẫn hiện, kèm `Companion::outOfStock()`.
- **Xem toàn bộ láng giềng (`allCompanions`):** `Graph::sortedNeighbors` chọn k = bậc lần, O(V + d²), không lọc; thiết bị bảo trì hiện kèm trạng thái để demo đồ thị.
- **Đổi quy ước M17:** trước đây top 3 vẫn gồm thiết bị bảo trì; nay bỏ qua theo yêu cầu giai đoạn 4 (đã cập nhật AGENTS.md).
- **Bất biến mới:** `checkInvariants()` kiểm tra `graph_.checkIntegrity()`, số đỉnh bằng số thiết bị và mỗi thiết bị có đúng một đỉnh. Trọng số cạnh được kiểm chéo trong test bằng cách đếm lại từ lịch sử phiếu.
- **Chưa làm ở giai đoạn này:** xoá thiết bị (M4, gỡ đỉnh) và dựng lại đồ thị khi nạp CSV — đã làm ở giai đoạn 5.

## Giai đoạn 5 — Storage CSV + console + dữ liệu mẫu

Tệp: `include/Storage.h`, `src/Storage.cpp`, `include/SampleData.h`, `src/SampleData.cpp`, `include/UI.h`, `src/UI.cpp`, `src/main.cpp`, `build.ps1`; lõi thêm `removeDevice`, `setChangeListener`, nhóm `restore*` (`LabManager`). Test thêm 154 kiểm tra (tổng 543, đạt hết).

- **Dựng lại dữ liệu suy ra khi nạp:** CSV chỉ chứa dữ liệu gốc (4 file, xem README). `Storage::load` gọi theo thứ tự `restoreMeta` → `restoreDevice` → `restoreRecord` → `restoreReservation` → `finishRestore`. Mỗi hàm `restore*` tự kiểm tra và từ chối dòng mâu thuẫn mà không đổi dữ liệu:
  - `restoreDevice` đặt `available = total − maintenance`.
  - `restoreRecord`: phiếu đang mở chuyển 1 đơn vị `available → borrowed` cho từng thiết bị còn tồn tại (không đủ tồn kho thì từ chối); mọi phiếu cộng `timesBorrowed` và gọi `Graph::addCoBorrow`, nên đồ thị được dựng lại từ lịch sử phiếu. Mã thiết bị đã xoá (M4) bị bỏ qua khi cập nhật số lượng/đồ thị nhưng phiếu vẫn được giữ.
  - `restoreReservation`: người đang giữ phải đứng liền ở đầu hàng và lấy 1 đơn vị `available → onHold`.
  - `finishRestore`: giữ hộ cho người chờ nếu còn đơn vị rảnh, chạy `expireReservations()` (lượt giữ đã hết hạn lúc nạp được xử lý như khi tua giờ), rồi `checkInvariants()`.
  - Bộ đếm mã phiếu luôn lớn hơn mọi mã đã có (`max(meta, số lớn nhất + 1)`), nên không bao giờ cấp trùng mã.
- **Chịu lỗi:** đọc số bằng hàm tự viết (`[−]chữ số`, tối đa 18 chữ số) thay vì `std::stoll` nên không ném ngoại lệ. File thiếu → cảnh báo, coi như rỗng. Dòng sai số cột, chữ thay số, số quá lớn, mã trùng, thiết bị lạ, phiếu mở vượt tồn kho → cảnh báo `file:dòng — lý do` rồi bỏ qua. Dòng trống và `\r` (file CRLF) được bỏ qua. Test dựng riêng một thư mục toàn dòng hỏng để kiểm tra.
- **Ghi an toàn:** mỗi file ghi ra `<tên>.tmp` rồi `std::remove` + `std::rename` (trên Windows `rename` không ghi đè được file có sẵn). `LabManager::setChangeListener` cho phép `main` đăng ký hàm lưu; `commit()` (thay `debugCheck()` ở cuối mỗi thao tác thành công) vừa kiểm tra bất biến ở chế độ debug vừa gọi listener. Thao tác thất bại và `restore*` không gọi listener, nên không ghi file thừa.
- **Xoá thiết bị (M4):** `removeDevice` bị chặn (`DeviceInUse`) nếu còn phiếu mở hoặc còn người trong hàng đợi; ngược lại xoá khỏi danh sách và gọi `Graph::removeVertex` để gỡ cả các cạnh. Phiếu lịch sử giữ nguyên mã, console ghi "(đã xoá)".
- **Lỗi tham chiếu treo:** mọi chỗ dùng kết quả `suggestCompanions`/`allCompanions`/`topNeighbors`/`sortedNeighbors` đều gán vào biến cục bộ rồi mới duyệt (kể cả bên trong `LabManager`), không giữ tham chiếu vào danh sách tạm.
- **Console:** lớp `UI` chỉ gọi API công khai của `LabManager`, không chứa nghiệp vụ. Mọi lệnh nhập đọc bằng `getline`; số nhập bằng hàm `readInt` hỏi lại tối đa 3 lần rồi huỷ, dòng trống = huỷ hoặc dùng mặc định, EOF thì lưu và thoát nên không bao giờ lặp vô hạn. Bảng căn cột bằng hàm `padRight`/`padLeft` đếm theo code point UTF-8 vì `std::setw` đếm byte nên chữ có dấu bị lệch cột; các cột số vẫn dùng `setw`.
- **Dữ liệu mẫu:** `SampleData::build` chỉ gọi API nghiệp vụ thật theo dòng thời gian (mượn, tua giờ, trả đúng thứ tự), nên dữ liệu sinh ra luôn thoả bất biến mà không cần ghi CSV bằng tay. 18 thiết bị, 52 phiếu, 5 phiếu trả trễ có phạt, 2 phiếu quá hạn đang mở, hàng đợi Kính VR 2 người. Giờ trả đúng hạn đặt 08:00 (trước giờ hẹn 09:00) để không bị tính trễ oan.
- **Gợi ý theo giỏ lúc mượn (`suggestForBasket`):** luồng Mượn hiện gợi ý *trước* khi hỏi số ngày/xác nhận, tính trên đồ thị hiện tại (phiếu đang lập chưa được cộng vào đồ thị — đồ thị chỉ đổi khi `borrowDevices` thành công, M6). Với mỗi món trong giỏ, duyệt danh sách kề (`Graph::forEachNeighbor`), bỏ láng giềng đã có trong giỏ và thiết bị bảo trì, rồi **cộng trọng số** của cùng một thiết bị qua các món (ví dụ giỏ {ARD01, BRD01}: JMP01 = 10 + 10 = 20). Ứng viên gom trong một DSLK tự cài `(mã, điểm)`; lấy top 3 bằng cách chọn 3 lần điểm lớn nhất (hoà thì mã nhỏ hơn), không dùng `std::map`/`std::sort`. Độ phức tạp O(s² + s·(V + d·(n + c + s)) + k·c) với s = số món trong giỏ, c = số ứng viên. Người dùng có thể nhập thêm mã từ gợi ý, khi đó gợi ý được tính lại cho giỏ mới.
- **Hạn trả tính đến đúng giờ (M19):** `dueHour = borrowHour + days·24`; quá hạn khi `now > dueHour`, số ngày quá hạn = `⌈(now − dueHour)/24⌉`. Dữ liệu mẫu trả lúc 08:00 trước hạn 09:00 là đúng hạn, trả lúc 16:00 cùng ngày hẹn là trễ 7 giờ nên bị tính 1 ngày.
- **Độ phức tạp đáng ghi vào báo cáo:** nạp CSV là O(m·(n + k²·(V+d))) vì mỗi phiếu tra thiết bị trong DSLK (O(n)) và cập nhật đồ thị; với quy mô đồ án (n ≈ 20, m ≈ 50) là tức thời (cả kịch bản 12 mục chạy dưới 0,2 giây).
- **Hạn chế đã biết:** thiếu `meta.csv` thì đồng hồ về 01/01/2026 00:00 (có cảnh báo); `rename` sau `remove` không nguyên tử tuyệt đối — nếu mất điện đúng lúc đó thì file `.tmp` còn nguyên dữ liệu mới.
