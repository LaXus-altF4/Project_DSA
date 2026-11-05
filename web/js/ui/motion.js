/**
 * motion.js - Các tiện ích JavaScript hỗ trợ chuyển động mượt mà (60fps)
 * Dùng chung cho toàn bộ giao diện web Lab
 */

export { prefersReducedMotion } from './fx.js';

/**
 * Hiệu ứng đếm số (Count-up) từ giá trị hiện tại đến giá trị mới
 * Hỗ trợ so sánh hiển thị nhãn delta (+1/-1) bay lên khi có thay đổi
 * @param {HTMLElement} element - Phần tử hiển thị số
 * @param {number} endVal - Giá trị đích
 * @param {number} [duration=350] - Thời gian chạy (ms, tối đa 400ms)
 * @param {Function} [formatter=v=>v] - Hàm định dạng số
 * @param {boolean} [showDelta=false] - Có hiện nhãn +1/-1 bay lên khi đổi số không
 */
export function animateCountUp(element, endVal, duration = 350, formatter = (v) => v, showDelta = false) {
  if (!element) return;

  const target = Number(endVal) || 0;
  const startVal = element._lastValue !== undefined ? element._lastValue : 0;
  const delta = target - startVal;

  // Hiển thị nhãn delta bay lên nếu có thay đổi và được kích hoạt
  if (element._lastValue !== undefined && delta !== 0 && showDelta) {
    showFloatingDelta(element.parentElement || element, delta);
    element.classList.remove('number-flash');
    void element.offsetWidth; // Force reflow
    element.classList.add('number-flash');
  }

  element._lastValue = target;

  if (startVal === target) {
    element.textContent = formatter(target);
    return;
  }

  // Tôn trọng prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = formatter(target);
    return;
  }

  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Easing cubic out
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
 * Hiển thị nhãn delta "+1" hoặc "-1" nhỏ bay lên rồi biến mất
 * @param {HTMLElement} container - Khung bao bọc số
 * @param {number} delta - Giá trị chênh lệch
 */
export function showFloatingDelta(container, delta) {
  if (!container || delta === 0) return;

  // Đảm bảo container có vị trí relative để căn chỉnh
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
  }, 420);
}

/**
 * Kích hoạt viền đỏ nhấp nháy Pulse 2 lần
 * @param {HTMLElement} element - Thẻ cần nhấp nháy
 */
export function triggerRedPulse(element) {
  if (!element) return;
  element.classList.remove('pulse-border-red');
  void element.offsetWidth; // Force reflow
  element.classList.add('pulse-border-red');
  setTimeout(() => {
    element.classList.remove('pulse-border-red');
  }, 850);
}

/**
 * Lăn chữ số (Roll) kiểu đồng hồ cơ khi đổi text (chế độ phẳng)
 * @param {HTMLElement} element - Phần tử hiển thị
 * @param {string} newText - Nội dung ngày giờ mới
 */
export function triggerRollDigit(element, newText) {
  if (!element) return;
  if (element.textContent === newText && !element.classList.contains('flip-clock-active')) return;

  element.classList.remove('clock-roll');
  void element.offsetWidth; // Force reflow
  element.textContent = newText;
  element.classList.add('clock-roll');
  setTimeout(() => {
    element.classList.remove('clock-roll');
  }, 320);
}

/**
 * Tách chuỗi ngày giờ ("03/03/2026 16:00") thành mảng token số & ký tự phân cách
 */
function tokenizeClockText(text) {
  const str = String(text || '');
  return str.match(/\d+|\s+|[^\d\s]+/g) || [str];
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
    if (/^\d+$/.test(tok)) {
      const tile = document.createElement('span');
      tile.className = 'flip-tile';
      tile.dataset.val = tok;

      const valSpan = document.createElement('span');
      valSpan.className = 'flip-tile-val';
      valSpan.textContent = tok;

      tile.appendChild(valSpan);
      element.appendChild(tile);
    } else if (/^\s+$/.test(tok)) {
      const sp = document.createElement('span');
      sp.className = 'flip-space';
      sp.textContent = tok;
      element.appendChild(sp);
    } else {
      const sep = document.createElement('span');
      sep.className = 'flip-sep';
      sep.textContent = tok;
      element.appendChild(sep);
    }
  });
}

/**
 * Cập nhật đồng hồ kiểu Flip-Clock 3D (Đợt B.2):
 * Các cụm số thay đổi sẽ lật cánh 3D quanh trục X khi tua giờ.
 * @param {HTMLElement} element - Phần tử #clock-time
 * @param {string} newText - Chuỗi giờ mới từ API (VD "03/03/2026 17:00")
 * @param {boolean} [animate=true] - Có chạy hiệu ứng lật cánh 3D hay không
 */
export function updateFlipClock3D(element, newText, animate = true) {
  if (!element) return;
  const cleanText = String(newText || '');
  element.dataset.rawTime = cleanText;
  element.setAttribute('aria-label', cleanText);

  const newTokens = tokenizeClockText(cleanText);
  const existingChildren = Array.from(element.children);

  // Kiểm tra cấu trúc DOM hiện tại có khớp khung Flip-Clock hay chưa
  const structureMatches =
    element.classList.contains('flip-clock-active') &&
    existingChildren.length === newTokens.length &&
    newTokens.every((tok, idx) => {
      const child = existingChildren[idx];
      if (/^\d+$/.test(tok)) return child.classList.contains('flip-tile');
      if (/^\s+$/.test(tok)) return child.classList.contains('flip-space');
      return child.classList.contains('flip-sep');
    });

  if (!structureMatches) {
    buildFlipClockDom(element, newTokens);
    return;
  }

  const reducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let changedOrder = 0;
  newTokens.forEach((tok, idx) => {
    const child = existingChildren[idx];
    if (!child.classList.contains('flip-tile')) {
      if (child.textContent !== tok) child.textContent = tok;
      return;
    }

    const oldVal = child.dataset.val || '';
    if (oldVal === tok) return;

    clearTileFlipTimer(child);
    child.dataset.val = tok;

    const valSpan = child.querySelector('.flip-tile-val');
    if (valSpan) {
      valSpan.textContent = tok;
    }

    if (!animate || reducedMotion || !oldVal || oldVal.includes('-')) {
      return;
    }

    // Dựng giàn 4 nửa cánh lật cơ học (dùng data-txt để không nhân đôi textContent)
    const delayMs = changedOrder * 35;
    changedOrder += 1;

    const rig = document.createElement('span');
    rig.className = 'flip-3d-rig';
    rig.setAttribute('aria-hidden', 'true');
    rig.style.setProperty('--flip-delay', `${delayMs}ms`);

    const staticTop = document.createElement('span');
    staticTop.className = 'flip-plate flip-static-top';
    staticTop.setAttribute('data-txt', tok);

    const staticBottom = document.createElement('span');
    staticBottom.className = 'flip-plate flip-static-bottom';
    staticBottom.setAttribute('data-txt', oldVal);

    const leafTop = document.createElement('span');
    leafTop.className = 'flip-plate flip-leaf-top';
    leafTop.setAttribute('data-txt', oldVal);

    const leafBottom = document.createElement('span');
    leafBottom.className = 'flip-plate flip-leaf-bottom';
    leafBottom.setAttribute('data-txt', tok);

    rig.append(staticTop, staticBottom, leafTop, leafBottom);
    child.appendChild(rig);
    child.classList.add('is-flipping');

    child._flipTimer = window.setTimeout(() => {
      clearTileFlipTimer(child);
    }, 390 + delayMs);
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
}
