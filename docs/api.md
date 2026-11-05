# Hợp đồng API — docs/api.md

> Ranh giới duy nhất giữa backend (`server/`, Claude Code) và web (`web/`, Antigravity).
> Đổi API thì sửa file này **trước**, rồi mới sửa server và web. Thiếu gì thì ghi vào `web/API_REQUESTS.md`.

## 1. Quy ước chung
- Gốc: `http://127.0.0.1:8080` (`localhost` cũng được). Server chỉ lắng nghe `127.0.0.1`; cổng 8080 bận thì thử 8081…8089 và in URL thực tế ra console. Web nên gọi đường dẫn tương đối (`/api/...`) để không phụ thuộc cổng.
- Mọi endpoint nằm dưới `/api/`. Mọi đường dẫn khác là file tĩnh trong `web/` (`/` → `web/index.html`).
- Request có body: `Content-Type: application/json`, body là **object JSON** UTF-8.
- Response: `Content-Type: application/json; charset=utf-8`, tiếng Việt giữ nguyên UTF-8 (không escape `\uXXXX`).
- Mọi số liệu nghiệp vụ (quá hạn, tiền phạt, thời gian giữ còn lại, gợi ý, thứ tự hàng đợi) do lõi tính. Web chỉ hiển thị, lọc, sắp xếp để trình bày.
- **Thời gian** là *giờ giả lập* kể từ 01/01/2026 00:00 (số nguyên). Mỗi trường giờ `xxxHour` đi kèm `xxxText` dạng `"dd/MM/yyyy HH:00"`. Giá trị chưa có (VD chưa trả) là `null`.
- **Tiền** là số nguyên, đơn vị đồng (VD `216000`).
- **Trạng thái thiết bị** (`status`): `"available"` (Sẵn sàng) | `"borrowed"` (Đang mượn) | `"maintenance"` (Bảo trì). Quy tắc M1: `maintenance == total` → maintenance; `available > 0` → available; còn lại → borrowed. `onHold` là con số, không phải trạng thái.
- Mã HTTP thành công: `200`; tạo mới (thiết bị, phiếu, đăng ký hàng đợi, nhận thiết bị) trả `201`.
- Không có xác thực (ứng dụng chạy cục bộ).

## 2. Lỗi
Mọi lỗi có dạng:
```json
{ "error": { "code": "OUT_OF_STOCK", "message": "Hết hàng: VR01", "details": { "unavailableIds": ["VR01"] } } }
```
`message` là tiếng Việt, hiện thẳng cho người dùng. `details` chỉ có ở một số lỗi (ghi rõ bên dưới), có thể vắng mặt.

| `code` | HTTP | Ý nghĩa |
|---|---|---|
| `INVALID_INPUT` | 400 | Thiếu trường / sai kiểu / giá trị sai (mã, tên rỗng hoặc chứa `,` `\|` xuống dòng; số lượng, số ngày ngoài 1–30; tham số query sai...) |
| `BAD_JSON` | 400 | Body không phải JSON hợp lệ hoặc không phải object |
| `DEVICE_NOT_FOUND` | 404 | Không có thiết bị |
| `RECORD_NOT_FOUND` | 404 | Không có phiếu mượn |
| `NOT_IN_QUEUE` | 404 | Sinh viên không có trong hàng đợi của thiết bị |
| `NOT_FOUND` | 404 | Endpoint không tồn tại |
| `DUPLICATE_DEVICE` | 409 | Mã thiết bị đã tồn tại / mã trùng trong một phiếu (M7) |
| `OUT_OF_STOCK` | 409 | Có món hết hàng hoặc đang bảo trì — cả phiếu thất bại (M6). `details.unavailableIds`: mã các món không mượn được. Cũng dùng khi chuyển bảo trì quá số đơn vị sẵn sàng |
| `ALREADY_RETURNED` | 409 | Phiếu đã trả |
| `ALREADY_QUEUED` | 409 | Sinh viên đã đứng trong hàng đợi này (M12) |
| `NOT_HOLDING` | 409 | Chưa đến lượt nhận (chưa được giữ hàng) |
| `CAN_BORROW_DIRECTLY` | 409 | Thiết bị còn hàng — phải mượn trực tiếp, không đặt trước (M12) |
| `DEVICE_IN_USE` | 409 | Không xoá được: còn phiếu đang mở hoặc còn người trong hàng đợi (chỉ chuyển Bảo trì) |
| `INTERNAL` | 500 | Lỗi không lường trước của server |

## 3. Đối tượng dùng chung

**Clock**
```json
{ "hour": 1528, "text": "03/03/2026 16:00" }
```

**Device** (dạng tóm tắt, dùng trong danh sách)
```json
{
  "id": "VR01", "name": "Kính thực tế ảo",
  "total": 2, "available": 0, "borrowed": 1, "onHold": 1, "maintenance": 0,
  "status": "borrowed", "timesBorrowed": 12, "queueLength": 2
}
```
Luôn đúng: `available + borrowed + onHold + maintenance == total`.

**Reservation** (một người trong hàng đợi, theo thứ tự từ đầu hàng)
```json
{
  "position": 1, "studentId": "25120103", "studentName": "Phạm Gia Huy",
  "enqueueHour": 1452, "enqueueText": "01/03/2026 12:00",
  "holding": true, "holdUntil": 1544, "holdUntilText": "04/03/2026 08:00",
  "hoursLeft": 16, "missCount": 0
}
```
- `holding`: đang được giữ hàng (có 24h đến nhận). Nhiều người có thể cùng đang giữ (M11); họ luôn là đoạn đầu hàng.
- Người chưa được giữ: `holdUntil`, `holdUntilText`, `hoursLeft` là `null`.
- `hoursLeft` = số giờ còn lại để nhận theo đồng hồ giả lập (vòng đếm ngược 24h).
- `missCount`: số lần đã lỡ hạn (0 hoặc 1; lỡ lần 2 thì bị loại).

**Companion** (thiết bị gợi ý mượn kèm)
```json
{ "id": "TC01", "name": "Tay cầm điều khiển VR", "weight": 10, "status": "available", "available": 2, "outOfStock": false }
```
`weight` = số phiếu chứa cả hai thiết bị (với gợi ý theo giỏ: tổng trọng số qua các món trong giỏ). `outOfStock` = hết hàng nhưng không phải bảo trì toàn bộ.

**Record** (phiếu mượn)
```json
{
  "recordId": "PM0055", "studentId": "25120104", "studentName": "Nguyễn Thị Lan",
  "devices": [ { "id": "PSU01", "name": "Nguồn DC điều chỉnh", "deleted": false },
               { "id": "DMM01", "name": "Đồng hồ vạn năng", "deleted": false } ],
  "borrowHour": 1236, "borrowText": "21/02/2026 12:00",
  "dueHour": 1332, "dueText": "25/02/2026 12:00",
  "returnHour": null, "returnText": null,
  "open": true, "overdue": true, "lateDays": 9, "fine": 648000, "fineFinal": false
}
```
- `open`: chưa trả. `overdue`: đang mở **và** giờ hiện tại > hạn trả (đúng bằng hạn thì chưa quá hạn).
- `lateDays`, `fine`: phiếu đã trả → giá trị đã chốt lúc trả (`fineFinal: true`); phiếu đang mở → tạm tính theo đồng hồ hiện tại (`fineFinal: false`). Tiền phạt = số ngày trễ × số thiết bị × 36.000đ, trễ chưa tròn ngày tính 1 ngày.
- Thiết bị đã bị xoá (M4): `deleted: true`, `name: ""` — hiển thị "đã xoá".

**Notification** (sự kiện từ lõi)
```json
{
  "type": "missed", "studentId": "25120103", "studentName": "Phạm Gia Huy",
  "deviceId": "VR01", "deviceName": "Kính thực tế ảo",
  "hour": 1544, "hourText": "04/03/2026 08:00",
  "holdUntil": null, "holdUntilText": null,
  "message": "Phạm Gia Huy (25120103) lỡ hạn nhận VR01, bị đẩy xuống cuối hàng"
}
```
`type`: `"hold_granted"` (được giữ hàng, có hạn nhận `holdUntil`) | `"missed"` (lỡ hạn, bị đẩy xuống cuối hàng) | `"removed"` (lỡ hạn lần 2, bị loại khỏi hàng). `hour` là thời điểm sự kiện xảy ra (có thể sớm hơn giờ hiện tại khi tua nhiều giờ — M15). `deviceName` rỗng nếu thiết bị đã bị xoá.

## 4. Endpoint

### 4.1 Tổng quan
**`GET /api/stats?within=6&top=5`** — thẻ số liệu, biểu đồ mượn nhiều nhất, danh sách sắp hết hạn nhận.
`within` (giờ, mặc định 6, 1–168): lấy người đang giữ còn ít hơn `within` giờ. `top` (mặc định 5, 1–50).
```json
{
  "clock": { "hour": 1528, "text": "03/03/2026 16:00" },
  "deviceCount": 18, "totalUnits": 77,
  "available": 50, "borrowed": 16, "onHold": 1, "maintenance": 3, "maintenanceDevices": 1,
  "openRecords": 6, "overdueRecords": 2, "pendingFines": 1008000,
  "waitingPeople": 2, "holdingPeople": 1,
  "topBorrowed": [ { "id": "VR01", "name": "Kính thực tế ảo", "timesBorrowed": 13 } ],
  "expiringHolds": [
    { "deviceId": "VR01", "deviceName": "Kính thực tế ảo", "studentId": "25120103", "studentName": "Phạm Gia Huy",
      "holdUntil": 1544, "holdUntilText": "04/03/2026 08:00", "hoursLeft": 4, "missCount": 0 }
  ]
}
```
`topBorrowed`: lượt mượn giảm dần, hoà thì mã tăng, bỏ thiết bị chưa mượn lần nào. `expiringHolds`: `hoursLeft` tăng dần.

### 4.2 Thiết bị
**`GET /api/devices?query=&status=`** — danh sách theo mã tăng dần.
`query`: chuỗi con của mã hoặc tên (không phân biệt hoa/thường với chữ Latinh không dấu). `status`: `available|borrowed|maintenance` (bỏ trống = tất cả).
```json
{ "count": 18, "devices": [ Device, ... ] }
```

**`GET /api/devices/{id}`** — chi tiết cho panel bên phải.
```json
{
  "device": Device,
  "queue": [ Reservation, ... ],
  "nextQueuePosition": 3,
  "suggestions": [ Companion, ... ]
}
```
`nextQueuePosition` = vị trí sẽ đứng nếu đăng ký hàng đợi bây giờ. `suggestions` = top 3 mượn kèm (M17: bỏ thiết bị bảo trì, hết hàng vẫn hiện). Lỗi: `DEVICE_NOT_FOUND`.

**`GET /api/devices/{id}/companions`** — toàn bộ láng giềng trong đồ thị (gồm cả thiết bị bảo trì, kèm `status`), trọng số giảm, hoà thì mã tăng.
```json
{ "deviceId": "VR01", "companions": [ Companion, ... ] }
```

**`POST /api/devices`** → `201`
```json
{ "id": "VR02", "name": "Kính VR đời mới", "total": 3 }
```
Trả `{ "device": Device }`. Lỗi: `INVALID_INPUT`, `DUPLICATE_DEVICE`.

**`PUT /api/devices/{id}`** — đổi tên và/hoặc tổng số (M3: `total ≥ borrowed + onHold + maintenance`; tăng thì phục vụ hàng đợi).
```json
{ "name": "Kính thực tế ảo", "total": 3 }
```
Cả hai trường bắt buộc (gửi lại giá trị cũ nếu không đổi). Trả `{ "device": Device }`. Lỗi: `DEVICE_NOT_FOUND`, `INVALID_INPUT`.

**`DELETE /api/devices/{id}`** — xoá thiết bị cùng đỉnh và cạnh trong đồ thị (M4). Trả `{ "deleted": "VR02" }`. Lỗi: `DEVICE_NOT_FOUND`, `DEVICE_IN_USE`.

**`POST /api/devices/{id}/maintenance`** — chuyển `qty` đơn vị từ sẵn sàng sang bảo trì (M2).
```json
{ "qty": 1 }
```
Trả `{ "device": Device }`. Lỗi: `DEVICE_NOT_FOUND`, `INVALID_INPUT`, `OUT_OF_STOCK` (qty > available).

**`POST /api/devices/{id}/maintenance/finish`** — trả `qty` đơn vị từ bảo trì về sẵn sàng, rồi phục vụ hàng đợi. Body như trên. Trả `{ "device": Device }`. Lỗi: `DEVICE_NOT_FOUND`, `INVALID_INPUT`.

### 4.3 Mượn / trả
**`POST /api/borrow`** → `201` — tạo phiếu nguyên tử (M6), mỗi thiết bị 1 đơn vị (M7), số ngày 1–30 (M9).
```json
{ "studentId": "25120199", "studentName": "Trần Văn An", "deviceIds": ["VR01", "TC01"], "days": 3 }
```
Trả `{ "record": Record }` (hạn trả = giờ mượn + days × 24). Đồ thị mượn kèm được cộng +1 cho mọi cặp trong phiếu.
Lỗi: `INVALID_INPUT`, `DEVICE_NOT_FOUND`, `DUPLICATE_DEVICE`, `OUT_OF_STOCK` (kèm `details.unavailableIds` → web mời đăng ký hàng đợi các món này).

**`POST /api/return`** — trả cả phiếu (M8), chốt số ngày trễ và tiền phạt; đơn vị vừa rảnh được giữ cho người đầu hàng (sinh thông báo `hold_granted`).
```json
{ "recordId": "PM0055" }
```
Trả `{ "record": Record }` (`open: false`, `fineFinal: true`). Lỗi: `RECORD_NOT_FOUND`, `ALREADY_RETURNED`.
Trước khi xác nhận, web gọi `GET /api/records/{id}` để hiện số ngày quá hạn và tiền phạt tạm tính.

**`GET /api/records?status=all&query=&page=1&pageSize=20`**
- `status`: `all` (mặc định) | `open` | `overdue` | `returned`. `open` = mọi phiếu chưa trả, **gồm cả phiếu quá hạn**; `overdue` là tập con của `open`.
- `query`: chuỗi con của mã phiếu, MSSV hoặc họ tên (bỏ trống = tất cả).
- `page` ≥ 1 (mặc định 1), `pageSize` 1–100 (mặc định 20).
- Thứ tự: `overdue` → `lateDays` giảm dần, hoà thì mã phiếu tăng; các loại khác → phiếu mới nhất trước.
- `counts`: số phiếu theo từng trạng thái **trong tập khớp `query`** (không phụ thuộc `status`, `page`). Bất biến: `all = open + returned`, `overdue ≤ open`, và `total == counts[status]`. Do lõi (`LabManager::countRecords`) tính.
```json
{ "page": 1, "pageSize": 20, "total": 52, "totalPages": 3,
  "counts": { "all": 52, "open": 5, "overdue": 2, "returned": 47 },
  "records": [ Record, ... ] }
```

**`GET /api/records/{id}`** → `{ "record": Record }`. Lỗi: `RECORD_NOT_FOUND`.

### 4.4 Hàng đợi đặt trước
**`GET /api/reservations/{deviceId}`**
```json
{ "device": Device, "queue": [ Reservation, ... ] }
```
Lỗi: `DEVICE_NOT_FOUND`.

**`POST /api/reservations/{deviceId}`** → `201` — đăng ký (chỉ khi `available == 0`, M12).
```json
{ "studentId": "25120150", "studentName": "Lê Minh Châu" }
```
Trả `{ "position": 3, "device": Device, "queue": [ Reservation, ... ] }`.
Lỗi: `INVALID_INPUT`, `DEVICE_NOT_FOUND`, `CAN_BORROW_DIRECTLY`, `ALREADY_QUEUED`.

**`POST /api/reservations/{deviceId}/claim`** → `201` — người đang giữ đến nhận (M13): tạo phiếu 1 thiết bị (không cộng cạnh đồ thị).
```json
{ "studentId": "25120103", "days": 7 }
```
`days` tuỳ chọn, mặc định 7, hợp lệ 1–30. Trả `{ "record": Record, "queue": [ Reservation, ... ] }`.
Lỗi: `INVALID_INPUT`, `DEVICE_NOT_FOUND`, `NOT_IN_QUEUE`, `NOT_HOLDING`.

**`DELETE /api/reservations/{deviceId}/{studentId}`** — huỷ đăng ký (M16); người huỷ đang giữ thì quyền chuyển cho người kế (sinh `hold_granted`).
Trả `{ "device": Device, "queue": [ Reservation, ... ] }`. Lỗi: `DEVICE_NOT_FOUND`, `NOT_IN_QUEUE`.

### 4.5 Gợi ý mượn kèm & đồ thị
**`GET /api/suggestions/{deviceId}?k=3`** — top k mượn kèm một thiết bị (M17). `k` 1–20, mặc định 3.
```json
{ "deviceId": "VR01", "suggestions": [ Companion, ... ] }
```
Lỗi: `DEVICE_NOT_FOUND`.

**`GET /api/suggestions?ids=VR01,TC01&k=3`** — gợi ý cho cả giỏ đang lập phiếu (`suggestForBasket`): cộng trọng số qua các món trong giỏ, loại món đã có trong giỏ, bỏ thiết bị bảo trì; mã lạ bị bỏ qua. `ids` rỗng → danh sách rỗng.
```json
{ "ids": ["VR01", "TC01"], "suggestions": [ Companion, ... ] }
```

**`GET /api/graph`** — toàn bộ đồ thị mượn kèm. Mỗi cạnh vô hướng xuất hiện đúng một lần (`from < to`).
```json
{
  "nodes": [ { "id": "VR01", "name": "Kính thực tế ảo", "status": "borrowed", "timesBorrowed": 13 } ],
  "edges": [ { "from": "TC01", "to": "VR01", "weight": 10 } ]
}
```
Để làm nổi bật top 3 của một đỉnh khi bấm, web gọi `GET /api/suggestions/{id}` (không tự sắp xếp cạnh).

### 4.6 Đồng hồ giả lập & thông báo
**`GET /api/clock`** → `Clock`.

**`POST /api/clock/advance`** — tua thời gian, rồi lõi xử lý mọi lượt giữ hết hạn (dây chuyền M15).
```json
{ "hours": 25 }
```
`hours` 1–8760. Trả `{ "clock": Clock, "pendingNotifications": 2 }`. Sau đó web gọi `GET /api/notifications` để hiện toast.

**`GET /api/notifications`** — lấy **và xoá** mọi thông báo đang chờ, theo thứ tự xảy ra (FIFO).
```json
{ "notifications": [ Notification, ... ] }
```
Thao tác trả phiếu, huỷ hàng đợi, hết bảo trì, sửa tổng số cũng có thể sinh thông báo `hold_granted` — web nên gọi endpoint này sau mỗi thao tác thay đổi dữ liệu.

## 5. Ghi chú cho web
- Mọi `fetch` đi qua `web/js/api.js`; lỗi luôn đọc `error.message` để hiện cho người dùng.
- Dữ liệu được lưu CSV ngay sau mỗi thao tác thành công (không có endpoint "lưu").
- Không cache: sau mỗi thao tác, tải lại dữ liệu của màn hình hiện tại.
