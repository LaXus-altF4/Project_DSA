/**
 * motion.js - Các tiện ích JavaScript hỗ trợ chuyển động mượt mà (60fps)
 * Dùng chung cho toàn bộ giao diện web Lab
 */

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
 * Lăn chữ số (Roll) kiểu đồng hồ cơ khi đổi text
 * @param {HTMLElement} element - Phần tử hiển thị
 * @param {string} newText - Nội dung ngày giờ mới
 */
export function triggerRollDigit(element, newText) {
  if (!element) return;
  if (element.textContent === newText) return;

  element.classList.remove('clock-roll');
  void element.offsetWidth; // Force reflow
  element.textContent = newText;
  element.classList.add('clock-roll');
  setTimeout(() => {
    element.classList.remove('clock-roll');
  }, 320);
}
