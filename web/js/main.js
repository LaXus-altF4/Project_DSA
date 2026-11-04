/**
 * main.js - Điểm khởi động toàn ứng dụng SPA
 */

import { initTheme } from './ui/theme.js';
import { initClock } from './ui/clock.js';
import { initRouter } from './router.js';
import { isMockEnabled } from './mock.js';
import { showToast } from './ui/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Khởi tạo Giao diện Sáng / Tối
  initTheme();

  // 2. Khởi tạo Đồng hồ giả lập trên Topbar
  initClock();

  // 3. Khởi tạo Bộ định tuyến Hash
  initRouter();

  // 4. Khởi tạo Icon Lucide ban đầu
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  // 5. Kiểm tra chế độ Mock
  if (isMockEnabled()) {
    console.info('%c[LabApp] 🧪 Đang chạy ở chế độ MOCK (?mock=1)', 'color: #3b82f6; font-weight: bold;');
    showToast('Ứng dụng đang chạy ở chế độ dữ liệu giả lập (?mock=1).', 'info', 'Chế độ Mock', 3000);
  } else {
    console.info('%c[LabApp] 🚀 Đang kết nối trực tiếp API Backend', 'color: #10b981; font-weight: bold;');
  }
});
