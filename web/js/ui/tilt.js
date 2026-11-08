/**
 * tilt.js - Nghiêng chiều sâu Tilt 3D tinh tế theo chuột trên các thẻ (<= 4 độ)
 * - Không dùng listener mousemove/pointermove toàn cục trên window.
 * - Chỉ gắn pointermove cục bộ trên đúng thẻ đang được trỏ chuột và gỡ ngay khi rời thẻ.
 * - Không tilt bảng dữ liệu lớn (.data-table, .bento-table-card), biểu mẫu hay Đồ thị 2D (#/graph).
 */

import { isMotionAllowed, isTabVisible, onFxChange } from './fx.js';

const TILT_COMPACT_SELECTOR = '.metric-card, .companion-card, .suggestion-card, .expiring-item';
const TILT_MEDIUM_SELECTOR = '.queue-card, .return-record-item, .device-select-item:not(.in-basket), .bento-card:not(.bento-table-card)';
const TILT_ANY_SELECTOR = `${TILT_COMPACT_SELECTOR}, ${TILT_MEDIUM_SELECTOR}`;

let listenersAttached = false;
let rafId = 0;

let activeTiltCard = null;
let activeTiltRect = null;
let activeTiltMaxDeg = 0;
let tiltRectDirty = false;
let pendingClientX = 0;
let pendingClientY = 0;

function hasFinePointer() {
  try {
    return Boolean(
      window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches
    );
  } catch (_) {
    return true;
  }
}

function isCardBusyWithAnimation(el) {
  if (!el) return true;
  if (el.dataset.flipBusy === '1') return true;
  return (
    el.classList.contains('pulse-border-red') ||
    el.classList.contains('pulse-glow-hold') ||
    el.classList.contains('card-shrink-remove') ||
    el.classList.contains('queue-card-flip-3d')
  );
}

function applyTiltFrame() {
  rafId = 0;
  if (!activeTiltCard || !activeTiltCard.isConnected || isCardBusyWithAnimation(activeTiltCard)) {
    clearActiveTiltCard();
    return;
  }

  if (tiltRectDirty || !activeTiltRect) {
    activeTiltRect = activeTiltCard.getBoundingClientRect();
    tiltRectDirty = false;
  }

  if (activeTiltRect.width > 0 && activeTiltRect.height > 0) {
    const nx = Math.max(
      -1,
      Math.min(1, ((pendingClientX - activeTiltRect.left) / activeTiltRect.width) * 2 - 1)
    );
    const ny = Math.max(
      -1,
      Math.min(1, ((pendingClientY - activeTiltRect.top) / activeTiltRect.height) * 2 - 1)
    );

    const rawRx = -ny * activeTiltMaxDeg;
    const rawRy = nx * activeTiltMaxDeg;
    // Khống chế nghiêm ngặt góc nghiêng tối đa ±4.00°, KHÔNG dịch chuyển vị trí
    const rx = Math.max(-4, Math.min(4, rawRx)).toFixed(2);
    const ry = Math.max(-4, Math.min(4, rawRy)).toFixed(2);
    activeTiltCard.style.setProperty('--tilt-rx', `${rx}deg`);
    activeTiltCard.style.setProperty('--tilt-ry', `${ry}deg`);
  }
}

function scheduleTiltUpdate(clientX, clientY) {
  pendingClientX = clientX;
  pendingClientY = clientY;
  if (!rafId) {
    rafId = window.requestAnimationFrame(applyTiltFrame);
  }
}

function handleActiveCardPointerMove(e) {
  if (!activeTiltCard || isCardBusyWithAnimation(activeTiltCard)) {
    clearActiveTiltCard();
    return;
  }
  scheduleTiltUpdate(e.clientX, e.clientY);
}

function handleActiveCardPointerLeave() {
  clearActiveTiltCard();
}

function clearActiveTiltCard() {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (!activeTiltCard) return;

  const prev = activeTiltCard;
  prev.removeEventListener('pointermove', handleActiveCardPointerMove);
  prev.removeEventListener('pointerleave', handleActiveCardPointerLeave);
  prev.classList.remove('is-tilt-hover');
  prev.style.removeProperty('--tilt-rx');
  prev.style.removeProperty('--tilt-ry');

  if (prev._tiltReleaseTimer) {
    window.clearTimeout(prev._tiltReleaseTimer);
  }
  prev._tiltReleaseTimer = window.setTimeout(() => {
    prev.style.willChange = '';
    prev._tiltReleaseTimer = 0;
  }, 180);

  activeTiltCard = null;
  activeTiltRect = null;
  activeTiltMaxDeg = 0;
  tiltRectDirty = false;
}

function handleDocumentPointerOver(e) {
  const target = e.target;
  if (!target || typeof target.closest !== 'function') return;

  const candidate = target.closest(TILT_ANY_SELECTOR);
  if (candidate === activeTiltCard) return;

  clearActiveTiltCard();
  if (!candidate || isCardBusyWithAnimation(candidate)) return;

  activeTiltCard = candidate;
  activeTiltRect = candidate.getBoundingClientRect();
  activeTiltMaxDeg = candidate.matches(TILT_COMPACT_SELECTOR) ? 3.5 : 2.2;
  tiltRectDirty = false;

  if (activeTiltCard._tiltReleaseTimer) {
    window.clearTimeout(activeTiltCard._tiltReleaseTimer);
    activeTiltCard._tiltReleaseTimer = 0;
  }
  activeTiltCard.style.willChange = 'transform';
  activeTiltCard.classList.add('tilt-settled', 'is-tilt-hover');

  activeTiltCard.addEventListener('pointermove', handleActiveCardPointerMove, { passive: true });
  activeTiltCard.addEventListener('pointerleave', handleActiveCardPointerLeave, { passive: true });
  scheduleTiltUpdate(e.clientX, e.clientY);
}

function markTiltRectDirty() {
  if (activeTiltCard) {
    tiltRectDirty = true;
  }
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  document.addEventListener('pointerover', handleDocumentPointerOver, { passive: true });
  window.addEventListener('scroll', markTiltRectDirty, { capture: true, passive: true });
  window.addEventListener('resize', markTiltRectDirty, { passive: true });
}

function detachListeners() {
  if (!listenersAttached) return;
  listenersAttached = false;

  document.removeEventListener('pointerover', handleDocumentPointerOver);
  window.removeEventListener('scroll', markTiltRectDirty, { capture: true });
  window.removeEventListener('resize', markTiltRectDirty);

  clearActiveTiltCard();
}

function syncTiltState() {
  if (isMotionAllowed() && isTabVisible() && hasFinePointer()) {
    attachListeners();
  } else {
    detachListeners();
  }
}

/**
 * Khởi tạo hiệu ứng Tilt 3D trên các thẻ
 */
export function initCardTilt() {
  syncTiltState();
  onFxChange(syncTiltState);
}
