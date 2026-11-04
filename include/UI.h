#ifndef UI_H
#define UI_H

#include <functional>
#include <string>
#include "LabManager.h"

// Giao diện console tiếng Việt (menu, bảng căn cột, màu ANSI). Không chứa nghiệp vụ: chỉ gọi LabManager.
// Màu trạng thái: xanh = Sẵn sàng, vàng = Đang mượn, đỏ = Bảo trì.
// Mọi lệnh nhập đọc bằng getline: nhập chữ thay số, dòng trống, số ngoài khoảng đều không làm treo/crash
// (hỏi lại tối đa 3 lần rồi huỷ thao tác; hết dữ liệu nhập (EOF) thì lưu và thoát).
class UI {
public:
    // saveNow: hàm lưu dữ liệu (gọi khi "Lưu & thoát" hoặc khi hết dữ liệu nhập). Dữ liệu còn được tự lưu
    // sau mỗi thao tác qua LabManager::setChangeListener do main đăng ký.
    UI(LabManager& lab, std::function<void()> saveNow);

    // Vòng lặp menu chính; trả về khi người dùng chọn 0 hoặc hết dữ liệu nhập.
    void run();

private:
    LabManager& lab_;
    std::function<void()> saveNow_;
    bool eof_;

    // --- nhập liệu an toàn ---
    bool readLine(const std::string& prompt, std::string* out); // false khi EOF
    bool readRequired(const std::string& prompt, std::string* out); // false khi EOF hoặc để trống (= huỷ)
    bool readInt(const std::string& prompt, int minV, int maxV, int* out, bool hasDefault = false, int def = 0);
    bool askYesNo(const std::string& prompt);
    bool resolveDeviceId(const std::string& typed, std::string* id) const; // khớp mã không phân biệt hoa thường

    // --- hiển thị ---
    void printHeader() const;
    void printMenu() const;
    int printDeviceTable(const std::string& filter = "") const; // trả về số dòng đã in; filter: chuỗi con trong mã/tên
    void printRecordRow(const BorrowRecord& r) const;
    void printRecordTableHeader() const;
    void printQueueTable(const Device& d) const;
    void printCompanions(const DoublyLinkedList<Companion>& list) const;
    void printResult(const OpResult& r) const;
    void drainNotifications();
    std::string deviceListText(const BorrowRecord& r) const;
    void printBasket(const DoublyLinkedList<std::string>& basket) const; // các món trong phiếu đang lập
    bool addCodes(const std::string& line, DoublyLinkedList<std::string>* basket); // thêm mã (false nếu có mã lạ)

    // --- chức năng ---
    void actionAddDevice();
    void actionEditDevice();
    void actionMaintenance();
    void actionRemoveDevice();
    void actionBorrow();
    void actionReturn();
    void actionQueue();
    void actionSearch();
    void actionCompanions();
    void actionOverdue();
    void actionAdvanceTime();
};

#endif // UI_H
