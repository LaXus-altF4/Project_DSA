# Thư viện bên thứ ba (header-only)

Chỉ dùng ở tầng `server/` (lõi CTDL không phụ thuộc thư viện nào). Tải nguyên file từ repo GitHub chính thức, không chỉnh sửa.

| File | Thư viện | Phiên bản (tag) | Commit của tag | Nguồn | SHA-256 |
|---|---|---|---|---|---|
| `httplib.h` | cpp-httplib (MIT) — https://github.com/yhirose/cpp-httplib | `v0.64.0` | `24e58ce5b25d55045af4cd6f463e83a8082fbe6b` | `https://raw.githubusercontent.com/yhirose/cpp-httplib/v0.64.0/httplib.h` | `805169049E6A6E9BA7729D7E01D14CED825029C88A277586602A6B38DF4D5357` |
| `json.hpp` | nlohmann/json (MIT) — https://github.com/nlohmann/json | `v3.12.0` | `55f93686c01528224f448c19128836e7df245f72` | `https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp` | `AAF127C04CB31C406E5B04A63F1AE89369FCCDE6D8FA7CDDA1ED4F32DFC5DE63` |

Tải ngày 05/11/2026. Kiểm tra lại: `Get-FileHash third_party\httplib.h -Algorithm SHA256`.

Ghi chú build (MinGW-W64 13.2): cpp-httplib yêu cầu Windows 10 trở lên nên `build_server.ps1` định nghĩa
`-D_WIN32_WINNT=0x0A00` và link `-lws2_32`. Thư mục này được thêm bằng `-isystem` để cảnh báo trong thư viện
không ảnh hưởng `-Wall -Wextra -Werror` của mã dự án.
