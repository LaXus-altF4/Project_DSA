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
