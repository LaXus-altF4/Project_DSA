/**
 * clock.js - Điều khiển đồng hồ giả lập 5 ô flip và sự kiện tua thời gian
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { openModal } from './modal.js';
import { teardownFlipClock3D, triggerRollDigit, updateFlipClock3D } from './motion.js';
import { isFxEnabled, isMotionAllowed, onFxChange } from './fx.js';

let isAdvancing = false;
let lastKnownFxState = null;

function applyClockDisplay(newText, animateFlip = false) {
  const clockEl = document.getElementById('clock-time');
  if (!clockEl || !newText) return;

  clockEl.dataset.rawTime = newText;
  clockEl.setAttribute('aria-label', `Đồng hồ giả lập: ${newText}`);

  if (isFxEnabled()) {
    updateFlipClock3D(clockEl, newText, animateFlip && isMotionAllowed());
  } else {
    if (clockEl.classList.contains('flip-clock-active')) {
      teardownFlipClock3D(clockEl);
    }
    triggerRollDigit(clockEl, newText);
  }
}

export async function refreshClock() {
  try {
    const clock = await api.get('/clock');
    if (clock && clock.text) {
      applyClockDisplay(clock.text, false);
    }
    return clock;
  } catch (err) {
    console.error('Lỗi khi nạp đồng hồ:', err);
  }
}

export async function advanceTime(hours) {
  if (isAdvancing) return;
  isAdvancing = true;

  const iconWrapper = document.getElementById('clock-icon-wrapper');
  if (iconWrapper && isMotionAllowed()) {
    iconWrapper.classList.add('spinning');
  }

  try {
    const result = await api.post('/clock/advance', { hours: Number(hours) });
    if (result && result.clock && result.clock.text) {
      applyClockDisplay(result.clock.text, true);
    }

    // Lấy thông báo sự kiện phát sinh từ hàng đợi / quá hạn
    const notiRes = await api.get('/notifications');
    const notifications = (notiRes && Array.isArray(notiRes.notifications)) ? notiRes.notifications : [];
    notifications.forEach(n => {
      let type = 'info';
      if (n.type === 'hold_granted') type = 'success';
      if (n.type === 'missed') type = 'warning';
      if (n.type === 'removed') type = 'error';

      showToast(n.message, type, 'Sự kiện hệ thống', 6000);
    });

    // Phát sự kiện để màn hình hiện tại tự làm mới dữ liệu
    window.dispatchEvent(new CustomEvent('lab:time-advanced', { detail: { hours, clock: result.clock, notifications } }));
  } catch (err) {
    showToast(err.message || 'Lỗi khi tua thời gian', 'error', 'Lỗi đồng hồ');
  } finally {
    setTimeout(() => {
      if (iconWrapper) iconWrapper.classList.remove('spinning');
      isAdvancing = false;
    }, 600);
  }
}

export function promptAdvanceNh() {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="input-custom-hours">Nhập số giờ muốn tua (1 – 8760 giờ):</label>
      <input
        type="number"
        id="input-custom-hours"
        class="form-input tabular-nums"
        min="1"
        max="8760"
        value="48"
        aria-describedby="input-custom-hours-helper input-custom-hours-error"
        autofocus
      >
      <div id="input-custom-hours-error" class="form-error-inline" role="alert" hidden></div>
      <div id="input-custom-hours-helper" class="form-helper">Hệ thống sẽ cập nhật trạng thái các lượt giữ hàng đợi và tính toán lại quá hạn.</div>
    </div>
  `;

  const inputEl = content.querySelector('#input-custom-hours');
  const errorEl = content.querySelector('#input-custom-hours-error');

  if (inputEl && errorEl) {
    inputEl.addEventListener('input', () => {
      inputEl.classList.remove('is-invalid');
      inputEl.removeAttribute('aria-invalid');
      errorEl.hidden = true;
      errorEl.textContent = '';
    });
  }

  openModal({
    title: 'Tua thời gian giả lập (+N giờ)',
    content,
    confirmText: 'Tua ngay',
    cancelText: 'Hủy',
    onConfirm: async () => {
      const val = parseInt(inputEl.value, 10);
      if (isNaN(val) || val < 1 || val > 8760) {
        const msg = 'Số giờ phải là số nguyên trong khoảng từ 1 đến 8760.';
        inputEl.classList.add('is-invalid');
        inputEl.setAttribute('aria-invalid', 'true');
        if (errorEl) {
          errorEl.textContent = msg;
          errorEl.hidden = false;
        }
        inputEl.focus();
        showToast(msg, 'warning');
        throw new Error('Invalid hours');
      }
      await advanceTime(val);
    }
  });
}

export function initClock() {
  lastKnownFxState = isFxEnabled();

  const initialClockEl = document.getElementById('clock-time');
  if (initialClockEl) {
    const initialRaw = initialClockEl.dataset.rawTime || initialClockEl.textContent || '--/--/---- --:00';
    if (lastKnownFxState) {
      updateFlipClock3D(initialClockEl, initialRaw, false);
    }
  }

  refreshClock();

  onFxChange(({ fxEnabled, motionAllowed }) => {
    const iconWrapper = document.getElementById('clock-icon-wrapper');
    if (iconWrapper && !motionAllowed) {
      iconWrapper.classList.remove('spinning');
    }

    if (fxEnabled === lastKnownFxState) return;
    lastKnownFxState = fxEnabled;

    const clockEl = document.getElementById('clock-time');
    if (!clockEl) return;
    const raw = clockEl.dataset.rawTime || clockEl.textContent || '';
    if (!raw) return;

    if (fxEnabled) {
      updateFlipClock3D(clockEl, raw, false);
    } else {
      teardownFlipClock3D(clockEl);
    }
  });

  const btn1h = document.getElementById('btn-advance-1h');
  if (btn1h) btn1h.addEventListener('click', () => advanceTime(1));

  const btn24h = document.getElementById('btn-advance-24h');
  if (btn24h) btn24h.addEventListener('click', () => advanceTime(24));

  const btnNh = document.getElementById('btn-advance-nh');
  if (btnNh) btnNh.addEventListener('click', promptAdvanceNh);
}
