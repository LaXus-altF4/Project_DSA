/**
 * splash.js - Màn hình chờ Splash Screen ~1 giây khi mở web (Đợt E.2)
 *
 * Đặc điểm an toàn cao (Fail-safe):
 * - Trung tâm là Khối Lập Phương Vi Mạch 3D bằng CSS thuần (preserve-3d).
 * - Hiển thị ~850ms + 150ms tan mờ phối cảnh = đúng ~1.0 giây, sau đó tự remove() khỏi DOM.
 * - KHÔNG BAO GIỜ CHẶN APP: bọc try/catch toàn diện, kèm bộ đếm watchdog tự gỡ sạch sau tối đa 2.0s
 *   dù có bất kỳ lỗi JavaScript / CSS nào.
 * - Không chặn luồng khởi tạo dữ liệu: API, đồng hồ giả lập và router vẫn nạp song song ngay từ 0ms.
 * - Ghi cờ vào sessionStorage ('lab_splash_shown', bọc try/catch) để không lặp lại khi F5 liên tục trong cùng phiên.
 * - Cho phép nhấp chuột bất kỳ để bỏ qua ngay lập tức.
 * - Tự động bỏ qua (0ms) khi người dùng tắt công tắc "Hiệu ứng 3D" (data-fx="flat") hoặc bật prefers-reduced-motion: reduce.
 * - Hỗ trợ tham số URL ?splash=1 để ép hiển thị lại phục vụ kiểm thử / demo.
 */

import { isMotionAllowed, prefersReducedMotion } from './fx.js';

const SESSION_KEY = 'lab_splash_shown';
const SHOW_DURATION_MS = 850;
const FADE_OUT_MS = 150;
const WATCHDOG_MAX_MS = 2000;

/**
 * Kiểm tra xem có nên bỏ qua màn hình chờ hay không
 */
function shouldSkipSplash() {
  try {
    // 1. Tôn trọng chế độ giảm chuyển động hoặc công tắc Hiệu ứng 3D tắt
    if (prefersReducedMotion() || !isMotionAllowed()) {
      return true;
    }

    // 2. Cho phép ép hiển thị qua URL ?splash=1 hoặc ?splash=on
    const urlParam = new URLSearchParams(window.location.search).get('splash');
    if (urlParam === '1' || urlParam === 'on' || urlParam === 'true') {
      return false;
    }

    // 3. Kiểm tra cờ trong sessionStorage (chỉ hiện 1 lần mỗi phiên duyệt web)
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      return true;
    }
  } catch (_) {
    // Bỏ qua lỗi đọc URL / sessionStorage
  }

  return false;
}

/**
 * Khởi tạo màn hình chờ Splash Screen ~1 giây (An toàn tuyệt đối, không chặn app)
 */
export function initSplash() {
  let watchdogTimer = 0;

  // Watchdog khẩn cấp: Tự gỡ bỏ bất kỳ thẻ #app-splash nào còn sót lại sau tối đa 2 giây
  try {
    watchdogTimer = window.setTimeout(() => {
      const leftover = document.getElementById('app-splash');
      if (leftover) {
        console.warn('[LabApp Splash] Watchdog 2s kích hoạt: tự thu hồi màn chào');
        leftover.remove();
      }
    }, WATCHDOG_MAX_MS);
  } catch (_) {}

  try {
    if (shouldSkipSplash()) {
      if (watchdogTimer) window.clearTimeout(watchdogTimer);
      return;
    }

    // Đánh dấu đã hiển thị trong phiên này
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch (_) {}

    // Tạo phần tử DOM màn hình chào
    const splashEl = document.createElement('div');
    splashEl.id = 'app-splash';
    splashEl.className = 'app-splash';
    splashEl.setAttribute('role', 'dialog');
    splashEl.setAttribute('aria-modal', 'true');
    splashEl.setAttribute('aria-label', 'Khởi động Lab Manager');

    splashEl.innerHTML = `
      <div class="splash-backdrop"></div>
      <div class="splash-card">
        <div class="splash-cube-stage" aria-hidden="true">
          <div class="splash-cube-rig">
            <div class="splash-cube">
              <div class="cube-face cube-face-front">
                <span class="cube-chip-core"></span>
                <span class="cube-trace t-top"></span>
                <span class="cube-trace t-bottom"></span>
              </div>
              <div class="cube-face cube-face-back"></div>
              <div class="cube-face cube-face-right">
                <span class="cube-pins"></span>
              </div>
              <div class="cube-face cube-face-left">
                <span class="cube-pins"></span>
              </div>
              <div class="cube-face cube-face-top">
                <span class="cube-grid-node"></span>
              </div>
              <div class="cube-face cube-face-bottom"></div>
            </div>
          </div>
          <div class="splash-cube-shadow"></div>
        </div>

        <div class="splash-brand">
          <div class="splash-title">Lab Manager</div>
          <div class="splash-subtitle">HCMUS • Đồ án Cấu trúc dữ liệu &amp; Giải thuật</div>
        </div>

        <div class="splash-progress-track" aria-hidden="true">
          <div class="splash-progress-bar"></div>
        </div>

        <div class="splash-hint">Nhấp chuột bất kỳ để vào nhanh</div>
      </div>
    `;

    document.body.appendChild(splashEl);

    let isClosing = false;
    let closeTimer = 0;

    const dismissSplash = () => {
      if (isClosing) return;
      isClosing = true;

      if (closeTimer) {
        window.clearTimeout(closeTimer);
        closeTimer = 0;
      }
      if (watchdogTimer) {
        window.clearTimeout(watchdogTimer);
        watchdogTimer = 0;
      }

      splashEl.classList.add('is-closing');
      window.setTimeout(() => {
        splashEl.remove();
      }, FADE_OUT_MS + 25);
    };

    // Nhấp chuột bất kỳ để bỏ qua ngay lập tức
    splashEl.addEventListener('click', dismissSplash, { once: true });

    // Tự động đóng sau ~850ms hiển thị
    closeTimer = window.setTimeout(() => {
      dismissSplash();
    }, SHOW_DURATION_MS);
  } catch (err) {
    console.warn('[LabApp Splash] Lỗi trong quá trình tạo splash, ứng dụng vẫn tiếp tục:', err);
    if (watchdogTimer) window.clearTimeout(watchdogTimer);
    const broken = document.getElementById('app-splash');
    if (broken) broken.remove();
  }
}
