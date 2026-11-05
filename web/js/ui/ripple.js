/**
 * ripple.js - Hiệu ứng sóng nhấn (Ripple) cho nút bấm (Đợt C.2)
 * Uỷ quyền 1 listener pointerdown duy nhất ở document; tự động thu dọn DOM sau 440ms;
 * tắt hoàn toàn khi tắt công tắc "Hiệu ứng 3D" hoặc khi bật prefers-reduced-motion.
 */

import { isMotionAllowed, onFxChange } from './fx.js';

const RIPPLE_TARGET_SELECTOR = '.btn:not(:disabled), .btn-icon:not(:disabled), .filter-pill:not(:disabled)';

let listenerBound = false;

function handlePointerDown(e) {
  // Chỉ phản hồi chuột trái hoặc chạm trực tiếp
  if (e.button !== undefined && e.button !== 0) return;
  if (!isMotionAllowed()) return;

  const target =
    e.target && typeof e.target.closest === 'function'
      ? e.target.closest(RIPPLE_TARGET_SELECTOR)
      : null;
  if (!target) return;

  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const size = Math.ceil(Math.max(rect.width, rect.height) * 1.15);
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;

  const ripple = document.createElement('span');
  ripple.className = 'btn-ripple';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x.toFixed(1)}px`;
  ripple.style.top = `${y.toFixed(1)}px`;

  target.appendChild(ripple);

  const cleanup = () => {
    if (ripple.parentNode) {
      ripple.parentNode.removeChild(ripple);
    }
  };

  ripple.addEventListener('animationend', cleanup, { once: true });
  window.setTimeout(cleanup, 460);
}

function syncRippleListener() {
  if (isMotionAllowed()) {
    if (!listenerBound) {
      listenerBound = true;
      document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    }
  } else if (listenerBound) {
    listenerBound = false;
    document.removeEventListener('pointerdown', handlePointerDown);
    document.querySelectorAll('.btn-ripple').forEach((el) => el.remove());
  }
}

/**
 * Khởi tạo hiệu ứng Ripple trên nút bấm (Đợt C.2)
 */
export function initRipple() {
  syncRippleListener();
  onFxChange(syncRippleListener);
}
