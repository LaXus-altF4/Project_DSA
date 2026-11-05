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

let currentContainer = null;
let allDevices = [];
let selectedDeviceId = null;
let currentDevice = null;
let currentQueue = [];
let isLoadingDevices = false;
let isLoadingQueue = false;

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
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

    // Ưu tiên thiết bị có người đang chờ (queueLength > 0) lên đầu
    allDevices.sort((a, b) => {
      const qA = a.queueLength || 0;
      const qB = b.queueLength || 0;
      if (qA > 0 && qB === 0) return -1;
      if (qA === 0 && qB > 0) return 1;
      if (qA !== qB) return qB - qA;
      return a.id.localeCompare(b.id);
    });

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
              // Invert: dịch thẻ về vị trí cũ ngay lập tức (không transition)
              card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
              card.style.transition = 'none';

              // Bắt buộc reflow
              void card.offsetWidth;

              // Play: cho thẻ trượt về vị trí mới
              card.style.transition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)';
              card.style.transform = 'translate(0, 0)';

              const cleanup = () => {
                card.style.transform = '';
                card.style.transition = '';
                card.removeEventListener('transitionend', cleanup);
              };
              card.addEventListener('transitionend', cleanup);
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

    let queueLabel = qCount > 0 ? `🔥 [Đang chờ: ${qCount}]` : `[0 chờ]`;
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

  let statusBadgeHtml = '';
  if (d.status === 'available') {
    statusBadgeHtml = `<span class="badge badge-available"><span class="badge-dot"></span> Sẵn sàng mượn</span>`;
  } else if (d.status === 'borrowed') {
    statusBadgeHtml = `<span class="badge badge-borrowed"><span class="badge-dot"></span> Đang mượn hết</span>`;
  } else if (d.status === 'maintenance') {
    statusBadgeHtml = `<span class="badge badge-maintenance"><span class="badge-dot"></span> Đang bảo trì</span>`;
  }

  container.innerHTML = `
    <div class="reservation-device-header">
      <div class="reservation-device-title-box">
        <span class="reservation-device-code">${escapeHtml(d.id)}</span>
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
          <i data-lucide="users" style="width: 14px; height: 14px;"></i>
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
        <i data-lucide="shield-check" style="width: 13px; height: 13px; color: var(--color-success);"></i>
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
      <div class="empty-state" style="padding: 48px 20px; background-color: var(--color-bg-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-lg); width: 100%;">
        <svg class="empty-state-icon svg-draw-check" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="9 12 11 14 15 10"></polyline>
        </svg>
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

    let strokeClass = 'stroke-normal';
    let urgencyClass = '';
    let urgentBadgeHtml = '';

    if (hoursLeft <= 6) {
      strokeClass = 'stroke-danger';
      urgencyClass = 'is-urgent';
      urgentBadgeHtml = `<div class="queue-countdown-urgent-badge"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> Sắp hết hạn nhận!</div>`;
    } else if (hoursLeft <= 12) {
      strokeClass = 'stroke-warning';
      urgencyClass = 'is-warning';
    }

    // Badge lỡ hẹn
    let missBadgeHtml = `<span class="queue-miss-badge badge-clean">0/2 lần lỡ</span>`;
    if (missCount === 1) {
      missBadgeHtml = `<span class="queue-miss-badge badge-missed" title="Đã lỡ hạn nhận 1 lần, nếu lỡ lần 2 sẽ bị loại khỏi hàng đợi"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> Lỡ hạn 1 lần</span>`;
    }

    // Hiệu ứng phát sáng nếu sinh viên này vừa được trao quyền giữ
    const isNewlyGranted = animatedEvents.holdGranted && animatedEvents.holdGranted.some(n => n.studentId === item.studentId);
    const holdGlowClass = isNewlyGranted ? 'pulse-glow-hold' : '';

    return `
      <div class="queue-card ${isHold ? 'queue-card-holding' : 'queue-card-waiting'} ${holdGlowClass}" 
           data-student-id="${escapeHtml(item.studentId)}" 
           data-position="${pos}">
        
        <div class="queue-card-header">
          <span class="queue-pos-pill">
            <i data-lucide="${isHold ? 'crown' : 'user'}"></i>
            Vị trí #${pos} • ${isHold ? 'Đang giữ hàng' : 'Đang chờ'}
          </span>
          ${missBadgeHtml}
        </div>

        <div class="queue-card-body">
          <div class="queue-student-box">
            <div class="queue-avatar">
              <i data-lucide="${isHold ? 'sparkles' : 'user'}"></i>
            </div>
            <div class="queue-student-details">
              <div class="queue-student-name">${escapeHtml(item.studentName)}</div>
              <div class="queue-student-id">
                <span>MSSV:</span>
                <code>${escapeHtml(item.studentId)}</code>
              </div>
              <div class="queue-time-sub">
                <i data-lucide="calendar" style="width: 11px; height: 11px;"></i>
                <span>Đăng ký: ${escapeHtml(item.enqueueText || 'N/A')}</span>
              </div>
            </div>
          </div>

          ${isHold ? `
            <div class="queue-countdown-box ${urgencyClass}">
              <div class="queue-svg-gauge">
                <svg class="queue-svg-circle" width="64" height="64" viewBox="0 0 64 64">
                  <circle class="queue-svg-track" cx="32" cy="32" r="${radius}"></circle>
                  <circle class="queue-svg-bar ${strokeClass}" 
                          cx="32" cy="32" r="${radius}" 
                          style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset};"></circle>
                </svg>
                <div class="queue-svg-number">
                  <span>${hoursLeft}h</span>
                  <small>/24h</small>
                </div>
              </div>
              <div class="queue-countdown-details">
                <div class="queue-countdown-title">
                  <i data-lucide="timer" style="width: 15px; height: 15px; color: var(--color-primary);"></i>
                  <span>Còn lại ${hoursLeft} giờ</span>
                </div>
                <div class="queue-countdown-deadline">
                  Hạn nhận: <strong>${escapeHtml(item.holdUntilText || 'Trong 24 giờ')}</strong>
                </div>
                ${urgentBadgeHtml}
              </div>
            </div>
          ` : `
            <div class="queue-waiting-box">
              <i data-lucide="hourglass" style="width: 16px; height: 16px;"></i>
              <div>
                Đang chờ lượt giữ chỗ 24 giờ ngay khi có thiết bị được trả vào kho hoặc người trước hết hạn giữ (Quy tắc M11).
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
      <div class="reservation-register-card">
        <div class="reservation-register-header">
          <h3 class="reservation-register-title">
            <i data-lucide="user-plus"></i> Đăng ký hàng đợi đặt trước
          </h3>
          <div class="reservation-register-desc">
            Đăng ký vị trí chờ nhận máy khi thiết bị hết hàng sẵn có trong kho (Quy tắc M12).
          </div>
        </div>

        <div class="reservation-alert-available">
          <i data-lucide="check-circle-2"></i>
          <div class="reservation-alert-content">
            <div><strong>Thiết bị hiện còn ${d.available} đơn vị sẵn sàng trong kho!</strong></div>
            <div>
              Theo quy định nghiệp vụ <strong>Quy tắc M12</strong>, sinh viên phải mượn trực tiếp và không được phép đặt trước khi thiết bị vẫn còn hàng.
            </div>
            <div>
              <a href="#/borrow?id=${encodeURIComponent(d.id)}" class="btn-jump-borrow" title="Chuyển sang Lập phiếu mượn và thêm sẵn ${escapeHtml(d.name)} vào giỏ">
                <span>Chuyển sang Lập phiếu mượn →</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    // Thiết bị hết hàng: Bật form đăng ký người mới
    container.innerHTML = `
      <div class="reservation-register-card">
        <div class="reservation-register-header">
          <h3 class="reservation-register-title">
            <i data-lucide="user-plus"></i> Đăng ký vào hàng đợi đặt trước cho ${escapeHtml(d.name)}
          </h3>
          <div class="reservation-register-desc">
            Thiết bị hiện đã hết hàng có sẵn (${d.available} sẵn sàng / ${d.total} tổng số). Nhập thông tin sinh viên để xếp hàng FIFO:
          </div>
        </div>

        <form id="form-register-queue" class="reservation-register-form">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="reg-student-id">Mã số sinh viên (MSSV): *</label>
            <input type="text" id="reg-student-id" class="form-input" placeholder="VD: 25120188" required maxlength="20">
            <div class="form-helper">Mỗi sinh viên chỉ được đứng 1 lần trong hàng đợi này (M12).</div>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="reg-student-name">Họ và tên sinh viên: *</label>
            <input type="text" id="reg-student-name" class="form-input" placeholder="VD: Hoàng Nhật Minh" required maxlength="100">
            <div class="form-helper">Không chứa dấu phẩy, sổ đứng hoặc xuống dòng (M5).</div>
          </div>

          <div>
            <button type="submit" id="btn-submit-reg" class="btn btn-primary" style="height: 38px; width: 100%;">
              <i data-lucide="plus-circle"></i> Đăng ký giữ chỗ
            </button>
          </div>
        </form>
      </div>
    `;

    const form = container.querySelector('#form-register-queue');
    if (form) {
      form.addEventListener('submit', handleRegisterSubmit);
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

  if (!studentId || !studentName) {
    showToast('Vui lòng nhập đầy đủ MSSV và Họ tên sinh viên', 'warning');
    return;
  }

  // Quy tắc M5: Không chứa dấu phẩy, gạch đứng hoặc xuống dòng
  if (/[,|\n\r]/.test(studentId) || /[,|\n\r]/.test(studentName)) {
    showToast('Mã SV và Họ tên không được chứa dấu phẩy (,), gạch đứng (|) hoặc xuống dòng', 'warning');
    return;
  }

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
    showToast(err.message || 'Lỗi khi đăng ký vào hàng đợi', 'error', 'Không thể đăng ký');
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
      <label class="form-label">Thiết bị nhận:</label>
      <div style="font-size: 14.5px; font-weight: 700; color: var(--color-text-primary);">
        ${escapeHtml(currentDevice?.name || deviceId)} (<code class="mono">${escapeHtml(deviceId)}</code>)
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Sinh viên nhận thiết bị:</label>
      <div style="font-weight: 600; color: var(--color-text-primary);">
        ${escapeHtml(studentName)} — MSSV: <code class="mono">${escapeHtml(studentId)}</code>
      </div>
      <div class="form-helper">Sinh viên hiện đang giữ chỗ hợp lệ trong thời hạn 24 giờ.</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="claim-days">Số ngày mượn (1 – 30 ngày):</label>
      <input type="number" id="claim-days" class="form-input" min="1" max="30" value="7" required autofocus>
      <div class="form-helper">Mặc định: 7 ngày (Quy tắc M13). Hệ thống sẽ tạo phiếu mượn 1 thiết bị và hoàn tất lượt giữ hàng.</div>
    </div>
  `;

  openModal({
    title: 'Xác nhận Nhận thiết bị từ Hàng đợi',
    content,
    confirmText: 'Tạo phiếu mượn ngay',
    cancelText: 'Huỷ',
    onConfirm: async () => {
      const daysInput = content.querySelector('#claim-days');
      const days = parseInt(daysInput.value, 10);
      if (isNaN(days) || days < 1 || days > 30) {
        showToast('Số ngày mượn phải nằm trong khoảng từ 1 đến 30 ngày', 'warning');
        throw new Error('Invalid days');
      }

      try {
        const res = await api.post(`/reservations/${deviceId}/claim`, { studentId, days });
        const recId = res.record ? res.record.recordId : '';
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
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <p style="margin: 0; line-height: 1.5;">
        Bạn có chắc chắn muốn huỷ đăng ký của sinh viên <strong>${escapeHtml(studentName)}</strong> (MSSV: <code class="mono">${escapeHtml(studentId)}</code>) khỏi hàng đợi thiết bị <strong>${escapeHtml(currentDevice?.name || deviceId)}</strong>?
      </p>
      ${isHolding ? `
        <div class="alert-box alert-warning" style="background-color: var(--color-danger-bg); border: 1px solid var(--color-danger-border); color: var(--color-danger-text); padding: 12px 14px; border-radius: var(--radius-md); font-size: 12.5px;">
          <div style="font-weight: 700; margin-bottom: 3px;">⚠️ Lưu ý quan trọng (Quy tắc M16):</div>
          Sinh viên này hiện đang được giữ chỗ thiết bị. Khi huỷ đăng ký, quyền nhận thiết bị trong 24 giờ sẽ tự động được chuyển cho người kế tiếp trong hàng đợi!
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
              showToast(n.message, n.type === 'hold_granted' ? 'success' : 'info', 'Chuyển quyền giữ hàng (M16)', 6000);
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

  // Bước 1: Xử lý thẻ bị loại bỏ (removed - lỡ lần 2):
  // Thẻ viền đỏ nhấp nháy 2 lần, co lại và mờ dần
  if (removedList.length > 0 && currentContainer) {
    removedList.forEach(n => {
      const card = currentContainer.querySelector(`.queue-card[data-student-id="${n.studentId}"]`);
      if (card) {
        // Viền đỏ nhấp nháy 2 lần (được định nghĩa trong animations.css: pulseRedBorder 400ms x 2)
        triggerRedPulse(card);
        // Sau đó co lại và mờ dần
        card.classList.add('card-shrink-remove');
      }
    });

    // Chờ 360ms cho hiệu ứng co mờ hoàn tất trước khi fetch và render lại
    await new Promise(r => setTimeout(r, 360));
  }

  // Bước 2: Nạp lại hàng đợi và kích hoạt FLIP animation cho thẻ trượt xuống cuối (missed)
  // và phát sáng cho thẻ được giữ (hold_granted)
  await loadReservations(selectedDeviceId, true, {
    missed: missedList,
    holdGranted: holdGrantedList
  });
}

/**
 * Hiển thị skeleton loading cho danh sách hàng đợi
 */
function renderQueueSkeleton() {
  const container = document.getElementById('reservation-queue-container');
  if (!container) return;

  container.innerHTML = `
    <div class="reservation-queue-grid">
      <div class="queue-card skeleton-card skeleton" style="height: 220px;"></div>
      <div class="queue-card skeleton-card skeleton" style="height: 220px;"></div>
      <div class="queue-card skeleton-card skeleton" style="height: 220px;"></div>
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
    <div class="error-state" style="padding: 40px 20px; background-color: var(--color-bg-surface); border: 1px solid var(--color-danger-border); border-radius: var(--radius-lg); width: 100%;">
      <i data-lucide="alert-octagon" class="error-state-icon"></i>
      <div class="error-state-title">Không thể tải thông tin hàng đợi</div>
      <div class="error-state-desc">${escapeHtml(msg)}</div>
      <button id="btn-retry-queue" class="btn btn-secondary btn-sm" style="margin-top: 8px;">
        <i data-lucide="rotate-cw"></i> Thử lại
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
  const container = document.getElementById('reservation-content-root');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state" style="padding: 60px 20px; background-color: var(--color-bg-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-lg);">
      <i data-lucide="package" class="empty-state-icon"></i>
      <div class="empty-state-title">Chưa có thiết bị nào trong hệ thống</div>
      <div class="empty-state-desc">Vui lòng sang màn hình Danh mục Thiết bị để thêm mới thiết bị vào phòng thực hành.</div>
      <a href="#/devices" class="btn btn-primary" style="margin-top: 10px;">
        <i data-lucide="plus"></i> Thêm thiết bị mới
      </a>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hiển thị lỗi nạp danh mục thiết bị
 */
function renderErrorAllDevices(msg) {
  const container = document.getElementById('reservation-content-root');
  if (!container) return;

  container.innerHTML = `
    <div class="error-state" style="padding: 60px 20px; background-color: var(--color-bg-surface); border: 1px solid var(--color-danger-border); border-radius: var(--radius-lg);">
      <i data-lucide="alert-triangle" class="error-state-icon"></i>
      <div class="error-state-title">Không thể nạp danh sách thiết bị</div>
      <div class="error-state-desc">${escapeHtml(msg)}</div>
      <button id="btn-retry-all-devices" class="btn btn-secondary" style="margin-top: 10px;">
        <i data-lucide="rotate-cw"></i> Thử lại
      </button>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  const retryBtn = container.querySelector('#btn-retry-all-devices');
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
            Hàng đợi FIFO có thời hạn 24 giờ nhận thiết bị, tự động đẩy xuống cuối khi lỡ hẹn (Quy tắc M11 – M16).
          </div>
        </div>
        <div class="page-actions">
          <button id="btn-refresh-reservations" class="btn btn-secondary" title="Làm mới dữ liệu hàng đợi">
            <i data-lucide="rotate-cw"></i> Làm mới
          </button>
        </div>
      </div>

      <!-- Vùng nội dung chính -->
      <div id="reservation-content-root" style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Thanh chọn thiết bị -->
        <div class="reservation-selector-card">
          <div class="reservation-selector-group">
            <label class="reservation-select-label" for="select-reservation-device">
              <i data-lucide="layers" style="color: var(--color-primary);"></i>
              <span>Chọn thiết bị xem hàng đợi:</span>
            </label>
            <select id="select-reservation-device" class="reservation-device-select">
              <option value="">Đang tải danh sách thiết bị...</option>
            </select>
          </div>
        </div>

        <!-- Khung tổng quan kho của thiết bị đang chọn -->
        <div id="reservation-device-overview" class="reservation-device-card">
          <div class="skeleton skeleton-title" style="width: 40%;"></div>
          <div class="skeleton skeleton-text" style="width: 80%;"></div>
          <div class="skeleton" style="height: 10px; width: 100%; border-radius: var(--radius-full);"></div>
        </div>

        <!-- Tiêu đề mục hàng đợi -->
        <div class="reservation-queue-header">
          <div class="reservation-queue-title">
            <i data-lucide="users" style="color: var(--color-primary);"></i>
            <span>Dãy sinh viên đang xếp hàng (FIFO)</span>
            <span id="reservation-queue-count" class="badge badge-subtle" style="font-size: 12px;">Đang tải...</span>
          </div>
        </div>

        <!-- Danh sách thẻ người chờ -->
        <div id="reservation-queue-container">
          <div class="reservation-queue-grid">
            <div class="queue-card skeleton-card skeleton" style="height: 220px;"></div>
            <div class="queue-card skeleton-card skeleton" style="height: 220px;"></div>
          </div>
        </div>

        <!-- Form đăng ký người mới vào hàng đợi -->
        <div id="reservation-register-container"></div>
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
      const icon = refreshBtn.querySelector('i');
      if (icon) icon.classList.add('spin-loading');
      refreshBtn.disabled = true;

      try {
        await loadDevices(selectedDeviceId);
        showToast('Đã làm mới dữ liệu hàng đợi', 'info');
      } catch (err) {
        showToast('Lỗi khi làm mới dữ liệu', 'error');
      } finally {
        if (icon) icon.classList.remove('spin-loading');
        refreshBtn.disabled = false;
      }
    });
  }

  // Bắt đầu nạp thiết bị
  await loadDevices();
}
