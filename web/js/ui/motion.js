/**
 * motion.js - Các tiện ích JavaScript hỗ trợ chuyển động mượt mà v2
 * Dùng chung cho toàn bộ giao diện web Lab; tự tắt khi FX phẳng hoặc prefers-reduced-motion.
 */

import { isMotionAllowed, prefersReducedMotion } from './fx.js';

export { prefersReducedMotion };

const FLIP_UNIT_ORDER = ['day', 'month', 'year', 'hour', 'minute'];

/**
 * Hiệu ứng đếm số (Count-up) từ giá trị hiện tại đến giá trị mới
 * Hỗ trợ so sánh hiển thị nhãn delta (+N/-N) bay lên khi có thay đổi
 * @param {HTMLElement} element - Phần tử hiển thị số
 * @param {number} endVal - Giá trị đích
 * @param {number} [duration=380] - Thời gian chạy (ms)
 * @param {Function} [formatter=v=>v] - Hàm định dạng số
 * @param {boolean} [showDelta=false] - Có hiện nhãn +N/-N bay lên khi đổi số không
 */
export function animateCountUp(element, endVal, duration = 380, formatter = (v) => v, showDelta = false) {
  if (!element) return;

  const target = Number(endVal) || 0;
  const startVal = element._lastValue !== undefined ? element._lastValue : target;
  const delta = target - startVal;
  const motionEnabled = isMotionAllowed();

  // Chỉ hiện nhãn delta & flash khi chuyển động được phép và giá trị thực sự thay đổi
  if (motionEnabled && element._lastValue !== undefined && delta !== 0 && showDelta) {
    showFloatingDelta(element.parentElement || element, delta);
    element.classList.remove('number-flash');
    void element.offsetWidth; // Force reflow
    element.classList.add('number-flash');
  }

  element._lastValue = target;

  if (startVal === target || !motionEnabled) {
    element.textContent = formatter(target);
    return;
  }

  const safeDuration = Math.max(120, Math.min(Number(duration) || 380, 450));
  const startTime = performance.now();

  function update(currentTime) {
    if (!isMotionAllowed()) {
      element.textContent = formatter(target);
      return;
    }
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / safeDuration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + delta * easeOut);

    element.textContent = formatter(current);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = formatter(target);
    }
  }

  requestAnimationFrame(update);
}

/**
 * Hiển thị nhãn delta "+N" hoặc "-N" nhỏ bay lên rồi biến mất
 * @param {HTMLElement} container - Khung bao bọc số
 * @param {number} delta - Giá trị chênh lệch
 */
export function showFloatingDelta(container, delta) {
  if (!container || delta === 0 || !isMotionAllowed()) return;

  const originalPos = window.getComputedStyle(container).position;
  if (originalPos === 'static') {
    container.style.position = 'relative';
  }

  const badge = document.createElement('span');
  badge.className = `floating-delta ${delta > 0 ? 'delta-plus' : 'delta-minus'}`;
  badge.textContent = delta > 0 ? `+${delta}` : `${delta}`;

  container.appendChild(badge);

  setTimeout(() => {
    if (badge.parentNode) badge.parentNode.removeChild(badge);
  }, 460);
}

/**
 * Kích hoạt viền đỏ nhấp nháy Pulse 2 lần
 * @param {HTMLElement} element - Thẻ cần nhấp nháy
 */
export function triggerRedPulse(element) {
  if (!element || !isMotionAllowed()) return;
  element.classList.remove('pulse-border-red');
  void element.offsetWidth; // Force reflow
  element.classList.add('pulse-border-red');
  setTimeout(() => {
    element.classList.remove('pulse-border-red');
  }, 900);
}

/**
 * Cập nhật chữ số đồng hồ (chế độ phẳng tắt lăn chữ, hiện tức thì)
 * @param {HTMLElement} element - Phần tử hiển thị
 * @param {string} newText - Nội dung ngày giờ mới
 */
export function triggerRollDigit(element, newText) {
  if (!element) return;
  const cleanText = String(newText || '');
  const wasSame = element.textContent === cleanText && !element.classList.contains('flip-clock-active');
  if (wasSame) return;

  element.classList.remove('clock-roll');
  element.textContent = cleanText;

  if (!isMotionAllowed()) return;

  void element.offsetWidth;
  element.classList.add('clock-roll');
  setTimeout(() => {
    element.classList.remove('clock-roll');
  }, 300);
}

/**
 * Tách chuỗi ngày giờ ("03/03/2026 16:00" hoặc "--/--/---- --:00")
 * thành 5 ô riêng cố định: day, month, year, hour, minute
 */
function parseClockFields(text) {
  const str = String(text || '').trim();
  const match = str.match(/^(\S{2})\/(\S{2})\/(\S{4})\s+(\S{2}):(\S{2})$/);
  if (match) {
    return [
      { type: 'tile', unit: 'day', val: match[1] },
      { type: 'sep', val: '/' },
      { type: 'tile', unit: 'month', val: match[2] },
      { type: 'sep', val: '/' },
      { type: 'tile', unit: 'year', val: match[3] },
      { type: 'space', val: ' ' },
      { type: 'tile', unit: 'hour', val: match[4] },
      { type: 'sep', val: ':' },
      { type: 'tile', unit: 'minute', val: match[5] },
    ];
  }

  const rawTokens = str.match(/\d+|\s+|[^\d\s]+/g) || [str];
  let tileIdx = 0;
  return rawTokens.map((tok) => {
    if (/^\d+$/.test(tok)) {
      const unit = FLIP_UNIT_ORDER[tileIdx] || `field-${tileIdx}`;
      tileIdx += 1;
      return { type: 'tile', unit, val: tok };
    }
    if (/^\s+$/.test(tok)) {
      return { type: 'space', val: tok };
    }
    return { type: 'sep', val: tok };
  });
}

function clearTileFlipTimer(tile) {
  if (tile._flipTimer) {
    clearTimeout(tile._flipTimer);
    tile._flipTimer = 0;
  }
  tile.classList.remove('is-flipping');
  const oldRig = tile.querySelector('.flip-3d-rig');
  if (oldRig) oldRig.remove();
}

function buildFlipClockDom(element, tokens) {
  element.innerHTML = '';
  element.classList.add('flip-clock-active');

  tokens.forEach((tok) => {
    if (tok.type === 'tile') {
      const tile = document.createElement('span');
      tile.className = 'flip-tile tabular-nums';
      tile.dataset.unit = tok.unit;
      tile.dataset.val = tok.val;

      const valSpan = document.createElement('span');
      valSpan.className = 'flip-tile-val';
      valSpan.textContent = tok.val;

      tile.appendChild(valSpan);
      element.appendChild(tile);
    } else if (tok.type === 'space') {
      const sp = document.createElement('span');
      sp.className = 'flip-space';
      sp.textContent = tok.val;
      element.appendChild(sp);
    } else {
      const sep = document.createElement('span');
      sep.className = 'flip-sep';
      sep.textContent = tok.val;
      element.appendChild(sep);
    }
  });
}

/**
 * Cập nhật đồng hồ kiểu Flip-Clock 3D (5 ô riêng: Ngày / Tháng / Năm  Giờ : Phút):
 * Các ô số thay đổi sẽ lật 3D quanh trục X khi tua giờ.
 * @param {HTMLElement} element - Phần tử #clock-time
 * @param {string} newText - Chuỗi giờ mới từ API (VD "03/03/2026 17:00")
 * @param {boolean} [animate=true] - Có chạy hiệu ứng lật cánh 3D hay không
 */
export function updateFlipClock3D(element, newText, animate = true) {
  if (!element) return;
  const cleanText = String(newText || '').trim();
  element.dataset.rawTime = cleanText;
  element.setAttribute('aria-label', `Đồng hồ giả lập: ${cleanText}`);

  const newTokens = parseClockFields(cleanText);
  const existingChildren = Array.from(element.children);

  const structureMatches =
    element.classList.contains('flip-clock-active') &&
    existingChildren.length === newTokens.length &&
    newTokens.every((tok, idx) => {
      const child = existingChildren[idx];
      if (tok.type === 'tile') {
        return child.classList.contains('flip-tile') && child.dataset.unit === tok.unit;
      }
      if (tok.type === 'space') return child.classList.contains('flip-space');
      return child.classList.contains('flip-sep');
    });

  if (!structureMatches) {
    buildFlipClockDom(element, newTokens);
    return;
  }

  const shouldAnimate = Boolean(animate) && isMotionAllowed();
  let changedOrder = 0;

  newTokens.forEach((tok, idx) => {
    const child = existingChildren[idx];
    if (tok.type !== 'tile') {
      if (child.textContent !== tok.val) child.textContent = tok.val;
      return;
    }

    const oldVal = child.dataset.val || '';
    if (oldVal === tok.val) return;

    clearTileFlipTimer(child);
    child.dataset.val = tok.val;

    const valSpan = child.querySelector('.flip-tile-val');
    if (valSpan) {
      valSpan.textContent = tok.val;
    }

    if (!shouldAnimate || !oldVal || oldVal.includes('-')) {
      return;
    }

    // Dựng giàn 4 nửa cánh lật cơ học
    const delayMs = changedOrder * 40;
    changedOrder += 1;

    const rig = document.createElement('span');
    rig.className = 'flip-3d-rig';
    rig.setAttribute('aria-hidden', 'true');
    rig.style.setProperty('--flip-delay', `${delayMs}ms`);

    const staticTop = document.createElement('span');
    staticTop.className = 'flip-plate flip-static-top';
    staticTop.setAttribute('data-txt', tok.val);

    const staticBottom = document.createElement('span');
    staticBottom.className = 'flip-plate flip-static-bottom';
    staticBottom.setAttribute('data-txt', oldVal);

    const leafTop = document.createElement('span');
    leafTop.className = 'flip-plate flip-leaf-top';
    leafTop.setAttribute('data-txt', oldVal);

    const leafBottom = document.createElement('span');
    leafBottom.className = 'flip-plate flip-leaf-bottom';
    leafBottom.setAttribute('data-txt', tok.val);

    rig.append(staticTop, staticBottom, leafTop, leafBottom);
    child.appendChild(rig);
    child.classList.add('is-flipping');

    child._flipTimer = window.setTimeout(() => {
      clearTileFlipTimer(child);
    }, 400 + delayMs);
  });
}

/**
 * Gỡ cấu trúc Flip-Clock 3D và trả phần tử đồng hồ về chuỗi phẳng gốc
 * @param {HTMLElement} element - Phần tử #clock-time
 */
export function teardownFlipClock3D(element) {
  if (!element) return;
  const raw = element.dataset.rawTime || element.textContent || '';
  element.querySelectorAll('.flip-tile').forEach(clearTileFlipTimer);
  element.classList.remove('flip-clock-active');
  element.textContent = raw;
  element.setAttribute('aria-label', `Đồng hồ giả lập: ${raw}`);
}
