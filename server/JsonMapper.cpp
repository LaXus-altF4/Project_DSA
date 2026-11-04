#include "JsonMapper.h"

#include "Clock.h"

namespace JsonMapper {

const char* statusString(DeviceStatus s) {
    switch (s) {
        case DeviceStatus::Available: return "available";
        case DeviceStatus::Borrowed: return "borrowed";
        case DeviceStatus::Maintenance: return "maintenance";
    }
    return "available";
}

const char* errorCodeString(ErrorCode c) {
    switch (c) {
        case ErrorCode::Ok: return "OK";
        case ErrorCode::InvalidInput: return "INVALID_INPUT";
        case ErrorCode::DuplicateDevice: return "DUPLICATE_DEVICE";
        case ErrorCode::DeviceNotFound: return "DEVICE_NOT_FOUND";
        case ErrorCode::OutOfStock: return "OUT_OF_STOCK";
        case ErrorCode::RecordNotFound: return "RECORD_NOT_FOUND";
        case ErrorCode::AlreadyReturned: return "ALREADY_RETURNED";
        case ErrorCode::AlreadyQueued: return "ALREADY_QUEUED";
        case ErrorCode::NotInQueue: return "NOT_IN_QUEUE";
        case ErrorCode::NotHolding: return "NOT_HOLDING";
        case ErrorCode::CanBorrowDirectly: return "CAN_BORROW_DIRECTLY";
        case ErrorCode::DeviceInUse: return "DEVICE_IN_USE";
    }
    return "INTERNAL";
}

int httpStatusFor(ErrorCode c) {
    switch (c) {
        case ErrorCode::Ok: return 200;
        case ErrorCode::InvalidInput: return 400;
        case ErrorCode::DeviceNotFound:
        case ErrorCode::RecordNotFound:
        case ErrorCode::NotInQueue: return 404;
        case ErrorCode::DuplicateDevice:
        case ErrorCode::OutOfStock:
        case ErrorCode::AlreadyReturned:
        case ErrorCode::AlreadyQueued:
        case ErrorCode::NotHolding:
        case ErrorCode::CanBorrowDirectly:
        case ErrorCode::DeviceInUse: return 409;
    }
    return 500;
}

const char* notificationTypeString(NotificationType t) {
    switch (t) {
        case NotificationType::HoldGranted: return "hold_granted";
        case NotificationType::Missed: return "missed";
        case NotificationType::Removed: return "removed";
    }
    return "hold_granted";
}

json clock(long long hour) {
    return json{{"hour", hour}, {"text", Clock::formatHour(hour)}};
}

json hourOrNull(long long hour) {
    return hour < 0 ? json(nullptr) : json(hour);
}

json hourTextOrNull(long long hour) {
    return hour < 0 ? json(nullptr) : json(Clock::formatHour(hour));
}

json device(const Device& d) {
    return json{{"id", d.id},
                {"name", d.name},
                {"total", d.total},
                {"available", d.available},
                {"borrowed", d.borrowed},
                {"onHold", d.onHold},
                {"maintenance", d.maintenance},
                {"status", statusString(d.status())},
                {"timesBorrowed", d.timesBorrowed},
                {"queueLength", d.queue.size()}};
}

json reservation(const LabManager& lab, const Reservation& r, int position) {
    long long left = lab.holdHoursLeft(r); // -1 nếu chưa được giữ
    return json{{"position", position},
                {"studentId", r.studentId},
                {"studentName", r.studentName},
                {"enqueueHour", r.enqueueHour},
                {"enqueueText", Clock::formatHour(r.enqueueHour)},
                {"holding", r.isHolding()},
                {"holdUntil", hourOrNull(r.holdUntil)},
                {"holdUntilText", hourTextOrNull(r.holdUntil)},
                {"hoursLeft", left < 0 ? json(nullptr) : json(left)},
                {"missCount", r.missCount}};
}

json queue(const LabManager& lab, const std::string& deviceId) {
    json arr = json::array();
    int position = 0;
    lab.forEachReservation(deviceId, [&](const Reservation& r) { arr.push_back(reservation(lab, r, ++position)); });
    return arr;
}

json companion(const Companion& c) {
    return json{{"id", c.deviceId},
                {"name", c.name},
                {"weight", c.weight},
                {"status", statusString(c.status)},
                {"available", c.available},
                {"outOfStock", c.outOfStock()}};
}

json companions(const DoublyLinkedList<Companion>& list) {
    json arr = json::array();
    for (const Companion& c : list) arr.push_back(companion(c));
    return arr;
}

json record(const LabManager& lab, const BorrowRecord& r) {
    json devices = json::array();
    for (const std::string& id : r.deviceIds) {
        const Device* d = lab.findDevice(id); // nullptr: thiết bị đã bị xoá (M4)
        devices.push_back(json{{"id", id}, {"name", d ? d->name : std::string()}, {"deleted", d == nullptr}});
    }
    OverdueInfo info = lab.previewOverdue(r);
    return json{{"recordId", r.recordId},
                {"studentId", r.studentId},
                {"studentName", r.studentName},
                {"devices", devices},
                {"borrowHour", r.borrowHour},
                {"borrowText", Clock::formatHour(r.borrowHour)},
                {"dueHour", r.dueHour},
                {"dueText", Clock::formatHour(r.dueHour)},
                {"returnHour", hourOrNull(r.returnHour)},
                {"returnText", hourTextOrNull(r.returnHour)},
                {"open", r.isOpen()},
                {"overdue", lab.isOverdue(r)},
                {"lateDays", info.lateDays},
                {"fine", info.fine},
                {"fineFinal", !r.isOpen()}};
}

json notification(const LabManager& lab, const Notification& n) {
    const Device* d = lab.findDevice(n.deviceId);
    bool granted = n.type == NotificationType::HoldGranted;
    return json{{"type", notificationTypeString(n.type)},
                {"studentId", n.studentId},
                {"studentName", n.studentName},
                {"deviceId", n.deviceId},
                {"deviceName", d ? d->name : std::string()},
                {"hour", n.hour},
                {"hourText", Clock::formatHour(n.hour)},
                {"holdUntil", granted ? hourOrNull(n.holdUntil) : json(nullptr)},
                {"holdUntilText", granted ? hourTextOrNull(n.holdUntil) : json(nullptr)},
                {"message", n.message}};
}

json holdInfo(const HoldInfo& h) {
    return json{{"deviceId", h.deviceId},
                {"deviceName", h.deviceName},
                {"studentId", h.studentId},
                {"studentName", h.studentName},
                {"holdUntil", h.holdUntil},
                {"holdUntilText", Clock::formatHour(h.holdUntil)},
                {"hoursLeft", h.hoursLeft},
                {"missCount", h.missCount}};
}

json stats(const LabManager& lab, long long withinHours, int top) {
    LabStats s = lab.getStats();
    // Lưu kết quả vào biến trước khi duyệt (không duyệt trên giá trị tạm).
    DoublyLinkedList<DeviceRank> ranks = lab.topBorrowedDevices(top);
    DoublyLinkedList<HoldInfo> holds = lab.expiringHolds(withinHours);

    json topArr = json::array();
    for (const DeviceRank& r : ranks)
        topArr.push_back(json{{"id", r.deviceId}, {"name", r.name}, {"timesBorrowed", r.timesBorrowed}});
    json holdArr = json::array();
    for (const HoldInfo& h : holds) holdArr.push_back(holdInfo(h));

    return json{{"clock", clock(lab.now())},
                {"deviceCount", s.deviceCount},
                {"totalUnits", s.totalUnits},
                {"available", s.available},
                {"borrowed", s.borrowed},
                {"onHold", s.onHold},
                {"maintenance", s.maintenance},
                {"maintenanceDevices", s.maintenanceDevices},
                {"openRecords", s.openRecords},
                {"overdueRecords", s.overdueRecords},
                {"pendingFines", s.pendingFines},
                {"waitingPeople", s.waitingPeople},
                {"holdingPeople", s.holdingPeople},
                {"topBorrowed", topArr},
                {"expiringHolds", holdArr}};
}

json graph(const LabManager& lab) {
    json nodes = json::array();
    lab.forEachDevice([&nodes](const Device& d) {
        nodes.push_back(json{{"id", d.id},
                             {"name", d.name},
                             {"status", statusString(d.status())},
                             {"timesBorrowed", d.timesBorrowed}});
    });
    json edges = json::array();
    lab.graph().forEachEdge([&edges](const std::string& a, const std::string& b, int w) {
        edges.push_back(json{{"from", a}, {"to", b}, {"weight", w}});
    });
    return json{{"nodes", nodes}, {"edges", edges}};
}

json error(const std::string& code, const std::string& message, const json& details) {
    json e{{"code", code}, {"message", message}};
    if (!details.is_null() && !details.empty()) e["details"] = details;
    return json{{"error", e}};
}

} // namespace JsonMapper
