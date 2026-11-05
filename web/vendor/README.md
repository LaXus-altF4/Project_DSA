# Thư viện & Tài nguyên bên thứ ba (web/vendor/ & web/assets/fonts/)

> Toàn bộ tài nguyên được tải về và lưu trữ cục bộ để phục vụ mục tiêu **chạy 100% offline**, không sử dụng CDN hay bất kỳ yêu cầu mạng nào khi chạy ứng dụng.

---

## 1. Thư viện JavaScript (`web/vendor/`)

### `vis-network.min.js`
- **Phiên bản:** `9.1.9` (Standalone UMD bundle)
- **Nguồn tải:** [unpkg.com/vis-network@9.1.9](https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js)
- **Trang chủ / Repo:** [https://github.com/visjs/vis-network](https://github.com/visjs/vis-network)
- **Giấy phép (License):** Dual license: Apache-2.0 / MIT License
- **Mục đích:** Dựng đồ thị mượn kèm dạng mô phỏng lực vật lý (force-directed layout) ở màn hình `#/graph`, cho phép kéo thả đỉnh, phóng to/thu nhỏ, làm nổi bật láng giềng liên kết.

### `lucide.min.js`
- **Phiên bản:** `0.460.0` (Standalone UMD bundle)
- **Nguồn tải:** [unpkg.com/lucide@0.460.0](https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js)
- **Trang chủ / Repo:** [https://github.com/lucide-icons/lucide](https://github.com/lucide-icons/lucide)
- **Giấy phép (License):** ISC License
- **Mục đích:** Cung cấp bộ icon vector SVG hiện đại cho toàn hệ thống (đồng hồ, menu sidebar, trạng thái kho, giỏ hàng, thông báo). Tự động render qua `lucide.createIcons()`.

### `three.module.min.js`
- **Phiên bản:** `0.160.0` (`r160` — Standalone ES Module minified, ~655 KB)
- **Nguồn tải:** [unpkg.com/three@0.160.0](https://unpkg.com/three@0.160.0/build/three.module.min.js)
- **Trang chủ / Repo:** [https://github.com/mrdoob/three.js](https://github.com/mrdoob/three.js)
- **Giấy phép (License):** MIT License (`SPDX-License-Identifier: MIT`, Copyright 2010–2023 Three.js Authors)
- **Mục đích:** Dựng lớp lưới sóng phối cảnh & hạt bụi ánh sáng 3D mờ phía sau nội dung (`bg-scene.js`) và mô hình 3D Low-Poly linh kiện Lab trang trí có thể thu gọn ở màn Tổng quan (`lab-hero-3d.js`). Được nạp động qua `import()` khi bật công tắc `"Hiệu ứng 3D"`, giới hạn `devicePixelRatio ≤ 1.5` và tự động tạm dừng khi ẩn tab hoặc khi bật `prefers-reduced-motion`.

---

## 2. Phông chữ cục bộ (`web/assets/fonts/`)

### `Be Vietnam Pro`
- **Các tệp:**
  - `BeVietnamPro-Regular.ttf` (Weight: 400)
  - `BeVietnamPro-Medium.ttf` (Weight: 500)
  - `BeVietnamPro-SemiBold.ttf` (Weight: 600)
  - `BeVietnamPro-Bold.ttf` (Weight: 700)
  - `OFL.txt` (Toàn văn giấy phép SIL Open Font License)
- **Phiên bản:** Version 1.002
- **Tác giả:** Lam Bao, Tony Le (Tiệm Thơm, VietType)
- **Nguồn tải:** [Google Fonts OFL Repository](https://github.com/google/fonts/tree/main/ofl/bevietnampro)
- **Giấy phép (License):** SIL Open Font License, Version 1.1 (xem chi tiết tại `web/assets/fonts/OFL.txt`)
- **Mục đích:** Phông chữ chính toàn bộ giao diện, được thiết kế tối ưu tuyệt đối cho hiển thị tiếng Việt có dấu. Khai báo qua `@font-face` trong `web/css/base.css`.
