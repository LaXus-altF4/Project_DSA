// LabApp: API server (cpp-httplib) + phục vụ giao diện web tĩnh trong web/.
// Cách dùng: LabApp.exe [--data <dir>] [--web <dir>] [--port <n>] [--seed] [--no-browser]
//   --data <dir>   thư mục 4 file CSV (mặc định: data cạnh thư mục web/)
//   --web <dir>    thư mục giao diện web (mặc định: tìm web/ ở thư mục hiện tại, cạnh exe, rồi thư mục cha của exe)
//   --port <n>     cổng ưu tiên (mặc định 8080); bận thì thử tiếp tới n+9
//   --seed         sinh dữ liệu mẫu, GHI ĐÈ dữ liệu hiện có (không hỏi lại — dùng cho test/demo)
//   --no-browser   không tự mở trình duyệt
// Chỉ lắng nghe 127.0.0.1 nên Windows Firewall không hỏi quyền.

#include "httplib.h" // phải đứng trước windows.h (winsock2)

#include <filesystem>
#include <iostream>
#include <mutex>
#include <string>

#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#endif

#include "LabManager.h"
#include "Routes.h"
#include "SampleData.h"
#include "Storage.h"

namespace fs = std::filesystem;

namespace {

const char* RESET = "\x1b[0m";
const char* GREEN = "\x1b[32m";
const char* YELLOW = "\x1b[33m";
const char* RED = "\x1b[31m";

httplib::Server* g_server = nullptr; // để Ctrl+C dừng server

void setupConsole() {
#ifdef _WIN32
    SetConsoleOutputCP(65001);
    SetConsoleCP(65001);
    HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD mode = 0;
    if (out != INVALID_HANDLE_VALUE && GetConsoleMode(out, &mode))
        SetConsoleMode(out, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
#endif
}

#ifdef _WIN32
BOOL WINAPI onConsoleCtrl(DWORD type) {
    if (type == CTRL_C_EVENT || type == CTRL_BREAK_EVENT || type == CTRL_CLOSE_EVENT) {
        if (g_server != nullptr) g_server->stop();
        return TRUE;
    }
    return FALSE;
}
#endif

fs::path exeDirectory() {
#ifdef _WIN32
    wchar_t buf[MAX_PATH * 4];
    DWORD n = GetModuleFileNameW(nullptr, buf, static_cast<DWORD>(sizeof(buf) / sizeof(buf[0])));
    if (n > 0 && n < sizeof(buf) / sizeof(buf[0])) return fs::path(buf).parent_path();
#endif
    return fs::current_path();
}

void openBrowser(const std::string& url) {
#ifdef _WIN32
    std::wstring w(url.begin(), url.end()); // URL chỉ có ký tự ASCII
    ShellExecuteW(nullptr, L"open", w.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
#else
    (void)url;
#endif
}

// Kiểm tra cổng còn trống trên 127.0.0.1. Phải dò trước vì httplib::Server bị vô hiệu hoá vĩnh viễn
// sau một lần bind_to_port thất bại (không thử cổng khác trên cùng đối tượng được).
// Bận nếu: (1) đã có chương trình nhận kết nối ở cổng này (kể cả nghe trên 0.0.0.0) — thử connect 200ms;
// hoặc (2) không bind độc quyền được 127.0.0.1:port.
bool portIsFree(int port) {
#ifdef _WIN32
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<u_short>(port));
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

    SOCKET c = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (c == INVALID_SOCKET) return false;
    u_long nonBlocking = 1;
    ioctlsocket(c, FIONBIO, &nonBlocking);
    bool listening = false;
    if (connect(c, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == 0) {
        listening = true;
    } else if (WSAGetLastError() == WSAEWOULDBLOCK) {
        fd_set writable, failed;
        FD_ZERO(&writable);
        FD_ZERO(&failed);
        FD_SET(c, &writable);
        FD_SET(c, &failed);
        timeval tv{0, 200000};
        if (select(0, nullptr, &writable, &failed, &tv) > 0 && FD_ISSET(c, &writable)) listening = true;
    }
    closesocket(c);
    if (listening) return false;

    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return false;
    BOOL one = TRUE;
    setsockopt(s, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, reinterpret_cast<const char*>(&one), sizeof(one));
    bool ok = bind(s, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == 0;
    closesocket(s);
    return ok;
#else
    (void)port;
    return true;
#endif
}

void printUsage() {
    std::cout << "Cách dùng: LabApp.exe [--data <thư mục>] [--web <thư mục>] [--port <cổng>] [--seed] [--no-browser]\n"
                 "  --data <dir>   thư mục chứa 4 file CSV (mặc định: data)\n"
                 "  --web <dir>    thư mục giao diện web (mặc định: tự tìm web/)\n"
                 "  --port <n>     cổng ưu tiên, mặc định 8080 (bận thì thử tới n+9)\n"
                 "  --seed         sinh dữ liệu mẫu, ghi đè dữ liệu hiện có\n"
                 "  --no-browser   không tự mở trình duyệt\n";
}

} // namespace

int main(int argc, char** argv) {
    setupConsole();

    std::string dataArg, webArg;
    int port = 8080;
    bool seed = false, browser = true;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--seed") {
            seed = true;
        } else if (arg == "--no-browser") {
            browser = false;
        } else if (arg == "--data" && i + 1 < argc) {
            dataArg = argv[++i];
        } else if (arg == "--web" && i + 1 < argc) {
            webArg = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            try {
                port = std::stoi(argv[++i]);
            } catch (...) {
                port = -1;
            }
            if (port < 1 || port > 65526) {
                std::cerr << RED << "Cổng không hợp lệ (1–65526)." << RESET << "\n";
                return 1;
            }
        } else {
            printUsage();
            return arg == "--help" || arg == "-h" ? 0 : 1;
        }
    }

    // Thư mục gốc = nơi có web/: thư mục hiện tại → cạnh exe → thư mục cha của exe (build\LabApp.exe).
    // Chuyển vào đó rồi dùng đường dẫn TƯƠNG ĐỐI: đường dẫn tuyệt đối có thể chứa chữ tiếng Việt
    // mà fstream/httplib (nhận std::string theo bảng mã ANSI) không mở được.
    std::error_code ec;
    fs::path origCwd = fs::current_path(ec);
    fs::path exeDir = exeDirectory();
    fs::path base = origCwd;
    if (webArg.empty()) {
        bool found = false;
        for (const fs::path& c : {origCwd, exeDir, exeDir.parent_path()}) {
            if (fs::is_directory(c / "web", ec)) {
                base = c;
                found = true;
                break;
            }
        }
        if (!found) std::cout << YELLOW << "Cảnh báo: không tìm thấy thư mục web/ — chỉ có API." << RESET << "\n";
    }
    fs::current_path(base, ec);
    if (ec) {
        std::cerr << RED << "Không chuyển được vào thư mục gốc của ứng dụng." << RESET << "\n";
        return 1;
    }
    // Đường dẫn người dùng nhập (tính từ thư mục hiện tại lúc chạy) → tương đối so với base.
    auto localPath = [&](const std::string& user, const char* fallback) -> std::string {
        if (user.empty()) return fallback;
        fs::path p(user);
        if (p.is_relative()) p = origCwd / p;
        std::error_code e;
        fs::path rel = fs::relative(p, base, e);
        try {
            return (e || rel.empty() ? p : rel).string();
        } catch (...) {
            return user;
        }
    };
    std::string dataDir = localPath(dataArg, "data");
    std::string webDir = localPath(webArg, "web");

    fs::create_directories(dataDir, ec);
    if (ec) {
        std::cerr << RED << "Không tạo được thư mục dữ liệu: " << dataDir << RESET << "\n";
        return 1;
    }

    // ---------------- Nạp dữ liệu ----------------
    LabManager lab;
    if (seed || !Storage::hasAnyData(dataDir)) {
        if (!seed) std::cout << "Chưa có dữ liệu trong '" << dataDir << "' — tạo dữ liệu mẫu.\n";
        SampleData::build(lab);
        OpResult r = Storage::save(dataDir, lab);
        if (!r.ok()) {
            std::cerr << RED << "Không lưu được dữ liệu mẫu: " << r.message << RESET << "\n";
            return 1;
        }
        std::cout << "Đã sinh dữ liệu mẫu: " << lab.deviceCount() << " thiết bị, " << lab.recordCount()
                  << " phiếu mượn.\n";
    } else {
        LoadReport rep = Storage::load(dataDir, lab);
        std::cout << "Đã nạp " << rep.devices << " thiết bị, " << rep.records << " phiếu, " << rep.reservations
                  << " lượt đặt trước từ '" << dataDir << "'.\n";
        for (const std::string& w : rep.warnings) std::cout << YELLOW << "  ! " << w << RESET << "\n";
        if (!rep.invariantsOk) std::cout << RED << "Cảnh báo: dữ liệu sau khi nạp vi phạm bất biến." << RESET << "\n";
    }
    // Thông báo sinh ra lúc nạp (lượt giữ hết hạn khi tắt máy) vẫn nằm trong hàng, web sẽ lấy qua /api/notifications.

    // Tự lưu CSV sau mỗi thao tác thành công. Listener chạy bên trong lời gọi lõi nên đã nằm trong vùng khoá mutex.
    lab.setChangeListener([&lab, dataDir]() {
        OpResult r = Storage::save(dataDir, lab);
        if (!r.ok()) std::cerr << RED << "Cảnh báo: không lưu được dữ liệu: " << r.message << RESET << "\n";
    });

    // ---------------- Server ----------------
    httplib::Server svr;
    std::mutex labMutex;

#ifdef _WIN32
    // Mặc định httplib bật SO_REUSEADDR; trên Windows tuỳ chọn này cho phép bind đè lên cổng đang có
    // chương trình khác dùng. Dùng SO_EXCLUSIVEADDRUSE để cổng bận thì bind thất bại đúng như mong đợi.
    svr.set_socket_options([](socket_t sock) {
        int one = 1;
        setsockopt(sock, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, reinterpret_cast<const char*>(&one), sizeof(one));
    });
#endif

    svr.set_file_extension_and_mimetype_mapping("html", "text/html; charset=utf-8");
    svr.set_file_extension_and_mimetype_mapping("js", "text/javascript; charset=utf-8");
    svr.set_file_extension_and_mimetype_mapping("mjs", "text/javascript; charset=utf-8");
    svr.set_file_extension_and_mimetype_mapping("css", "text/css; charset=utf-8");
    svr.set_file_extension_and_mimetype_mapping("json", "application/json; charset=utf-8");
    svr.set_file_extension_and_mimetype_mapping("md", "text/plain; charset=utf-8");
    if (fs::is_directory(webDir, ec) && !svr.set_mount_point("/", webDir))
        std::cout << YELLOW << "Cảnh báo: không phục vụ được thư mục web: " << webDir << RESET << "\n";

    // Tắt cache cho HTML/JS/CSS để trình duyệt luôn lấy bản mới khi đang phát triển web
    svr.set_file_request_handler([](const httplib::Request&, httplib::Response& res) {
        const std::string type = res.get_header_value("Content-Type");
        if (type.rfind("text/html", 0) == 0 || type.rfind("text/javascript", 0) == 0 ||
            type.rfind("text/css", 0) == 0)
            res.set_header("Cache-Control", "no-store");
    });

    registerRoutes(svr, lab, labMutex);

    // Ghi nhật ký các thao tác thay đổi dữ liệu và các lỗi (bỏ qua GET thành công cho đỡ rối).
    svr.set_logger([](const httplib::Request& req, const httplib::Response& res) {
        if (req.method == "GET" && res.status < 400) return;
        const char* color = res.status >= 400 ? YELLOW : GREEN;
        std::cout << color << res.status << RESET << " " << req.method << " " << req.path << "\n";
    });

    // Chỉ lắng nghe 127.0.0.1; cổng bận thì thử 9 cổng kế tiếp.
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa); // cho portIsFree (có đếm tham chiếu, không ảnh hưởng httplib)
#endif
    int boundPort = -1;
    for (int p = port; p <= port + 9; ++p) {
        if (portIsFree(p)) {
            boundPort = p;
            break;
        }
        std::cout << YELLOW << "Cổng " << p << " đang bận, thử cổng kế tiếp..." << RESET << "\n";
    }
    if (boundPort < 0) {
        std::cerr << RED << "Lỗi: các cổng " << port << "–" << port + 9
                  << " đều đang bận. Hãy tắt chương trình đang dùng cổng hoặc chạy với --port <cổng khác>." << RESET
                  << "\n";
        return 1;
    }
    if (!svr.bind_to_port("127.0.0.1", boundPort)) {
        std::cerr << RED << "Lỗi: không mở được cổng " << boundPort << " (có thể vừa bị chương trình khác chiếm)."
                  << RESET << "\n";
        return 1;
    }

    std::string url = "http://127.0.0.1:" + std::to_string(boundPort);
    std::cout << GREEN << "LabApp đang chạy tại " << url << RESET << "  (API: " << url << "/api/...)\n"
              << "Nhấn Ctrl+C để dừng. Dữ liệu tự lưu vào '" << dataDir << "' sau mỗi thao tác.\n"
              << std::flush;

    g_server = &svr;
#ifdef _WIN32
    SetConsoleCtrlHandler(onConsoleCtrl, TRUE);
#endif
    if (browser) openBrowser(url + "/");

    bool ok = svr.listen_after_bind();
    g_server = nullptr;
    std::cout << "Đã dừng server.\n";
    return ok ? 0 : 1;
}
