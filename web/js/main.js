/**
 * main.js - Điểm khởi động toàn ứng dụng SPA
 */

import { initTheme } from './ui/theme.js';
import { initFx } from './ui/fx.js';
import { initSplash } from './ui/splash.js';
import { initBgScene } from './ui/bg-scene.js';
import { initCardTilt } from './ui/tilt.js';
import { initRipple } from './ui/ripple.js';
import { initClock } from './ui/clock.js';
import { initRouter } from './router.js';
import { isMockEnabled } from './mock.js';
import { showToast } from './ui/toast.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Khởi tạo Giao diện Sáng / Tối & Công tắc Hiệu ứng 3D
  try {
    initTheme();
  } catch (err) {
    console.error('[LabApp] Lỗi initTheme:', err);
  }

  try {
    initFx();
  } catch (err) {
    console.error('[LabApp] Lỗi initFx:', err);
  }

  // 1b. Khởi tạo Màn hình chờ Splash Screen ~1 giây (Đợt E.2, fail-safe: không bao giờ chặn app)
  try {
    initSplash();
  } catch (err) {
    console.warn('[LabApp] Bỏ qua lỗi splash để tiếp tục khởi chạy app:', err);
    const brokenSplash = document.getElementById('app-splash');
    if (brokenSplash) brokenSplash.remove();
  }

  // Fallback an toàn toàn cục: đảm bảo gỡ bỏ hoàn toàn màn chào sau tối đa 2 giây dù có bất kỳ sự cố nào
  window.setTimeout(() => {
    const lingering = document.getElementById('app-splash');
    if (lingering) {
      console.warn('[LabApp] Fallback timeout 2s: tự thu hồi màn chào còn sót');
      lingering.remove();
    }
  }, 2000);

  // 2. Khởi tạo Đồng hồ giả lập trên Topbar
  try {
    initClock();
  } catch (err) {
    console.error('[LabApp] Lỗi initClock:', err);
  }

  // 3. Khởi tạo Bộ định tuyến Hash
  try {
    initRouter();
  } catch (err) {
    console.error('[LabApp] Lỗi initRouter:', err);
  }

  // 4. Khởi tạo Icon Lucide ban đầu
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('[LabApp] Lỗi lucide.createIcons:', err);
  }

  // 5. Khởi tạo Tilt 3D, Ripple & Nền không khí 3D (nạp động không chặn trang chính)
  try {
    initCardTilt();
  } catch (err) {
    console.warn('[LabApp] Lỗi initCardTilt:', err);
  }

  try {
    initRipple();
  } catch (err) {
    console.warn('[LabApp] Lỗi initRipple:', err);
  }

  try {
    initBgScene();
  } catch (err) {
    console.warn('[LabApp] Lỗi initBgScene:', err);
  }

  // 6. Kiểm tra chế độ Mock
  try {
    if (isMockEnabled()) {
      console.info('%c[LabApp] 🧪 Đang chạy ở chế độ MOCK (?mock=1)', 'color: #3b82f6; font-weight: bold;');
      showToast('Ứng dụng đang chạy ở chế độ dữ liệu giả lập (?mock=1).', 'info', 'Chế độ Mock', 3000);
    } else {
      console.info('%c[LabApp] 🚀 Đang kết nối trực tiếp API Backend', 'color: #10b981; font-weight: bold;');
    }
  } catch (err) {
    console.warn('[LabApp] Lỗi kiểm tra mock:', err);
  }
});
