// Chương trình console quản lý mượn trả thiết bị Lab.
// Cách dùng: app.exe [--data <thư mục>] [--seed]
//   --data <dir>  thư mục chứa 4 file CSV (mặc định: data)
//   --seed        sinh dữ liệu mẫu và ghi đè dữ liệu hiện có (có hỏi xác nhận)
#include <filesystem>
#include <iostream>
#include <string>

#ifdef _WIN32
#include <windows.h>
#endif

#include "LabManager.h"
#include "SampleData.h"
#include "Storage.h"
#include "UI.h"

namespace {

const char* RESET = "\x1b[0m";
const char* YELLOW = "\x1b[33m";
const char* RED = "\x1b[31m";

void setupConsole() {
#ifdef _WIN32
    SetConsoleOutputCP(65001); // UTF-8 cho tiếng Việt
    SetConsoleCP(65001);
    HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD mode = 0;
    if (out != INVALID_HANDLE_VALUE && GetConsoleMode(out, &mode))
        SetConsoleMode(out, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING); // màu ANSI
#endif
}

// Hỏi có/không; hết dữ liệu nhập (EOF) coi như "không".
bool confirm(const std::string& prompt) {
    std::cout << prompt << " (c/k): " << std::flush;
    std::string line;
    if (!std::getline(std::cin, line)) return false;
    return line == "c" || line == "C" || line == "y" || line == "Y" || line == "có" || line == "co";
}

void printUsage() {
    std::cout << "Cách dùng: app.exe [--data <thư mục>] [--seed]\n"
                 "  --data <dir>  thư mục chứa devices.csv, borrow_records.csv, reservations.csv, meta.csv (mặc định: data)\n"
                 "  --seed        sinh dữ liệu mẫu, ghi đè dữ liệu hiện có (có hỏi xác nhận)\n";
}

bool seedAndSave(LabManager& lab, const std::string& dir) {
    SampleData::build(lab);
    OpResult r = Storage::save(dir, lab);
    if (!r.ok()) {
        std::cerr << RED << "Không lưu được dữ liệu mẫu: " << r.message << RESET << "\n";
        return false;
    }
    std::cout << "Đã sinh dữ liệu mẫu: " << lab.deviceCount() << " thiết bị, " << lab.recordCount() << " phiếu mượn.\n";
    return true;
}

} // namespace

int main(int argc, char** argv) {
    setupConsole();

    std::string dir = "data";
    bool seed = false;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--seed") {
            seed = true;
        } else if (arg == "--data" && i + 1 < argc) {
            dir = argv[++i];
        } else {
            printUsage();
            return arg == "--help" || arg == "-h" ? 0 : 1;
        }
    }

    std::error_code ec;
    std::filesystem::create_directories(dir, ec); // thư mục data chưa có thì tạo
    if (ec) {
        std::cerr << RED << "Không tạo được thư mục " << dir << ": " << ec.message() << RESET << "\n";
        return 1;
    }

    LabManager lab;
    bool hasData = Storage::hasAnyData(dir);
    if (seed) {
        if (hasData && !confirm("Dữ liệu hiện có trong '" + dir + "' sẽ bị ghi đè bằng dữ liệu mẫu. Tiếp tục?")) {
            std::cout << "Đã huỷ.\n";
            return 0;
        }
        if (!seedAndSave(lab, dir)) return 1;
    } else if (!hasData) {
        std::cout << "Chưa có dữ liệu trong '" << dir << "'.\n";
        if (confirm("Tạo dữ liệu mẫu để demo?")) {
            if (!seedAndSave(lab, dir)) return 1;
        } else {
            std::cout << "Bắt đầu với dữ liệu trống.\n";
        }
    } else {
        LoadReport rep = Storage::load(dir, lab);
        std::cout << "Đã nạp " << rep.devices << " thiết bị, " << rep.records << " phiếu, " << rep.reservations
                  << " lượt đặt trước.\n";
        for (const std::string& w : rep.warnings) std::cout << YELLOW << "  ! " << w << RESET << "\n";
        if (rep.skippedLines > 0) std::cout << YELLOW << "Đã bỏ qua " << rep.skippedLines << " dòng lỗi.\n" << RESET;
    }

    // Tự lưu sau mỗi thao tác thay đổi dữ liệu (Storage ghi file .tmp rồi đổi tên).
    lab.setChangeListener([&lab, dir]() {
        OpResult r = Storage::save(dir, lab);
        if (!r.ok()) std::cerr << RED << "Cảnh báo: không lưu được dữ liệu: " << r.message << RESET << "\n";
    });

    UI ui(lab, [&lab, dir]() {
        OpResult r = Storage::save(dir, lab);
        if (!r.ok()) std::cerr << RED << "Cảnh báo: không lưu được dữ liệu: " << r.message << RESET << "\n";
    });
    ui.run();
    return 0;
}
