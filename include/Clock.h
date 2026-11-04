#ifndef CLOCK_H
#define CLOCK_H

#include <string>

// Đồng hồ giả lập (M18): đếm số giờ kể từ 01/01/2026 00:00. Logic nghiệp vụ không gọi time().
// Chỉ có thể tiến (tua), không lùi.
class Clock {
private:
    long long now_; // số giờ đã trôi qua kể từ mốc 01/01/2026 00:00

    static bool isLeap(int year) { return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0; }

    static int daysInMonth(int year, int month) { // month: 1..12. O(1)
        static const int days[12] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        if (month == 2 && isLeap(year)) return 29;
        return days[month - 1];
    }

    static std::string pad2(int v) { return (v < 10 ? "0" : "") + std::to_string(v); }

public:
    explicit Clock(long long startHour = 0) : now_(startHour < 0 ? 0 : startHour) {}

    long long now() const { return now_; } // O(1)

    // Tua thêm hours giờ; false nếu hours <= 0. O(1)
    bool advance(long long hours) {
        if (hours <= 0) return false;
        now_ += hours;
        return true;
    }

    // Đặt thẳng giờ hiện tại (Storage dùng khi nạp meta.csv); false nếu hour < 0. O(1)
    bool setNow(long long hour) {
        if (hour < 0) return false;
        now_ = hour;
        return true;
    }

    // Đổi số giờ thành chuỗi "dd/MM/yyyy HH:00". O(số năm + 12)
    static std::string formatHour(long long hour) {
        if (hour < 0) hour = 0;
        long long days = hour / 24;
        int hh = static_cast<int>(hour % 24);
        int year = 2026;
        while (true) {
            int len = isLeap(year) ? 366 : 365;
            if (days < len) break;
            days -= len;
            ++year;
        }
        int month = 1;
        while (days >= daysInMonth(year, month)) {
            days -= daysInMonth(year, month);
            ++month;
        }
        return pad2(static_cast<int>(days) + 1) + "/" + pad2(month) + "/" + std::to_string(year) +
               " " + pad2(hh) + ":00";
    }
};

#endif // CLOCK_H
