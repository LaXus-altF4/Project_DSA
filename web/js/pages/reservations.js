/**
 * reservations.js - Màn hình 5: Hàng đợi đặt trước (Reservations)
 * Tuân thủ docs/api.md, AGENTS.md (M11–M16) và web/DESIGN.md mục 2.5 & 3.5.
 * 
 * Tính năng chính:
 * 1. Chọn thiết bị xem hàng đợi (dropdown ưu tiên thiết bị có người chờ, hỗ trợ #/reservations?id=VR01).
 * 2. Tổng quan kho: Sẵn sàng, Đang mượn, Đang giữ 24h, Bảo trì, Bất biến kho.
 * 3. Dãy thẻ người chờ FIFO:
 *    - Người đang giữ: Vòng đếm ngược SVG 24h theo hoursLeft từ API, hạn nhận, số lần lỡ (x/2).
 *    - Nút "Nhận thiết bị" (chỉ người đang giữ) → modal chọn ngày (1–30, mặc định 7) → POST claim.
 *    - Nút "Huỷ đăng ký" → modal xác nhận (cảnh báo chuyển quyền M16) → DELETE reservation.
 * 4. Form đăng ký người mới: chỉ bật khi available == 0 (M12).
 * 5. Điểm nhấn Demo (khi tua giờ):
 *    - Lỡ lần 1: Thẻ trượt từ đầu xuống cuối hàng bằng FLIP animation + badge "Lỡ hạn 1 lần".
 *    - Lỡ lần 2: Thẻ viền đỏ nhấp nháy 2 lần, co lại và mờ dần rồi biến mất.
 *    - Người kế tiếp được giữ: Thẻ phát sáng (glow 2 lần).
 *    - Mỗi sự kiện kèm toast tương ứng.
 */

import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { triggerRedPulse } from '../ui/motion.js';
import { isMotionAllowed, prefersReducedMotion } from '../ui/fx.js';
import { launchSuccessConfetti } from '../ui/confetti.js';
import { deviceIconHtml, illustrationHtml as illusSvgHtml } from '../ui/device-images.js';

let currentContainer = null;
let allDevices = [];
let selectedDeviceId = null;
let currentDevice = null;
let currentQueue = [];
let isLoadingDevices = false;
let isLoadingQueue = false;
const prevHoldHoursMap = new Map(); // Lưu số giờ còn lại trước đó để animate vòng đếm 24h mượt mà

function sortDevicesByQueuePriority(list) {
  list.sort((a, b) => {
    const qA = a.queueLength || 0;
    const qB = b.queueLength || 0;
    if (qA > 0 && qB === 0) return -1;
    if (qA === 0 && qB > 0) return 1;
    if (qA !== qB) return qB - qA;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Đồng bộ ngầm số lượng kho & hàng đợi của toàn bộ thiết bị trong dropdown
 */
async function syncAllDevicesSelector() {
  try {
    const res = await api.get('/devices');
    if (res && Array.isArray(res.devices)) {
      allDevices = res.devices;
      sortDevicesByQueuePriority(allDevices);
      renderDeviceSelector();
    }
  } catch (_) {}
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}

/**
 * Helper hiển thị / xoá lỗi trực tiếp cạnh ô nhập liệu (cùng mẫu với màn Mượn)
 */
function clearFieldErrors(root) {
  if (!root) return;
  root.querySelectorAll('.is-invalid').forEach((el) => {
    el.classList.remove('is-invalid');
    el.removeAttribute('aria-invalid');
  });
  root.querySelectorAll('.form-error-inline').forEach((el) => {
    el.textContent = '';
  });
}

function setFieldError(root, inputId, errorId, message, shouldFocus = false) {
  if (!root) return;
  const input = root.querySelector(`#${inputId}`);
  const errEl = root.querySelector(`#${errorId}`);
  if (input) {
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    if (shouldFocus) input.focus();
  }
  if (errEl) errEl.textContent = message;
}

function bindClearErrorsOnInput(root, pairs) {
  if (!root) return;
  pairs.forEach(([inputId, errorId]) => {
    const input = root.querySelector(`#${inputId}`);
    const errEl = root.querySelector(`#${errorId}`);
    if (input && errEl) {
      input.addEventListener('input', () => {
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
        errEl.textContent = '';
      });
    }
  });
}

/**
 * Khung ảnh thiết bị chừa sẵn (Đợt 7 sẽ thay icon bằng SVG theo mã thiết bị)
 */
function deviceThumbHtml(deviceId) {
  return `<div class="reservation-device-thumb" data-device-id="${escapeHtml(deviceId)}" aria-hidden="true">${deviceIconHtml(deviceId, { size: 52 })}</div>`;
}

/**
 * Khung minh hoạ trạng thái chừa sẵn (Đợt 7 sẽ gắn SVG theo data-illustration)
 */
function illustrationHtml(name, iconName, extraClass = '') {
  const svg = illusSvgHtml(name);
  return `<div class="empty-illustration ${extraClass}${svg ? ' has-svg' : ''}" data-illustration="${name}" aria-hidden="true">${svg || `<i data-lucide="${iconName}"></i>`}</div>`;
}

/**
 * Badge trạng thái thiết bị: màu token + icon Lucide + chữ tiếng Việt (quy tắc M1)
 */
function buildStatusBadgeHtml(status) {
  if (status === 'available') {
    return `<span class="badge badge-available"><i data-lucide="check-circle-2" class="badge-icon"></i><span>Sẵn sàng mượn</span></span>`;
  }
  if (status === 'borrowed') {
    return `<span class="badge badge-borrowed"><i data-lucide="clock" class="badge-icon"></i><span>Đang mượn hết</span></span>`;
  }
  if (status === 'maintenance') {
    return `<span class="badge badge-maintenance"><i data-lucide="wrench" class="badge-icon"></i><span>Đang bảo trì</span></span>`;
  }
  return '';
}

/**
 * Hiện trạng thái toàn trang (trống / lỗi nạp thiết bị) mà không xoá khung chính,
 * để nút "Thử lại" nạp xong vẫn có chỗ vẽ lại selector, tổng quan, hàng đợi.
 */
function showStateView(html) {
  const main = document.getElementById('reservation-main');
  const state = document.getElementById('reservation-state-root');
  if (main) main.hidden = true;
  if (state) {
    state.hidden = false;
    state.innerHTML = html;
  }
}

function hideStateView() {
  const main = document.getElementById('reservation-main');
  const state = document.getElementById('reservation-state-root');
  if (main) main.hidden = false;
  if (state) {
    state.hidden = true;
    state.innerHTML = '';
  }
}

/**
 * Lấy tham số id từ Hash URL (VD: #/reservations?id=VR01)
 */
function getDeviceIdFromHash() {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex !== -1) {
    const params = new URLSearchParams(hash.substring(queryIndex + 1));
    return params.get('id');
  }
  return null;
}

/**
 * Cập nhật query param trong hash mà không tải lại toàn bộ trang
 */
function updateUrlHash(deviceId) {
  if (!deviceId) return;
  const currentHash = window.location.hash || '#/reservations';
  const cleanRoute = currentHash.split('?')[0];
  const newHash = `${cleanRoute}?id=${encodeURIComponent(deviceId)}`;
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }
}

/**
 * Tải danh sách thiết bị từ GET /api/devices
 */
async function loadDevices(preferredId = null) {
  isLoadingDevices = true;
  try {
    const res = await api.get('/devices');
    allDevices = res.devices || [];
    hideStateView();

    // Ưu tiên thiết bị có người đang chờ (queueLength > 0) lên đầu
    sortDevicesByQueuePriority(allDevices);

    // Xác định thiết bị được chọn ban đầu
    const urlId = preferredId || getDeviceIdFromHash();
    if (urlId && allDevices.some(d => d.id === urlId)) {
      selectedDeviceId = urlId;
    } else if (allDevices.length > 0) {
      // Ưu tiên thiết bị đầu tiên (đã sắp xếp có queueLength > 0 lên trước)
      selectedDeviceId = allDevices[0].id;
    } else {
      selectedDeviceId = null;
    }

    renderDeviceSelector();

    if (selectedDeviceId) {
      updateUrlHash(selectedDeviceId);
      await loadReservations(selectedDeviceId);
    } else {
      renderEmptyAllDevices();
    }
  } catch (err) {
    console.error('Lỗi khi nạp danh sách thiết bị:', err);
    renderErrorAllDevices(err.message || 'Không thể kết nối đến máy chủ.');
  } finally {
    isLoadingDevices = false;
  }
}

/**
 * Tải hàng đợi của thiết bị từ GET /api/reservations/{deviceId}
 * Hỗ trợ tuỳ chọn chạy FLIP animation khi có biến động vị trí
 */
async function loadReservations(deviceId, animateFlip = false, animatedStudentEvents = {}) {
  if (!deviceId) return;
  isLoadingQueue = true;

  // Bước 1 của FLIP: Ghi lại toạ độ cũ của các thẻ nếu animateFlip = true
  const initialRects = new Map();
  if (animateFlip && currentContainer) {
    const cards = currentContainer.querySelectorAll('.queue-card[data-student-id]');
    cards.forEach(card => {
      const sId = card.getAttribute('data-student-id');
      if (sId) {
        initialRects.set(sId, card.getBoundingClientRect());
      }
    });
  }

  // Hiển thị skeleton nếu nạp lần đầu hoặc đổi thiết bị
  if (!animateFlip) {
    renderQueueSkeleton();
  }

  try {
    const res = await api.get(`/reservations/${deviceId}`);
    currentDevice = res.device || null;
    currentQueue = res.queue || [];

    // Cập nhật lại thông tin thiết bị trong allDevices
    if (currentDevice) {
      const idx = allDevices.findIndex(d => d.id === currentDevice.id);
      if (idx !== -1) {
        allDevices[idx] = currentDevice;
        sortDevicesByQueuePriority(allDevices);
        renderDeviceSelector();
      }
    }

    renderDeviceOverview();
    renderQueueList(animatedStudentEvents);
    renderRegisterCard();

    // Bước 2, 3, 4 của FLIP: Tính delta toạ độ và chạy chuyển động trượt mượt mà (60fps)
    if (animateFlip && initialRects.size > 0 && currentContainer) {
      requestAnimationFrame(() => {
        const newCards = currentContainer.querySelectorAll('.queue-card[data-student-id]');
        newCards.forEach(card => {
          const sId = card.getAttribute('data-student-id');
          const firstRect = initialRects.get(sId);
          if (firstRect) {
            const lastRect = card.getBoundingClientRect();
            const deltaX = firstRect.left - lastRect.left;
            const deltaY = firstRect.top - lastRect.top;

            if (deltaX !== 0 || deltaY !== 0) {
              card.dataset.flipBusy = '1';

              // Invert: dịch thẻ về vị trí cũ ngay lập tức (không transition)
              card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
              card.style.transition = 'none';

              // Bắt buộc reflow
              void card.offsetWidth;

              // Play: cho thẻ trượt về vị trí mới
              card.style.transition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)';
              card.style.transform = 'translate(0, 0)';

              const finishSlide = () => {
                card.style.transform = '';
                card.style.transition = '';
                delete card.dataset.flipBusy;
                card.removeEventListener('transitionend', cleanup);
              };
              const cleanup = (e) => {
                if (e.target !== card || e.propertyName !== 'transform') return;
                finishSlide();
              };
              card.addEventListener('transitionend', cleanup);
              window.setTimeout(finishSlide, 460);
            }
          }
        });
      });
    }
  } catch (err) {
    console.error(`Lỗi nạp hàng đợi thiết bị ${deviceId}:`, err);
    renderQueueError(err.message || 'Lỗi nạp hàng đợi');
  } finally {
    isLoadingQueue = false;
  }
}

/**
 * Hiển thị dropdown chọn thiết bị
 */
function renderDeviceSelector() {
  const selectEl = document.getElementById('select-reservation-device');
  if (!selectEl) return;

  if (allDevices.length === 0) {
    selectEl.innerHTML = `<option value="">-- Không có thiết bị nào --</option>`;
    selectEl.disabled = true;
    return;
  }

  selectEl.disabled = false;
  selectEl.innerHTML = allDevices.map(d => {
    const qCount = d.queueLength || 0;
    const isSelected = d.id === selectedDeviceId ? 'selected' : '';
    
    let statusLabel = 'Sẵn sàng';
    if (d.status === 'borrowed') statusLabel = 'Đang mượn';
    if (d.status === 'maintenance') statusLabel = 'Bảo trì';

    const queueLabel = `[${qCount} chờ]`;
    let stockLabel = `Còn: ${d.available}/${d.total}`;

    return `<option value="${escapeHtml(d.id)}" ${isSelected}>
      ${escapeHtml(d.id)} — ${escapeHtml(d.name)} (${statusLabel}, ${stockLabel}) ${queueLabel}
    </option>`;
  }).join('');
}

/**
 * Hiển thị card tổng quan kho của thiết bị đang chọn
 */
function renderDeviceOverview() {
  const container = document.getElementById('reservation-device-overview');
  if (!container) return;

  if (!currentDevice) {
    container.innerHTML = '';
    return;
  }

  const d = currentDevice;
  const total = Number(d.total) || 0;
  const avail = Number(d.available) || 0;
  const borrowed = Number(d.borrowed) || 0;
  const onHold = Number(d.onHold) || 0;
  const maint = Number(d.maintenance) || 0;
  const qLen = currentQueue.length;

  // Tính tỷ lệ % cho thanh tỷ lệ nhiều màu
  const pctAvail = total > 0 ? (avail / total * 100) : 0;
  const pctBorrow = total > 0 ? (borrowed / total * 100) : 0;
  const pctHold = total > 0 ? (onHold / total * 100) : 0;
  const pctMaint = total > 0 ? (maint / total * 100) : 0;

  const statusBadgeHtml = buildStatusBadgeHtml(d.status);

  container.setAttribute('data-glow', d.status || 'available');
  container.innerHTML = `
    <div class="reservation-device-header">
      <div class="reservation-device-title-box">
        ${deviceThumbHtml(d.id)}
        <code class="device-code-chip">${escapeHtml(d.id)}</code>
        <h2 class="reservation-device-name">${escapeHtml(d.name)}</h2>
        ${statusBadgeHtml}
      </div>
      <div class="reservation-stock-chips">
        <div class="stock-chip stock-chip-total" title="Tổng số đơn vị">
          <span>Tổng số:</span>
          <span class="stock-chip-val">${total}</span>
        </div>
        <div class="stock-chip stock-chip-available" title="Số đơn vị sẵn sàng mượn trực tiếp">
          <span>Sẵn sàng:</span>
          <span class="stock-chip-val">${avail}</span>
        </div>
        <div class="stock-chip stock-chip-borrowed" title="Số đơn vị đang được sinh viên mượn">
          <span>Đang mượn:</span>
          <span class="stock-chip-val">${borrowed}</span>
        </div>
        <div class="stock-chip stock-chip-onhold" title="Số đơn vị đang giữ chỗ 24h cho người đầu hàng đợi">
          <span>Đang giữ 24h:</span>
          <span class="stock-chip-val">${onHold}</span>
        </div>
        <div class="stock-chip stock-chip-maint" title="Số đơn vị đang bảo trì">
          <span>Bảo trì:</span>
          <span class="stock-chip-val">${maint}</span>
        </div>
        <div class="stock-chip stock-chip-queue" title="Tổng số sinh viên đang chờ trong hàng đợi">
          <i data-lucide="users" class="stock-chip-icon" aria-hidden="true"></i>
          <span>Hàng đợi:</span>
          <span class="stock-chip-val">${qLen} người</span>
        </div>
      </div>
    </div>

    <div class="reservation-device-progress-box">
      <div class="progress-bar-multi" title="Tỷ lệ kho: Xanh lá (Sẵn sàng) | Vàng (Đang mượn) | Xanh dương (Đang giữ) | Đỏ (Bảo trì)">
        <div class="progress-segment segment-available" style="width: ${pctAvail}%;"></div>
        <div class="progress-segment segment-borrowed" style="width: ${pctBorrow}%;"></div>
        <div class="progress-segment segment-onhold" style="width: ${pctHold}%;"></div>
        <div class="progress-segment segment-maintenance" style="width: ${pctMaint}%;"></div>
      </div>
      <div class="reservation-invariant-hint">
        <i data-lucide="shield-check" class="reservation-invariant-icon" aria-hidden="true"></i>
        <span>Bất biến kho: <code>available (${avail}) + borrowed (${borrowed}) + onHold (${onHold}) + maintenance (${maint}) == total (${total})</code></span>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hiển thị danh sách thẻ người chờ
 */
function renderQueueList(animatedEvents = {}) {
  const container = document.getElementById('reservation-queue-container');
  const countBadge = document.getElementById('reservation-queue-count');
  if (!container) return;

  const count = currentQueue.length;
  if (countBadge) {
    countBadge.textContent = `${count} người`;
  }

  // Trường hợp hàng đợi rỗng
  if (count === 0) {
    container.innerHTML = `
      <div class="empty-state reservation-empty-state">
        ${illustrationHtml('empty-queue', 'hourglass')}
        <div class="empty-state-title">Hàng đợi đang trống</div>
        <div class="empty-state-desc">
          Hiện tại không có sinh viên nào đăng ký chờ thiết bị <strong>${escapeHtml(currentDevice?.name || selectedDeviceId)}</strong>.
          ${currentDevice && currentDevice.available === 0 ? 'Thiết bị đang hết hàng, sinh viên có thể đăng ký vào hàng đợi bên dưới.' : ''}
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Vẽ các thẻ người chờ
  const cardsHtml = currentQueue.map(item => {
    const isHold = Boolean(item.holding);
    const pos = item.position;
    const hoursLeft = Number(item.hoursLeft) || 0;
    const missCount = Number(item.missCount) || 0;

    // SVG Circular countdown: bán kính R = 25, chu vi C = 2 * PI * 25 ≈ 157.08
    const radius = 25;
    const circumference = 2 * Math.PI * radius;
    const ratio = Math.max(0, Math.min(1, hoursLeft / 24));
    const strokeDashoffset = circumference * (1 - ratio);
    const holdKey = `${selectedDeviceId}:${item.studentId}`;
    const prevHours = prevHoldHoursMap.get(holdKey);
    const initialDashoffset = prevHours !== undefined
      ? circumference * (1 - Math.max(0, Math.min(1, prevHours / 24)))
      : circumference;

    let strokeClass = 'stroke-normal';
    let urgencyClass = '';
    let urgentBadgeHtml = '';

    if (hoursLeft <= 6) {
      strokeClass = 'stroke-danger';
      urgencyClass = 'is-urgent';
      urgentBadgeHtml = `<div class="queue-countdown-urgent-badge"><i data-lucide="alert-circle" class="queue-inline-icon" aria-hidden="true"></i> Sắp hết hạn nhận!</div>`;
    } else if (hoursLeft <= 12) {
      strokeClass = 'stroke-warning';
      urgencyClass = 'is-warning';
    }

    // Badge lỡ hẹn
    let missBadgeHtml = `<span class="queue-miss-badge badge-clean">0/2 lần lỡ</span>`;
    if (missCount === 1) {
      missBadgeHtml = `<span class="queue-miss-badge badge-missed" title="Đã lỡ hạn nhận 1 lần, nếu lỡ lần 2 sẽ bị loại khỏi hàng đợi"><i data-lucide="alert-triangle" class="queue-inline-icon" aria-hidden="true"></i> Lỡ hạn 1 lần</span>`;
    }

    // Hiệu ứng phát sáng nếu sinh viên này vừa được trao quyền giữ
    const isNewlyGranted = animatedEvents.holdGranted && animatedEvents.holdGranted.some(n => n.studentId === item.studentId);
    const holdGlowClass = isNewlyGranted ? 'pulse-glow-hold' : '';

    return `
      <div class="queue-card ${isHold ? 'queue-card-holding' : 'queue-card-waiting'} ${urgencyClass} ${holdGlowClass}" 
           data-glow="${isHold ? (hoursLeft <= 6 ? 'maintenance' : 'onhold') : (missCount === 1 ? 'borrowed' : '')}"
           data-miss="${missCount}"
           data-student-id="${escapeHtml(item.studentId)}" 
           data-position="${pos}">
        
        <div class="queue-card-header">
          <span class="queue-pos-pill">
            <i data-lucide="${isHold ? 'crown' : 'user'}" aria-hidden="true"></i>
            <span>Vị trí <span class="queue-pos-num">#${pos}</span> • ${isHold ? 'Đang giữ hàng' : 'Đang chờ'}</span>
          </span>
          ${missBadgeHtml}
        </div>

        <div class="queue-card-body">
          <div class="queue-student-box">
            <div class="queue-avatar" aria-hidden="true">
              <i data-lucide="${isHold ? 'sparkles' : 'user'}"></i>
            </div>
            <div class="queue-student-details">
              <div class="queue-student-name">${escapeHtml(item.studentName)}</div>
              <div class="queue-student-id">
                <span>MSSV:</span>
                <code>${escapeHtml(item.studentId)}</code>
              </div>
              <div class="queue-time-sub">
                <i data-lucide="calendar" class="queue-inline-icon" aria-hidden="true"></i>
                <span>Đăng ký: <span class="mono">${escapeHtml(item.enqueueText || 'N/A')}</span></span>
              </div>
            </div>
          </div>

          ${isHold ? `
            <div class="queue-countdown-box ${urgencyClass}">
              <div class="queue-svg-gauge">
                <svg class="queue-svg-circle" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="Còn ${hoursLeft} giờ trên tổng 24 giờ để nhận thiết bị">
                  <circle class="queue-svg-track" cx="32" cy="32" r="${radius}"></circle>
                  <circle class="queue-svg-bar ${strokeClass}" 
                          cx="32" cy="32" r="${radius}" 
                          data-target-offset="${strokeDashoffset}"
                          style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${initialDashoffset};"></circle>
                </svg>
                <div class="queue-svg-number" aria-hidden="true">
                  <span>${hoursLeft}h</span>
                  <small>/24h</small>
                </div>
              </div>
              <div class="queue-countdown-details">
                <div class="queue-countdown-title">
                  <i data-lucide="timer" class="queue-countdown-icon" aria-hidden="true"></i>
                  <span>Còn lại <span class="mono">${hoursLeft}</span> giờ</span>
                </div>
                <div class="queue-countdown-deadline">
                  Hạn nhận: <strong class="mono">${escapeHtml(item.holdUntilText || 'Trong 24 giờ')}</strong>
                </div>
                ${urgentBadgeHtml}
              </div>
            </div>
          ` : `
            <div class="queue-waiting-box">
              <i data-lucide="hourglass" class="queue-waiting-icon" aria-hidden="true"></i>
              <div>
                Đang chờ lượt giữ chỗ 24 giờ ngay khi có thiết bị được trả vào kho hoặc người trước hết hạn giữ.
              </div>
            </div>
          `}
        </div>

        <div class="queue-card-actions">
          ${isHold ? `
            <button class="btn btn-primary btn-claim" 
                    data-dev="${escapeHtml(selectedDeviceId)}" 
                    data-stuid="${escapeHtml(item.studentId)}" 
                    data-stuname="${escapeHtml(item.studentName)}">
              <i data-lucide="gift"></i> Nhận thiết bị
            </button>
          ` : ''}
          <button class="btn btn-outline btn-cancel" 
                  data-dev="${escapeHtml(selectedDeviceId)}" 
                  data-stuid="${escapeHtml(item.studentId)}" 
                  data-stuname="${escapeHtml(item.studentName)}"
                  data-holding="${isHold}">
            <i data-lucide="x-circle"></i> Huỷ đăng ký
          </button>
        </div>

      </div>
    `;
  }).join('');

  container.innerHTML = `<div class="reservation-queue-grid">${cardsHtml}</div>`;
  if (window.lucide) window.lucide.createIcons();

  // Cập nhật bộ nhớ vòng đếm ngược của thiết bị hiện tại & kích hoạt hiệu ứng quét cung tròn
  for (const key of Array.from(prevHoldHoursMap.keys())) {
    if (key.startsWith(`${selectedDeviceId}:`)) {
      prevHoldHoursMap.delete(key);
    }
  }
  currentQueue.forEach(item => {
    if (item.holding) {
      prevHoldHoursMap.set(`${selectedDeviceId}:${item.studentId}`, Number(item.hoursLeft) || 0);
    }
  });
  requestAnimationFrame(() => {
    container.querySelectorAll('.queue-svg-bar[data-target-offset]').forEach(bar => {
      bar.style.strokeDashoffset = bar.getAttribute('data-target-offset');
    });
  });

  // Gắn sự kiện cho các nút Nhận thiết bị
  container.querySelectorAll('.btn-claim').forEach(btn => {
    btn.addEventListener('click', () => {
      openClaimModal(btn.dataset.dev, btn.dataset.stuid, btn.dataset.stuname);
    });
  });

  // Gắn sự kiện cho các nút Huỷ đăng ký
  container.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const isHold = btn.dataset.holding === 'true';
      openCancelModal(btn.dataset.dev, btn.dataset.stuid, btn.dataset.stuname, isHold);
    });
  });

  // Xoá class glow sau khi chạy xong 2 lần (khoảng 950ms)
  setTimeout(() => {
    container.querySelectorAll('.pulse-glow-hold').forEach(el => {
      el.classList.remove('pulse-glow-hold');
    });
  }, 950);
}

/**
 * Hiển thị form đăng ký người mới vào hàng đợi
 */
function renderRegisterCard() {
  const container = document.getElementById('reservation-register-container');
  if (!container) return;

  if (!currentDevice) {
    container.innerHTML = '';
    return;
  }

  const d = currentDevice;
  const isAvailable = d.available > 0;

  if (isAvailable) {
    // Quy tắc M12: Thiết bị còn hàng thì PHẢI mượn trực tiếp, không cho vào hàng đợi
    container.innerHTML = `
      <div class="card-header">
        <div class="card-title">
          <i data-lucide="user-plus"></i>
          <span>Đăng ký hàng đợi đặt trước</span>
        </div>
        <span class="badge badge-available">
          <i data-lucide="check-circle-2" class="badge-icon"></i>
          <span>Còn <span class="tabular-nums">${d.available}</span> đơn vị</span>
        </span>
      </div>
      <div class="card-body reservation-register-body">
        <div class="reservation-register-desc">
          Đăng ký vị trí chờ nhận máy khi thiết bị hết hàng sẵn có trong kho.
        </div>

        <div class="reservation-alert-available" role="status">
          <i data-lucide="check-circle-2" aria-hidden="true"></i>
          <div class="reservation-alert-content">
            <div><strong>Thiết bị hiện còn ${d.available} đơn vị sẵn sàng trong kho.</strong></div>
            <div>
              Sinh viên phải mượn trực tiếp và không được đặt trước khi thiết bị vẫn còn hàng.
            </div>
            <div>
              <a href="#/borrow?id=${encodeURIComponent(d.id)}" class="btn-jump-borrow" title="Chuyển sang Lập phiếu mượn và thêm sẵn ${escapeHtml(d.name)} vào giỏ">
                <span>Chuyển sang Lập phiếu mượn</span>
                <i data-lucide="arrow-right" aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    // Thiết bị hết hàng: Bật form đăng ký người mới
    container.innerHTML = `
      <div class="card-header">
        <div class="card-title">
          <i data-lucide="user-plus"></i>
          <span>Đăng ký vào hàng đợi cho ${escapeHtml(d.name)}</span>
        </div>
        <span class="badge badge-maintenance">
          <i data-lucide="alert-circle" class="badge-icon"></i>
          <span>Hết hàng (<span class="tabular-nums">${d.available}</span>/<span class="tabular-nums">${d.total}</span>)</span>
        </span>
      </div>
      <div class="card-body reservation-register-body">
        <div class="reservation-register-desc">
          Thiết bị hiện đã hết hàng có sẵn. Nhập thông tin sinh viên để xếp hàng FIFO.
        </div>

        <form id="form-register-queue" class="reservation-register-form" novalidate>
          <div class="form-group reservation-form-group">
            <label class="form-label" for="reg-student-id">Mã số sinh viên (MSSV) <span class="borrow-required-mark">*</span></label>
            <input type="text" id="reg-student-id" class="form-input mono" placeholder="VD: 25120188" maxlength="20" autocomplete="off" aria-describedby="err-reg-student-id hint-reg-student-id">
            <div id="hint-reg-student-id" class="form-helper">Mỗi sinh viên chỉ được đứng 1 lần trong hàng đợi này.</div>
            <div id="err-reg-student-id" class="form-error-inline" role="alert"></div>
          </div>

          <div class="form-group reservation-form-group">
            <label class="form-label" for="reg-student-name">Họ và tên sinh viên <span class="borrow-required-mark">*</span></label>
            <input type="text" id="reg-student-name" class="form-input" placeholder="VD: Hoàng Nhật Minh" maxlength="100" autocomplete="off" aria-describedby="err-reg-student-name hint-reg-student-name">
            <div id="hint-reg-student-name" class="form-helper">Không chứa dấu phẩy, gạch đứng hoặc xuống dòng.</div>
            <div id="err-reg-student-name" class="form-error-inline" role="alert"></div>
          </div>

          <div class="reservation-form-submit">
            <button type="submit" id="btn-submit-reg" class="btn btn-primary">
              <i data-lucide="plus-circle"></i>
              <span>Đăng ký giữ chỗ</span>
            </button>
          </div>
        </form>
      </div>
    `;

    const form = container.querySelector('#form-register-queue');
    if (form) {
      form.addEventListener('submit', handleRegisterSubmit);
      bindClearErrorsOnInput(form, [
        ['reg-student-id', 'err-reg-student-id'],
        ['reg-student-name', 'err-reg-student-name'],
      ]);
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Xử lý submit form đăng ký người mới
 */
async function handleRegisterSubmit(e) {
  e.preventDefault();
  if (!selectedDeviceId) return;

  const stIdInput = document.getElementById('reg-student-id');
  const stNameInput = document.getElementById('reg-student-name');
  const submitBtn = document.getElementById('btn-submit-reg');

  const studentId = stIdInput?.value?.trim();
  const studentName = stNameInput?.value?.trim();
  const formEl = e.currentTarget || document.getElementById('form-register-queue');

  clearFieldErrors(formEl);

  // Lỗi hiện ngay cạnh ô nhập (không chỉ toast)
  let hasError = false;
  if (!studentId) {
    setFieldError(formEl, 'reg-student-id', 'err-reg-student-id', 'Vui lòng nhập MSSV.', !hasError);
    hasError = true;
  }
  if (!studentName) {
    setFieldError(formEl, 'reg-student-name', 'err-reg-student-name', 'Vui lòng nhập họ và tên sinh viên.', !hasError);
    hasError = true;
  }
  if (hasError) return;

  // Quy tắc M5: Không chứa dấu phẩy, gạch đứng hoặc xuống dòng
  const M5_MSG = 'Không được chứa dấu phẩy (,), gạch đứng (|) hoặc xuống dòng.';
  if (/[,|\n\r]/.test(studentId)) {
    setFieldError(formEl, 'reg-student-id', 'err-reg-student-id', M5_MSG, !hasError);
    hasError = true;
  }
  if (/[,|\n\r]/.test(studentName)) {
    setFieldError(formEl, 'reg-student-name', 'err-reg-student-name', M5_MSG, !hasError);
    hasError = true;
  }
  if (hasError) return;

  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await api.post(`/reservations/${selectedDeviceId}`, { studentId, studentName });
    const pos = res.position || (res.queue ? res.queue.length : 1);
    showToast(`Đăng ký thành công! Sinh viên ${studentName} đang đứng ở vị trí #${pos} trong hàng đợi.`, 'success', 'Đăng ký giữ chỗ');

    if (stIdInput) stIdInput.value = '';
    if (stNameInput) stNameInput.value = '';

    // Tải lại hàng đợi
    await loadReservations(selectedDeviceId);
  } catch (err) {
    console.error('Lỗi đăng ký hàng đợi:', err);
    // Hiển thị trực tiếp lỗi từ server (ALREADY_QUEUED, CAN_BORROW_DIRECTLY, INVALID_INPUT...)
    const serverMsg = err.message || 'Lỗi khi đăng ký vào hàng đợi';
    if (err.code === 'ALREADY_QUEUED') {
      setFieldError(formEl, 'reg-student-id', 'err-reg-student-id', serverMsg, true);
    }
    showToast(serverMsg, 'error', 'Không thể đăng ký');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Modal Nhận thiết bị (POST /api/reservations/{deviceId}/claim)
 */
function openClaimModal(deviceId, studentId, studentName) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <div class="form-label">Thiết bị nhận</div>
      <div class="reservation-modal-strong">
        ${escapeHtml(currentDevice?.name || deviceId)} <code class="device-code-chip">${escapeHtml(deviceId)}</code>
      </div>
    </div>
    <div class="form-group">
      <div class="form-label">Sinh viên nhận thiết bị</div>
      <div class="reservation-modal-strong">
        ${escapeHtml(studentName)} — MSSV: <code class="mono">${escapeHtml(studentId)}</code>
      </div>
      <div class="form-helper">Sinh viên hiện đang giữ chỗ hợp lệ trong thời hạn 24 giờ.</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="claim-days">Số ngày mượn (1 – 30 ngày)</label>
      <input type="number" id="claim-days" class="form-input mono" min="1" max="30" value="7" required autofocus aria-describedby="err-claim-days hint-claim-days">
      <div id="hint-claim-days" class="form-helper">Mặc định: 7 ngày. Hệ thống sẽ tạo phiếu mượn 1 thiết bị và hoàn tất lượt giữ hàng.</div>
      <div id="err-claim-days" class="form-error-inline" role="alert"></div>
    </div>
  `;
  bindClearErrorsOnInput(content, [['claim-days', 'err-claim-days']]);

  openModal({
    title: 'Xác nhận Nhận thiết bị từ Hàng đợi',
    content,
    confirmText: 'Tạo phiếu mượn ngay',
    cancelText: 'Huỷ',
    onConfirm: async () => {
      const daysInput = content.querySelector('#claim-days');
      const days = parseInt(daysInput.value, 10);
      clearFieldErrors(content);
      if (isNaN(days) || days < 1 || days > 30) {
        setFieldError(content, 'claim-days', 'err-claim-days', 'Số ngày mượn phải nằm trong khoảng từ 1 đến 30 ngày.', true);
        throw new Error('Invalid days');
      }

      try {
        const res = await api.post(`/reservations/${deviceId}/claim`, { studentId, days });
        const recId = res.record ? res.record.recordId : '';

        launchSuccessConfetti(
          document.querySelector('#modal-backdrop.active #modal-footer .btn-primary')
        );

        showToast(`Nhận thiết bị thành công! Đã tạo phiếu mượn ${recId} cho sinh viên ${studentName}.`, 'success', 'Phiếu mượn đã lập');

        // Lấy thông báo hệ thống nếu có phát sinh
        try {
          const notiRes = await api.get('/notifications');
          if (notiRes && Array.isArray(notiRes.notifications)) {
            notiRes.notifications.forEach(n => {
              showToast(n.message, n.type === 'hold_granted' ? 'success' : 'info', 'Sự kiện hệ thống', 6000);
            });
          }
        } catch (_) {}

        // Nạp lại dữ liệu
        await loadReservations(deviceId);
      } catch (err) {
        showToast(err.message || 'Lỗi khi nhận thiết bị', 'error');
        throw err;
      }
    }
  });
}

/**
 * Modal Huỷ đăng ký (DELETE /api/reservations/{deviceId}/{studentId})
 */
function openCancelModal(deviceId, studentId, studentName, isHolding) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="reservation-cancel-modal">
      <p class="reservation-cancel-text">
        Bạn có chắc chắn muốn huỷ đăng ký của sinh viên <strong>${escapeHtml(studentName)}</strong> (MSSV: <code class="mono">${escapeHtml(studentId)}</code>) khỏi hàng đợi thiết bị <strong>${escapeHtml(currentDevice?.name || deviceId)}</strong>?
      </p>
      ${isHolding ? `
        <div class="reservation-cancel-warning" role="alert">
          <i data-lucide="alert-triangle" aria-hidden="true"></i>
          <div>
            <div class="reservation-cancel-warning-title">Lưu ý quan trọng</div>
            Sinh viên này hiện đang được giữ chỗ thiết bị. Khi huỷ đăng ký, quyền nhận thiết bị trong 24 giờ sẽ tự động được chuyển cho người kế tiếp trong hàng đợi.
          </div>
        </div>
      ` : `
        <div class="form-helper">Thao tác này sẽ xoá vị trí chờ của sinh viên khỏi hàng đợi FIFO.</div>
      `}
    </div>
  `;

  openModal({
    title: 'Xác nhận Huỷ đăng ký Hàng đợi',
    content,
    confirmText: 'Huỷ đăng ký ngay',
    cancelText: 'Quay lại',
    onConfirm: async () => {
      try {
        await api.delete(`/reservations/${deviceId}/${studentId}`);
        showToast(`Đã huỷ đăng ký thành công cho sinh viên ${studentName}.`, 'success');

        // Kiểm tra xem việc huỷ này có kích hoạt quyền giữ cho người kế tiếp không (M16)
        try {
          const notiRes = await api.get('/notifications');
          if (notiRes && Array.isArray(notiRes.notifications)) {
            notiRes.notifications.forEach(n => {
              showToast(n.message, n.type === 'hold_granted' ? 'success' : 'info', 'Chuyển quyền giữ hàng', 6000);
            });
          }
        } catch (_) {}

        // Tải lại dữ liệu
        await loadReservations(deviceId);
      } catch (err) {
        showToast(err.message || 'Lỗi khi huỷ đăng ký', 'error');
        throw err;
      }
    }
  });
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Xử lý khi có sự kiện tua thời gian (QUAN TRỌNG: Điểm nhấn demo)
 * 1. Phân loại sự kiện từ notifications:
 *    - missed (lỡ lần 1): Thẻ trượt từ đầu xuống cuối hàng bằng FLIP animation + badge "Lỡ hạn 1 lần".
 *    - removed (lỡ lần 2): Thẻ viền đỏ nhấp nháy 2 lần, co lại và mờ dần rồi biến mất.
 *    - hold_granted: Thẻ người kế tiếp sáng lên (glow 2 lần).
 */
export async function onTimeAdvanced(detail) {
  if (!selectedDeviceId) return;

  let notifications = detail?.notifications || [];

  // Nếu trong detail chưa có notifications, thử fetch trực tiếp
  if (notifications.length === 0) {
    try {
      const notiRes = await api.get('/notifications');
      if (notiRes && Array.isArray(notiRes.notifications)) {
        notifications = notiRes.notifications;
      }
    } catch (_) {}
  }

  // Lọc các thông báo liên quan đến thiết bị đang xem
  const devNotis = notifications.filter(n => n.deviceId === selectedDeviceId);
  const missedList = devNotis.filter(n => n.type === 'missed');
  const removedList = devNotis.filter(n => n.type === 'removed');
  const holdGrantedList = devNotis.filter(n => n.type === 'hold_granted');

  const reducedMotion = prefersReducedMotion();
  const fx3dAllowed = isMotionAllowed();

  // Hàm tìm an toàn thẻ .queue-card theo MSSV trong vùng hiển thị hiện tại
  const findCardByStudent = (studentId) => {
    if (!currentContainer || !studentId) return null;
    const allCards = currentContainer.querySelectorAll('.queue-card[data-student-id]');
    for (const el of allCards) {
      if (el.getAttribute('data-student-id') === studentId) return el;
    }
    return null;
  };

  // Pha 1 (Đợt D.2): Lật 3D báo lỡ hạn (320ms) cho người đầu lỡ hẹn & nghiêng rơi 3D cho người bị loại
  if (!reducedMotion && currentContainer) {
    if (fx3dAllowed && (missedList.length > 0 || removedList.length > 0)) {
      const phase1Anims = [];
      const flippedCards = [];

      missedList.forEach(n => {
        const card = findCardByStudent(n.studentId);
        if (!card) return;
        card.dataset.flipBusy = '1';
        card.classList.add('queue-card-flip-3d');
        flippedCards.push(card);

        if (typeof card.animate === 'function') {
          const anim = card.animate(
            [
              { transform: 'perspective(800px) rotateY(0deg) scale(1)' },
              { transform: 'perspective(800px) rotateY(180deg) scale(1.03)', offset: 0.5 },
              { transform: 'perspective(800px) rotateY(360deg) scale(1)' },
            ],
            { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          );
          phase1Anims.push(anim.finished.catch(() => {}));
        } else {
          phase1Anims.push(new Promise(r => setTimeout(r, 320)));
        }
      });

      removedList.forEach(n => {
        const card = findCardByStudent(n.studentId);
        if (!card) return;
        card.dataset.flipBusy = '1';
        triggerRedPulse(card);

        if (typeof card.animate === 'function') {
          const anim = card.animate(
            [
              { transform: 'perspective(800px) rotateX(0deg) scale(1)', opacity: 1 },
              {
                transform: 'perspective(800px) translateY(14px) rotateX(-18deg) scale(0.88)',
                opacity: 0,
              },
            ],
            { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
          );
          phase1Anims.push(anim.finished.catch(() => {}));
        } else {
          card.classList.add('card-shrink-remove');
          phase1Anims.push(new Promise(r => setTimeout(r, 300)));
        }
      });

      if (phase1Anims.length > 0) {
        await Promise.all(phase1Anims);
      }

      // Trả thẻ missed về khung chuẩn trước khi đo toạ độ đầu của Pha 2 FLIP
      flippedCards.forEach(card => {
        card.classList.remove('queue-card-flip-3d');
        delete card.dataset.flipBusy;
      });
    } else if (removedList.length > 0) {
      // Chế độ phẳng (tắt 3D): giữ nguyên hiệu ứng nháy đỏ + co mờ phẳng
      removedList.forEach(n => {
        const card = findCardByStudent(n.studentId);
        if (card) {
          triggerRedPulse(card);
          card.classList.add('card-shrink-remove');
        }
      });
      await new Promise(r => setTimeout(r, 320));
    }
  }

  // Pha 2: Nạp lại hàng đợi và kích hoạt FLIP trượt mượt xuống cuối hàng (420ms)
  await loadReservations(selectedDeviceId, !reducedMotion, {
    missed: missedList,
    holdGranted: holdGrantedList
  });
  syncAllDevicesSelector();
}

/**
 * Hiển thị skeleton loading cho danh sách hàng đợi
 */
function renderQueueSkeleton() {
  const container = document.getElementById('reservation-queue-container');
  if (!container) return;

  container.innerHTML = `
    <div class="reservation-queue-grid">
      <div class="queue-card skeleton-card skeleton queue-skeleton"></div>
      <div class="queue-card skeleton-card skeleton queue-skeleton"></div>
      <div class="queue-card skeleton-card skeleton queue-skeleton"></div>
    </div>
  `;
}

/**
 * Hiển thị lỗi nạp hàng đợi
 */
function renderQueueError(msg) {
  const container = document.getElementById('reservation-queue-container');
  if (!container) return;

  container.innerHTML = `
    <div class="error-state reservation-error-state" role="alert">
      ${illustrationHtml('connection-error', 'alert-octagon', 'is-error')}
      <div class="error-state-title">Không thể tải thông tin hàng đợi</div>
      <div class="error-state-desc">${escapeHtml(msg)}</div>
      <button id="btn-retry-queue" type="button" class="btn btn-secondary btn-sm">
        <i data-lucide="refresh-cw"></i>
        <span>Thử lại</span>
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  const retryBtn = container.querySelector('#btn-retry-queue');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadReservations(selectedDeviceId));
  }
}

/**
 * Hiển thị trạng thái không có thiết bị nào trong toàn hệ thống
 */
function renderEmptyAllDevices() {
  showStateView(`
    <section class="bento-card stagger-item">
      <div class="empty-state reservation-empty-state">
        ${illustrationHtml('empty-data', 'package')}
        <div class="empty-state-title">Chưa có thiết bị nào trong hệ thống</div>
        <div class="empty-state-desc">Vui lòng sang màn hình Danh mục Thiết bị để thêm mới thiết bị vào phòng thực hành.</div>
        <a href="#/devices" class="btn btn-primary">
          <i data-lucide="plus"></i>
          <span>Thêm thiết bị mới</span>
        </a>
      </div>
    </section>
  `);
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hiển thị lỗi nạp danh mục thiết bị
 */
function renderErrorAllDevices(msg) {
  showStateView(`
    <section class="bento-card stagger-item">
      <div class="error-state reservation-error-state" role="alert">
        ${illustrationHtml('connection-error', 'alert-triangle', 'is-error')}
        <div class="error-state-title">Không thể nạp danh sách thiết bị</div>
        <div class="error-state-desc">${escapeHtml(msg)}</div>
        <button id="btn-retry-all-devices" type="button" class="btn btn-secondary btn-sm">
          <i data-lucide="refresh-cw"></i>
          <span>Thử lại</span>
        </button>
      </div>
    </section>
  `);
  if (window.lucide) window.lucide.createIcons();

  const retryBtn = document.querySelector('#btn-retry-all-devices');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadDevices());
  }
}

/**
 * Hàm khởi tạo chính của màn hình Hàng đợi đặt trước (SPA render)
 */
export async function render(container) {
  currentContainer = container;

  container.innerHTML = `
    <div class="page reservation-layout">
      <!-- Tiêu đề trang -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="clock-4"></i> Hàng Đợi Đặt Trước
          </h1>
          <div class="page-desc">
            Hàng đợi FIFO có thời hạn 24 giờ nhận thiết bị, tự động đẩy xuống cuối khi lỡ hẹn.
          </div>
        </div>
        <div class="page-actions">
          <button id="btn-refresh-reservations" type="button" class="btn btn-secondary btn-sm" title="Làm mới dữ liệu hàng đợi">
            <i data-lucide="refresh-cw"></i>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      <!-- Trạng thái toàn trang (trống / lỗi nạp thiết bị) -->
      <div id="reservation-state-root" hidden></div>

      <!-- Vùng nội dung chính -->
      <div id="reservation-main" class="reservation-main">
        <!-- 1. Thanh chọn thiết bị -->
        <section class="bento-card reservation-selector-card stagger-item stagger-delay-1" aria-label="Chọn thiết bị xem hàng đợi">
          <div class="reservation-selector-group">
            <label class="reservation-select-label" for="select-reservation-device">
              <i data-lucide="layers" aria-hidden="true"></i>
              <span>Chọn thiết bị xem hàng đợi</span>
            </label>
            <select id="select-reservation-device" class="reservation-device-select">
              <option value="">Đang tải danh sách thiết bị...</option>
            </select>
          </div>
        </section>

        <!-- 2. Tổng quan kho của thiết bị đang chọn -->
        <section id="reservation-device-overview" class="bento-card reservation-device-card stagger-item stagger-delay-2" aria-label="Tổng quan kho thiết bị">
          <div class="skeleton skeleton-title reservation-skeleton-title"></div>
          <div class="skeleton skeleton-text reservation-skeleton-text"></div>
          <div class="skeleton reservation-skeleton-bar"></div>
        </section>

        <!-- 3. Dãy sinh viên xếp hàng FIFO -->
        <section class="bento-card bento-table-card stagger-item stagger-delay-3" aria-label="Dãy sinh viên đang xếp hàng">
          <div class="card-header">
            <div class="card-title">
              <i data-lucide="users"></i>
              <span>Dãy sinh viên đang xếp hàng (FIFO)</span>
            </div>
            <span id="reservation-queue-count" class="badge badge-onhold tabular-nums" aria-live="polite">Đang tải...</span>
          </div>
          <div class="card-body">
            <div id="reservation-queue-container">
              <div class="reservation-queue-grid">
                <div class="queue-card skeleton-card skeleton queue-skeleton"></div>
                <div class="queue-card skeleton-card skeleton queue-skeleton"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. Đăng ký người mới vào hàng đợi (M12) -->
        <section id="reservation-register-container" class="bento-card bento-table-card reservation-register-card stagger-item stagger-delay-4" aria-label="Đăng ký vào hàng đợi"></section>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Sự kiện thay đổi thiết bị trên Dropdown
  const selectEl = container.querySelector('#select-reservation-device');
  if (selectEl) {
    selectEl.addEventListener('change', (e) => {
      const devId = e.target.value;
      if (devId && devId !== selectedDeviceId) {
        selectedDeviceId = devId;
        updateUrlHash(devId);
        loadReservations(devId);
      }
    });
  }

  // Sự kiện nút Làm mới
  const refreshBtn = container.querySelector('#btn-refresh-reservations');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg, i');
      if (icon) icon.classList.add('spin-loading');
      refreshBtn.disabled = true;

      try {
        await loadDevices(selectedDeviceId);
        showToast('Đã làm mới dữ liệu hàng đợi', 'info', '', 2000);
      } catch (err) {
        showToast('Lỗi khi làm mới dữ liệu', 'error');
      } finally {
        setTimeout(() => {
          if (icon) icon.classList.remove('spin-loading');
          refreshBtn.disabled = false;
        }, 300);
      }
    });
  }

  // Bắt đầu nạp thiết bị
  await loadDevices();
}
