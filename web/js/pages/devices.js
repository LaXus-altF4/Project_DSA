/**
 * devices.js - Màn hình 2: Danh mục Thiết bị (Devices v2)
 * Kết nối API thật: GET /api/devices, GET /api/devices/{id}, GET /api/devices/{id}/companions,
 * POST / PUT / DELETE / maintenance...
 * Bảo đảm chuẩn Dark-tech Glass + Checklist UI/UX:
 * - Bảng dài cuộn ngang trong .table-responsive (không overshoot, không cuộn ngang trang)
 * - Trạng thái thiết bị = Màu + Icon Lucide + Chữ (không emoji)
 * - Label hiển thị rõ + lỗi form hiện ngay cạnh ô nhập
 */

import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { deviceIconHtml, illustrationHtml } from '../ui/device-images.js';

let currentContainer = null;
let currentQuery = '';
let currentStatus = '';
let searchTimeout = null;
let activeDeviceId = null;
let globalPanelListenersBound = false;
let panelOpenerEl = null; // Phần tử đã mở panel chi tiết (để trả focus khi đóng)

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Tạo huy hiệu trạng thái thiết bị (luôn đủ 3 yếu tố: màu token + icon Lucide + chữ)
 */
function buildStatusBadgeHtml(status) {
  if (status === 'borrowed') {
    return `
      <span class="badge badge-borrowed">
        <i data-lucide="clock" class="badge-icon"></i>
        <span>Đang mượn</span>
      </span>
    `;
  }
  if (status === 'maintenance') {
    return `
      <span class="badge badge-maintenance">
        <i data-lucide="wrench" class="badge-icon"></i>
        <span>Bảo trì</span>
      </span>
    `;
  }
  return `
    <span class="badge badge-available">
      <i data-lucide="check-circle-2" class="badge-icon"></i>
      <span>Sẵn sàng</span>
    </span>
  `;
}

/**
 * Helper hiển thị và xoá lỗi inline ngay cạnh ô nhập trong Modal
 */
function clearModalErrors(root) {
  if (!root) return;
  root.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  root.querySelectorAll('.form-error-inline').forEach((el) => {
    el.textContent = '';
  });
}

function setModalFieldError(root, inputId, errorId, message) {
  if (!root) return;
  const input = root.querySelector(`#${inputId}`);
  const errEl = root.querySelector(`#${errorId}`);
  if (input) {
    input.classList.add('is-invalid');
    input.focus();
  }
  if (errEl) {
    errEl.textContent = message;
  }
}

function bindClearErrorOnInput(root, pairs) {
  if (!root) return;
  pairs.forEach(([inputId, errorId]) => {
    const input = root.querySelector(`#${inputId}`);
    const errEl = root.querySelector(`#${errorId}`);
    if (input && errEl) {
      input.addEventListener('input', () => {
        input.classList.remove('is-invalid');
        errEl.textContent = '';
      });
    }
  });
}

/**
 * Lấy và hiển thị các thông báo phát sinh từ hàng đợi C++ (M3, M16, bảo trì...)
 */
async function drainAndToastNotifications(defaultTitle = 'Sự kiện hệ thống') {
  try {
    const notiRes = await api.get('/notifications');
    if (notiRes && Array.isArray(notiRes.notifications)) {
      notiRes.notifications.forEach((n) => {
        let type = 'info';
        let title = defaultTitle;
        if (n.type === 'hold_granted') {
          type = 'success';
          title = 'Hàng đợi: Giữ chỗ 24h';
        } else if (n.type === 'missed') {
          type = 'warning';
          title = 'Hàng đợi: Lỡ hẹn';
        } else if (n.type === 'removed') {
          type = 'error';
          title = 'Hàng đợi: Bị loại';
        }
        showToast(n.message, type, title, 6000);
      });
    }
  } catch (_) {}
}

/**
 * Hiển thị khung chờ Skeleton của bảng thiết bị
 */
function renderSkeletonTable() {
  const tbody = document.getElementById('devices-table-body');
  if (!tbody) return;

  tbody.innerHTML = Array(6).fill(0).map(() => `
    <tr>
      <td><div class="skeleton skeleton-w52"></div></td>
      <td><div class="skeleton skeleton-w180"></div></td>
      <td><div class="skeleton skeleton-w88"></div></td>
      <td><div class="skeleton skeleton-w150"></div></td>
      <td class="devices-col-count"><div class="skeleton skeleton-w34"></div></td>
      <td class="devices-col-queue"><div class="skeleton skeleton-w34"></div></td>
      <td class="devices-col-actions"><div class="skeleton skeleton-w72"></div></td>
    </tr>
  `).join('');
}

/**
 * Hiển thị lỗi tải danh sách
 */
function renderTableError(errorMsg) {
  const tbody = document.getElementById('devices-table-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7">
        <div class="error-state">
          ${illustrationHtml('connection-error')}
          <div class="error-state-title">Lỗi tải danh sách thiết bị</div>
          <div class="error-state-desc">${escapeHtml(errorMsg)}</div>
          <button id="btn-devices-retry" type="button" class="btn btn-primary btn-sm">
            <i data-lucide="rotate-cw"></i> Thử lại
          </button>
        </div>
      </td>
    </tr>
  `;

  if (window.lucide) window.lucide.createIcons();

  const retryBtn = document.getElementById('btn-devices-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', loadDevices);
  }
}

/**
 * Tải danh sách thiết bị từ API thật
 */
async function loadDevices() {
  renderSkeletonTable();

  try {
    const params = new URLSearchParams();
    if (currentQuery.trim()) params.append('query', currentQuery.trim());
    if (currentStatus) params.append('status', currentStatus);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await api.get(`/devices${queryString}`);
    renderDevicesList(res.devices || []);
  } catch (err) {
    renderTableError(err.message || 'Không thể kết nối đến máy chủ API');
  }
}

/**
 * Hiển thị danh sách thiết bị ra bảng
 */
function renderDevicesList(devices) {
  const tbody = document.getElementById('devices-table-body');
  const countBadge = document.getElementById('devices-count-badge');
  if (!tbody) return;

  if (countBadge) {
    countBadge.textContent = `${devices.length} thiết bị`;
  }

  if (devices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            ${illustrationHtml('no-results')}
            <div class="empty-state-title">Không tìm thấy thiết bị nào</div>
            <div class="empty-state-desc">Thử tìm kiếm với từ khóa khác hoặc điều chỉnh bộ lọc trạng thái.</div>
          </div>
        </td>
      </tr>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  tbody.innerHTML = devices.map((d) => {
    const total = Number(d.total) || 1;
    const available = Number(d.available) || 0;
    const borrowed = Number(d.borrowed) || 0;
    const onHold = Number(d.onHold) || 0;
    const maintenance = Number(d.maintenance) || 0;

    const pAvail = Math.round((available / total) * 100);
    const pBorrow = Math.round((borrowed / total) * 100);
    const pHold = Math.round((onHold / total) * 100);
    const pMaint = Math.round((maintenance / total) * 100);

    const tooltip = `Kho: Sẵn sàng: ${available} | Đang mượn: ${borrowed} | Đang giữ 24h: ${onHold} | Bảo trì: ${maintenance} (Tổng: ${total})`;

    const queueHtml = (d.queueLength || 0) > 0
      ? `<span class="badge badge-onhold tabular-nums"><i data-lucide="users" class="badge-icon"></i><span>${d.queueLength} chờ</span></span>`
      : '<span class="devices-empty-queue tabular-nums">0 chờ</span>';

    return `
      <tr
        class="clickable-row"
        tabindex="0"
        data-device-id="${escapeHtml(d.id)}"
        aria-label="Xem chi tiết thiết bị ${escapeHtml(d.name)} (${escapeHtml(d.id)})"
      >
        <td class="devices-col-code">
          <code class="device-code-chip">${escapeHtml(d.id)}</code>
        </td>
        <td class="devices-col-name">
          <div class="device-name-cell">
            <div class="device-row-thumb" aria-hidden="true">${deviceIconHtml(d.id, { size: 40 })}</div>
            <div class="device-name-clamp" title="${escapeHtml(d.name)}">
              ${escapeHtml(d.name)}
            </div>
          </div>
        </td>
        <td class="devices-col-status">
          ${buildStatusBadgeHtml(d.status)}
        </td>
        <td class="devices-col-stock">
          <div
            class="progress-bar-multi"
            title="${escapeHtml(tooltip)}"
            role="img"
            aria-label="${escapeHtml(tooltip)}"
          >
            <div class="progress-segment segment-available" style="width: ${pAvail}%;"></div>
            <div class="progress-segment segment-borrowed" style="width: ${pBorrow}%;"></div>
            <div class="progress-segment segment-onhold" style="width: ${pHold}%;"></div>
            <div class="progress-segment segment-maintenance" style="width: ${pMaint}%;"></div>
          </div>
          <div class="stock-metrics-row">
            <span class="stock-metric-avail" title="Sẵn sàng (${available}/${total})">Sẵn: ${available}</span>
            <span class="stock-metric-sep" aria-hidden="true">·</span>
            <span class="stock-metric-borr ${borrowed > 0 ? 'is-nonzero' : ''}" title="Đang mượn">Mượn: ${borrowed}</span>
            <span class="stock-metric-sep" aria-hidden="true">·</span>
            <span class="stock-metric-hold ${onHold > 0 ? 'is-nonzero' : ''}" title="Đang giữ 24h cho hàng đợi">Giữ: ${onHold}</span>
            <span class="stock-metric-sep" aria-hidden="true">·</span>
            <span class="stock-metric-maint ${maintenance > 0 ? 'is-nonzero' : ''}" title="Đang bảo trì">B.trì: ${maintenance}</span>
          </div>
        </td>
        <td class="devices-col-count">
          <span class="tabular-nums font-semibold">${d.timesBorrowed || 0}</span>
        </td>
        <td class="devices-col-queue">
          ${queueHtml}
        </td>
        <td class="devices-col-actions">
          <button
            type="button"
            class="btn btn-secondary btn-sm btn-open-panel"
            data-device-id="${escapeHtml(d.id)}"
            title="Xem chi tiết và thao tác"
          >
            <span>Chi tiết</span>
            <i data-lucide="chevron-right" class="btn-action-icon-sm"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Bắt sự kiện click & phím Enter/Space vào từng dòng để mở Slide-over panel
  tbody.querySelectorAll('.clickable-row').forEach((row) => {
    row.addEventListener('click', () => {
      const devId = row.dataset.deviceId;
      if (devId) openDevicePanel(devId);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const devId = row.dataset.deviceId;
        if (devId) openDevicePanel(devId);
      }
    });
  });

  tbody.querySelectorAll('.btn-open-panel').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const devId = btn.dataset.deviceId;
      if (devId) openDevicePanel(devId);
    });
  });
}

/**
 * Mở Slide-over panel bên phải xem chi tiết, top 3 mượn kèm và hàng đợi
 */
export async function openDevicePanel(deviceId) {
  activeDeviceId = deviceId;
  const panel = document.getElementById('side-panel');
  const backdrop = document.getElementById('side-panel-backdrop');
  if (!panel || !backdrop) return;

  // Nhớ phần tử đã mở panel để trả focus khi đóng (không ghi đè khi đổi sang thiết bị khác)
  if (!panel.classList.contains('open')) {
    panelOpenerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  backdrop.classList.add('active');
  panel.classList.add('open');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const appEl = document.getElementById('app');
  if (appEl) appEl.inert = true;

  panel.innerHTML = `
    <div class="side-panel-header">
      <div class="side-panel-title">
        <i data-lucide="layers"></i>
        <span>Chi tiết thiết bị <code class="device-code-chip">${escapeHtml(deviceId)}</code></span>
      </div>
      <button id="btn-close-panel" type="button" class="btn-icon" aria-label="Đóng panel chi tiết thiết bị" title="Đóng">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div class="side-panel-body">
      <div class="skeleton skeleton-panel-sm"></div>
      <div class="skeleton skeleton-panel-lg"></div>
      <div class="skeleton skeleton-panel-md"></div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  const firstCloseBtn = panel.querySelector('#btn-close-panel');
  firstCloseBtn.addEventListener('click', closeDevicePanel);
  firstCloseBtn.focus();

  try {
    const res = await api.get(`/devices/${encodeURIComponent(deviceId)}`);
    renderPanelContent(panel, res);
    // Nội dung panel vừa được thay: đưa focus lại vào nút đóng để không bị rơi ra ngoài
    const closeBtnAfter = panel.querySelector('#btn-close-panel');
    if (closeBtnAfter && !panel.contains(document.activeElement)) closeBtnAfter.focus();
  } catch (err) {
    panel.innerHTML = `
      <div class="side-panel-header">
        <div class="side-panel-title">
          <i data-lucide="layers"></i>
          <span>Chi tiết thiết bị</span>
        </div>
        <button id="btn-close-panel" type="button" class="btn-icon" aria-label="Đóng panel" title="Đóng">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="side-panel-body">
        <div class="error-state">
          ${illustrationHtml('connection-error')}
          <div class="error-state-title">Không thể tải thông tin thiết bị</div>
          <div class="error-state-desc">${escapeHtml(err.message || 'Lỗi kết nối')}</div>
          <button id="btn-panel-retry" type="button" class="btn btn-primary btn-sm">
            <i data-lucide="rotate-cw"></i> Thử lại
          </button>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    panel.querySelector('#btn-close-panel').addEventListener('click', closeDevicePanel);
    const retryBtn = panel.querySelector('#btn-panel-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => openDevicePanel(deviceId));
    }
  }
}

/**
 * Đóng Slide-over panel
 */
export function closeDevicePanel() {
  const panel = document.getElementById('side-panel');
  const backdrop = document.getElementById('side-panel-backdrop');
  if (panel) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true; // Panel đã đóng không được nhận focus / đọc màn hình
  }
  if (backdrop) {
    backdrop.classList.remove('active');
  }
  document.body.style.overflow = '';
  const appEl = document.getElementById('app');
  if (appEl) appEl.inert = false;
  activeDeviceId = null;

  // Trả focus về phần tử đã mở panel
  if (panelOpenerEl && document.contains(panelOpenerEl)) {
    panelOpenerEl.focus();
  }
  panelOpenerEl = null;
}

/**
 * Mở modal xem toàn bộ láng giềng đồ thị (M17: gồm cả thiết bị bảo trì kèm trạng thái)
 */
async function openAllCompanionsModal(dev) {
  try {
    const res = await api.get(`/devices/${encodeURIComponent(dev.id)}/companions`);
    const list = Array.isArray(res.companions) ? res.companions : [];

    const content = document.createElement('div');
    if (list.length === 0) {
      content.innerHTML = `
        <div class="panel-empty-box">
          Thiết bị <strong>${escapeHtml(dev.name)}</strong> chưa có láng giềng nào trong đồ thị mượn kèm.
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="all-companions-modal-list">
          ${list.map((c) => `
            <div class="companion-card" data-glow="${escapeHtml(c.status || 'available')}">
              <div class="companion-left">
                <div class="companion-thumb" aria-hidden="true">${deviceIconHtml(c.id, { size: 36 })}</div>
                <div class="companion-info">
                  <div class="companion-name">
                    ${escapeHtml(c.name)} <code class="device-code-chip">${escapeHtml(c.id)}</code>
                  </div>
                  <div class="companion-weight">
                    Mượn kèm: <strong class="tabular-nums">${c.weight}</strong> lần · Sẵn sàng: <strong class="tabular-nums">${c.available || 0}</strong>
                  </div>
                </div>
              </div>
              ${buildStatusBadgeHtml(c.status)}
            </div>
          `).join('')}
        </div>
      `;
    }

    openModal({
      title: `Toàn bộ láng giềng đồ thị: ${dev.id}`,
      content,
      cancelText: 'Đóng',
    });

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    showToast(
      err.message || 'Endpoint /companions chưa khả dụng ở chế độ này — bạn có thể xem trực quan tại Đồ thị mượn kèm.',
      'info',
      'Thông tin láng giềng',
      4500
    );
  }
}

/**
 * Điền nội dung chi tiết vào Slide-over panel
 */
function renderPanelContent(panel, data) {
  const dev = data.device;
  const queue = data.queue || [];
  const suggestions = data.suggestions || [];
  const total = Number(dev.total) || 1;
  const available = Number(dev.available) || 0;
  const borrowed = Number(dev.borrowed) || 0;
  const onHold = Number(dev.onHold) || 0;
  const maintenance = Number(dev.maintenance) || 0;

  const pAvail = Math.round((available / total) * 100);
  const pBorrow = Math.round((borrowed / total) * 100);
  const pHold = Math.round((onHold / total) * 100);
  const pMaint = Math.round((maintenance / total) * 100);
  const tooltip = `Kho: Sẵn sàng: ${available} | Đang mượn: ${borrowed} | Đang giữ: ${onHold} | Bảo trì: ${maintenance} (Tổng: ${total})`;

  panel.innerHTML = `
    <div class="side-panel-header">
      <div class="side-panel-title">
        <i data-lucide="layers"></i>
        <span>${escapeHtml(dev.name)}</span>
      </div>
      <button id="btn-close-panel" type="button" class="btn-icon" aria-label="Đóng panel chi tiết thiết bị" title="Đóng">
        <i data-lucide="x"></i>
      </button>
    </div>

    <div class="side-panel-body">
      <!-- 0. Khối nhận diện thiết bị trong Panel -->
      <div class="panel-device-hero">
        <div class="panel-device-thumb" aria-hidden="true">
          ${deviceIconHtml(dev.id, { size: 72 })}
        </div>
        <div class="panel-device-hero-meta">
          <div class="panel-device-hero-name">${escapeHtml(dev.name)}</div>
          <div class="panel-device-hero-badges">
            <code class="device-code-chip">${escapeHtml(dev.id)}</code>
            ${buildStatusBadgeHtml(dev.status)}
          </div>
          <div class="panel-device-hero-sub tnum">
            Đã mượn tích luỹ: <strong>${dev.timesBorrowed || 0}</strong> lượt · Hàng chờ: <strong>${queue.length}</strong> người
          </div>
        </div>
      </div>

      <!-- 1. Tóm tắt tình trạng kho -->
      <div class="side-panel-section">
        <div class="side-panel-section-title">
          <i data-lucide="box"></i> Tình trạng kho (${escapeHtml(dev.id)})
        </div>
        <div class="device-stock-summary-card" data-glow="${escapeHtml(dev.status || 'available')}">
          <div class="panel-stock-header">
            <span class="panel-stock-header-label">Trạng thái suy ra theo M1:</span>
            ${buildStatusBadgeHtml(dev.status)}
          </div>

          <div
            class="progress-bar-multi is-tall"
            title="${escapeHtml(tooltip)}"
            role="img"
            aria-label="${escapeHtml(tooltip)}"
          >
            <div class="progress-segment segment-available" style="width: ${pAvail}%;"></div>
            <div class="progress-segment segment-borrowed" style="width: ${pBorrow}%;"></div>
            <div class="progress-segment segment-onhold" style="width: ${pHold}%;"></div>
            <div class="progress-segment segment-maintenance" style="width: ${pMaint}%;"></div>
          </div>

          <div class="panel-stock-grid">
            <div>Sẵn sàng: <strong class="tabular-nums stock-metric-avail">${available}</strong> món</div>
            <div>Đang mượn: <strong class="tabular-nums stock-metric-borr is-nonzero">${borrowed}</strong> món</div>
            <div>Đang giữ 24h: <strong class="tabular-nums stock-metric-hold is-nonzero">${onHold}</strong> món</div>
            <div>Bảo trì: <strong class="tabular-nums stock-metric-maint is-nonzero">${maintenance}</strong> món</div>
            <div class="panel-invariant-note tnum">
              Bất biến kho: ${available} + ${borrowed} + ${onHold} + ${maintenance} = ${total} đơn vị
            </div>
          </div>

          <div class="side-panel-actions">
            <button id="btn-panel-edit" type="button" class="btn btn-secondary btn-sm">
              <i data-lucide="edit-3" class="btn-action-icon-sm"></i> Sửa
            </button>
            <button
              id="btn-panel-maintenance"
              type="button"
              class="btn btn-secondary btn-sm"
              ${available === 0 ? 'disabled' : ''}
              title="${available === 0 ? 'Hết hàng sẵn sàng để bảo trì' : 'Chuyển đơn vị sang bảo trì'}"
            >
              <i data-lucide="wrench" class="btn-action-icon-sm"></i> Chuyển bảo trì
            </button>
            <button
              id="btn-panel-finish-maintenance"
              type="button"
              class="btn btn-secondary btn-sm"
              ${maintenance === 0 ? 'disabled' : ''}
              title="${maintenance === 0 ? 'Không có món đang bảo trì' : 'Hoàn tất bảo trì'}"
            >
              <i data-lucide="check-circle-2" class="btn-action-icon-sm"></i> Trả bảo trì
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Top 3 gợi ý mượn kèm + Toàn bộ láng giềng Graph (M17) -->
      <div class="side-panel-section">
        <div class="panel-section-header">
          <div class="side-panel-section-title">
            <i data-lucide="sparkles"></i> Top 3 mượn kèm (M17)
          </div>
          <button
            id="btn-panel-all-companions"
            type="button"
            class="btn btn-outline btn-sm"
            title="Xem toàn bộ láng giềng trong đồ thị kèm trạng thái (gồm cả thiết bị bảo trì)"
          >
            <i data-lucide="network" class="btn-action-icon-sm"></i>
            <span>Toàn bộ láng giềng</span>
          </button>
        </div>

        ${suggestions.length === 0 ? `
          <div class="panel-empty-box">
            Chưa có ghi nhận thiết bị nào thường mượn kèm với ${escapeHtml(dev.name)}.
          </div>
        ` : `
          <div class="companion-list">
            ${suggestions.map((s) => `
              <div class="companion-card" data-glow="${s.outOfStock ? 'borrowed' : 'available'}">
                <div class="companion-left">
                  <div class="companion-thumb" aria-hidden="true">${deviceIconHtml(s.id, { size: 36 })}</div>
                  <div class="companion-info">
                    <div class="companion-name">
                      ${escapeHtml(s.name)} <code class="device-code-chip">${escapeHtml(s.id)}</code>
                    </div>
                    <div class="companion-weight">
                      Mượn kèm: <strong class="tabular-nums">${s.weight}</strong> lần ·
                      ${s.outOfStock
                        ? '<span class="companion-stock-out">Hết hàng</span>'
                        : `<span class="companion-stock-ok">Còn ${s.available} sẵn sàng</span>`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-outline btn-sm btn-view-companion"
                  data-id="${escapeHtml(s.id)}"
                  title="Xem chi tiết thiết bị ${escapeHtml(s.id)}"
                >
                  Xem
                </button>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- 3. Hàng đợi đặt trước hiện tại (Reservation Queue) -->
      <div class="side-panel-section">
        <div class="panel-section-header">
          <div class="side-panel-section-title">
            <i data-lucide="clock"></i> Hàng đợi đặt trước (${queue.length} người)
          </div>
          <div class="panel-section-actions">
            <a
              href="#/reservations?id=${encodeURIComponent(dev.id)}"
              id="btn-panel-view-queue"
              class="btn btn-outline btn-sm"
              title="Mở trang Hàng đợi đặt trước chi tiết"
            >
              <i data-lucide="external-link" class="btn-action-icon-sm"></i> Xem đầy đủ
            </a>
            ${available === 0 ? `
              <button id="btn-panel-register-queue" type="button" class="btn btn-primary btn-sm">
                <i data-lucide="user-plus" class="btn-action-icon-sm"></i> Đăng ký
              </button>
            ` : `
              <span class="panel-queue-hint" title="Thiết bị còn hàng, phải mượn trực tiếp">
                Đặt trước mở khi hết hàng (M12)
              </span>
            `}
          </div>
        </div>

        ${queue.length === 0 ? `
          <div class="panel-empty-box">
            Hàng đợi đang trống. Không có sinh viên nào đang chờ thiết bị này.
          </div>
        ` : `
          <div class="queue-mini-list">
            ${queue.map((q) => {
              const isHold = q.holding === true;
              const hoursLeft = Math.max(0, Number(q.hoursLeft) || 0);
              const isUrgentHold = isHold && hoursLeft <= 6;
              return `
                <div class="queue-mini-item ${isHold ? 'is-holding' : ''}">
                  <div class="panel-queue-left">
                    <div class="queue-pos-badge tabular-nums">${q.position}</div>
                    <div class="panel-queue-meta">
                      <div class="panel-queue-student">
                        ${escapeHtml(q.studentName)} <span class="panel-queue-sid">(${escapeHtml(q.studentId)})</span>
                      </div>
                      <div class="panel-queue-time">
                        Đăng ký: ${escapeHtml(q.enqueueText || '')}
                        ${(q.missCount || 0) > 0
                          ? ` · <span class="panel-queue-miss">Lỡ hẹn: ${q.missCount}/2</span>`
                          : ''}
                      </div>
                      ${isHold ? `
                        <div class="panel-queue-hold-row">
                          <span class="expiring-badge ${isUrgentHold ? 'is-urgent' : ''}">
                            <i data-lucide="hourglass" class="expiring-badge-icon"></i>
                            <span>Còn ${hoursLeft}h (Hạn: ${escapeHtml(q.holdUntilText || '')})</span>
                          </span>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  <div class="panel-queue-btns">
                    ${isHold ? `
                      <button
                        type="button"
                        class="btn btn-primary btn-sm btn-claim-queue"
                        data-dev="${escapeHtml(dev.id)}"
                        data-stuid="${escapeHtml(q.studentId)}"
                        data-stuname="${escapeHtml(q.studentName)}"
                      >
                        Nhận máy
                      </button>
                    ` : ''}
                    <button
                      type="button"
                      class="btn btn-outline btn-sm btn-cancel-queue"
                      data-dev="${escapeHtml(dev.id)}"
                      data-devname="${escapeHtml(dev.name)}"
                      data-stuid="${escapeHtml(q.studentId)}"
                      data-stuname="${escapeHtml(q.studentName)}"
                      data-holding="${isHold}"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- 4. Vùng thao tác nguy hiểm (Xoá thiết bị) -->
      <div class="side-panel-section panel-danger-zone">
        <div class="side-panel-section-title panel-danger-zone-title">
          <i data-lucide="alert-triangle"></i> Thao tác nguy hiểm
        </div>
        <div class="panel-danger-zone-body">
          <p class="panel-danger-zone-desc">Xoá thiết bị khỏi danh mục. Chỉ xoá được khi không còn phiếu mượn đang mở và không còn người trong hàng đợi.</p>
          <button id="btn-panel-delete" type="button" class="btn btn-outline btn-sm panel-btn-danger-outline">
            <i data-lucide="trash-2" class="btn-action-icon-sm"></i> Xoá thiết bị
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  panel.querySelector('#btn-close-panel').addEventListener('click', closeDevicePanel);

  panel.querySelectorAll('.btn-view-companion').forEach((btn) => {
    btn.addEventListener('click', () => {
      openDevicePanel(btn.dataset.id);
    });
  });

  const allCompanionsBtn = panel.querySelector('#btn-panel-all-companions');
  if (allCompanionsBtn) {
    allCompanionsBtn.addEventListener('click', () => openAllCompanionsModal(dev));
  }

  const editBtn = panel.querySelector('#btn-panel-edit');
  if (editBtn) editBtn.addEventListener('click', () => openEditDeviceModal(dev));

  const maintBtn = panel.querySelector('#btn-panel-maintenance');
  if (maintBtn && available > 0) {
    maintBtn.addEventListener('click', () => openSendMaintenanceModal(dev));
  }

  const finishMaintBtn = panel.querySelector('#btn-panel-finish-maintenance');
  if (finishMaintBtn && maintenance > 0) {
    finishMaintBtn.addEventListener('click', () => openFinishMaintenanceModal(dev));
  }

  const deleteBtn = panel.querySelector('#btn-panel-delete');
  if (deleteBtn) deleteBtn.addEventListener('click', () => confirmDeleteDevice(dev));

  const viewQueueLink = panel.querySelector('#btn-panel-view-queue');
  if (viewQueueLink) {
    viewQueueLink.addEventListener('click', closeDevicePanel);
  }

  const registerQueueBtn = panel.querySelector('#btn-panel-register-queue');
  if (registerQueueBtn) {
    const nextPos = data.nextQueuePosition || (queue.length + 1);
    registerQueueBtn.addEventListener('click', () => openRegisterQueueModal(dev.id, dev.name, nextPos));
  }

  panel.querySelectorAll('.btn-claim-queue').forEach((btn) => {
    btn.addEventListener('click', () => {
      openClaimModal(btn.dataset.dev, btn.dataset.stuid, btn.dataset.stuname);
    });
  });

  panel.querySelectorAll('.btn-cancel-queue').forEach((btn) => {
    btn.addEventListener('click', () => {
      const isHold = btn.dataset.holding === 'true';
      openCancelQueueFromPanelModal(
        btn.dataset.dev,
        btn.dataset.devname || dev.name,
        btn.dataset.stuid,
        btn.dataset.stuname || btn.dataset.stuid,
        isHold
      );
    });
  });
}

/**
 * Modal Huỷ đăng ký hàng đợi từ Panel phải (DELETE /api/reservations/{dev}/{stuid})
 */
function openCancelQueueFromPanelModal(deviceId, deviceName, studentId, studentName, isHolding) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="companion-list">
      <p>
        Bạn có chắc chắn muốn huỷ đăng ký của sinh viên <strong>${escapeHtml(studentName)}</strong> (<code class="device-code-chip">${escapeHtml(studentId)}</code>) khỏi hàng đợi thiết bị <strong>${escapeHtml(deviceName)}</strong>?
      </p>
      ${isHolding ? `
        <div class="panel-alert-danger">
          <i data-lucide="alert-triangle" class="panel-alert-icon"></i>
          <div>
            <strong>Lưu ý:</strong> Sinh viên này đang giữ chỗ 24h. Khi huỷ, quyền giữ hàng sẽ tự động chuyển cho người kế tiếp trong hàng đợi.
          </div>
        </div>
      ` : ''}
    </div>
  `;

  openModal({
    title: 'Xác nhận Huỷ đăng ký Hàng đợi',
    content,
    confirmText: 'Huỷ đăng ký',
    cancelText: 'Quay lại',
    onConfirm: async () => {
      try {
        await api.delete(`/reservations/${encodeURIComponent(deviceId)}/${encodeURIComponent(studentId)}`);
        showToast(`Đã huỷ đăng ký hàng đợi cho sinh viên ${studentName}.`, 'success');
        await drainAndToastNotifications('Chuyển quyền giữ hàng');
        openDevicePanel(deviceId);
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Lỗi khi huỷ đăng ký', 'error');
        throw err;
      }
    },
  });

  if (window.lucide) window.lucide.createIcons();
}

/* ==========================================================================
   MODAL THAO TÁC (Thêm / Sửa / Bảo trì / Xoá / Hàng đợi — kèm lỗi inline cạnh ô)
   ========================================================================== */

/**
 * 1. Modal Thêm thiết bị mới (POST /api/devices)
 */
function openAddDeviceModal() {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="add-device-id">Mã thiết bị (ID):</label>
      <input type="text" id="add-device-id" class="form-input mono" placeholder="VD: VR02, OSC02..." required autofocus>
      <div class="form-error-inline" id="err-add-device-id" role="alert"></div>
      <div class="form-helper">Không chứa dấu phẩy (,), thanh đứng (|) hoặc ký tự xuống dòng.</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="add-device-name">Tên thiết bị:</label>
      <input type="text" id="add-device-name" class="form-input" placeholder="VD: Kính thực tế ảo thế hệ 2..." required>
      <div class="form-error-inline" id="err-add-device-name" role="alert"></div>
    </div>
    <div class="form-group">
      <label class="form-label" for="add-device-total">Tổng số lượng đơn vị:</label>
      <input type="number" id="add-device-total" class="form-input tabular-nums" min="1" max="999" value="1" required>
      <div class="form-error-inline" id="err-add-device-total" role="alert"></div>
    </div>
  `;

  bindClearErrorOnInput(content, [
    ['add-device-id', 'err-add-device-id'],
    ['add-device-name', 'err-add-device-name'],
    ['add-device-total', 'err-add-device-total'],
  ]);

  openModal({
    title: 'Thêm thiết bị mới vào phòng Lab',
    content,
    confirmText: 'Lưu thiết bị',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      clearModalErrors(content);
      const idInput = content.querySelector('#add-device-id').value.trim();
      const nameInput = content.querySelector('#add-device-name').value.trim();
      const totalInput = parseInt(content.querySelector('#add-device-total').value, 10);

      if (!idInput) {
        setModalFieldError(content, 'add-device-id', 'err-add-device-id', 'Vui lòng nhập mã thiết bị.');
        throw new Error('Missing device id');
      }
      if (/[,|\n\r]/.test(idInput)) {
        setModalFieldError(content, 'add-device-id', 'err-add-device-id', 'Mã thiết bị không được chứa dấu phẩy (,), thanh đứng (|) hoặc xuống dòng.');
        throw new Error('Invalid M5 id');
      }
      if (!nameInput) {
        setModalFieldError(content, 'add-device-name', 'err-add-device-name', 'Vui lòng nhập tên thiết bị.');
        throw new Error('Missing device name');
      }
      if (/[,|\n\r]/.test(nameInput)) {
        setModalFieldError(content, 'add-device-name', 'err-add-device-name', 'Tên thiết bị không được chứa dấu phẩy (,), thanh đứng (|) hoặc xuống dòng.');
        throw new Error('Invalid M5 name');
      }
      if (isNaN(totalInput) || totalInput <= 0 || totalInput > 999) {
        setModalFieldError(content, 'add-device-total', 'err-add-device-total', 'Số lượng phải từ 1 đến 999.');
        throw new Error('Invalid total');
      }

      try {
        await api.post('/devices', { id: idInput, name: nameInput, total: totalInput });
        showToast(`Đã thêm thiết bị ${idInput} thành công!`, 'success');
        loadDevices();
      } catch (err) {
        setModalFieldError(content, 'add-device-id', 'err-add-device-id', err.message || 'Không thể lưu thiết bị này.');
        showToast(err.message || 'Lỗi khi thêm thiết bị', 'error', 'Lỗi lưu thiết bị');
        throw err;
      }
    },
  });
}

/**
 * 2. Modal Sửa thiết bị (PUT /api/devices/{id})
 */
function openEditDeviceModal(dev) {
  const minAllowed = (dev.borrowed || 0) + (dev.onHold || 0) + (dev.maintenance || 0);

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="edit-device-id-readonly">Mã thiết bị:</label>
      <input type="text" id="edit-device-id-readonly" class="form-input mono form-input-readonly" value="${escapeHtml(dev.id)}" disabled>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-device-name">Tên thiết bị:</label>
      <input type="text" id="edit-device-name" class="form-input" value="${escapeHtml(dev.name)}" required autofocus>
      <div class="form-error-inline" id="err-edit-device-name" role="alert"></div>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-device-total">Tổng số lượng đơn vị:</label>
      <input type="number" id="edit-device-total" class="form-input tabular-nums" min="${minAllowed}" value="${dev.total}" required>
      <div class="form-error-inline" id="err-edit-device-total" role="alert"></div>
      <div class="form-helper">
        Tối thiểu là <strong>${minAllowed}</strong> đơn vị (do đang có: ${dev.borrowed} mượn, ${dev.onHold} giữ, ${dev.maintenance} bảo trì).
      </div>
    </div>
  `;

  bindClearErrorOnInput(content, [
    ['edit-device-name', 'err-edit-device-name'],
    ['edit-device-total', 'err-edit-device-total'],
  ]);

  openModal({
    title: `Chỉnh sửa thiết bị: ${dev.id}`,
    content,
    confirmText: 'Cập nhật',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      clearModalErrors(content);
      const nameInput = content.querySelector('#edit-device-name').value.trim();
      const totalInput = parseInt(content.querySelector('#edit-device-total').value, 10);

      if (!nameInput) {
        setModalFieldError(content, 'edit-device-name', 'err-edit-device-name', 'Tên thiết bị không được để trống.');
        throw new Error('Missing name');
      }
      if (/[,|\n\r]/.test(nameInput)) {
        setModalFieldError(content, 'edit-device-name', 'err-edit-device-name', 'Tên không được chứa dấu phẩy (,), thanh đứng (|) hoặc xuống dòng.');
        throw new Error('Invalid M5');
      }
      if (isNaN(totalInput) || totalInput < minAllowed) {
        setModalFieldError(content, 'edit-device-total', 'err-edit-device-total', `Tổng số lượng không được nhỏ hơn ${minAllowed}.`);
        throw new Error('Invalid total');
      }

      try {
        await api.put(`/devices/${encodeURIComponent(dev.id)}`, { name: nameInput, total: totalInput });
        showToast(`Cập nhật thông tin ${dev.id} thành công!`, 'success');
        await drainAndToastNotifications('Hàng đợi được phục vụ');
        openDevicePanel(dev.id);
        loadDevices();
      } catch (err) {
        setModalFieldError(content, 'edit-device-total', 'err-edit-device-total', err.message || 'Lỗi khi cập nhật thiết bị.');
        showToast(err.message || 'Lỗi khi cập nhật thiết bị', 'error');
        throw err;
      }
    },
  });
}

/**
 * 3. Modal Chuyển sang bảo trì (POST /api/devices/{id}/maintenance)
 */
function openSendMaintenanceModal(dev) {
  const maxAvailable = dev.available || 0;
  if (maxAvailable <= 0) {
    showToast('Thiết bị này hiện không còn đơn vị sẵn sàng để chuyển bảo trì', 'warning');
    return;
  }

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Thiết bị:</label>
      <div class="modal-static-val">${escapeHtml(dev.name)} (<code class="device-code-chip">${escapeHtml(dev.id)}</code>)</div>
      <div class="form-helper">Hiện có <strong>${maxAvailable}</strong> đơn vị đang sẵn sàng.</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="maint-qty">Số lượng đơn vị cần bảo trì (1 – ${maxAvailable}):</label>
      <input type="number" id="maint-qty" class="form-input tabular-nums" min="1" max="${maxAvailable}" value="1" required autofocus>
      <div class="form-error-inline" id="err-maint-qty" role="alert"></div>
    </div>
  `;

  bindClearErrorOnInput(content, [['maint-qty', 'err-maint-qty']]);

  openModal({
    title: `Chuyển sang bảo trì: ${dev.id}`,
    content,
    confirmText: 'Chuyển bảo trì',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      clearModalErrors(content);
      const qtyInput = parseInt(content.querySelector('#maint-qty').value, 10);
      if (isNaN(qtyInput) || qtyInput < 1 || qtyInput > maxAvailable) {
        setModalFieldError(content, 'maint-qty', 'err-maint-qty', `Số lượng phải từ 1 đến ${maxAvailable}.`);
        throw new Error('Invalid qty');
      }

      try {
        await api.post(`/devices/${encodeURIComponent(dev.id)}/maintenance`, { qty: qtyInput });
        showToast(`Đã chuyển ${qtyInput} đơn vị ${dev.id} sang bảo trì`, 'success');
        openDevicePanel(dev.id);
        loadDevices();
      } catch (err) {
        setModalFieldError(content, 'maint-qty', 'err-maint-qty', err.message || 'Lỗi chuyển bảo trì.');
        showToast(err.message || 'Lỗi chuyển bảo trì', 'error');
        throw err;
      }
    },
  });
}

/**
 * 4. Modal Hoàn tất bảo trì (POST /api/devices/{id}/maintenance/finish)
 */
function openFinishMaintenanceModal(dev) {
  const maxMaint = dev.maintenance || 0;
  if (maxMaint <= 0) {
    showToast('Không có đơn vị nào đang trong trạng thái bảo trì', 'warning');
    return;
  }

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Thiết bị:</label>
      <div class="modal-static-val">${escapeHtml(dev.name)} (<code class="device-code-chip">${escapeHtml(dev.id)}</code>)</div>
      <div class="form-helper">Hiện có <strong>${maxMaint}</strong> đơn vị đang bảo trì.</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="finish-maint-qty">Số lượng đơn vị hoàn tất bảo trì (1 – ${maxMaint}):</label>
      <input type="number" id="finish-maint-qty" class="form-input tabular-nums" min="1" max="${maxMaint}" value="${maxMaint}" required autofocus>
      <div class="form-error-inline" id="err-finish-maint-qty" role="alert"></div>
      <div class="form-helper">Đơn vị sau khi sửa xong sẽ trở lại sẵn sàng hoặc phục vụ người chờ hàng đợi.</div>
    </div>
  `;

  bindClearErrorOnInput(content, [['finish-maint-qty', 'err-finish-maint-qty']]);

  openModal({
    title: `Hoàn tất bảo trì: ${dev.id}`,
    content,
    confirmText: 'Xác nhận hoàn tất',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      clearModalErrors(content);
      const qtyInput = parseInt(content.querySelector('#finish-maint-qty').value, 10);
      if (isNaN(qtyInput) || qtyInput < 1 || qtyInput > maxMaint) {
        setModalFieldError(content, 'finish-maint-qty', 'err-finish-maint-qty', `Số lượng phải từ 1 đến ${maxMaint}.`);
        throw new Error('Invalid qty');
      }

      try {
        await api.post(`/devices/${encodeURIComponent(dev.id)}/maintenance/finish`, { qty: qtyInput });
        showToast(`Đã phục hồi ${qtyInput} đơn vị ${dev.id} về kho`, 'success');
        await drainAndToastNotifications('Hàng đợi được phục vụ');
        openDevicePanel(dev.id);
        loadDevices();
      } catch (err) {
        setModalFieldError(content, 'finish-maint-qty', 'err-finish-maint-qty', err.message || 'Lỗi hoàn tất bảo trì.');
        showToast(err.message || 'Lỗi hoàn tất bảo trì', 'error');
        throw err;
      }
    },
  });
}

/**
 * 5. Modal Xoá thiết bị (DELETE /api/devices/{id})
 */
function confirmDeleteDevice(dev) {
  const content = document.createElement('div');
  content.innerHTML = `
    <p>Bạn có chắc chắn muốn xoá thiết bị <strong>${escapeHtml(dev.name)} (${escapeHtml(dev.id)})</strong>?</p>
    <div class="panel-alert-danger modal-danger-note">
      <i data-lucide="alert-triangle" class="panel-alert-icon"></i>
      <div>
        Chỉ xoá được khi không còn phiếu mượn đang mở và không còn người trong hàng đợi. Đỉnh và các cạnh liên quan trong đồ thị sẽ bị xoá vĩnh viễn.
      </div>
    </div>
  `;

  openModal({
    title: `Xác nhận xoá thiết bị: ${dev.id}`,
    content,
    confirmText: 'Xoá vĩnh viễn',
    cancelText: 'Giữ lại',
    onConfirm: async () => {
      try {
        await api.delete(`/devices/${encodeURIComponent(dev.id)}`);
        showToast(`Đã xoá thiết bị ${dev.id} thành công`, 'success');
        closeDevicePanel();
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Không thể xoá thiết bị này', 'error', 'Từ chối xoá thiết bị');
        throw err;
      }
    },
  });

  if (window.lucide) window.lucide.createIcons();
}

/**
 * 6. Modal Đăng ký hàng đợi từ panel (POST /api/reservations/{deviceId})
 */
function openRegisterQueueModal(deviceId, deviceName, nextQueuePosition = null) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Thiết bị đăng ký:</label>
      <div class="modal-static-val">${escapeHtml(deviceName)} (<code class="device-code-chip">${escapeHtml(deviceId)}</code>)</div>
      <div id="panel-next-queue-pos" class="form-helper modal-highlight-note">
        ${nextQueuePosition ? `Vị trí dự kiến trong hàng đợi: #${nextQueuePosition}` : 'Đang kiểm tra vị trí hàng đợi…'}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="queue-student-id">Mã số sinh viên (MSSV):</label>
      <input type="text" id="queue-student-id" class="form-input mono" placeholder="VD: 25120199" required autofocus>
      <div class="form-error-inline" id="err-queue-student-id" role="alert"></div>
    </div>
    <div class="form-group">
      <label class="form-label" for="queue-student-name">Họ và tên sinh viên:</label>
      <input type="text" id="queue-student-name" class="form-input" placeholder="VD: Trần Văn An" required>
      <div class="form-error-inline" id="err-queue-student-name" role="alert"></div>
      <div class="form-helper">Không chứa dấu phẩy (,), gạch đứng (|) hoặc xuống dòng.</div>
    </div>
  `;

  bindClearErrorOnInput(content, [
    ['queue-student-id', 'err-queue-student-id'],
    ['queue-student-name', 'err-queue-student-name'],
  ]);

  if (!nextQueuePosition) {
    api.get(`/devices/${encodeURIComponent(deviceId)}`).then((res) => {
      const posEl = content.querySelector('#panel-next-queue-pos');
      if (posEl && res) {
        const pos = res.nextQueuePosition || ((res.queue ? res.queue.length : 0) + 1);
        posEl.textContent = `Vị trí dự kiến trong hàng đợi: #${pos}`;
      }
    }).catch(() => {});
  }

  openModal({
    title: 'Đăng ký vào Hàng đợi đặt trước',
    content,
    confirmText: 'Đăng ký chờ',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      clearModalErrors(content);
      const stId = content.querySelector('#queue-student-id').value.trim();
      const stName = content.querySelector('#queue-student-name').value.trim();

      if (!stId) {
        setModalFieldError(content, 'queue-student-id', 'err-queue-student-id', 'Vui lòng nhập MSSV.');
        throw new Error('Missing studentId');
      }
      if (/[,|\n\r]/.test(stId)) {
        setModalFieldError(content, 'queue-student-id', 'err-queue-student-id', 'MSSV không được chứa dấu phẩy (,), gạch đứng (|) hoặc xuống dòng.');
        throw new Error('Invalid M5 studentId');
      }
      if (!stName) {
        setModalFieldError(content, 'queue-student-name', 'err-queue-student-name', 'Vui lòng nhập họ và tên sinh viên.');
        throw new Error('Missing studentName');
      }
      if (/[,|\n\r]/.test(stName)) {
        setModalFieldError(content, 'queue-student-name', 'err-queue-student-name', 'Họ tên không được chứa dấu phẩy (,), gạch đứng (|) hoặc xuống dòng.');
        throw new Error('Invalid M5 studentName');
      }

      try {
        const res = await api.post(`/reservations/${encodeURIComponent(deviceId)}`, { studentId: stId, studentName: stName });
        showToast(`Đăng ký thành công! Bạn đứng vị trí số ${res.position} trong hàng đợi.`, 'success');
        openDevicePanel(deviceId);
        loadDevices();
      } catch (err) {
        setModalFieldError(content, 'queue-student-id', 'err-queue-student-id', err.message || 'Lỗi đăng ký hàng đợi.');
        showToast(err.message || 'Lỗi đăng ký hàng đợi', 'error');
        throw err;
      }
    },
  });
}

/**
 * 7. Modal Nhận thiết bị (POST /api/reservations/{deviceId}/claim)
 */
function openClaimModal(deviceId, studentId, studentName) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Sinh viên nhận thiết bị:</label>
      <div class="modal-static-val">${escapeHtml(studentName)} (<code class="device-code-chip">${escapeHtml(studentId)}</code>)</div>
      <div class="form-helper">Thiết bị: <code class="device-code-chip">${escapeHtml(deviceId)}</code></div>
    </div>
    <div class="form-group">
      <label class="form-label" for="claim-days">Số ngày mượn (1 – 30 ngày):</label>
      <input type="number" id="claim-days" class="form-input tabular-nums" min="1" max="30" value="7" required autofocus>
      <div class="form-error-inline" id="err-claim-days" role="alert"></div>
      <div class="form-helper">Mặc định: 7 ngày. Hệ thống sẽ tạo phiếu mượn 1 thiết bị.</div>
    </div>
  `;

  bindClearErrorOnInput(content, [['claim-days', 'err-claim-days']]);

  openModal({
    title: 'Nhận thiết bị từ Hàng đợi',
    content,
    confirmText: 'Xác nhận tạo phiếu mượn',
    cancelText: 'Huỷ',
    onConfirm: async () => {
      clearModalErrors(content);
      const days = parseInt(content.querySelector('#claim-days').value, 10);
      if (isNaN(days) || days < 1 || days > 30) {
        setModalFieldError(content, 'claim-days', 'err-claim-days', 'Số ngày mượn phải từ 1 đến 30 ngày.');
        throw new Error('Invalid days');
      }

      try {
        const res = await api.post(`/reservations/${encodeURIComponent(deviceId)}/claim`, { studentId, days });
        const recId = res.record ? ` #${res.record.recordId}` : '';
        showToast(`Sinh viên ${studentName} đã nhận thiết bị! Đã tạo phiếu mượn${recId}.`, 'success');
        await drainAndToastNotifications();
        openDevicePanel(deviceId);
        loadDevices();
      } catch (err) {
        setModalFieldError(content, 'claim-days', 'err-claim-days', err.message || 'Lỗi nhận thiết bị.');
        showToast(err.message || 'Lỗi nhận thiết bị', 'error');
        throw err;
      }
    },
  });
}

/**
 * Khởi tạo giao diện trang Thiết bị
 */
export async function render(container) {
  currentContainer = container;
  // Luôn mở trang ở trạng thái mặc định "Tất cả trạng thái" và ô tìm kiếm trống
  clearTimeout(searchTimeout);
  currentQuery = '';
  currentStatus = '';

  container.innerHTML = `
    <div class="page">
      <!-- Tiêu đề trang & Nút thêm thiết bị -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="layers"></i> Danh mục Thiết bị
          </h1>
          <div class="page-desc">Quản lý danh mục thiết bị bằng Doubly Linked List, theo dõi tỷ lệ kho 4 màu và gợi ý mượn kèm.</div>
        </div>
        <div class="page-actions">
          <button id="btn-add-device" type="button" class="btn btn-primary btn-sm">
            <i data-lucide="plus"></i> Thêm thiết bị mới
          </button>
        </div>
      </div>

      <!-- Thanh tìm kiếm và bộ lọc trạng thái 1 hàng gọn -->
      <div class="bento-card bento-table-card devices-filter-card stagger-item stagger-delay-1">
        <div class="devices-filter-bar">
          <div class="devices-filter-field is-search">
            <label class="devices-filter-label" for="input-device-search">Tìm theo mã hoặc tên thiết bị</label>
            <div class="search-input-wrapper">
              <i data-lucide="search" class="search-input-icon"></i>
              <input
                type="text"
                id="input-device-search"
                class="form-input"
                placeholder="Nhập mã (VD: VR01) hoặc tên thiết bị..."
                value=""
              >
            </div>
          </div>

          <div class="devices-filter-field is-status">
            <label class="devices-filter-label" for="select-device-status">Trạng thái</label>
            <select id="select-device-status" class="form-select">
              <option value="" selected>Tất cả trạng thái</option>
              <option value="available">Sẵn sàng</option>
              <option value="borrowed">Đang mượn</option>
              <option value="maintenance">Bảo trì</option>
            </select>
          </div>

          <div class="devices-filter-actions">
            <span id="devices-count-badge" class="badge badge-available tabular-nums">Đang tải…</span>
            <button
              id="btn-devices-refresh"
              type="button"
              class="btn btn-secondary btn-sm"
              aria-label="Làm mới danh mục thiết bị"
              title="Tải lại danh sách thiết bị"
            >
              <i data-lucide="refresh-cw" class="btn-action-icon-sm"></i>
              <span>Làm mới</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Bảng danh sách thiết bị (vừa 1366/1920, cuộn ngang nội bộ khi hẹp) -->
      <div class="table-responsive bento-table-card stagger-item no-overshoot stagger-delay-2">
        <table class="data-table devices-table">
          <thead>
            <tr>
              <th class="devices-col-code">Mã</th>
              <th class="devices-col-name">Thiết bị</th>
              <th class="devices-col-status">Trạng thái</th>
              <th class="devices-col-stock" title="Tỷ lệ kho (Sẵn / Mượn / Giữ 24h / Bảo trì)">Tỷ lệ kho</th>
              <th class="devices-col-count">Lượt mượn</th>
              <th class="devices-col-queue">Hàng đợi</th>
              <th class="devices-col-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody id="devices-table-body"></tbody>
        </table>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Bắt sự kiện tìm kiếm (Debounce 200ms)
  const searchInput = container.querySelector('#input-device-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        loadDevices();
      }, 200);
    });
  }

  // Bắt sự kiện lọc theo trạng thái
  const statusSelect = container.querySelector('#select-device-status');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      currentStatus = e.target.value;
      loadDevices();
    });
  }

  // Nút Thêm thiết bị mới
  const addBtn = container.querySelector('#btn-add-device');
  if (addBtn) {
    addBtn.addEventListener('click', openAddDeviceModal);
  }

  // Nút Làm mới
  const refreshBtn = container.querySelector('#btn-devices-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg, i');
      if (icon) icon.classList.add('spin-loading');
      refreshBtn.disabled = true;
      try {
        await loadDevices();
        showToast('Đã làm mới danh mục thiết bị', 'info', '', 2000);
      } finally {
        setTimeout(() => {
          if (icon) icon.classList.remove('spin-loading');
          refreshBtn.disabled = false;
        }, 300);
      }
    });
  }

  // Gắn sự kiện đóng panel toàn cục đúng 1 lần
  if (!globalPanelListenersBound) {
    globalPanelListenersBound = true;
    const backdrop = document.getElementById('side-panel-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeDevicePanel);
    }

    document.addEventListener('keydown', (e) => {
      // Nếu modal đang mở phía trên panel thì Escape chỉ đóng modal
      const modalOpen = document.getElementById('modal-backdrop')?.classList.contains('active');
      if (e.key === 'Escape' && activeDeviceId && !modalOpen) {
        closeDevicePanel();
      }
    });
  }

  await loadDevices();
}

/**
 * Hook tự động làm mới khi tua thời gian
 */
export async function onTimeAdvanced() {
  if (currentContainer && document.body.contains(currentContainer)) {
    loadDevices();
    if (activeDeviceId) {
      openDevicePanel(activeDeviceId);
    }
  }
}
