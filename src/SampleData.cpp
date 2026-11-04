#include "SampleData.h"

#include <initializer_list>

namespace {

struct Student {
    const char* id;
    const char* name;
};

// 12 sinh viên; các lệnh bên dưới gọi theo số thứ tự 1..12.
const Student kStudents[12] = {
    {"25120001", "Nguyễn Minh Anh"}, {"25120014", "Trần Quốc Bảo"},  {"25120027", "Lê Thu Hà"},
    {"25120033", "Phạm Gia Huy"},    {"25120045", "Võ Ngọc Lan"},    {"25120052", "Đặng Hoàng Nam"},
    {"25120068", "Bùi Thanh Tùng"},  {"25120071", "Hoàng Mai Phương"}, {"25120089", "Ngô Đức Thịnh"},
    {"25120096", "Dương Khánh Vy"},  {"25120103", "Phan Anh Khoa"},  {"25120117", "Đỗ Bảo Châu"}};

const long long kStartHour = 243LL * 24; // 01/09/2026 00:00 (ngày thứ 243 của năm)

long long hourOf(int day, int hour) { return kStartHour + static_cast<long long>(day) * 24 + hour; }

// Phiếu đã lên lịch trả: trả lúc returnHour (giờ tuyệt đối).
struct Pending {
    std::string recordId;
    long long returnHour;
    bool done;
};

struct Script {
    LabManager& lab;
    Pending pending[64];
    int count = 0;
    explicit Script(LabManager& l) : lab(l) {}

    // Tua tới giờ tuyệt đối target, trả các phiếu đến hạn trả theo đúng thứ tự thời gian. O(count²)
    void goTo(long long target) {
        while (true) {
            int best = -1;
            for (int i = 0; i < count; ++i)
                if (!pending[i].done && pending[i].returnHour <= target &&
                    (best < 0 || pending[i].returnHour < pending[best].returnHour))
                    best = i;
            if (best < 0) break;
            if (pending[best].returnHour > lab.now()) lab.advanceTime(pending[best].returnHour - lab.now());
            lab.returnRecord(pending[best].recordId);
            pending[best].done = true;
        }
        if (target > lab.now()) lab.advanceTime(target - lab.now());
    }

    // Sinh viên student (1..12) mượn lúc 09:00 ngày day, hẹn days ngày, trả lúc 08:00 ngày retDay (-1: không trả).
    // 08:00 < 09:00 nên trả đúng ngày hẹn thì không bị tính trễ; chỉ phiếu có retDay sau ngày hẹn mới bị phạt.
    void lend(int day, int student, std::initializer_list<const char*> items, int days, int retDay) {
        goTo(hourOf(day, 9));
        DoublyLinkedList<std::string> ids;
        for (const char* it : items) ids.pushBack(it);
        const Student& s = kStudents[student - 1];
        BorrowResult r = lab.borrowDevices(s.id, s.name, ids, days);
        if (r.ok() && retDay >= 0 && count < 64) {
            pending[count].recordId = r.recordId;
            pending[count].returnHour = hourOf(retDay, 8);
            pending[count].done = false;
            ++count;
        }
    }

    void reserve(int student, const char* deviceId) {
        const Student& s = kStudents[student - 1];
        lab.reserveDevice(s.id, s.name, deviceId);
    }
};

} // namespace

void SampleData::build(LabManager& lab) {
    // ---- Thiết bị ----
    lab.addDevice("ARD01", "Arduino Uno R3", 6);
    lab.addDevice("BRD01", "Breadboard 830 lỗ", 8);
    lab.addDevice("JMP01", "Bộ dây cắm jumper", 8);
    lab.addDevice("ESP01", "ESP32 DevKit", 5);
    lab.addDevice("SEN01", "Bộ cảm biến 37 món", 4);
    lab.addDevice("RPI01", "Raspberry Pi 4", 4);
    lab.addDevice("SDC01", "Thẻ microSD 32GB", 6);
    lab.addDevice("CAM01", "Camera module Pi", 3);
    lab.addDevice("VR01", "Kính thực tế ảo", 2);
    lab.addDevice("TC01", "Tay cầm điều khiển VR", 4);
    lab.addDevice("OSC01", "Máy hiện sóng", 3);
    lab.addDevice("PRB01", "Đầu dò máy hiện sóng", 6);
    lab.addDevice("DMM01", "Đồng hồ vạn năng", 6);
    lab.addDevice("PSU01", "Nguồn DC điều chỉnh", 3);
    lab.addDevice("SLD01", "Máy hàn thiếc", 2);
    lab.addDevice("PRJ01", "Máy chiếu mini", 2);
    lab.addDevice("LAP01", "Laptop Lab", 4);
    lab.addDevice("BK01", "Sách hiếm: The Art of Computer Programming", 1);

    lab.advanceTime(kStartHour); // bắt đầu lịch sử từ 01/09/2026

    // ---- Lịch sử mượn (theo thứ tự thời gian). lend(ngày mượn, SV, thiết bị, số ngày, ngày trả) ----
    Script s(lab);
    s.lend(1, 1, {"ARD01", "BRD01", "JMP01"}, 7, 6);
    s.lend(2, 3, {"VR01", "TC01"}, 3, 5);
    s.lend(3, 2, {"ARD01", "BRD01", "JMP01"}, 7, 9);
    s.lend(4, 6, {"VR01", "TC01"}, 3, 7);
    s.lend(4, 4, {"OSC01", "PRB01"}, 3, 6);
    s.lend(5, 3, {"ARD01", "BRD01", "JMP01", "SEN01"}, 7, 11);
    s.lend(6, 10, {"RPI01", "SDC01", "CAM01"}, 7, 12);
    s.lend(7, 5, {"PSU01", "DMM01"}, 3, 10);
    s.lend(8, 4, {"ARD01", "BRD01", "JMP01"}, 5, 12);
    s.lend(9, 9, {"VR01", "TC01", "LAP01"}, 3, 12);
    s.lend(10, 8, {"OSC01", "PRB01", "DMM01"}, 3, 14);
    s.lend(11, 12, {"BK01"}, 14, 24);
    s.lend(12, 5, {"ARD01", "BRD01", "JMP01", "DMM01"}, 7, 17);
    s.lend(13, 2, {"VR01", "TC01"}, 2, 15);
    s.lend(14, 2, {"RPI01", "SDC01", "CAM01"}, 7, 20);
    s.lend(15, 6, {"ARD01", "BRD01"}, 7, 20);
    s.lend(16, 11, {"VR01", "TC01"}, 3, 19);
    s.lend(17, 9, {"PSU01", "DMM01"}, 3, 20);
    s.lend(18, 7, {"ARD01", "BRD01", "JMP01"}, 7, 27); // trả trễ
    s.lend(19, 3, {"OSC01", "PRB01", "PSU01"}, 4, 22);
    s.lend(20, 7, {"ESP01", "SEN01"}, 7, 26);
    s.lend(21, 5, {"VR01", "TC01"}, 3, 24);
    s.lend(22, 8, {"ARD01", "BRD01", "JMP01"}, 7, 28);
    s.lend(23, 6, {"RPI01", "SDC01"}, 5, 27);
    s.lend(24, 11, {"PSU01", "DMM01", "SLD01"}, 2, 26);
    s.lend(26, 12, {"VR01", "TC01"}, 3, 29);
    s.lend(27, 4, {"BK01"}, 7, 36); // trả trễ
    s.lend(28, 1, {"OSC01", "PRB01"}, 3, 31);
    s.lend(29, 2, {"PSU01", "DMM01"}, 3, 32);
    s.lend(30, 9, {"ARD01", "JMP01"}, 5, 35);
    s.lend(31, 1, {"RPI01", "SDC01", "CAM01"}, 7, 37);
    s.lend(32, 10, {"SLD01"}, 3, 34);
    s.lend(33, 8, {"VR01", "TC01", "PRJ01"}, 3, 36);
    s.lend(34, 7, {"OSC01", "PRB01"}, 3, 39); // trả trễ
    s.lend(36, 10, {"ESP01", "BRD01", "JMP01"}, 7, 41);
    s.lend(37, 6, {"PSU01", "DMM01"}, 3, 40);
    s.lend(38, 7, {"VR01", "TC01"}, 3, 41);
    s.lend(40, 11, {"ARD01", "BRD01", "JMP01"}, 7, 46);
    s.lend(41, 5, {"PRJ01", "LAP01"}, 2, 43);
    s.lend(42, 9, {"RPI01", "SDC01", "CAM01"}, 7, 47);
    s.lend(43, 10, {"VR01"}, 3, 46);
    s.lend(44, 12, {"OSC01", "PRB01"}, 3, 47);
    s.lend(45, 12, {"ESP01", "SEN01"}, 7, 50);
    s.lend(46, 3, {"PSU01", "DMM01"}, 3, 49);
    s.lend(47, 2, {"TC01"}, 3, 50);
    s.lend(50, 1, {"ARD01", "BRD01", "JMP01"}, 7, 55);

    // ---- Phiếu đang mở (2 phiếu đã quá hạn khi demo: ngày 52 và 55) ----
    s.lend(52, 4, {"PSU01", "DMM01"}, 4, -1);
    s.lend(55, 8, {"PRJ01", "LAP01"}, 3, -1);
    s.lend(57, 7, {"OSC01", "PRB01"}, 10, -1);
    s.lend(58, 9, {"VR01", "TC01"}, 7, -1);  // VR01 còn 1 đơn vị
    s.lend(59, 5, {"VR01"}, 3, 63);          // VR01 hết hàng, phiếu này trả lúc 08:00 ngày 63
    s.lend(60, 12, {"RPI01", "SDC01", "CAM01"}, 14, -1);

    // ---- Hàng đợi Kính VR: 2 người đặt khi hết hàng; khi phiếu ngày 59 được trả, người đầu hàng được giữ 24h ----
    s.goTo(hourOf(60, 12));
    s.reserve(11, "VR01");
    s.goTo(hourOf(61, 12));
    s.reserve(6, "VR01");

    // ---- Bảo trì: Máy hàn thiếc toàn bộ (đỏ), Máy hiện sóng 1/3 ----
    s.goTo(hourOf(62, 10));
    lab.sendToMaintenance("SLD01", 2);
    lab.sendToMaintenance("OSC01", 1);

    s.goTo(hourOf(63, 16)); // phiếu VR01 trả lúc 08:00 ngày 63 → SV 25120103 được giữ Kính VR đến 08:00 ngày 64
}
