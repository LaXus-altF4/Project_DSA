#include "UI.h"

#include <cstdio>
#include <iomanip>
#include <iostream>

#ifdef _WIN32
#include <io.h>
#define LAB_ISATTY(fd) _isatty(fd)
#define LAB_FILENO(f) _fileno(f)
#else
#include <unistd.h>
#define LAB_ISATTY(fd) isatty(fd)
#define LAB_FILENO(f) fileno(f)
#endif

namespace {

const char* RESET = "\x1b[0m";
const char* BOLD = "\x1b[1m";
const char* GREEN = "\x1b[32m";  // Sẵn sàng
const char* YELLOW = "\x1b[33m"; // Đang mượn
const char* RED = "\x1b[31m";    // Bảo trì / quá hạn / lỗi
const char* CYAN = "\x1b[36m";

std::string trim(const std::string& s) {
    size_t b = 0, e = s.size();
    while (b < e && (s[b] == ' ' || s[b] == '\t' || s[b] == '\r' || s[b] == '\n')) ++b;
    while (e > b && (s[e - 1] == ' ' || s[e - 1] == '\t' || s[e - 1] == '\r' || s[e - 1] == '\n')) --e;
    return s.substr(b, e - b);
}

std::string lowerAscii(std::string s) {
    for (char& c : s)
        if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
    return s;
}

std::string upperAscii(std::string s) {
    for (char& c : s)
        if (c >= 'a' && c <= 'z') c = static_cast<char>(c - 'a' + 'A');
    return s;
}

bool containsIgnoreCase(const std::string& text, const std::string& key) {
    return lowerAscii(text).find(lowerAscii(key)) != std::string::npos;
}

// Số code point UTF-8 (setw đếm byte nên chữ có dấu bị lệch cột). O(len)
int cpCount(const std::string& s) {
    int n = 0;
    for (char c : s)
        if ((static_cast<unsigned char>(c) & 0xC0) != 0x80) ++n;
    return n;
}

// Canh trái theo code point; quá dài thì cắt và thêm "…". width >= 1. O(len)
std::string padRight(const std::string& s, int width) {
    int cps = cpCount(s);
    if (cps <= width) return s + std::string(static_cast<size_t>(width - cps), ' ');
    std::string out;
    int n = 0;
    for (size_t i = 0; i < s.size() && n < width - 1;) {
        size_t j = i + 1;
        while (j < s.size() && (static_cast<unsigned char>(s[j]) & 0xC0) == 0x80) ++j;
        out += s.substr(i, j - i);
        ++n;
        i = j;
    }
    return out + "…";
}

std::string padLeft(const std::string& s, int width) {
    int cps = cpCount(s);
    return (cps >= width ? std::string() : std::string(static_cast<size_t>(width - cps), ' ')) + s;
}

// 216000 -> "216.000đ"
std::string formatMoney(long long v) {
    std::string digits = std::to_string(v < 0 ? -v : v), out;
    int cnt = 0;
    for (size_t i = digits.size(); i > 0; --i) {
        if (cnt > 0 && cnt % 3 == 0) out = "." + out;
        out = digits[i - 1] + out;
        ++cnt;
    }
    return (v < 0 ? "-" : "") + out + "đ";
}

// Chỉ nhận [-]chữ số, tối đa 9 chữ số (tránh tràn). Không ném ngoại lệ. O(len)
bool parseInt(const std::string& s, int* out) {
    size_t i = 0;
    bool neg = false;
    if (i < s.size() && s[i] == '-') { neg = true; ++i; }
    if (i >= s.size() || s.size() - i > 9) return false;
    int v = 0;
    for (; i < s.size(); ++i) {
        if (s[i] < '0' || s[i] > '9') return false;
        v = v * 10 + (s[i] - '0');
    }
    *out = neg ? -v : v;
    return true;
}

const char* statusText(DeviceStatus st) {
    switch (st) {
        case DeviceStatus::Available: return "Sẵn sàng";
        case DeviceStatus::Borrowed: return "Đang mượn";
        case DeviceStatus::Maintenance: return "Bảo trì";
    }
    return "";
}

const char* statusColor(DeviceStatus st) {
    switch (st) {
        case DeviceStatus::Available: return GREEN;
        case DeviceStatus::Borrowed: return YELLOW;
        case DeviceStatus::Maintenance: return RED;
    }
    return RESET;
}

std::string colored(const char* color, const std::string& text) { return std::string(color) + text + RESET; }

std::string dateText(long long hour) { return Clock::formatHour(hour); }

bool stdinIsTty() { return LAB_ISATTY(LAB_FILENO(stdin)) != 0; }

} // namespace

UI::UI(LabManager& lab, std::function<void()> saveNow) : lab_(lab), saveNow_(std::move(saveNow)), eof_(false) {}

// ============================ Nhập liệu an toàn ============================

bool UI::readLine(const std::string& prompt, std::string* out) {
    std::cout << prompt << std::flush;
    std::string line;
    if (!std::getline(std::cin, line)) { // EOF hoặc lỗi luồng: không lặp vô hạn
        eof_ = true;
        std::cout << "\n";
        return false;
    }
    *out = trim(line);
    if (!stdinIsTty()) std::cout << *out << "\n"; // chạy từ file/pipe: in lại dòng nhập để đọc được log
    return true;
}

bool UI::readRequired(const std::string& prompt, std::string* out) {
    if (!readLine(prompt, out)) return false;
    if (out->empty()) {
        std::cout << "Đã huỷ (để trống).\n";
        return false;
    }
    return true;
}

// Hỏi lại tối đa 3 lần khi nhập sai (chữ, tràn số, ngoài khoảng). Dòng trống: lấy mặc định hoặc huỷ.
bool UI::readInt(const std::string& prompt, int minV, int maxV, int* out, bool hasDefault, int def) {
    for (int attempt = 0; attempt < 3; ++attempt) {
        std::string line;
        if (!readLine(prompt, &line)) return false;
        if (line.empty()) {
            if (hasDefault) {
                *out = def;
                return true;
            }
            std::cout << "Đã huỷ (để trống).\n";
            return false;
        }
        int v = 0;
        if (!parseInt(line, &v) || v < minV || v > maxV) {
            std::cout << colored(RED, "Giá trị không hợp lệ") << ": cần một số nguyên từ " << minV << " đến " << maxV
                      << ".\n";
            continue;
        }
        *out = v;
        return true;
    }
    std::cout << colored(RED, "Nhập sai quá 3 lần, huỷ thao tác.") << "\n";
    return false;
}

bool UI::askYesNo(const std::string& prompt) {
    std::string line;
    if (!readLine(prompt + " (c/k): ", &line)) return false;
    line = lowerAscii(line);
    return line == "c" || line == "co" || line == "có" || line == "y" || line == "yes";
}

bool UI::resolveDeviceId(const std::string& typed, std::string* id) const {
    std::string key = lowerAscii(typed);
    bool found = false;
    lab_.forEachDevice([&](const Device& d) {
        if (!found && lowerAscii(d.id) == key) {
            *id = d.id;
            found = true;
        }
    });
    return found;
}

// ============================ Hiển thị ============================

void UI::printHeader() const {
    int open = 0;
    lab_.forEachRecord([&](const BorrowRecord& r) {
        if (r.isOpen()) ++open;
    });
    std::cout << "\n" << CYAN << BOLD << "══════ QUẢN LÝ MƯỢN TRẢ THIẾT BỊ LAB ══════" << RESET << "\n";
    std::cout << "Đồng hồ giả lập: " << BOLD << dateText(lab_.now()) << RESET << " | " << lab_.deviceCount()
              << " thiết bị | " << open << " phiếu đang mở\n";
}

void UI::printMenu() const {
    std::cout << " 1. Xem danh sách thiết bị        7. Trả thiết bị\n"
                 " 2. Thêm thiết bị                 8. Hàng đợi đặt trước\n"
                 " 3. Sửa thiết bị                  9. Tìm kiếm / lịch sử phiếu\n"
                 " 4. Bảo trì thiết bị             10. Gợi ý thiết bị mượn kèm\n"
                 " 5. Xoá thiết bị                 11. Danh sách quá hạn\n"
                 " 6. Mượn thiết bị                12. Tua thời gian\n"
                 " 0. Lưu & thoát\n";
}

int UI::printDeviceTable(const std::string& filter) const {
    int rows = 0;
    // Tiêu đề có dấu nên canh bằng padLeft/padRight (đếm code point); cột số bên dưới dùng setw.
    std::cout << BOLD << padRight("Mã", 7) << ' ' << padRight("Tên thiết bị", 30) << ' ' << padLeft("Tổng", 5) << ' '
              << padLeft("Sẵn", 5) << ' ' << padLeft("Mượn", 5) << ' ' << padLeft("Giữ", 5) << ' '
              << padLeft("BTrì", 5) << ' ' << padLeft("Chờ", 5) << ' ' << padRight("Trạng thái", 10) << RESET << "\n";
    lab_.forEachDevice([&](const Device& d) {
        if (!filter.empty() && !containsIgnoreCase(d.id, filter) && !containsIgnoreCase(d.name, filter)) return;
        ++rows;
        std::cout << padRight(d.id, 7) << ' ' << padRight(d.name, 30) << ' ' << std::setw(5) << d.total << ' '
                  << std::setw(5) << d.available << ' ' << std::setw(5) << d.borrowed << ' ' << std::setw(5)
                  << d.onHold << ' ' << std::setw(5) << d.maintenance << ' ' << std::setw(5) << d.queue.size() << ' '
                  << colored(statusColor(d.status()), padRight(statusText(d.status()), 10)) << "\n";
    });
    if (rows == 0) std::cout << "(Không có thiết bị nào" << (filter.empty() ? "" : " khớp \"" + filter + "\"") << ")\n";
    return rows;
}

std::string UI::deviceListText(const BorrowRecord& r) const {
    std::string text;
    for (const std::string& id : r.deviceIds) {
        if (!text.empty()) text += ", ";
        text += id;
        if (lab_.findDevice(id) == nullptr) text += "(đã xoá)";
    }
    return text;
}

void UI::printRecordTableHeader() const {
    std::cout << BOLD << padRight("Mã phiếu", 8) << ' ' << padRight("MSSV", 9) << ' ' << padRight("Họ tên", 17) << ' '
              << padRight("Thiết bị", 30) << ' ' << padRight("Mượn lúc", 16) << ' ' << padRight("Hẹn trả", 16) << ' '
              << padRight("Trạng thái", 25) << ' ' << padLeft("Tiền phạt", 11) << RESET << "\n";
}

void UI::printRecordRow(const BorrowRecord& r) const {
    OverdueInfo info = lab_.previewOverdue(r);
    std::string status;
    const char* color = GREEN;
    if (r.isOpen()) {
        if (info.lateDays > 0) {
            status = "Quá hạn " + std::to_string(info.lateDays) + " ngày";
            color = RED;
        } else {
            status = "Đang mượn";
            color = YELLOW;
        }
    } else {
        status = "Đã trả" + (r.lateDays > 0 ? " (trễ " + std::to_string(r.lateDays) + " ngày)" : std::string());
        color = r.lateDays > 0 ? RED : GREEN;
    }
    std::string fine = info.fine > 0 ? formatMoney(info.fine) : "-";
    std::cout << padRight(r.recordId, 8) << ' ' << padRight(r.studentId, 9) << ' ' << padRight(r.studentName, 17) << ' '
              << padRight(deviceListText(r), 30) << ' ' << padRight(dateText(r.borrowHour), 16) << ' '
              << padRight(dateText(r.dueHour), 16) << ' ' << colored(color, padRight(status, 25)) << ' '
              << padLeft(fine, 11) << "\n";
}

void UI::printQueueTable(const Device& d) const {
    std::cout << BOLD << padRight("Vị trí", 6) << ' ' << padRight("MSSV", 9) << ' ' << padRight("Họ tên", 18) << ' '
              << padRight("Đăng ký lúc", 16) << ' ' << padRight("Trạng thái", 36) << ' ' << padRight("Lỡ", 3) << RESET
              << "\n";
    int pos = 0;
    lab_.forEachReservation(d.id, [&](const Reservation& q) {
        ++pos;
        std::string status = q.isHolding() ? "Đang giữ, hạn nhận " + dateText(q.holdUntil) : "Đang chờ";
        std::cout << std::setw(6) << pos << ' ' << padRight(q.studentId, 9) << ' ' << padRight(q.studentName, 18) << ' '
                  << padRight(dateText(q.enqueueHour), 16) << ' '
                  << colored(q.isHolding() ? GREEN : YELLOW, padRight(status, 36)) << ' ' << q.missCount << "\n";
    });
}

void UI::printCompanions(const DoublyLinkedList<Companion>& list) const {
    if (list.empty()) {
        std::cout << "(Chưa có dữ liệu mượn kèm)\n";
        return;
    }
    std::cout << BOLD << padRight("Hạng", 5) << ' ' << padRight("Mã", 7) << ' ' << padRight("Tên thiết bị", 30) << ' '
              << padRight("Mượn kèm", 9) << ' ' << padRight("Tình trạng", 16) << RESET << "\n";
    int rank = 0;
    for (const Companion& c : list) {
        std::string state;
        if (c.status == DeviceStatus::Maintenance) state = "Bảo trì";
        else if (c.outOfStock()) state = "Hết hàng";
        else state = "Sẵn sàng (" + std::to_string(c.available) + ")";
        std::cout << std::setw(5) << ++rank << ' ' << padRight(c.deviceId, 7) << ' ' << padRight(c.name, 30) << ' '
                  << std::setw(5) << c.weight << " lần " << colored(statusColor(c.status), padRight(state, 16))
                  << "\n";
    }
}

void UI::printBasket(const DoublyLinkedList<std::string>& basket) const {
    std::cout << "\nPhiếu đang lập gồm: ";
    bool first = true;
    for (const std::string& id : basket) {
        const Device* d = lab_.findDevice(id);
        std::cout << (first ? "" : ", ") << id << (d != nullptr ? " (" + d->name + ")" : std::string());
        first = false;
    }
    std::cout << "\n";
}

// Tách mã theo ',' ';' khoảng trắng, khớp không phân biệt hoa thường, chỉ thêm mã chưa có trong giỏ.
// Trả về false nếu có mã không tồn tại (đã báo); các mã hợp lệ vẫn được thêm. O(len + t·(n + s))
bool UI::addCodes(const std::string& line, DoublyLinkedList<std::string>* basket) {
    bool allKnown = true;
    std::string token;
    std::string text = line + ' '; // dấu kết thúc để đẩy token cuối
    for (char c : text) {
        if (c != ',' && c != ' ' && c != ';' && c != '\t') {
            token += c;
            continue;
        }
        if (token.empty()) continue;
        std::string id;
        if (!resolveDeviceId(token, &id)) {
            std::cout << colored(RED, "✘ Không tìm thấy thiết bị: " + token) << "\n";
            allKnown = false;
        } else if (basket->findFirst([&id](const std::string& b) { return b == id; }) != nullptr) {
            std::cout << "(" << id << " đã có trong phiếu, bỏ qua)\n";
        } else {
            basket->pushBack(id);
        }
        token.clear();
    }
    return allKnown;
}

void UI::printResult(const OpResult& r) const {
    if (r.ok()) std::cout << colored(GREEN, "✔ Thành công.") << "\n";
    else std::cout << colored(RED, "✘ " + r.message) << "\n";
}

void UI::drainNotifications() {
    Notification n;
    bool any = false;
    while (lab_.popNotification(&n)) {
        if (!any) std::cout << "\n" << BOLD << "--- Thông báo ---" << RESET << "\n";
        any = true;
        const char* color = n.type == NotificationType::HoldGranted ? GREEN
                            : n.type == NotificationType::Missed    ? YELLOW
                                                                    : RED;
        std::cout << colored(color, "[" + dateText(n.hour) + "] " + n.message) << "\n";
    }
}

// ============================ Vòng lặp chính ============================

void UI::run() {
    drainNotifications(); // thông báo phát sinh lúc nạp dữ liệu / sinh dữ liệu mẫu
    while (!eof_) {
        printHeader();
        printMenu();
        int choice = -1;
        if (!readInt("Chọn chức năng (0-12): ", 0, 12, &choice, true, -1)) {
            if (eof_) break;
            continue;
        }
        if (choice == 0) break;
        switch (choice) {
            case 1: printDeviceTable(); break;
            case 2: actionAddDevice(); break;
            case 3: actionEditDevice(); break;
            case 4: actionMaintenance(); break;
            case 5: actionRemoveDevice(); break;
            case 6: actionBorrow(); break;
            case 7: actionReturn(); break;
            case 8: actionQueue(); break;
            case 9: actionSearch(); break;
            case 10: actionCompanions(); break;
            case 11: actionOverdue(); break;
            case 12: actionAdvanceTime(); break;
            default: break; // -1: dòng trống, hiện lại menu
        }
        drainNotifications();
    }
    saveNow_();
    std::cout << "\nĐã lưu dữ liệu. Tạm biệt!\n";
}

// ============================ Thiết bị ============================

void UI::actionAddDevice() {
    std::string id, name;
    int total = 0;
    if (!readRequired("Mã thiết bị mới (không chứa , hoặc |): ", &id)) return;
    if (!readRequired("Tên thiết bị: ", &name)) return;
    if (!readInt("Số lượng (1-10000): ", 1, 10000, &total)) return;
    printResult(lab_.addDevice(id, name, total));
}

void UI::actionEditDevice() {
    std::string typed, id;
    if (!readRequired("Mã thiết bị cần sửa: ", &typed)) return;
    if (!resolveDeviceId(typed, &id)) {
        std::cout << colored(RED, "✘ Không tìm thấy thiết bị: " + typed) << "\n";
        return;
    }
    const Device* d = lab_.findDevice(id);
    std::string curName = d->name;
    int curTotal = d->total;
    int minTotal = d->borrowed + d->onHold + d->maintenance;
    std::cout << "Hiện tại: " << curName << ", tổng " << curTotal << " (tối thiểu " << (minTotal > 1 ? minTotal : 1)
              << ")\n";
    std::string newName;
    if (!readLine("Tên mới (Enter = giữ nguyên): ", &newName)) return;
    if (newName.empty()) newName = curName;
    int newTotal = curTotal;
    if (!readInt("Tổng số mới (Enter = giữ nguyên): ", 1, 10000, &newTotal, true, curTotal)) return;
    printResult(lab_.updateDevice(id, newName, newTotal));
}

void UI::actionMaintenance() {
    std::cout << "1. Đưa vào bảo trì   2. Hoàn tất bảo trì   0. Quay lại\n";
    int c = 0;
    if (!readInt("Chọn (0-2): ", 0, 2, &c) || c == 0) return;
    std::string typed, id;
    if (!readRequired("Mã thiết bị: ", &typed)) return;
    if (!resolveDeviceId(typed, &id)) {
        std::cout << colored(RED, "✘ Không tìm thấy thiết bị: " + typed) << "\n";
        return;
    }
    const Device* d = lab_.findDevice(id);
    int limit = c == 1 ? d->available : d->maintenance;
    std::cout << id << ": sẵn sàng " << d->available << ", đang bảo trì " << d->maintenance << "\n";
    if (limit < 1) {
        std::cout << colored(RED, c == 1 ? "✘ Không có đơn vị sẵn sàng để đưa vào bảo trì." : "✘ Không có đơn vị nào đang bảo trì.")
                  << "\n";
        return;
    }
    int qty = 0;
    if (!readInt("Số đơn vị (1-" + std::to_string(limit) + "): ", 1, limit, &qty)) return;
    printResult(c == 1 ? lab_.sendToMaintenance(id, qty) : lab_.finishMaintenance(id, qty));
}

void UI::actionRemoveDevice() {
    std::string typed, id;
    if (!readRequired("Mã thiết bị cần xoá: ", &typed)) return;
    if (!resolveDeviceId(typed, &id)) {
        std::cout << colored(RED, "✘ Không tìm thấy thiết bị: " + typed) << "\n";
        return;
    }
    if (!askYesNo("Xoá thiết bị " + id + " (phiếu lịch sử vẫn giữ mã)?")) {
        std::cout << "Đã huỷ.\n";
        return;
    }
    printResult(lab_.removeDevice(id));
}

// ============================ Mượn / trả ============================

void UI::actionBorrow() {
    std::string sid, name, line;
    int days = 7;
    if (!readRequired("MSSV: ", &sid)) return;
    if (!readRequired("Họ tên: ", &name)) return;
    if (!readRequired("Mã thiết bị (cách nhau bằng dấu phẩy hoặc khoảng trắng): ", &line)) return;

    DoublyLinkedList<std::string> ids;
    if (!addCodes(line, &ids) || ids.empty()) return; // mã lạ: dừng, chưa đổi gì

    // Gợi ý TRƯỚC khi tạo phiếu: tính trên đồ thị hiện tại (phiếu này chưa được cộng), đã loại món trong giỏ.
    // Kết quả luôn gán vào biến cục bộ trước khi duyệt. Enter = bỏ qua; nhập thêm mã thì gợi ý lại cho giỏ mới.
    while (!eof_) {
        printBasket(ids);
        DoublyLinkedList<Companion> sug = lab_.suggestForBasket(ids, 3);
        if (sug.empty()) {
            std::cout << "Không có gợi ý mượn kèm nào thêm.\n";
            break;
        }
        std::cout << "Gợi ý mượn kèm (theo lịch sử mượn, điểm = tổng số lần mượn cùng các món trong phiếu):\n";
        printCompanions(sug);
        std::string more;
        if (!readLine("Nhập thêm mã thiết bị (Enter = bỏ qua): ", &more)) return;
        if (more.empty()) break;
        addCodes(more, &ids); // mã lạ/trùng chỉ báo rồi bỏ qua, hiện lại gợi ý
    }
    if (eof_) return;

    if (!readInt("Số ngày mượn (1-30, Enter = 7): ", 1, 30, &days, true, 7)) return;

    // Tóm tắt và xác nhận. Hạn trả = giờ hiện tại + số ngày × 24 giờ, tính đến đúng giờ (M19).
    std::cout << "\nPhiếu mượn của " << BOLD << name << RESET << " (" << sid << "): " << ids.size() << " thiết bị, "
              << days << " ngày (hạn trả = " << dateText(lab_.now()) << " + " << days << "×24 giờ).\n";
    bool anyOut = false;
    for (const std::string& id : ids) {
        const Device* d = lab_.findDevice(id);
        bool out = d != nullptr && d->available <= 0;
        anyOut = anyOut || out;
        std::cout << "  - " << id << (d != nullptr ? " " + d->name : "")
                  << (out ? colored(RED, "  (hết hàng/bảo trì)") : std::string()) << "\n";
    }
    if (anyOut) std::cout << colored(YELLOW, "Lưu ý: có món hết hàng nên cả phiếu sẽ thất bại (M6).") << "\n";
    if (!askYesNo("Xác nhận tạo phiếu?")) {
        std::cout << "Đã huỷ, chưa tạo phiếu.\n";
        return;
    }

    BorrowResult r = lab_.borrowDevices(sid, name, ids, days);
    if (r.ok()) {
        std::cout << colored(GREEN, "✔ Đã tạo phiếu " + r.recordId) << ", hẹn trả " << dateText(r.dueHour) << "\n";
        return;
    }
    printResult(r);
    if (r.code == ErrorCode::OutOfStock && ids.size() == 1) { // hết hàng: gợi ý đặt trước (M12)
        std::string only = *ids.front();
        if (askYesNo("Đặt trước " + only + " vào hàng đợi?")) printResult(lab_.reserveDevice(sid, name, only));
    }
}

void UI::actionReturn() {
    std::string in, recordId;
    if (!readRequired("Mã phiếu (VD PM0001) hoặc MSSV: ", &in)) return;
    if (lowerAscii(in).compare(0, 2, "pm") == 0) {
        recordId = upperAscii(in);
    } else {
        int found = 0;
        lab_.forEachRecord([&](const BorrowRecord& r) {
            if (!r.isOpen() || r.studentId != in) return;
            if (found++ == 0) printRecordTableHeader();
            printRecordRow(r);
        });
        if (found == 0) {
            std::cout << "Sinh viên " << in << " không có phiếu nào đang mở.\n";
            return;
        }
        if (!readRequired("Mã phiếu cần trả: ", &in)) return;
        recordId = upperAscii(in);
    }
    ReturnResult r = lab_.returnRecord(recordId);
    if (!r.ok()) {
        printResult(r);
        return;
    }
    std::cout << colored(GREEN, "✔ Đã trả phiếu " + recordId) << ". ";
    if (r.lateDays > 0)
        std::cout << colored(RED, "Trễ " + std::to_string(r.lateDays) + " ngày, tiền phạt " + formatMoney(r.fine)) << "\n";
    else
        std::cout << "Trả đúng hạn, không phạt.\n";
}

// ============================ Hàng đợi ============================

void UI::actionQueue() {
    while (!eof_) {
        std::cout << "\n--- Hàng đợi đặt trước ---\n"
                     "1. Xem tất cả hàng đợi    2. Xem theo thiết bị    3. Đăng ký đặt trước\n"
                     "4. Nhận thiết bị đang giữ 5. Huỷ đăng ký          0. Quay lại\n";
        int c = 0;
        if (!readInt("Chọn (0-5): ", 0, 5, &c) || c == 0) return;
        if (c == 1) {
            int shown = 0;
            lab_.forEachDevice([&](const Device& d) {
                if (d.queue.empty()) return;
                ++shown;
                std::cout << "\n" << BOLD << d.id << " - " << d.name << RESET << " (sẵn " << d.available << ", đang giữ "
                          << d.onHold << ")\n";
                printQueueTable(d);
            });
            if (shown == 0) std::cout << "Hiện không có hàng đợi nào.\n";
            continue;
        }
        std::string typed, id;
        if (!readRequired("Mã thiết bị: ", &typed)) continue;
        if (!resolveDeviceId(typed, &id)) {
            std::cout << colored(RED, "✘ Không tìm thấy thiết bị: " + typed) << "\n";
            continue;
        }
        if (c == 2) {
            const Device* d = lab_.findDevice(id);
            if (d->queue.empty()) std::cout << "Hàng đợi " << id << " đang trống.\n";
            else printQueueTable(*d);
            continue;
        }
        std::string sid, name;
        if (!readRequired("MSSV: ", &sid)) continue;
        if (c == 3) {
            if (!readRequired("Họ tên: ", &name)) continue;
            OpResult r = lab_.reserveDevice(sid, name, id);
            printResult(r);
        } else if (c == 4) {
            int days = 7;
            if (!readInt("Số ngày mượn (1-30, Enter = 7): ", 1, 30, &days, true, 7)) continue;
            BorrowResult r = lab_.claimReservation(sid, id, days);
            if (r.ok()) std::cout << colored(GREEN, "✔ Đã tạo phiếu " + r.recordId) << ", hẹn trả " << dateText(r.dueHour) << "\n";
            else printResult(r);
        } else {
            printResult(lab_.cancelReservation(sid, id));
        }
        drainNotifications(); // huỷ/đặt có thể chuyển quyền giữ cho người kế
    }
}

// ============================ Tìm kiếm / lịch sử ============================

void UI::actionSearch() {
    std::cout << "1. Tìm thiết bị (mã/tên)   2. Tìm phiếu (MSSV/mã phiếu)   3. Toàn bộ lịch sử phiếu   0. Quay lại\n";
    int c = 0;
    if (!readInt("Chọn (0-3): ", 0, 3, &c) || c == 0) return;
    if (c == 1) {
        std::string key;
        if (!readRequired("Từ khoá: ", &key)) return;
        printDeviceTable(key);
        return;
    }
    std::string key;
    if (c == 2 && !readRequired("MSSV hoặc mã phiếu: ", &key)) return;
    int found = 0;
    lab_.forEachRecord([&](const BorrowRecord& r) {
        if (c == 2 && !containsIgnoreCase(r.studentId, key) && !containsIgnoreCase(r.recordId, key)) return;
        if (found++ == 0) printRecordTableHeader();
        printRecordRow(r);
    });
    if (found == 0) std::cout << "(Không có phiếu nào khớp)\n";
    else std::cout << found << " phiếu.\n";
}

void UI::actionCompanions() {
    std::string typed, id;
    if (!readRequired("Mã thiết bị cần gợi ý: ", &typed)) return;
    if (!resolveDeviceId(typed, &id)) {
        std::cout << colored(RED, "✘ Không tìm thấy thiết bị: " + typed) << "\n";
        return;
    }
    const Device* d = lab_.findDevice(id);
    std::cout << "Thiết bị " << BOLD << id << " - " << d->name << RESET << " (đã mượn " << d->timesBorrowed << " lần)\n";
    std::cout << "Top 3 thiết bị thường mượn kèm (bỏ qua thiết bị đang bảo trì):\n";
    DoublyLinkedList<Companion> top = lab_.suggestCompanions(id, 3);
    printCompanions(top);
    if (!askYesNo("Xem toàn bộ thiết bị từng mượn kèm (gồm cả bảo trì)?")) return;
    DoublyLinkedList<Companion> all = lab_.allCompanions(id);
    printCompanions(all);
}

void UI::actionOverdue() {
    int count = 0;
    long long total = 0;
    lab_.forEachRecord([&](const BorrowRecord& r) {
        if (!r.isOpen()) return;
        OverdueInfo info = lab_.previewOverdue(r);
        if (info.lateDays <= 0) return;
        if (count++ == 0) printRecordTableHeader();
        printRecordRow(r);
        total += info.fine;
    });
    if (count == 0) std::cout << "Không có phiếu nào quá hạn.\n";
    else std::cout << colored(RED, std::to_string(count) + " phiếu quá hạn, tổng tiền phạt tạm tính " + formatMoney(total)) << "\n";
}

void UI::actionAdvanceTime() {
    int hours = 0;
    if (!readInt("Tua thêm bao nhiêu giờ (1-8760): ", 1, 8760, &hours)) return;
    long long before = lab_.now();
    if (!lab_.advanceTime(hours)) {
        std::cout << colored(RED, "✘ Không tua được.") << "\n";
        return;
    }
    std::cout << colored(GREEN, "✔ Đã tua " + std::to_string(hours) + " giờ") << ": " << dateText(before) << " → "
              << dateText(lab_.now()) << "\n";
}
