#include "Routes.h"

#include <algorithm>
#include <functional>
#include <string>
#include <vector>

#include "JsonMapper.h"

namespace {

using json = nlohmann::json;
using httplib::Request;
using httplib::Response;
namespace JM = JsonMapper;

const char* JSON_TYPE = "application/json; charset=utf-8";

// Lỗi ném ra trong handler (thiếu trường, sai kiểu, lỗi nghiệp vụ...) — wrap() bắt và trả JSON lỗi.
struct ApiError {
    int status;
    std::string code;
    std::string message;
    json details;
};

void sendJson(Response& res, int status, const json& body) {
    res.status = status;
    // ensure_ascii = false: giữ nguyên UTF-8 tiếng Việt; chuỗi UTF-8 hỏng (nếu có) được thay bằng U+FFFD.
    res.set_content(body.dump(-1, ' ', false, json::error_handler_t::replace), JSON_TYPE);
}

[[noreturn]] void fail(int status, const std::string& code, const std::string& message, const json& details = json()) {
    throw ApiError{status, code, message, details};
}

// Lỗi từ lõi: ErrorCode → HTTP status + mã chuỗi (docs/api.md mục 2).
[[noreturn]] void failResult(const OpResult& r, const json& details = json()) {
    fail(JM::httpStatusFor(r.code), JM::errorCodeString(r.code), r.message, details);
}

[[noreturn]] void failInput(const std::string& message) {
    fail(400, "INVALID_INPUT", message);
}

// ---------------- Đọc body JSON ----------------
json parseBody(const Request& req) {
    json body = json::parse(req.body, nullptr, false);
    if (body.is_discarded() || !body.is_object())
        fail(400, "BAD_JSON", "Dữ liệu gửi lên không phải JSON object hợp lệ");
    return body;
}

std::string getString(const json& body, const char* key) {
    auto it = body.find(key);
    if (it == body.end() || !it->is_string())
        failInput(std::string("Thiếu trường hoặc sai kiểu (cần chuỗi): ") + key);
    return it->get<std::string>();
}

int toIntField(const json& v, const char* key) {
    if (!v.is_number_integer()) failInput(std::string("Thiếu trường hoặc sai kiểu (cần số nguyên): ") + key);
    long long x = v.get<long long>();
    if (x < -2147483647LL || x > 2147483647LL) failInput(std::string("Giá trị quá lớn: ") + key);
    return static_cast<int>(x);
}

int getInt(const json& body, const char* key) {
    auto it = body.find(key);
    if (it == body.end()) failInput(std::string("Thiếu trường: ") + key);
    return toIntField(*it, key);
}

int getIntOr(const json& body, const char* key, int fallback) {
    auto it = body.find(key);
    if (it == body.end() || it->is_null()) return fallback;
    return toIntField(*it, key);
}

// ---------------- Tham số query ----------------
std::string queryString(const Request& req, const char* key) {
    return req.has_param(key) ? req.get_param_value(key) : std::string();
}

long long queryInt(const Request& req, const char* key, long long fallback, long long lo, long long hi) {
    std::string s = queryString(req, key);
    if (s.empty()) return fallback;
    bool digits = s.size() <= 12;
    for (char c : s)
        if (c < '0' || c > '9') digits = false;
    long long v = digits ? std::stoll(s) : -1;
    if (!digits || v < lo || v > hi)
        failInput(std::string("Tham số ") + key + " phải là số nguyên từ " + std::to_string(lo) + " đến " +
                  std::to_string(hi));
    return v;
}

// Tìm chuỗi con, không phân biệt hoa/thường với chữ Latinh không dấu (chỉ để lọc hiển thị).
std::string lowerAscii(std::string s) {
    for (char& c : s)
        if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
    return s;
}

bool containsCI(const std::string& hay, const std::string& needleLower) {
    return lowerAscii(hay).find(needleLower) != std::string::npos;
}

// ---------------- Tra cứu ----------------
const Device& requireDevice(const LabManager& lab, const std::string& id) {
    const Device* d = lab.findDevice(id);
    if (d == nullptr) fail(404, "DEVICE_NOT_FOUND", "Không tìm thấy thiết bị: " + id);
    return *d;
}

const BorrowRecord& requireRecord(const LabManager& lab, const std::string& id) {
    const BorrowRecord* r = lab.findRecord(id);
    if (r == nullptr) fail(404, "RECORD_NOT_FOUND", "Không tìm thấy phiếu mượn: " + id);
    return *r;
}

// Bọc handler: khoá mutex trong suốt lời gọi lõi và lúc đổi sang JSON, bắt mọi lỗi thành JSON.
using Handler = std::function<void(const Request&, Response&)>;

Handler wrap(std::mutex& mtx, Handler fn) {
    return [&mtx, fn](const Request& req, Response& res) {
        try {
            std::lock_guard<std::mutex> lock(mtx);
            fn(req, res);
        } catch (const ApiError& e) {
            sendJson(res, e.status, JM::error(e.code, e.message, e.details));
        } catch (const std::exception& e) {
            sendJson(res, 500, JM::error("INTERNAL", std::string("Lỗi máy chủ: ") + e.what()));
        } catch (...) {
            sendJson(res, 500, JM::error("INTERNAL", "Lỗi máy chủ không xác định"));
        }
    };
}

} // namespace

void registerRoutes(httplib::Server& svr, LabManager& lab, std::mutex& mtx) {
    // ======================= Tổng quan =======================
    svr.Get("/api/stats", wrap(mtx, [&lab](const Request& req, Response& res) {
        long long within = queryInt(req, "within", 6, 1, 168);
        int top = static_cast<int>(queryInt(req, "top", 5, 1, 50));
        sendJson(res, 200, JM::stats(lab, within, top));
    }));

    // ======================= Thiết bị =======================
    svr.Get("/api/devices", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string query = lowerAscii(queryString(req, "query"));
        std::string status = queryString(req, "status");
        if (!status.empty() && status != "available" && status != "borrowed" && status != "maintenance")
            failInput("Tham số status phải là available, borrowed hoặc maintenance");
        json arr = json::array();
        lab.forEachDevice([&](const Device& d) {
            if (!status.empty() && status != JM::statusString(d.status())) return;
            if (!query.empty() && !containsCI(d.id, query) && !containsCI(d.name, query)) return;
            arr.push_back(JM::device(d));
        });
        sendJson(res, 200, json{{"count", arr.size()}, {"devices", arr}});
    }));

    svr.Get(R"(/api/devices/([^/]+))", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        const Device& d = requireDevice(lab, id);
        DoublyLinkedList<Companion> top = lab.suggestCompanions(id, 3); // lưu vào biến rồi mới duyệt
        sendJson(res, 200, json{{"device", JM::device(d)},
                                {"queue", JM::queue(lab, id)},
                                {"nextQueuePosition", d.queue.size() + 1},
                                {"suggestions", JM::companions(top)}});
    }));

    svr.Get(R"(/api/devices/([^/]+)/companions)", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        requireDevice(lab, id);
        DoublyLinkedList<Companion> all = lab.allCompanions(id);
        sendJson(res, 200, json{{"deviceId", id}, {"companions", JM::companions(all)}});
    }));

    svr.Post("/api/devices", wrap(mtx, [&lab](const Request& req, Response& res) {
        json body = parseBody(req);
        std::string id = getString(body, "id");
        std::string name = getString(body, "name");
        int total = getInt(body, "total");
        OpResult r = lab.addDevice(id, name, total);
        if (!r.ok()) failResult(r);
        sendJson(res, 201, json{{"device", JM::device(requireDevice(lab, id))}});
    }));

    svr.Put(R"(/api/devices/([^/]+))", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        json body = parseBody(req);
        std::string name = getString(body, "name");
        int total = getInt(body, "total");
        OpResult r = lab.updateDevice(id, name, total);
        if (!r.ok()) failResult(r);
        sendJson(res, 200, json{{"device", JM::device(requireDevice(lab, id))}});
    }));

    svr.Delete(R"(/api/devices/([^/]+))", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        OpResult r = lab.removeDevice(id);
        if (!r.ok()) failResult(r);
        sendJson(res, 200, json{{"deleted", id}});
    }));

    svr.Post(R"(/api/devices/([^/]+)/maintenance)", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        json body = parseBody(req);
        OpResult r = lab.sendToMaintenance(id, getInt(body, "qty"));
        if (!r.ok()) failResult(r);
        sendJson(res, 200, json{{"device", JM::device(requireDevice(lab, id))}});
    }));

    svr.Post(R"(/api/devices/([^/]+)/maintenance/finish)", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        json body = parseBody(req);
        OpResult r = lab.finishMaintenance(id, getInt(body, "qty"));
        if (!r.ok()) failResult(r);
        sendJson(res, 200, json{{"device", JM::device(requireDevice(lab, id))}});
    }));

    // ======================= Mượn / trả =======================
    svr.Post("/api/borrow", wrap(mtx, [&lab](const Request& req, Response& res) {
        json body = parseBody(req);
        std::string studentId = getString(body, "studentId");
        std::string studentName = getString(body, "studentName");
        auto it = body.find("deviceIds");
        if (it == body.end() || !it->is_array()) failInput("Thiếu trường hoặc sai kiểu (cần mảng chuỗi): deviceIds");
        DoublyLinkedList<std::string> ids;
        for (const json& v : *it) {
            if (!v.is_string()) failInput("deviceIds chỉ được chứa chuỗi");
            ids.pushBack(v.get<std::string>());
        }
        int days = getInt(body, "days");

        BorrowResult r = lab.borrowDevices(studentId, studentName, ids, days);
        if (!r.ok()) {
            json details;
            if (r.code == ErrorCode::OutOfStock) {
                json arr = json::array();
                for (const std::string& id : r.unavailableIds) arr.push_back(id);
                details = json{{"unavailableIds", arr}};
            }
            failResult(r, details);
        }
        sendJson(res, 201, json{{"record", JM::record(lab, requireRecord(lab, r.recordId))}});
    }));

    svr.Post("/api/return", wrap(mtx, [&lab](const Request& req, Response& res) {
        json body = parseBody(req);
        std::string recordId = getString(body, "recordId");
        ReturnResult r = lab.returnRecord(recordId);
        if (!r.ok()) failResult(r);
        sendJson(res, 200, json{{"record", JM::record(lab, requireRecord(lab, recordId))}});
    }));

    svr.Get("/api/records", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string status = queryString(req, "status");
        if (status.empty()) status = "all";
        if (status != "all" && status != "open" && status != "overdue" && status != "returned")
            failInput("Tham số status phải là all, open, overdue hoặc returned");
        std::string query = lowerAscii(queryString(req, "query"));
        long long page = queryInt(req, "page", 1, 1, 1000000);
        long long pageSize = queryInt(req, "pageSize", 20, 1, 100);

        // Lọc theo trạng thái do lõi xác định (isOpen / isOverdue); ở đây chỉ lọc chuỗi và sắp để hiển thị.
        std::vector<const BorrowRecord*> list;
        lab.forEachRecord([&](const BorrowRecord& r) {
            if (status == "open" && !r.isOpen()) return;
            if (status == "returned" && r.isOpen()) return;
            if (status == "overdue" && !lab.isOverdue(r)) return;
            if (!query.empty() && !containsCI(r.recordId, query) && !containsCI(r.studentId, query) &&
                !containsCI(r.studentName, query))
                return;
            list.push_back(&r);
        });
        if (status == "overdue") {
            // Sắp theo số ngày quá hạn do lõi tính (previewOverdue), giảm dần; hoà thì mã phiếu tăng.
            std::vector<std::pair<int, const BorrowRecord*>> keyed;
            for (const BorrowRecord* r : list) keyed.push_back({lab.previewOverdue(*r).lateDays, r});
            std::stable_sort(keyed.begin(), keyed.end(), [](const auto& a, const auto& b) {
                if (a.first != b.first) return a.first > b.first;
                return a.second->recordId < b.second->recordId;
            });
            for (size_t i = 0; i < keyed.size(); ++i) list[i] = keyed[i].second;
        } else {
            std::reverse(list.begin(), list.end()); // phiếu mới nhất trước
        }

        long long total = static_cast<long long>(list.size());
        long long totalPages = (total + pageSize - 1) / pageSize;
        json arr = json::array();
        for (long long i = (page - 1) * pageSize; i < total && i < page * pageSize; ++i)
            arr.push_back(JM::record(lab, *list[static_cast<size_t>(i)]));
        sendJson(res, 200, json{{"page", page}, {"pageSize", pageSize}, {"total", total},
                                {"totalPages", totalPages}, {"records", arr}});
    }));

    svr.Get(R"(/api/records/([^/]+))", wrap(mtx, [&lab](const Request& req, Response& res) {
        sendJson(res, 200, json{{"record", JM::record(lab, requireRecord(lab, req.matches[1].str()))}});
    }));

    // ======================= Hàng đợi đặt trước =======================
    svr.Get(R"(/api/reservations/([^/]+))", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        const Device& d = requireDevice(lab, id);
        sendJson(res, 200, json{{"device", JM::device(d)}, {"queue", JM::queue(lab, id)}});
    }));

    svr.Post(R"(/api/reservations/([^/]+))", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        json body = parseBody(req);
        std::string studentId = getString(body, "studentId");
        std::string studentName = getString(body, "studentName");
        OpResult r = lab.reserveDevice(studentId, studentName, id);
        if (!r.ok()) failResult(r);
        int position = 0, index = 0;
        lab.forEachReservation(id, [&](const Reservation& x) {
            ++index;
            if (x.studentId == studentId) position = index;
        });
        sendJson(res, 201, json{{"position", position},
                                {"device", JM::device(requireDevice(lab, id))},
                                {"queue", JM::queue(lab, id)}});
    }));

    svr.Post(R"(/api/reservations/([^/]+)/claim)", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        json body = parseBody(req);
        std::string studentId = getString(body, "studentId");
        int days = getIntOr(body, "days", 7); // M13: mặc định 7 ngày
        BorrowResult r = lab.claimReservation(studentId, id, days);
        if (!r.ok()) failResult(r);
        sendJson(res, 201, json{{"record", JM::record(lab, requireRecord(lab, r.recordId))},
                                {"queue", JM::queue(lab, id)}});
    }));

    svr.Delete(R"(/api/reservations/([^/]+)/([^/]+))", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        OpResult r = lab.cancelReservation(req.matches[2].str(), id);
        if (!r.ok()) failResult(r);
        sendJson(res, 200, json{{"device", JM::device(requireDevice(lab, id))}, {"queue", JM::queue(lab, id)}});
    }));

    // ======================= Gợi ý & đồ thị =======================
    svr.Get(R"(/api/suggestions/([^/]+))", wrap(mtx, [&lab](const Request& req, Response& res) {
        std::string id = req.matches[1].str();
        int k = static_cast<int>(queryInt(req, "k", 3, 1, 20));
        requireDevice(lab, id);
        DoublyLinkedList<Companion> top = lab.suggestCompanions(id, k);
        sendJson(res, 200, json{{"deviceId", id}, {"suggestions", JM::companions(top)}});
    }));

    svr.Get("/api/suggestions", wrap(mtx, [&lab](const Request& req, Response& res) {
        int k = static_cast<int>(queryInt(req, "k", 3, 1, 20));
        std::string raw = queryString(req, "ids");
        DoublyLinkedList<std::string> basket;
        json idsJson = json::array();
        size_t start = 0;
        while (start <= raw.size()) { // tách theo dấu phẩy, bỏ khoảng trắng hai đầu và mục rỗng
            size_t comma = raw.find(',', start);
            if (comma == std::string::npos) comma = raw.size();
            std::string item = raw.substr(start, comma - start);
            size_t b = item.find_first_not_of(" \t");
            size_t e = item.find_last_not_of(" \t");
            if (b != std::string::npos) {
                item = item.substr(b, e - b + 1);
                basket.pushBack(item);
                idsJson.push_back(item);
            }
            start = comma + 1;
        }
        DoublyLinkedList<Companion> list = lab.suggestForBasket(basket, k);
        sendJson(res, 200, json{{"ids", idsJson}, {"suggestions", JM::companions(list)}});
    }));

    svr.Get("/api/graph", wrap(mtx, [&lab](const Request&, Response& res) {
        sendJson(res, 200, JM::graph(lab));
    }));

    // ======================= Đồng hồ & thông báo =======================
    svr.Get("/api/clock", wrap(mtx, [&lab](const Request&, Response& res) {
        sendJson(res, 200, JM::clock(lab.now()));
    }));

    svr.Post("/api/clock/advance", wrap(mtx, [&lab](const Request& req, Response& res) {
        json body = parseBody(req);
        int hours = getInt(body, "hours");
        if (hours < 1 || hours > 8760) failInput("Số giờ tua phải từ 1 đến 8760");
        lab.advanceTime(hours);
        sendJson(res, 200, json{{"clock", JM::clock(lab.now())}, {"pendingNotifications", lab.notificationCount()}});
    }));

    svr.Get("/api/notifications", wrap(mtx, [&lab](const Request&, Response& res) {
        json arr = json::array();
        Notification n;
        while (lab.popNotification(&n)) arr.push_back(JM::notification(lab, n));
        sendJson(res, 200, json{{"notifications", arr}});
    }));

    // ======================= Lỗi chung =======================
    // Response >= 400 chưa có nội dung: route /api lạ → JSON NOT_FOUND; file tĩnh không có → chữ thường.
    svr.set_error_handler([](const Request& req, Response& res) {
        if (!res.body.empty()) return httplib::Server::HandlerResponse::Unhandled;
        bool api = req.path == "/api" || req.path.rfind("/api/", 0) == 0;
        if (api) {
            json body = JM::error(res.status == 404 ? "NOT_FOUND" : "INVALID_INPUT",
                                  "Không có endpoint: " + req.method + " " + req.path);
            res.set_content(body.dump(-1, ' ', false, json::error_handler_t::replace), JSON_TYPE);
        } else {
            res.set_content("Không tìm thấy: " + req.path, "text/plain; charset=utf-8");
        }
        return httplib::Server::HandlerResponse::Handled;
    });
}
