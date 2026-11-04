#ifndef ROUTES_H
#define ROUTES_H

// Đăng ký mọi endpoint /api/... (đặc tả: docs/api.md).
// Mỗi handler: đọc JSON/tham số → khoá mutex → gọi hàm công khai của LabManager → đổi kết quả sang JSON.
// Không có logic nghiệp vụ ở đây.

#include <mutex>
#include "LabManager.h"
#include "httplib.h"

// lab và mtx phải sống lâu hơn server. Mọi truy cập lab (kể cả listener tự lưu CSV, chạy trong
// lời gọi lõi) đều diễn ra khi đang giữ mtx.
void registerRoutes(httplib::Server& svr, LabManager& lab, std::mutex& mtx);

#endif // ROUTES_H
