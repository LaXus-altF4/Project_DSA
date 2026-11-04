#include "LabManager.h"

#include <cassert>

namespace {

OpResult makeError(ErrorCode code, const std::string& message) {
    OpResult r;
    r.code = code;
    r.message = message;
    return r;
}

// Mã phiếu dạng PM0001.
std::string makeRecordId(int no) {
    std::string digits = std::to_string(no);
    while (digits.size() < 4) digits = "0" + digits;
    return "PM" + digits;
}

void appendItem(std::string& list, const std::string& item) {
    if (!list.empty()) list += ", ";
    list += item;
}

} // namespace

LabManager::LabManager() : nextRecordNo_(1) {}

bool LabManager::isValidText(const std::string& s) {
    if (s.empty()) return false;
    for (char c : s)
        if (c == ',' || c == '|' || c == '\n' || c == '\r') return false;
    return true;
}

Device* LabManager::findDeviceMutable(const std::string& id) {
    return devices_.findFirst([&id](const Device& d) { return d.id == id; });
}

const Device* LabManager::findDevice(const std::string& id) const {
    return devices_.findFirst([&id](const Device& d) { return d.id == id; });
}

void LabManager::debugCheck() const {
    assert(checkInvariants());
}

void LabManager::notify(NotificationType type, const Reservation& r, const std::string& deviceId,
                        long long hour, const std::string& message) {
    Notification n;
    n.type = type;
    n.studentId = r.studentId;
    n.studentName = r.studentName;
    n.deviceId = deviceId;
    n.hour = hour;
    n.holdUntil = r.holdUntil;
    n.message = message;
    notifications_.enqueue(n);
}

void LabManager::serveQueue(Device& d, long long atHour) {
    // Người đang giữ là đoạn đầu hàng nên người chưa giữ đầu tiên là người kế tiếp (M11).
    d.queue.forEach([&](Reservation& r) {
        if (d.available <= 0 || r.isHolding()) return;
        r.holdUntil = atHour + HOLD_HOURS;
        --d.available;
        ++d.onHold;
        notify(NotificationType::HoldGranted, r, d.id, atHour,
               "Đến lượt " + r.studentName + " (" + r.studentId + ") nhận thiết bị " + d.id +
                   ", hạn nhận " + Clock::formatHour(r.holdUntil));
    });
}

// ============================ Thiết bị ============================

OpResult LabManager::addDevice(const std::string& id, const std::string& name, int total) {
    if (!isValidText(id) || !isValidText(name))
        return makeError(ErrorCode::InvalidInput, "Mã và tên thiết bị không được rỗng hoặc chứa , | hay xuống dòng");
    if (total < 1)
        return makeError(ErrorCode::InvalidInput, "Số lượng phải từ 1 trở lên");
    if (findDevice(id) != nullptr)
        return makeError(ErrorCode::DuplicateDevice, "Mã thiết bị đã tồn tại: " + id);

    Device d;
    d.id = id;
    d.name = name;
    d.total = total;
    d.available = total;
    devices_.insertSorted(d, [](const Device& a, const Device& b) { return a.id < b.id; });
    graph_.addVertex(id);
    debugCheck();
    return OpResult();
}

OpResult LabManager::sendToMaintenance(const std::string& id, int qty) {
    Device* d = findDeviceMutable(id);
    if (d == nullptr) return makeError(ErrorCode::DeviceNotFound, "Không tìm thấy thiết bị: " + id);
    if (qty < 1) return makeError(ErrorCode::InvalidInput, "Số lượng bảo trì phải từ 1 trở lên");
    if (qty > d->available)
        return makeError(ErrorCode::OutOfStock, "Chỉ có thể đưa vào bảo trì tối đa " +
                                                   std::to_string(d->available) + " đơn vị đang sẵn sàng");
    d->available -= qty;
    d->maintenance += qty;
    debugCheck();
    return OpResult();
}

OpResult LabManager::finishMaintenance(const std::string& id, int qty) {
    Device* d = findDeviceMutable(id);
    if (d == nullptr) return makeError(ErrorCode::DeviceNotFound, "Không tìm thấy thiết bị: " + id);
    if (qty < 1) return makeError(ErrorCode::InvalidInput, "Số lượng phải từ 1 trở lên");
    if (qty > d->maintenance)
        return makeError(ErrorCode::InvalidInput, "Chỉ có " + std::to_string(d->maintenance) +
                                                      " đơn vị đang bảo trì");
    d->maintenance -= qty;
    d->available += qty;
    serveQueue(*d, clock_.now());
    debugCheck();
    return OpResult();
}

OpResult LabManager::updateDevice(const std::string& id, const std::string& newName, int newTotal) {
    Device* d = findDeviceMutable(id);
    if (d == nullptr) return makeError(ErrorCode::DeviceNotFound, "Không tìm thấy thiết bị: " + id);
    if (!isValidText(newName))
        return makeError(ErrorCode::InvalidInput, "Tên thiết bị không được rỗng hoặc chứa , | hay xuống dòng");
    int minTotal = d->borrowed + d->onHold + d->maintenance; // M3
    if (newTotal < 1 || newTotal < minTotal)
        return makeError(ErrorCode::InvalidInput, "Tổng số phải từ " + std::to_string(minTotal > 1 ? minTotal : 1) +
                                                      " trở lên (đang mượn, đang giữ và bảo trì không thể giảm)");
    bool grew = newTotal > d->total;
    d->name = newName;
    d->total = newTotal;
    d->available = newTotal - minTotal;
    if (grew) serveQueue(*d, clock_.now());
    debugCheck();
    return OpResult();
}

// ============================ Mượn / trả ============================

BorrowResult LabManager::borrowDevices(const std::string& studentId, const std::string& studentName,
                                       const DoublyLinkedList<std::string>& deviceIds, int days) {
    BorrowResult result;
    auto fail = [&result](ErrorCode code, const std::string& message) {
        result.code = code;
        result.message = message;
        return result;
    };

    if (!isValidText(studentId) || !isValidText(studentName))
        return fail(ErrorCode::InvalidInput, "MSSV và họ tên không được rỗng hoặc chứa , | hay xuống dòng");
    if (days < MIN_BORROW_DAYS || days > MAX_BORROW_DAYS)
        return fail(ErrorCode::InvalidInput, "Số ngày mượn phải từ " + std::to_string(MIN_BORROW_DAYS) +
                                                 " đến " + std::to_string(MAX_BORROW_DAYS));
    if (deviceIds.empty())
        return fail(ErrorCode::InvalidInput, "Phiếu mượn phải có ít nhất một thiết bị");

    // Lượt 1 (chỉ đọc): gom mọi món không mượn được, chưa đổi dữ liệu nào (M6).
    std::string notFound, duplicated, outOfStock;
    int seen = 0;
    for (const std::string& id : deviceIds) {
        int sameBefore = 0; // đã xuất hiện ở vị trí trước trong phiếu?
        int pos = 0;
        for (const std::string& other : deviceIds) {
            if (pos++ >= seen) break;
            if (other == id) ++sameBefore;
        }
        ++seen;
        if (sameBefore > 0) {
            appendItem(duplicated, id);
            continue;
        }
        const Device* d = findDevice(id);
        if (d == nullptr) {
            appendItem(notFound, id);
        } else if (d->available <= 0) {
            appendItem(outOfStock, id + (d->status() == DeviceStatus::Maintenance ? " (đang bảo trì)" : ""));
        }
    }
    if (!notFound.empty()) return fail(ErrorCode::DeviceNotFound, "Không tìm thấy thiết bị: " + notFound);
    if (!duplicated.empty())
        return fail(ErrorCode::DuplicateDevice, "Thiết bị trùng trong phiếu (mỗi loại tối đa 1 đơn vị): " + duplicated);
    if (!outOfStock.empty()) return fail(ErrorCode::OutOfStock, "Hết hàng: " + outOfStock);

    // Lượt 2: mọi món đều mượn được — cập nhật số lượng và tạo phiếu.
    BorrowRecord rec;
    rec.recordId = makeRecordId(nextRecordNo_++);
    rec.studentId = studentId;
    rec.studentName = studentName;
    rec.borrowHour = clock_.now();
    rec.dueHour = clock_.now() + static_cast<long long>(days) * 24;
    for (const std::string& id : deviceIds) {
        Device* d = findDeviceMutable(id);
        --d->available;
        ++d->borrowed;
        ++d->timesBorrowed;
        rec.deviceIds.pushBack(id);
    }
    graph_.addCoBorrow(rec.deviceIds); // +1 cho mọi cặp trong phiếu: k(k-1)/2 cạnh (phiếu 1 món: không có cặp)
    records_.pushBack(rec);

    result.recordId = rec.recordId;
    result.dueHour = rec.dueHour;
    debugCheck();
    return result;
}

ReturnResult LabManager::returnRecord(const std::string& recordId) {
    ReturnResult result;
    BorrowRecord* rec = records_.findFirst([&recordId](const BorrowRecord& r) { return r.recordId == recordId; });
    if (rec == nullptr) {
        result.code = ErrorCode::RecordNotFound;
        result.message = "Không tìm thấy phiếu mượn: " + recordId;
        return result;
    }
    if (!rec->isOpen()) {
        result.code = ErrorCode::AlreadyReturned;
        result.message = "Phiếu " + recordId + " đã được trả lúc " + Clock::formatHour(rec->returnHour);
        return result;
    }

    rec->returnHour = clock_.now();
    rec->lateDays = overdueDays(rec->dueHour, rec->returnHour);
    rec->fine = calcFine(rec->lateDays, rec->deviceIds.size());
    for (const std::string& id : rec->deviceIds) {
        Device* d = findDeviceMutable(id); // nullptr nếu thiết bị đã bị xoá (M4)
        if (d == nullptr) continue;
        --d->borrowed;
        ++d->available;
        serveQueue(*d, clock_.now()); // giữ đơn vị vừa rảnh cho người đầu hàng (nếu có)
    }

    result.lateDays = rec->lateDays;
    result.fine = rec->fine;
    debugCheck();
    return result;
}

const BorrowRecord* LabManager::findRecord(const std::string& recordId) const {
    return records_.findFirst([&recordId](const BorrowRecord& r) { return r.recordId == recordId; });
}

// ============================ Quá hạn ============================

int LabManager::overdueDays(long long dueHour, long long atHour) {
    if (atHour <= dueHour) return 0;
    long long lateHours = atHour - dueHour;
    return static_cast<int>((lateHours + 23) / 24); // làm tròn lên
}

long long LabManager::calcFine(int lateDays, int deviceCount) {
    return static_cast<long long>(lateDays) * deviceCount * FINE_PER_DAY;
}

OverdueInfo LabManager::previewOverdue(const BorrowRecord& record) const {
    OverdueInfo info;
    if (!record.isOpen()) {
        info.lateDays = record.lateDays;
        info.fine = record.fine;
        return info;
    }
    info.lateDays = overdueDays(record.dueHour, clock_.now());
    info.fine = calcFine(info.lateDays, record.deviceIds.size());
    return info;
}

bool LabManager::advanceTime(long long hours) {
    bool ok = clock_.advance(hours);
    if (ok) {
        expireReservations();
        debugCheck();
    }
    return ok;
}

// ============================ Hàng đợi đặt trước ============================

OpResult LabManager::reserveDevice(const std::string& studentId, const std::string& studentName,
                                   const std::string& deviceId) {
    if (!isValidText(studentId) || !isValidText(studentName))
        return makeError(ErrorCode::InvalidInput, "MSSV và họ tên không được rỗng hoặc chứa , | hay xuống dòng");
    Device* d = findDeviceMutable(deviceId);
    if (d == nullptr) return makeError(ErrorCode::DeviceNotFound, "Không tìm thấy thiết bị: " + deviceId);
    if (d->available > 0)
        return makeError(ErrorCode::CanBorrowDirectly, "Thiết bị " + deviceId + " còn hàng, hãy mượn trực tiếp");
    if (d->queue.findFirst([&](const Reservation& r) { return r.studentId == studentId; }) != nullptr)
        return makeError(ErrorCode::AlreadyQueued, "Sinh viên " + studentId + " đã đứng trong hàng đợi của " + deviceId);

    Reservation r;
    r.studentId = studentId;
    r.studentName = studentName;
    r.enqueueHour = clock_.now();
    d->queue.enqueue(r);
    debugCheck();
    return OpResult();
}

BorrowResult LabManager::claimReservation(const std::string& studentId, const std::string& deviceId, int days) {
    BorrowResult result;
    auto fail = [&result](ErrorCode code, const std::string& message) {
        result.code = code;
        result.message = message;
        return result;
    };
    if (days < MIN_BORROW_DAYS || days > MAX_BORROW_DAYS)
        return fail(ErrorCode::InvalidInput, "Số ngày mượn phải từ " + std::to_string(MIN_BORROW_DAYS) +
                                                 " đến " + std::to_string(MAX_BORROW_DAYS));
    Device* d = findDeviceMutable(deviceId);
    if (d == nullptr) return fail(ErrorCode::DeviceNotFound, "Không tìm thấy thiết bị: " + deviceId);
    const Reservation* r = d->queue.findFirst([&](const Reservation& x) { return x.studentId == studentId; });
    if (r == nullptr) return fail(ErrorCode::NotInQueue, "Sinh viên " + studentId + " không có trong hàng đợi " + deviceId);
    if (!r->isHolding())
        return fail(ErrorCode::NotHolding, "Chưa đến lượt nhận: sinh viên " + studentId + " chưa được giữ hàng");

    BorrowRecord rec;
    rec.recordId = makeRecordId(nextRecordNo_++);
    rec.studentId = r->studentId;
    rec.studentName = r->studentName;
    rec.borrowHour = clock_.now();
    rec.dueHour = clock_.now() + static_cast<long long>(days) * 24;
    rec.deviceIds.pushBack(deviceId);

    d->queue.removeFirst([&](const Reservation& x) { return x.studentId == studentId; }); // r không còn hợp lệ
    --d->onHold;
    ++d->borrowed;
    ++d->timesBorrowed;
    records_.pushBack(rec); // phiếu 1 món: không cộng cạnh đồ thị (M13)

    result.recordId = rec.recordId;
    result.dueHour = rec.dueHour;
    debugCheck();
    return result;
}

OpResult LabManager::cancelReservation(const std::string& studentId, const std::string& deviceId) {
    Device* d = findDeviceMutable(deviceId);
    if (d == nullptr) return makeError(ErrorCode::DeviceNotFound, "Không tìm thấy thiết bị: " + deviceId);
    const Reservation* r = d->queue.findFirst([&](const Reservation& x) { return x.studentId == studentId; });
    if (r == nullptr) return makeError(ErrorCode::NotInQueue, "Sinh viên " + studentId + " không có trong hàng đợi " + deviceId);

    bool wasHolding = r->isHolding();
    d->queue.removeFirst([&](const Reservation& x) { return x.studentId == studentId; });
    if (wasHolding) { // trả đơn vị đang giữ và chuyển quyền cho người kế (M16)
        --d->onHold;
        ++d->available;
        serveQueue(*d, clock_.now());
    }
    debugCheck();
    return OpResult();
}

void LabManager::expireReservations() {
    long long nowHour = clock_.now();
    for (Device& d : devices_) {
        while (true) {
            Reservation* head = d.queue.front();
            if (head == nullptr || !head->isHolding() || head->holdUntil > nowHour) break;

            long long expiredAt = head->holdUntil; // M15: người kế tính hạn từ thời điểm này
            --d.onHold;
            ++d.available;
            ++head->missCount;
            if (head->missCount >= MAX_MISSES) {
                Reservation gone;
                d.queue.dequeue(&gone);
                notify(NotificationType::Removed, gone, d.id, expiredAt,
                       gone.studentName + " (" + gone.studentId + ") lỡ hạn nhận " + d.id + " lần 2, bị loại khỏi hàng");
            } else {
                head->holdUntil = -1;
                Reservation missed = *head;
                d.queue.moveFrontToBack();
                notify(NotificationType::Missed, missed, d.id, expiredAt,
                       missed.studentName + " (" + missed.studentId + ") lỡ hạn nhận " + d.id + ", bị đẩy xuống cuối hàng");
            }
            serveQueue(d, expiredAt); // hàng rỗng thì đơn vị ở lại available
        }
    }
}

// ============================ Gợi ý mượn kèm ============================

namespace {

Companion makeCompanion(const Neighbor& n, const Device& d) {
    Companion c;
    c.deviceId = d.id;
    c.name = d.name;
    c.weight = n.weight;
    c.status = d.status();
    c.available = d.available;
    return c;
}

} // namespace

DoublyLinkedList<Companion> LabManager::suggestCompanions(const std::string& id, int k) const {
    DoublyLinkedList<Companion> result;
    auto notInMaintenance = [this](const std::string& otherId) {
        const Device* d = findDevice(otherId);
        return d != nullptr && d->status() != DeviceStatus::Maintenance;
    };
    for (const Neighbor& n : graph_.topNeighbors(id, k, notInMaintenance)) {
        const Device* d = findDevice(n.deviceId);
        if (d != nullptr) result.pushBack(makeCompanion(n, *d));
    }
    return result;
}

DoublyLinkedList<Companion> LabManager::allCompanions(const std::string& id) const {
    DoublyLinkedList<Companion> result;
    for (const Neighbor& n : graph_.sortedNeighbors(id)) {
        const Device* d = findDevice(n.deviceId);
        if (d != nullptr) result.pushBack(makeCompanion(n, *d));
    }
    return result;
}

// ============================ Bất biến ============================

bool LabManager::checkInvariants() const {
    if (!devices_.checkIntegrity() || !records_.checkIntegrity()) return false;
    // Đồ thị: cấu trúc hợp lệ, mỗi thiết bị đúng một đỉnh.
    if (!graph_.checkIntegrity() || graph_.vertexCount() != devices_.size()) return false;
    for (const Device& d : devices_)
        if (!graph_.hasVertex(d.id)) return false;

    const Device* prev = nullptr;
    for (const Device& d : devices_) {
        if (prev != nullptr && !(prev->id < d.id)) return false; // trùng mã hoặc sai thứ tự
        prev = &d;
        if (d.total < 0 || d.available < 0 || d.borrowed < 0 || d.onHold < 0 || d.maintenance < 0) return false;
        if (d.available + d.borrowed + d.onHold + d.maintenance != d.total) return false;

        int openCount = 0; // số phiếu đang mở chứa thiết bị này
        for (const BorrowRecord& r : records_) {
            if (!r.isOpen()) continue;
            if (r.deviceIds.findFirst([&d](const std::string& id) { return id == d.id; }) != nullptr) ++openCount;
        }
        if (openCount != d.borrowed) return false;

        // Hàng đợi.
        if (!d.queue.checkIntegrity()) return false;
        int holders = 0, waiting = 0;
        bool seenWaiting = false, ok = true;
        long long lastHold = -1;
        d.queue.forEach([&](const Reservation& r) {
            if (r.missCount < 0 || r.missCount >= MAX_MISSES) ok = false;
            if (r.isHolding()) {
                ++holders;
                if (seenWaiting) ok = false;       // người giữ phải là đoạn đầu hàng (M11)
                if (r.holdUntil < lastHold) ok = false; // hạn không giảm dọc đoạn đầu
                lastHold = r.holdUntil;
            } else {
                ++waiting;
                seenWaiting = true;
            }
            int same = 0; // không trùng sinh viên trong một hàng (M12)
            d.queue.forEach([&](const Reservation& o) { if (o.studentId == r.studentId) ++same; });
            if (same != 1) ok = false;
        });
        if (!ok || holders != d.onHold) return false;
        if (waiting > 0 && d.available != 0) return false; // còn người chờ thì không để đơn vị rảnh
    }

    for (const BorrowRecord& r : records_) {
        if (!r.deviceIds.checkIntegrity() || r.deviceIds.empty()) return false;
        if (r.dueHour <= r.borrowHour) return false;
        if (!r.isOpen() && (r.returnHour < r.borrowHour || r.fine < 0 || r.lateDays < 0)) return false;
        // Không trùng mã trong cùng phiếu.
        int i = 0;
        for (const std::string& a : r.deviceIds) {
            int j = 0;
            for (const std::string& b : r.deviceIds) {
                if (j++ <= i) continue;
                if (a == b) return false;
            }
            ++i;
        }
    }
    return true;
}
