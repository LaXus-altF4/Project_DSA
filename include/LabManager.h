#ifndef LAB_MANAGER_H
#define LAB_MANAGER_H

#include <functional>
#include <string>
#include <utility>
#include "Clock.h"
#include "DoublyLinkedList.h"
#include "Graph.h"
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
    Graph graph_;                          // đồ thị mượn kèm: đỉnh = thiết bị, trọng số = số phiếu chứa cả hai

    Device* findDeviceMutable(const std::string& id); // O(n)
    static bool isValidText(const std::string& s);    // không rỗng, không có , | \n \r (M5). O(len)
    void notify(NotificationType type, const Reservation& r, const std::string& deviceId,
                long long hour, const std::string& message); // O(1)
    // Cấp giữ hàng cho những người chưa được giữ đứng đầu, tới khi hết đơn vị available hoặc hết người.
    // Hạn nhận = atHour + 24 (atHour là thời điểm đơn vị rảnh, M15). O(q)
    void serveQueue(Device& d, long long atHour);
    void debugCheck() const;                         // assert(checkInvariants()) ở chế độ debug
    void commit();                                   // debugCheck() rồi gọi onChange_ (cuối mỗi thao tác thành công)
    std::function<void()> onChange_;                 // listener tự lưu, có thể rỗng

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

    // M4: xoá thiết bị cùng đỉnh và các cạnh trong đồ thị. Bị chặn (DeviceInUse) nếu còn phiếu đang mở
    // chứa thiết bị hoặc còn người trong hàng đợi — khi đó chỉ được chuyển sang Bảo trì.
    // Phiếu lịch sử giữ nguyên mã thiết bị. O(n + m·k + V·d)
    OpResult removeDevice(const std::string& id);

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

    // ---------------- Gợi ý mượn kèm (giai đoạn 4) ----------------
    // Top k thiết bị thường mượn kèm id (M17): trọng số giảm, hoà thì mã tăng; bỏ qua thiết bị đang
    // Bảo trì (lấy láng giềng kế tiếp), thiết bị hết hàng vẫn hiện (Companion::outOfStock). Mã lạ → rỗng.
    // O(V + k·d·n)
    DoublyLinkedList<Companion> suggestCompanions(const std::string& id, int k = 3) const;

    // Toàn bộ láng giềng của id theo thứ tự trên, gồm cả thiết bị bảo trì (kèm trạng thái). O(V + d² + d·n)
    DoublyLinkedList<Companion> allCompanions(const std::string& id) const;

    // Gợi ý cho cả giỏ (lúc đang lập phiếu, chưa tạo phiếu nên đồ thị chưa bị cộng): với mọi thiết bị trong
    // selected, gộp láng giềng trong đồ thị, CỘNG trọng số của cùng một thiết bị qua các món trong giỏ.
    // Bỏ thiết bị đã có trong giỏ (mã trùng trong giỏ chỉ tính một lần, mã lạ bị bỏ qua) và thiết bị đang
    // Bảo trì; thiết bị hết hàng vẫn hiện (Companion::outOfStock, M17). Mỗi thiết bị xuất hiện đúng một lần.
    // Lấy tối đa k, điểm giảm dần, hoà thì mã tăng. Companion::weight = tổng điểm.
    // Không đổi đồ thị. O(s² + s·(V + d·(n + c + s)) + k·c), s = số món trong giỏ, d = bậc, c = số ứng viên
    DoublyLinkedList<Companion> suggestForBasket(const DoublyLinkedList<std::string>& selected, int k = 3) const;

    // Số lần hai thiết bị được mượn cùng phiếu; 0 nếu chưa bao giờ. O(V + d)
    int coBorrowCount(const std::string& a, const std::string& b) const { return graph_.weight(a, b); }

    const Graph& graph() const { return graph_; } // chỉ đọc, để giao diện duyệt đồ thị

    // ---------------- Tự lưu ----------------
    // Đăng ký hàm được gọi sau mỗi thao tác làm thay đổi dữ liệu và thành công (console dùng để tự lưu CSV).
    // Các hàm restore* bên dưới không gọi listener. O(1)
    void setChangeListener(std::function<void()> listener) { onChange_ = std::move(listener); }

    // ---------------- Khôi phục dữ liệu (chỉ Storage dùng khi nạp dữ liệu) ----------------
    // Mỗi hàm tự kiểm tra tính hợp lệ, trả lỗi (không đổi dữ liệu) nếu dòng CSV mâu thuẫn.
    // Chỉ Storage dùng khi nạp dữ liệu: thứ tự gọi restoreMeta → restoreDevice → restoreRecord →
    // restoreReservation → finishRestore. Không gọi ở chỗ khác.

    // Chỉ Storage dùng khi nạp dữ liệu. 0 <= maintenance <= total. O(n)
    OpResult restoreDevice(const std::string& id, const std::string& name, int total, int maintenance);

    // Chỉ Storage dùng khi nạp dữ liệu. Phiếu mở cần còn đơn vị available cho từng thiết bị còn tồn tại;
    // mã thiết bị đã xoá thì bỏ qua khi cập nhật số lượng/đồ thị (M4). O(m + k·n + k²·(V + d))
    OpResult restoreRecord(const BorrowRecord& record);

    // Chỉ Storage dùng khi nạp dữ liệu. Người đang giữ phải đứng liền ở đầu hàng. O(n + q)
    OpResult restoreReservation(const std::string& deviceId, const Reservation& r);

    // Chỉ Storage dùng khi nạp dữ liệu. Đặt giờ hiện tại và bộ đếm mã phiếu. O(1)
    void restoreMeta(long long nowHour, int nextRecordNo);

    // Chỉ Storage dùng khi nạp dữ liệu. Phục vụ hàng đợi còn đơn vị rảnh, xử lý lượt giữ đã hết hạn,
    // rồi trả về checkInvariants(). O(n·q)
    bool finishRestore();

    int nextRecordNo() const { return nextRecordNo_; } // để Storage ghi meta.csv. O(1)

    // ---------------- Bất biến ----------------
    // Kiểm tra: cấu trúc DSLK, mã thiết bị không trùng và tăng dần, available+borrowed+onHold+maintenance==total,
    // borrowed == số phiếu đang mở chứa thiết bị, phiếu hợp lệ; hàng đợi: onHold == số người đang giữ,
    // người giữ là đoạn đầu hàng với hạn không giảm, missCount < 2, không trùng sinh viên,
    // còn người chưa giữ thì available == 0. O(n·(m·k + q²)) — chỉ dùng debug/test
    bool checkInvariants() const;
};

#endif // LAB_MANAGER_H
