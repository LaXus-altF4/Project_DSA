PHẦN MỀM QUẢN LÝ MƯỢN TRẢ THIẾT BỊ VÀ GỢI Ý ĐỒ DÙNG THỰC HÀNH
Đồ án Cấu trúc dữ liệu & Giải thuật — HCMUS
Sinh viên: Lê Trường Khải — MSSV 25300003

YÊU CẦU: Windows 10 trở lên. Không cần cài thêm gì (không cần MinGW/g++).

CÁCH CHẠY (bản web):
  1. Bấm đúp LabApp.exe.
  2. Trình duyệt tự mở http://127.0.0.1:8080 (nếu không tự mở, hãy gõ địa chỉ này vào trình duyệt).
  3. Để tắt: nhấn Ctrl+C hoặc đóng cửa sổ đen của LabApp.exe.
  Dữ liệu tự lưu vào thư mục data\ sau mỗi thao tác.

BẢN CONSOLE:
  app.exe là bản chạy trong cửa sổ dòng lệnh (menu 0-12). Mở bằng Windows Terminal/PowerShell:
    .\app.exe
  Chạy từ thư mục này để thấy thư mục data\.

LƯU Ý:
  - Không chạy app.exe và LabApp.exe cùng lúc (hai bên ghi đè dữ liệu của nhau).
  - Khôi phục dữ liệu mẫu ban đầu:  LabApp.exe --seed   (GHI ĐÈ thư mục data\).
  - Đổi cổng: LabApp.exe --port 9000
  - Kịch bản demo từng bước: docs\demo-checklist.md