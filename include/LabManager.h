#ifndef LAB_MANAGER_H
#define LAB_MANAGER_H

#include <string>
#include "Clock.h"
#include "DoublyLinkedList.h"
#include "LinkedQueue.h"
#include "Models.h"

// Lớp nghiệp vụ trung tâm (giai đoạn 2–3: thiết bị, mượn/trả, quá hạn, hàng đợi đặt trước).
// Lõi không I/O: mọi hàm nhận tham số và trả kết quả có cấu trúc.
// Ký hiệu Big-O: n = số thiết bị, m = số phiếu, k = số thiết bị trong một phiếu.
class LabManager {
private:
    Clock clock_;
    DoublyLinkedList<Device> devices_;     // sắp theo mã tăng dần (insertSorted)
    DoublyLinkedList<BorrowRecord> records_; // theo thứ tự tạo phiếu
    int nextRecordNo_;                     // bộ đếm mã phiếu (PM0001, PM0002, ...)
    LinkedQueue<Notification> notifications_; // sự kiện chờ giao diện lấy ra

    Device* findDeviceMutable(const std::string& id); // O(n)
    static bool isValidText(const std::string& s);    // không rỗng, không có , | \n \r (M5). O(len)
    void notify(NotificationType type, const Reservation& r, const std::string& deviceId,
                long long hour, const std::string& message); // O(1)
    // Cấp giữ hàng cho những người chưa được giữ đứng đầu, tới khi hết đơn vị available hoặc hết người.
    // Hạn nhận = atHour + 24 (atHour là thời điểm đơn vị rảnh, M15). O(q)
    void serveQueue(Device& d, long long atHour);
    void debugCheck() const;                         // assert(checkInvariants()) ở chế độ debug

public:
    LabManager();

    // ---------------- Thiết bị ----------------
    // Thêm thiết bị mới, tất cả đơn vị ở trạng thái available. O(n)
    OpResult addDevice(const std::string& id, const std::string& name, int total);

    // M2: chuyển qty đơn vị từ available sang bảo trì. O(n)
    OpResult sendToMaintenance(const std::string& id, int qty);

    // M2: trả qty đơn vị từ bảo trì về available. O(n)
    OpResult finishMaintenance(const std::string& id, int qty);

    // M3: đổi tên và/hoặc tổng số. Chỉ cho newTotal >= borrowed + onHold + maintenance;
    // phần chênh lệch cộng/trừ vào available, tăng total thì phục vụ hàng đợi. O(n + q)
    OpResult updateDevice(const std::string& id, const std::string& newName, int newTotal);

    const Device* findDevice(const std::string& id) const; // nullptr nếu không có. O(n)
    int deviceCount() const { return devices_.size(); }     // O(1)

    // Gọi fn(const Device&) theo thứ tự mã tăng dần. O(n)
    template <class Fn>
    void forEachDevice(Fn fn) const { devices_.forEach(fn); }

    // ---------------- Mượn / trả ----------------
    // Tạo phiếu nguyên tử (M6): có món nào lỗi thì cả phiếu thất bại, không đổi dữ liệu.
    // days hợp lệ 1–30 (M9); mỗi mã tối đa 1 đơn vị, không trùng (M7). O(k·n + k²)
    BorrowResult borrowDevices(const std::string& studentId, const std::string& studentName,
                               const DoublyLinkedList<std::string>& deviceIds, int days);

    // Trả cả phiếu (M8): ghi ngày trả, chốt số ngày quá hạn và tiền phạt. O(m + k·n)
    ReturnResult returnRecord(const std::string& recordId);

    const BorrowRecord* findRecord(const std::string& recordId) const; // O(m)
    int recordCount() const { return records_.size(); }                 // O(1)

    // Gọi fn(const BorrowRecord&) theo thứ tự tạo phiếu. O(m)
    template <class Fn>
    void forEachRecord(Fn fn) const { records_.forEach(fn); }

    // ---------------- Hàng đợi đặt trước (giai đoạn 3) ----------------
    // Đặt trước: chỉ khi available == 0 (M12), mỗi sinh viên tối đa 1 lần trong một hàng. O(n + q)
    OpResult reserveDevice(const std::string& studentId, const std::string& studentName,
                           const std::string& deviceId);

    // Nhận thiết bị đang giữ (M13): tạo phiếu 1 thiết bị, days 1–30. Phải đang được giữ. O(n + q)
    BorrowResult claimReservation(const std::string& studentId, const std::string& deviceId, int days);

    // Huỷ đăng ký (M16); đang giữ thì chuyển quyền cho người kế. O(n + q)
    OpResult cancelReservation(const std::string& studentId, const std::string& deviceId);

    // Xử lý mọi lượt giữ hết hạn (holdUntil <= now), dây chuyền theo M15. Gọi tự động từ advanceTime(). O(n·q)
    void expireReservations();

    // Gọi fn(const Reservation&) từ đầu đến cuối hàng của thiết bị. false nếu không có thiết bị. O(n + q)
    template <class Fn>
    bool forEachReservation(const std::string& deviceId, Fn fn) const {
        const Device* d = findDevice(deviceId);
        if (d == nullptr) return false;
        d->queue.forEach(fn);
        return true;
    }

    // Lấy một thông báo ra khỏi hàng thông báo (FIFO). false nếu rỗng. O(1)
    bool popNotification(Notification* out) { return notifications_.dequeue(out); }
    int notificationCount() const { return notifications_.size(); } // O(1)

    // ---------------- Quá hạn ----------------
    // Số ngày quá hạn: 0 nếu at <= due, ngược lại làm tròn lên (trễ chưa tròn ngày tính 1 ngày). O(1)
    static int overdueDays(long long dueHour, long long atHour);

    // Tiền phạt = số ngày × số thiết bị × 36.000đ (mỗi thiết bị tính riêng). O(1)
    static long long calcFine(int lateDays, int deviceCount);

    // Phiếu đã trả: giá trị đã chốt. Phiếu đang mở: tạm tính theo đồng hồ hiện tại (M19). O(k)
    OverdueInfo previewOverdue(const BorrowRecord& record) const;

    // ---------------- Thời gian ----------------
    long long now() const { return clock_.now(); } // O(1)
    bool advanceTime(long long hours);             // tua +hours giờ rồi expireReservations(); false nếu hours <= 0

    // ---------------- Bất biến ----------------
    // Kiểm tra: cấu trúc DSLK, mã thiết bị không trùng và tăng dần, available+borrowed+onHold+maintenance==total,
    // borrowed == số phiếu đang mở chứa thiết bị, phiếu hợp lệ; hàng đợi: onHold == số người đang giữ,
    // người giữ là đoạn đầu hàng với hạn không giảm, missCount < 2, không trùng sinh viên,
    // còn người chưa giữ thì available == 0. O(n·(m·k + q²)) — chỉ dùng debug/test
    bool checkInvariants() const;
};

#endif // LAB_MANAGER_H
