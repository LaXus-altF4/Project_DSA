/**
 * clock.js - Điều khiển đồng hồ giả lập và sự kiện tua thời gian
 */

import { api } from '../api.js';
import { showToast } from './toast.js';
import { openModal } from './modal.js';
import { triggerRollDigit } from './motion.js';

let isAdvancing = false;

export async function refreshClock() {
  try {
    const clock = await api.get('/clock');
    const clockEl = document.getElementById('clock-time');
    if (clockEl && clock && clock.text) {
      triggerRollDigit(clockEl, clock.text);
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
  if (iconWrapper) iconWrapper.classList.add('spinning');

  try {
    const result = await api.post('/clock/advance', { hours: Number(hours) });
    if (result && result.clock) {
      const clockEl = document.getElementById('clock-time');
      if (clockEl) triggerRollDigit(clockEl, result.clock.text);
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
      <input type="number" id="input-custom-hours" class="form-input" min="1" max="8760" value="48" autofocus>
      <div class="form-helper">Hệ thống sẽ cập nhật trạng thái các lượt giữ hàng đợi và tính toán lại quá hạn.</div>
    </div>
  `;

  openModal({
    title: 'Tua thời gian giả lập (+N giờ)',
    content,
    confirmText: 'Tua ngay',
    cancelText: 'Hủy',
    onConfirm: async () => {
      const input = content.querySelector('#input-custom-hours');
      const val = parseInt(input.value, 10);
      if (isNaN(val) || val < 1 || val > 8760) {
        showToast('Số giờ phải nằm trong khoảng từ 1 đến 8760', 'warning');
        throw new Error('Invalid hours');
      }
      await advanceTime(val);
    }
  });
}

export function initClock() {
  refreshClock();

  const btn1h = document.getElementById('btn-advance-1h');
  if (btn1h) btn1h.addEventListener('click', () => advanceTime(1));

  const btn24h = document.getElementById('btn-advance-24h');
  if (btn24h) btn24h.addEventListener('click', () => advanceTime(24));

  const btnNh = document.getElementById('btn-advance-nh');
  if (btnNh) btnNh.addEventListener('click', promptAdvanceNh);
}
