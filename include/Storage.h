#ifndef STORAGE_H
#define STORAGE_H

#include <string>
#include "DoublyLinkedList.h"
#include "LabManager.h"
#include "Models.h"

// Kết quả nạp dữ liệu: số dòng đã nạp, số dòng bị bỏ qua và các cảnh báo (file thiếu, dòng lỗi...).
struct LoadReport {
    int devices = 0;
    int records = 0;
    int reservations = 0;
    int skippedLines = 0;
    int missingFiles = 0;       // số file (trong 4 file) không mở được
    bool invariantsOk = true;   // checkInvariants() sau khi nạp xong
    DoublyLinkedList<std::string> warnings; // mỗi cảnh báo một dòng, dạng "file:dòng — lý do"
};

// Đọc/ghi 4 file CSV trong thư mục dir: devices.csv, borrow_records.csv, reservations.csv, meta.csv.
// Dòng đầu mỗi file là tiêu đề; cột ngăn bằng ','; danh sách mã thiết bị trong phiếu ngăn bằng '|'.
// Nhờ M5 (mã/tên không chứa , | xuống dòng) nên không cần quoting.
// Chỉ lưu dữ liệu gốc; available/borrowed/onHold, timesBorrowed và đồ thị mượn kèm được dựng lại khi nạp.
class Storage {
public:
    // Nạp vào lab (nên là LabManager mới, còn trống). File thiếu hoặc dòng lỗi: ghi cảnh báo rồi bỏ qua,
    // không bao giờ crash. Thứ tự: meta → devices → records → reservations → finishRestore.
    // O(tổng số dòng · chi phí restore*)
    static LoadReport load(const std::string& dir, LabManager& lab);

    // Ghi cả 4 file: mỗi file ghi ra "<tên>.tmp" rồi mới đổi tên thay file thật. O(n + m·k + tổng hàng đợi)
    static OpResult save(const std::string& dir, const LabManager& lab);

    // true nếu trong dir có ít nhất một trong 4 file. O(1)
    static bool hasAnyData(const std::string& dir);
};

#endif // STORAGE_H
