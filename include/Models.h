#ifndef MODELS_H
#define MODELS_H

#include <string>
#include "DoublyLinkedList.h"
#include "LinkedQueue.h"

// Hằng nghiệp vụ (xem AGENTS.md mục 3).
const long long FINE_PER_DAY = 36000LL; // đồng / ngày quá hạn / thiết bị
const int MIN_BORROW_DAYS = 1;          // M9
const int MAX_BORROW_DAYS = 30;         // M9
const int HOLD_HOURS = 24;              // thời hạn đến nhận khi được giữ hàng
const int MAX_MISSES = 2;               // lỡ hạn lần thứ 2 thì bị loại khỏi hàng

enum class DeviceStatus { Available, Borrowed, Maintenance };

// Một người trong hàng đợi đặt trước của một thiết bị.
struct Reservation {
    std::string studentId;
    std::string studentName;
    long long enqueueHour = 0;
    long long holdUntil = -1; // -1 = chưa được giữ; >= 0 = đang giữ, hạn nhận (giờ)
    int missCount = 0;        // số lần lỡ hạn (0 hoặc 1; đạt MAX_MISSES thì bị loại)

    bool isHolding() const { return holdUntil >= 0; }
};

// Một dòng trong danh mục thiết bị.
// Bất biến: available + borrowed + onHold + maintenance == total.
struct Device {
    std::string id;
    std::string name;
    int total = 0;
    int available = 0;
    int borrowed = 0;
    int onHold = 0; // số đơn vị đang giữ cho hàng đợi (= số người đang giữ)
    int maintenance = 0;
    int timesBorrowed = 0;
    LinkedQueue<Reservation> queue; // hàng đợi đặt trước; người đang giữ luôn là đoạn đầu hàng (M11)

    // Trạng thái suy ra từ số lượng (M1). O(1)
    DeviceStatus status() const {
        if (maintenance == total) return DeviceStatus::Maintenance;
        if (available > 0) return DeviceStatus::Available;
        return DeviceStatus::Borrowed;
    }
};

// Một phiếu mượn: nhiều thiết bị (mỗi loại 1 đơn vị, M7), trả cả phiếu một lần (M8).
struct BorrowRecord {
    std::string recordId;
    std::string studentId;
    std::string studentName;
    DoublyLinkedList<std::string> deviceIds;
    long long borrowHour = 0;
    long long dueHour = 0;
    long long returnHour = -1; // -1 = chưa trả
    int lateDays = 0;          // chốt lúc trả
    long long fine = 0;        // chốt lúc trả (đồng)

    bool isOpen() const { return returnHour < 0; }
};

enum class ErrorCode {
    Ok,
    InvalidInput,    // mã/tên rỗng hoặc có ký tự cấm, số lượng/số ngày sai
    DuplicateDevice, // mã thiết bị đã có / trùng trong phiếu
    DeviceNotFound,
    OutOfStock,      // hết hàng hoặc đang bảo trì
    RecordNotFound,
    AlreadyReturned,
    AlreadyQueued,    // sinh viên đã đứng trong hàng đợi của thiết bị này (M12)
    NotInQueue,       // sinh viên không có trong hàng đợi
    NotHolding,       // đang trong hàng nhưng chưa được giữ hàng nên chưa nhận được
    CanBorrowDirectly, // còn hàng sẵn sàng: phải mượn trực tiếp, không đặt trước (M12)
    DeviceInUse        // không xoá được: còn phiếu đang mở hoặc còn người trong hàng đợi (M4)
};

// Sự kiện lõi đẩy ra cho console/web tự hiển thị.
enum class NotificationType {
    HoldGranted, // được giữ hàng, có 24h đến nhận
    Missed,      // lỡ hạn, bị đẩy xuống cuối hàng
    Removed      // lỡ hạn lần 2, bị loại khỏi hàng
};

struct Notification {
    NotificationType type = NotificationType::HoldGranted;
    std::string studentId;
    std::string studentName;
    std::string deviceId;
    long long hour = 0;       // thời điểm sự kiện xảy ra (giờ giả lập)
    long long holdUntil = -1; // hạn nhận (chỉ có nghĩa với HoldGranted)
    std::string message;
};

struct OpResult {
    ErrorCode code = ErrorCode::Ok;
    std::string message;
    bool ok() const { return code == ErrorCode::Ok; }
};

struct BorrowResult : OpResult {
    std::string recordId;
    long long dueHour = 0;
    // Khi code == OutOfStock: mã các thiết bị không còn đơn vị sẵn sàng (hết hàng hoặc đang bảo trì),
    // để giao diện mời đăng ký hàng đợi đúng món (M6).
    DoublyLinkedList<std::string> unavailableIds;
};

struct ReturnResult : OpResult {
    int lateDays = 0;
    long long fine = 0;
};

// Một thiết bị gợi ý mượn kèm (kết quả của suggestCompanions / allCompanions).
struct Companion {
    std::string deviceId;
    std::string name;
    int weight = 0; // số lần mượn cùng phiếu
    DeviceStatus status = DeviceStatus::Available;
    int available = 0;

    // Hết hàng: không còn đơn vị sẵn sàng nhưng không phải đang bảo trì toàn bộ.
    bool outOfStock() const { return status == DeviceStatus::Borrowed; }
};

// Số ngày quá hạn và tiền phạt tạm tính của một phiếu (M19).
struct OverdueInfo {
    int lateDays = 0;
    long long fine = 0;
};

// Số phiếu theo trạng thái (tab màn hình Quá hạn & lịch sử).
// open = mọi phiếu chưa trả (GỒM quá hạn); overdue ⊂ open; returned = đã trả; all = open + returned.
struct RecordCounts {
    int all = 0;
    int open = 0;
    int overdue = 0;
    int returned = 0;
};

// Số liệu tổng quan (màn hình Tổng quan). Mọi con số tính theo đồng hồ giả lập hiện tại.
struct LabStats {
    int deviceCount = 0;        // số loại thiết bị
    int totalUnits = 0;         // tổng số đơn vị
    int available = 0;          // tổng đơn vị sẵn sàng
    int borrowed = 0;           // tổng đơn vị đang mượn
    int onHold = 0;             // tổng đơn vị đang giữ cho hàng đợi
    int maintenance = 0;        // tổng đơn vị bảo trì
    int maintenanceDevices = 0; // số thiết bị có trạng thái Bảo trì (M1)
    int openRecords = 0;        // phiếu đang mở
    int overdueRecords = 0;     // phiếu đang mở đã quá hạn (M19)
    int waitingPeople = 0;      // tổng số người trong mọi hàng đợi
    int holdingPeople = 0;      // số người đang được giữ hàng
    long long pendingFines = 0; // tổng tiền phạt tạm tính của phiếu đang quá hạn (đồng)
};

// Một thiết bị trong bảng xếp hạng mượn nhiều nhất.
struct DeviceRank {
    std::string deviceId;
    std::string name;
    int timesBorrowed = 0;
};

// Một người đang được giữ hàng, kèm thời gian còn lại để đến nhận.
struct HoldInfo {
    std::string deviceId;
    std::string deviceName;
    std::string studentId;
    std::string studentName;
    long long holdUntil = 0;
    long long hoursLeft = 0; // holdUntil - now (> 0 vì lượt giữ hết hạn đã được xử lý)
    int missCount = 0;
};

#endif // MODELS_H
