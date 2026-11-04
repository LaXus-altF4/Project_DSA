# Bộ prompt cho đồ án — dùng trong Google Antigravity

## Chuẩn bị
1. Tạo thư mục repo, `git init`.
2. Đặt `AGENTS.md` ở thư mục gốc (điền các chỗ `[...]`); đặt `docs/web-ui-spec.md`; bỏ ảnh đề vào `docs/requirements.png`.
3. Mở thư mục bằng Antigravity, dùng **Editor view** (agent ở thanh bên) — đồ án một người không cần Manager view nhiều agent.
4. Bật **Planning mode** và để agent **xin duyệt kế hoạch trước khi chạy lệnh/sửa file** — đọc kỹ implementation plan mỗi lần, đó là lúc bạn hiểu code.
5. Mỗi giai đoạn mở **một hội thoại mới** để agent không mang theo ngữ cảnh cũ lộn xộn; `AGENTS.md` giữ phần bối cảnh chung.
6. Chọn model: Gemini Pro cho mọi giai đoạn; nếu một chỗ trong lõi C++ làm mãi không đúng, thử đổi sang model khác trong danh sách để có góc nhìn thứ hai.
7. Commit Git sau mỗi giai đoạn đã duyệt — agent sửa sai thì `git checkout .` để quay lại.

---

## Prompt 0 — Khởi động (chỉ lập kế hoạch, chưa code)
```
Đọc AGENTS.md và ảnh docs/requirements.png. Chưa viết code.
1. Tóm tắt lại yêu cầu theo cách bạn hiểu, đối chiếu từng ý với đề.
2. Liệt kê những chỗ đề còn mơ hồ mà mục 3 AGENTS.md CHƯA chốt.
3. Đề xuất chữ ký (header) cho các class: DoublyLinkedList<T>, LinkedQueue<T>, Graph,
   Device, BorrowRecord, Reservation, Clock, LabManager — kèm Big-O dự kiến cho từng hàm.
4. Đề xuất format các file CSV trong data/.
5. Kiểm tra API của LabManager không có I/O (mục 4 AGENTS.md) để sau này gắn server/web không phải sửa lõi.
Dừng lại chờ tôi duyệt.
```

## Prompt 1 — CTDL lõi
```
Làm giai đoạn 1 trong AGENTS.md theo header đã duyệt.
- Tự cài DoublyLinkedList<T>, LinkedQueue<T>, Graph (danh sách kề, đỉnh = mã thiết bị).
- Không rò rỉ bộ nhớ: có destructor; copy constructor/assignment hoặc xoá chúng (= delete).
- Graph::topNeighbors(deviceId, k): trả về k láng giềng trọng số lớn nhất; giải thích Big-O trong comment.
- Viết tests/test_main.cpp bằng assert: danh sách rỗng, 1 phần tử, xoá đầu/cuối/giữa,
  queue rỗng khi dequeue, cạnh vô hướng cập nhật cả 2 chiều, topK khi có < k láng giềng.
- Tạo build.ps1 và build_test.ps1, chạy test, báo kết quả. Dừng chờ duyệt.
```

## Prompt 2 — Mượn/trả cơ bản
```
Làm giai đoạn 2. Danh mục thiết bị lưu bằng DoublyLinkedList.
- Mượn: một phiếu có thể nhiều thiết bị; kiểm tra tồn tại, trạng thái, số lượng sẵn có.
- Trả: ghi ngày trả, tính số ngày quá hạn (và tiền phạt nếu có trong AGENTS.md).
- Dùng Clock giả lập, không gọi time().
- Viết checkInvariants() và gọi sau mỗi thao tác.
- Thêm test cho: mượn hết hàng, trả sai mã, trả 2 lần, quá hạn đúng số ngày. Dừng chờ duyệt.
```

## Prompt 3 — Hàng đợi đặt trước 24h
```
Làm giai đoạn 3 theo đúng quy ước mục 3 AGENTS.md.
- Mỗi thiết bị có một LinkedQueue<Reservation>.
- Khi trả mà hàng đợi khác rỗng: giữ món đồ cho người đầu hàng (onHold++), đặt hạn nhận = now + 24h, in thông báo.
- expireReservations() chạy mỗi lần tua đồng hồ: lỡ hạn thì đẩy xuống cuối và missCount++,
  missCount == 2 thì loại hẳn; sau đó giữ cho người kế tiếp. Hàng đợi rỗng thì trả về available.
- Người đầu hàng đến nhận thì tạo phiếu mượn bình thường.
- Test kịch bản: 3 người chờ, tua 25h, kiểm tra thứ tự hàng và bất biến số lượng. Dừng chờ duyệt.
```

## Prompt 4 — Đồ thị gợi ý
```
Làm giai đoạn 4.
- Mỗi phiếu mượn k thiết bị: tăng trọng số cho mọi cặp (k*(k-1)/2 cạnh).
- Khi người dùng chọn/mượn thiết bị A: hiện top 3 thiết bị mượn kèm (tên, số lần), bỏ qua
  thiết bị đang Bảo trì, đánh dấu thiết bị đang hết hàng.
- Thêm chức năng xem toàn bộ láng giềng của một thiết bị (để demo đồ thị).
- Test với dữ liệu nhỏ biết trước đáp án. Dừng chờ duyệt.
```

## Prompt 5 — Lưu file + giao diện console
```
Làm giai đoạn 5.
- Storage: đọc/ghi 4 file CSV trong data/; file thiếu hoặc dòng lỗi thì báo và bỏ qua dòng đó, không crash.
- Menu console tiếng Việt, bảng căn cột bằng iomanip; màu ANSI: xanh = Sẵn sàng,
  vàng = Đang mượn, đỏ = Bảo trì. Nhập sai kiểu (chữ thay vì số) không được làm treo chương trình.
- Menu gồm: xem/thêm/sửa/chuyển bảo trì thiết bị; mượn; trả; xem hàng đợi; tìm kiếm;
  gợi ý mượn kèm; danh sách quá hạn; tua thời gian; lưu & thoát.
- Sinh dữ liệu mẫu: ≥ 15 thiết bị phòng Lab thực tế, ≥ 30 phiếu mượn lịch sử sao cho đồ thị
  có vài cặp nổi bật (VD Kính VR – Tay cầm, Arduino – Breadboard – Dây cắm).
Chạy thử toàn bộ menu, dừng chờ duyệt.
```

## Prompt 6 — API server + hợp đồng API
```
Bản console đã ổn. Làm giai đoạn 6 trong AGENTS.md.
1. Đọc docs/web-ui-spec.md mục 5 và 8. Rà LabManager.h: màn hình nào thiếu dữ liệu từ API
   (VD thời gian còn lại của người đầu hàng, thống kê tổng quan, dữ liệu đồ thị)? Đề xuất hàm cần thêm, CHỜ DUYỆT.
2. Sau khi duyệt: viết docs/api.md (endpoint, JSON request/response mẫu, mã lỗi).
3. Viết server/ bằng cpp-httplib + nlohmann/json; server phục vụ luôn web/ và tự mở trình duyệt.
   Tầng server chỉ chuyển đổi JSON <-> LabManager, không chứa logic nghiệp vụ.
4. Viết tests/api_smoke.ps1 gọi thử mọi endpoint bằng Invoke-RestMethod theo kịch bản demo.
5. Tạo web/index.html tối giản (chỉ để kiểm tra server chạy). Dừng chờ duyệt.
```

---

# Giai đoạn 7 — Giao diện web
Mỗi prompt mở đầu bằng "Đọc docs/web-ui-spec.md và docs/api.md trước." Agent tự mở trình duyệt tích hợp để chụp màn hình kiểm tra — hãy xem ảnh/video nó đính kèm trong walkthrough, đừng chỉ đọc chữ.

## Prompt 7A — Lên thiết kế (chưa code)
```
Đọc docs/web-ui-spec.md, AGENTS.md mục 2–3 và docs/api.md.
Chưa viết code. Đề xuất:
1. Hệ thống thiết kế: bảng màu sáng/tối (mã hex), font, cỡ chữ, khoảng cách, bo góc, bóng,
   màu cho 4 trạng thái thiết bị.
2. Bố cục từng màn hình ở docs/web-ui-spec.md mục 5 (mô tả hoặc wireframe ASCII).
3. Danh sách animation sẽ dùng và chỗ dùng.
4. Thư viện local sẽ tải về web/vendor/ (đồ thị, icon, biểu đồ) và lý do chọn.
Dừng chờ tôi duyệt.
```

## Prompt 7B — Khung app + dữ liệu giả
```
Theo thiết kế đã duyệt: dựng web/ theo docs/web-ui-spec.md mục 7 — sidebar, router hash, thanh đồng hồ,
theme sáng/tối, toast, modal, api.js (một chỗ gọi fetch, xử lý lỗi chung) và mock.js đúng format docs/api.md.
Chạy LabApp.exe (hoặc ?mock=1), tự chụp màn hình kiểm tra. Chỉ sửa trong web/.
```

## Prompt 7C — Từng màn hình (lặp lại, mỗi màn hình một hội thoại)
```
Làm màn hình [Tổng quan | Thiết bị | Mượn | Trả | Hàng đợi | Quá hạn & lịch sử | Đồ thị] theo docs/web-ui-spec.md mục 5,
dùng API thật (không mock). Kiểm tra trạng thái tải/rỗng/lỗi. Chụp màn hình sáng và tối.
Nếu thiếu API thì ghi vào web/API_REQUESTS.md và dừng lại, không tự bịa endpoint.
```

## Prompt 7D — Chạy kịch bản demo
```
Chạy đủ 5 luồng ở docs/web-ui-spec.md mục 6 trong trình duyệt tích hợp, quay video/chụp từng bước.
Liệt kê chỗ nào hiển thị sai, giật, khó hiểu hoặc animation chưa mượt; sửa trong web/.
```

## Prompt 7E — Đánh bóng
```
Rà toàn bộ giao diện như một designer khó tính: căn lề, nhất quán màu/khoảng cách, độ tương phản,
chữ tiếng Việt bị cắt, hover/focus, prefers-reduced-motion, hiển thị trên máy chiếu 1366x768.
Sửa từng mục, giữ nguyên hành vi.
```

---

## Prompt 8 — Ghép nối
```
Đọc web/API_REQUESTS.md. Với từng yêu cầu: có hợp lý không, có cần đổi lõi không?
Đề xuất thay đổi, chờ duyệt, rồi cập nhật docs/api.md + server. Không sửa web/.
Sau đó chạy tests/api_smoke.ps1 và viết deploy.ps1 đóng gói thư mục release:
LabApp.exe + DLL MinGW cần thiết + web/ + data/ mẫu, chạy được trên máy không cài gì.
```

## Prompt 9 — Demo, README, báo cáo
```
Làm giai đoạn 9.
- docs/demo-script.md: kịch bản 7 phút — mở đầu bằng sơ đồ kiến trúc (lõi CTDL / server / web),
  rồi chạy 5 luồng ở docs/web-ui-spec.md mục 6; ghi rõ lúc nào chuyển sang console để chứng minh lõi độc lập với web.
- README.md: cách build, cách chạy, cấu trúc thư mục, thông tin sinh viên thực hiện, phần nào AI hỗ trợ.
- report/: báo cáo LaTeX tiếng Việt: giới thiệu, phân tích yêu cầu, quy ước nghiệp vụ, kiến trúc,
  thiết kế từng CTDL (hình node/con trỏ bằng TikZ), bảng Big-O, ảnh chụp màn hình web,
  đánh giá & hướng phát triển.
```

---

## Prompt dùng khi sửa lỗi / review (dùng bất cứ lúc nào)
```
Review module [DoublyLinkedList | LinkedQueue | Graph | LabManager | Storage | UI] như một giảng viên chấm CTDL: tìm rò rỉ bộ nhớ, con trỏ treo khi xoá node,
trường hợp biên (rỗng, 1 phần tử), vi phạm bất biến số lượng, chỗ dùng STL trái quy định.
Liệt kê lỗi theo mức nghiêm trọng, CHƯA sửa, chờ tôi chọn.
```

```
Giải thích cho tôi hàm [VD: LabManager::returnDevice] từng bước, để tôi viết vào báo cáo: nó làm gì, Big-O bao nhiêu,
vì sao chọn CTDL này thay vì mảng/vector.
```
