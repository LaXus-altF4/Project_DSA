# Phần mềm quản lý mượn trả thiết bị và gợi ý đồ dùng thực hành

Đồ án môn Thực hành Cấu trúc dữ liệu & Giải thuật — HCMUS.
Sinh viên: Lê Trường Khải — MSSV 25300003.

> README đang được viết dần theo từng giai đoạn.

## Yêu cầu
- Windows, `g++` (MinGW-W64 13.2.0 trở lên), hỗ trợ C++17.

## Build & chạy

Các script build là file PowerShell `.ps1`. Windows có thể chặn chạy script theo mặc định,
nên khi chạy **từ CMD** hãy dùng:

```bat
powershell -ExecutionPolicy Bypass -File build_test.ps1
```

Từ PowerShell (nếu đã cho phép chạy script) có thể gõ trực tiếp `.\build_test.ps1`.

| Script | Kết quả |
|---|---|
| `build_test.ps1` | Build `build/test.exe` (bật `-Wall -Wextra -Werror`) và chạy unit test của lõi |
