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
- **Chưa làm:** xoá thiết bị (M4, gỡ đỉnh) và dựng lại đồ thị khi nạp CSV — để giai đoạn 5.
