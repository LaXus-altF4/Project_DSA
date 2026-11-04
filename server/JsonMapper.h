#ifndef JSON_MAPPER_H
#define JSON_MAPPER_H

// Chuyển đối tượng của lõi sang JSON theo đúng docs/api.md mục 3.
// Tầng server: được dùng STL và nlohmann/json; không chứa logic nghiệp vụ — mọi số liệu suy ra
// (quá hạn, tiền phạt, thời gian giữ còn lại, gợi ý) đều lấy từ hàm của LabManager.
// Mọi hàm nhận LabManager phải được gọi khi đang giữ mutex của server.

#include <string>
#include "LabManager.h"
#include "Models.h"
#include "json.hpp"

namespace JsonMapper {

using json = nlohmann::json;

// ---------------- Enum → chuỗi / HTTP ----------------
const char* statusString(DeviceStatus s);          // "available" | "borrowed" | "maintenance"
const char* errorCodeString(ErrorCode c);          // VD "OUT_OF_STOCK"
int httpStatusFor(ErrorCode c);                    // 400 / 404 / 409
const char* notificationTypeString(NotificationType t); // "hold_granted" | "missed" | "removed"

// ---------------- Đối tượng ----------------
json clock(long long hour);                            // { hour, text }
json hourOrNull(long long hour);                       // hour < 0 → null
json hourTextOrNull(long long hour);                   // hour < 0 → null
json device(const Device& d);
json reservation(const LabManager& lab, const Reservation& r, int position);
json queue(const LabManager& lab, const std::string& deviceId); // mảng Reservation từ đầu hàng
json companion(const Companion& c);
json companions(const DoublyLinkedList<Companion>& list);
json record(const LabManager& lab, const BorrowRecord& r);
json notification(const LabManager& lab, const Notification& n);
json holdInfo(const HoldInfo& h);
json stats(const LabManager& lab, long long withinHours, int top);
json graph(const LabManager& lab);

// { "error": { code, message } } (+ details nếu không rỗng)
json error(const std::string& code, const std::string& message, const json& details = json());

} // namespace JsonMapper

#endif // JSON_MAPPER_H
