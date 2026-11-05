# Kịch bản trình bày demo (~7 phút)

> Bản gọn của `docs/demo-checklist.md` (checklist chi tiết từng cú bấm, kèm kết quả mong đợi). Ở đây mỗi bước chỉ có **thao tác** và **câu nói** ngắn nhấn vào cấu trúc dữ liệu. Số liệu lấy từ dữ liệu mẫu gốc (đồng hồ `03/11/2026 16:00`).

## Chuẩn bị (trước giờ trình bày)
1. Dừng mọi `LabApp.exe`/`app.exe` đang chạy, khôi phục dữ liệu mẫu: `git checkout -- data/` (bản đóng gói: `LabApp.exe --seed`).
2. Chạy `LabApp.exe`, mở `http://127.0.0.1:8080`, ở màn **Tổng quan** kiểm: 18 mã / 77 đơn vị, 5 phiếu mở, 2 quá hạn, phạt tạm tính 1.008.000 đ.
3. Mở sẵn một cửa sổ terminal (Windows Terminal) ở thư mục gốc để chuyển sang console ở phút thứ 6.
4. Dự phòng: nếu trình duyệt lỗi, làm toàn bộ demo trên `app.exe` (menu 6, 7, 8, 10, 11, 12 tương ứng 5 luồng).

---

## Phút 0:00–0:45 — Mở đầu: kiến trúc

| Thao tác | Câu nói |
|---|---|
| Chiếu sơ đồ 3 tầng (báo cáo, hình kiến trúc) | "Đề số 3: quản lý mượn trả thiết bị Lab có gợi ý mượn kèm. Em chia thành ba tầng." |
| Chỉ tầng dưới | "**Lõi C++** tự cài ba cấu trúc: danh sách liên kết kép, hàng đợi liên kết đơn và đồ thị danh sách kề. Lõi không dùng `std::vector`, `std::map` hay `std::list`, và không biết gì về giao diện." |
| Chỉ tầng giữa và trên | "**API server** chỉ đổi JSON qua lại và gọi hàm công khai của lõi. **Web** là HTML/JS tĩnh chạy offline, mọi con số đều lấy từ API, web không tự tính nghiệp vụ." |
| Chuyển sang trình duyệt, màn Tổng quan | "Dữ liệu mẫu: 18 thiết bị, 52 phiếu. Đồng hồ là **đồng hồ giả lập** nên em tua được thời gian để demo logic 24 giờ." |

## Phút 0:45–1:45 — Luồng 1: mượn hết một thiết bị, 3 người vào hàng đợi
| Thao tác | Câu nói |
|---|---|
| **Lập phiếu mượn**: chọn `PRJ01` (còn 1/2), MSSV `25120201` – `Lê Hoàng Quân`, 7 ngày, xác nhận → phiếu `PM0053` | "Danh mục thiết bị là **danh sách liên kết kép** chèn theo thứ tự mã nên luôn có sẵn thứ tự. Tìm theo mã là O(n), với vài chục thiết bị là đủ." |
| `PRJ01` đổi thành *Hết hàng* → **Đăng ký chờ** cho `25120202` Trần Minh Khôi, rồi `25120203`, `25120204` | "Hết hàng thì vào **Reservation Queue**. Mỗi thiết bị có một `LinkedQueue`: thêm cuối O(1) vì giữ con trỏ `tail`. Quy ước M12: chưa hết hàng thì không được đặt trước, và một sinh viên không đứng hai lần trong một hàng." |
| (tuỳ chọn) đăng ký lại `25120202` → lỗi `ALREADY_QUEUED` | "Lõi trả mã lỗi có cấu trúc, web chỉ hiển thị." |

## Phút 1:45–2:45 — Luồng 2: trả thiết bị, người đầu hàng được giữ 24 giờ
| Thao tác | Câu nói |
|---|---|
| **Trả thiết bị**: chọn `PM0053` → xác nhận. Hai toast hiện ra | "Trả cả phiếu một lần. Đơn vị vừa rảnh **không** quay về `available` mà được giữ cho người đầu hàng chưa được giữ." |
| **Hàng đợi** `PRJ01`: thẻ #1 có vòng đếm 24h, hạn nhận 04/11 16:00 | "Bất biến luôn đúng: `available + borrowed + onHold + maintenance = total`, ở đây `0 + 1 + 1 + 0 = 2`. Sự kiện 'đến lượt ai' lõi đẩy vào một `LinkedQueue<Notification>`, web tự lấy ra hiện toast." |

## Phút 2:45–4:00 — Luồng 3: quá 24 giờ, đẩy xuống cuối và chuyển quyền
| Thao tác | Câu nói |
|---|---|
| Topbar **+N giờ…** → `25` → Tua ngay | "Quá 24 giờ chưa nhận thì người đó bị đẩy xuống cuối hàng." |
| Thẻ Khôi trượt xuống #3, nhãn *Lỡ hạn 1 lần*; Nhi lên #1 với hạn nhận **05/11 16:00** | "Đẩy xuống cuối là `moveFrontToBack`: chỉ nối lại con trỏ, không cấp phát hay giải phóng nút, O(1). Lỡ **hai** lần (`missCount = 2`) thì bị loại hẳn, vừa là 'đẩy xuống cuối' vừa là 'tự động loại'." |
| Chỉ vào hạn 16:00 (không phải 17:00) | "Đây là quy ước **M15**: hạn của người kế tính từ mốc hết hạn cũ của người trước, không tính từ 'bây giờ'. Nhờ vậy tua 72 giờ một lần ra kết quả giống hệt tua từng giờ." |

## Phút 4:00–5:30 — Luồng 4: gợi ý mượn kèm bằng đồ thị
| Thao tác | Câu nói |
|---|---|
| **Lập phiếu**: chọn `ARD01` → khung *Thường được mượn kèm* hiện BRD01, JMP01 (10 lần), DMM01 (1 lần) | "Đồ thị vô hướng, đỉnh là thiết bị, cài bằng **danh sách kề** (cũng là danh sách liên kết tự cài). Một phiếu k thiết bị cộng +1 cho k(k−1)/2 cặp." |
| Bấm **+ Thêm** `BRD01` → `JMP01` nhảy lên đầu với **20 lần** | "Gợi ý theo cả giỏ: trọng số của cùng một thiết bị được cộng dồn qua các món đã chọn, 10 + 10 = 20." |
| Thêm `JMP01`, nhập MSSV `25120205`, **2 ngày**, xác nhận → `PM0054`; mở **Đồ thị**, chọn `ARD01` | "Top 3 lấy bằng cách **chọn 3 lần cạnh lớn nhất**, hoà thì mã nhỏ hơn: O(V + k·d), không cần `std::sort`. Đồ thị không lưu file, mỗi lần khởi động được **dựng lại từ lịch sử phiếu**." |

## Phút 5:30–6:15 — Luồng 5: quá hạn và tiền phạt
| Thao tác | Câu nói |
|---|---|
| **+N giờ…** → `72` → Tổng quan: *Phiếu quá hạn* từ 2 lên **5**, phạt 1.152.000 → 1.980.000 đ | "Hạn trả tính đến đúng giờ: hạn = giờ mượn + số ngày × 24. Trễ chưa tròn ngày vẫn tính 1 ngày." |
| Bấm thẻ → **Quá hạn & Lịch sử** | "Phạt 36.000 đ mỗi ngày, mỗi thiết bị tính riêng, lưu bằng `long long`, không dùng số thực. Phiếu đang mở là tạm tính, chốt khi trả." |

## Phút 6:15–7:00 — Chuyển sang console: lõi độc lập với web
| Thao tác | Câu nói |
|---|---|
| Đóng `LabApp.exe` (Ctrl+C). Terminal: `.\app.exe` (cùng thư mục `data/`) | "Em tắt web server và mở bản console. Hai bản chạy trên **cùng lõi và cùng file CSV**." |
| Menu **11** (quá hạn): cùng 5 phiếu, cùng số tiền. Menu **10**, nhập `ARD01`: cùng top 3 | "Số liệu giống hệt vì mọi nghiệp vụ nằm trong lõi; web và console chỉ là hai giao diện. Chương trình nạp CSV, dựng lại số lượng và đồ thị, rồi tự kiểm tra bất biến." |
| Chọn **0** thoát | "Lõi có 596 kiểm tra tự động, API có 83 kiểm tra smoke, tất cả đạt. Em xin hết, cảm ơn thầy." |

---

## Phụ lục: câu hỏi thầy có thể hỏi
- **Vì sao danh sách liên kết kép mà không phải đơn?** Gỡ một nút khi đã có con trỏ tới nó là O(1) vì nút biết `prev`; thêm/xoá hai đầu O(1) nhờ có `head` và `tail`.
- **Vì sao hàng đợi dùng liên kết đơn?** Chỉ đi một chiều từ đầu đến cuối; `moveFrontToBack` và `removeFirst` chỉ cần con trỏ nút đứng trước.
- **Vì sao không có `graph.csv`?** Đồ thị suy ra được từ các phiếu; lưu thêm sẽ có nguy cơ lệch dữ liệu. Nạp CSV tốn O(m·(n + k²·(V + d))), với m ≈ 50, n ≈ 20 là tức thời.
- **Độ phức tạp top 3?** O(V + k·d) với V để tìm đỉnh, d là bậc, k = 3. Thực tế có lọc thiết bị bảo trì thì thêm chi phí tra thiết bị O(n) mỗi cạnh xét.
- **Mượn phiếu nhiều món mà một món hết hàng?** Phiếu nguyên tử (M6): kiểm tra hết ở lượt 1 chỉ đọc, thất bại thì không đổi gì, kể cả đồ thị.
- **Tại sao đồng hồ giả lập?** Không gọi `time()` trong nghiệp vụ để demo và kiểm thử lặp lại được.
