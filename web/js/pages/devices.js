/**
 * devices.js - Màn hình 2: Danh mục Thiết bị (Devices)
 * Kết nối API thật: GET /api/devices, GET /api/devices/{id}, POST / PUT / DELETE...
 * Tích hợp Bảng tìm kiếm/lọc, thanh tỷ lệ 4 màu có tooltip, Panel trượt chi tiết,
 * Top 3 gợi ý mượn kèm, hàng đợi hiện tại và các modal quản lý.
 */

import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';

let currentContainer = null;
let currentQuery = '';
let currentStatus = '';
let searchTimeout = null;
let activeDeviceId = null;

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}

/**
 * Hiển thị khung chờ Skeleton của bảng thiết bị
 */
function renderSkeletonTable() {
  const tbody = document.getElementById('devices-table-body');
  if (!tbody) return;

  tbody.innerHTML = Array(6).fill(0).map(() => `
    <tr>
      <td><div class="skeleton" style="width: 50px; height: 16px;"></div></td>
      <td><div class="skeleton" style="width: 180px; height: 16px;"></div></td>
      <td><div class="skeleton" style="width: 80px; height: 20px; border-radius: 4px;"></div></td>
      <td><div class="skeleton" style="width: 140px; height: 12px; border-radius: 6px;"></div></td>
      <td><div class="skeleton" style="width: 30px; height: 16px;"></div></td>
      <td><div class="skeleton" style="width: 30px; height: 16px;"></div></td>
      <td><div class="skeleton" style="width: 60px; height: 28px; border-radius: 6px;"></div></td>
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
          <i data-lucide="alert-octagon" class="error-state-icon"></i>
          <div class="error-state-title">Lỗi tải danh sách thiết bị</div>
          <div class="error-state-desc">${escapeHtml(errorMsg)}</div>
          <button id="btn-devices-retry" class="btn btn-primary btn-sm">
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
            <i data-lucide="search-x" class="empty-state-icon"></i>
            <div class="empty-state-title">Không tìm thấy thiết bị nào</div>
            <div class="empty-state-desc">Thử tìm kiếm với từ khóa khác hoặc điều chỉnh bộ lọc trạng thái.</div>
          </div>
        </td>
      </tr>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  tbody.innerHTML = devices.map(d => {
    const total = d.total || 1;
    const pAvail = Math.round((d.available / total) * 100);
    const pBorrow = Math.round((d.borrowed / total) * 100);
    const pHold = Math.round((d.onHold / total) * 100);
    const pMaint = Math.round((d.maintenance / total) * 100);

    const tooltip = `Kho: Sẵn sàng: ${d.available} | Đang mượn: ${d.borrowed} | Đang giữ 24h: ${d.onHold} | Bảo trì: ${d.maintenance} (Tổng: ${total})`;

    let badgeClass = 'badge-available';
    let badgeText = 'Sẵn sàng';
    if (d.status === 'borrowed') {
      badgeClass = 'badge-borrowed';
      badgeText = 'Đang mượn';
    } else if (d.status === 'maintenance') {
      badgeClass = 'badge-maintenance';
      badgeText = 'Bảo trì';
    }

    const queueHtml = d.queueLength > 0
      ? `<span class="badge badge-onhold tabular-nums font-semibold">${d.queueLength} chờ</span>`
      : `<span style="color: var(--color-text-muted);">0</span>`;

    return `
      <tr class="clickable-row" data-device-id="${escapeHtml(d.id)}">
        <td><code class="mono" style="font-weight: 600; color: var(--color-primary);">${escapeHtml(d.id)}</code></td>
        <td>
          <div class="device-name-clamp" title="${escapeHtml(d.name)}" style="font-weight: 600; color: var(--color-text-primary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.35; max-width: 340px; cursor: pointer;">
            ${escapeHtml(d.name)}
          </div>
        </td>
        <td>
          <span class="badge ${badgeClass}">
            <span class="badge-dot"></span>
            <span>${badgeText}</span>
          </span>
        </td>
        <td style="min-width: 260px;">
          <!-- Thanh tỷ lệ kho 4 màu có tooltip trực quan -->
          <div class="progress-bar-multi" title="${tooltip}">
            <div class="progress-segment segment-available" style="width: ${pAvail}%;"></div>
            <div class="progress-segment segment-borrowed" style="width: ${pBorrow}%;"></div>
            <div class="progress-segment segment-onhold" style="width: ${pHold}%;"></div>
            <div class="progress-segment segment-maintenance" style="width: ${pMaint}%;"></div>
          </div>
          <!-- Nhãn hiển thị đầy đủ cả 4 chỉ số: Sẵn / Mượn / Giữ / Bảo trì -->
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; margin-top: 5px; flex-wrap: nowrap; gap: 4px;" class="tabular-nums">
            <span style="color: var(--status-available-bar); font-weight: 600;" title="Sẵn sàng (${d.available}/${total})">Sẵn: ${d.available}</span>
            <span style="color: var(--color-border);">•</span>
            <span style="color: var(--status-borrowed-bar); font-weight: ${d.borrowed > 0 ? '600' : '400'};" title="Đang mượn">Mượn: ${d.borrowed}</span>
            <span style="color: var(--color-border);">•</span>
            <span style="color: var(--status-onhold-bar); font-weight: ${d.onHold > 0 ? '600' : '400'};" title="Đang giữ 24h cho hàng đợi">Giữ: ${d.onHold}</span>
            <span style="color: var(--color-border);">•</span>
            <span style="color: var(--status-maintenance-bar); font-weight: ${d.maintenance > 0 ? '600' : '400'};" title="Đang bảo trì">Bảo trì: ${d.maintenance}</span>
          </div>
        </td>
        <td style="text-align: center;"><span class="tabular-nums font-semibold">${d.timesBorrowed || 0}</span></td>
        <td style="text-align: center;">${queueHtml}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm btn-open-panel" data-device-id="${escapeHtml(d.id)}" title="Xem chi tiết và thao tác">
            <span>Chi tiết</span>
            <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Bắt sự kiện bấm vào từng dòng để mở Slide-over panel
  tbody.querySelectorAll('.clickable-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const devId = row.dataset.deviceId;
      if (devId) openDevicePanel(devId);
    });
  });

  tbody.querySelectorAll('.btn-open-panel').forEach(btn => {
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

  // Hiển thị trạng thái mở panel + loading
  backdrop.classList.add('active');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  panel.innerHTML = `
    <div class="side-panel-header">
      <div class="side-panel-title">
        <i data-lucide="layers"></i>
        <span>Chi tiết thiết bị: <code class="mono" style="color: var(--color-primary);">${escapeHtml(deviceId)}</code></span>
      </div>
      <button id="btn-close-panel" class="btn-icon" aria-label="Đóng panel">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div class="side-panel-body">
      <div class="skeleton" style="width: 100%; height: 100px; border-radius: var(--radius-lg);"></div>
      <div class="skeleton" style="width: 100%; height: 160px; border-radius: var(--radius-lg);"></div>
      <div class="skeleton" style="width: 100%; height: 120px; border-radius: var(--radius-lg);"></div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();

  panel.querySelector('#btn-close-panel').addEventListener('click', closeDevicePanel);

  try {
    const res = await api.get(`/devices/${deviceId}`);
    renderPanelContent(panel, res);
  } catch (err) {
    panel.innerHTML = `
      <div class="side-panel-header">
        <div class="side-panel-title">Chi tiết thiết bị</div>
        <button id="btn-close-panel" class="btn-icon" aria-label="Đóng">&times;</button>
      </div>
      <div class="side-panel-body">
        <div class="error-state">
          <i data-lucide="alert-octagon" class="error-state-icon"></i>
          <div class="error-state-title">Không thể tải thông tin thiết bị</div>
          <div class="error-state-desc">${escapeHtml(err.message || 'Lỗi kết nối')}</div>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    panel.querySelector('#btn-close-panel').addEventListener('click', closeDevicePanel);
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
  }
  if (backdrop) {
    backdrop.classList.remove('active');
  }
  document.body.style.overflow = '';
  activeDeviceId = null;
}

/**
 * Điền nội dung chi tiết vào Slide-over panel
 */
function renderPanelContent(panel, data) {
  const dev = data.device;
  const queue = data.queue || [];
  const suggestions = data.suggestions || [];
  const total = dev.total || 1;

  const pAvail = Math.round((dev.available / total) * 100);
  const pBorrow = Math.round((dev.borrowed / total) * 100);
  const pHold = Math.round((dev.onHold / total) * 100);
  const pMaint = Math.round((dev.maintenance / total) * 100);
  const tooltip = `Kho: Sẵn sàng: ${dev.available} | Đang mượn: ${dev.borrowed} | Đang giữ: ${dev.onHold} | Bảo trì: ${dev.maintenance} (Tổng: ${total})`;

  let statusBadge = `<span class="badge badge-available"><span class="badge-dot"></span> Sẵn sàng</span>`;
  if (dev.status === 'borrowed') statusBadge = `<span class="badge badge-borrowed"><span class="badge-dot"></span> Đang mượn</span>`;
  if (dev.status === 'maintenance') statusBadge = `<span class="badge badge-maintenance"><span class="badge-dot"></span> Bảo trì</span>`;

  panel.innerHTML = `
    <div class="side-panel-header">
      <div class="side-panel-title">
        <i data-lucide="cpu"></i>
        <span>${escapeHtml(dev.name)}</span>
      </div>
      <button id="btn-close-panel" class="btn-icon" aria-label="Đóng panel">
        <i data-lucide="x"></i>
      </button>
    </div>

    <div class="side-panel-body">
      <!-- 1. Tóm tắt tình trạng kho -->
      <div class="side-panel-section">
        <div class="side-panel-section-title">
          <i data-lucide="box"></i> Tình trạng kho (${escapeHtml(dev.id)})
        </div>
        <div style="background-color: var(--color-bg-muted); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; color: var(--color-text-secondary);">Trạng thái hệ thống:</span>
            ${statusBadge}
          </div>

          <!-- Thanh tỷ lệ 4 màu -->
          <div>
            <div class="progress-bar-multi" title="${tooltip}" style="height: 10px;">
              <div class="progress-segment segment-available" style="width: ${pAvail}%;"></div>
              <div class="progress-segment segment-borrowed" style="width: ${pBorrow}%;"></div>
              <div class="progress-segment segment-onhold" style="width: ${pHold}%;"></div>
              <div class="progress-segment segment-maintenance" style="width: ${pMaint}%;"></div>
            </div>
          </div>

          <!-- Thống kê chi tiết từng loại đơn vị -->
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12.5px;">
            <div>Sẵn sàng: <strong class="tabular-nums" style="color: var(--status-available-bar);">${dev.available}</strong> món</div>
            <div>Đang mượn: <strong class="tabular-nums" style="color: var(--status-borrowed-bar);">${dev.borrowed}</strong> món</div>
            <div>Đang giữ 24h: <strong class="tabular-nums" style="color: var(--status-onhold-bar);">${dev.onHold}</strong> món</div>
            <div>Bảo trì: <strong class="tabular-nums" style="color: var(--status-maintenance-bar);">${dev.maintenance}</strong> món</div>
            <div style="grid-column: span 2; border-top: 1px solid var(--color-border); padding-top: 6px; font-weight: 600;">
              Tổng cộng: <span class="tabular-nums">${total}</span> đơn vị kho (Đã mượn: ${dev.timesBorrowed || 0} lượt)
            </div>
          </div>

          <!-- Nút thao tác quản lý kho -->
          <div class="side-panel-actions">
            <button id="btn-panel-edit" class="btn btn-secondary btn-sm">
              <i data-lucide="edit-3"></i> Sửa
            </button>
            <button id="btn-panel-maintenance" class="btn btn-secondary btn-sm" ${dev.available === 0 ? 'disabled' : ''} title="${dev.available === 0 ? 'Hết hàng sẵn sàng để bảo trì' : 'Chuyển đơn vị sang bảo trì'}">
              <i data-lucide="wrench"></i> Chuyển bảo trì
            </button>
            <button id="btn-panel-finish-maintenance" class="btn btn-secondary btn-sm" ${dev.maintenance === 0 ? 'disabled' : ''} title="${dev.maintenance === 0 ? 'Không có món đang bảo trì' : 'Hoàn tất bảo trì'}">
              <i data-lucide="check-circle-2"></i> Trả bảo trì
            </button>
            <button id="btn-panel-delete" class="btn btn-outline btn-sm" style="color: var(--color-danger); border-color: var(--color-danger-border);">
              <i data-lucide="trash-2"></i> Xoá
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Top 3 gợi ý mượn kèm (Companion Suggestions) -->
      <div class="side-panel-section">
        <div class="side-panel-section-title">
          <i data-lucide="sparkles"></i> Top 3 thường được mượn kèm
        </div>
        ${suggestions.length === 0 ? `
          <div style="font-size: 12.5px; color: var(--color-text-muted); padding: 12px; background-color: var(--color-bg-muted); border-radius: var(--radius-md); text-align: center;">
            Chưa có ghi nhận thiết bị nào thường mượn kèm với ${escapeHtml(dev.name)}.
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${suggestions.map(s => `
              <div class="companion-card">
                <div class="companion-info">
                  <div class="companion-name">${escapeHtml(s.name)} <code class="mono" style="font-size: 11px;">${escapeHtml(s.id)}</code></div>
                  <div class="companion-weight">
                    Mượn kèm: <strong class="tabular-nums">${s.weight}</strong> lần • 
                    ${s.outOfStock ? '<span style="color: var(--color-danger); font-weight: 600;">Hết hàng</span>' : `<span style="color: var(--color-success); font-weight: 500;">Còn ${s.available} sẵn sàng</span>`}
                  </div>
                </div>
                <button class="btn btn-outline btn-sm btn-view-companion" data-id="${escapeHtml(s.id)}" title="Xem chi tiết thiết bị này">
                  Xem
                </button>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- 3. Hàng đợi đặt trước hiện tại (Reservation Queue) -->
      <div class="side-panel-section">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div class="side-panel-section-title">
            <i data-lucide="clock"></i> Hàng đợi đặt trước (${queue.length} người)
          </div>
          ${dev.available === 0 ? `
            <button id="btn-panel-register-queue" class="btn btn-primary btn-sm" style="font-size: 11.5px; padding: 3px 8px;">
              + Đăng ký
            </button>
          ` : `
            <span style="font-size: 11px; color: var(--color-text-muted);" title="Thiết bị còn hàng, phải mượn trực tiếp">+ Đăng ký (chỉ khi hết hàng)</span>
          `}
        </div>

        ${queue.length === 0 ? `
          <div style="font-size: 12.5px; color: var(--color-text-muted); padding: 14px; background-color: var(--color-bg-muted); border-radius: var(--radius-md); text-align: center;">
            Hàng đợi đang trống. Không có sinh viên nào đang chờ thiết bị này.
          </div>
        ` : `
          <div class="queue-mini-list">
            ${queue.map(q => {
              const isHold = q.holding === true;
              return `
                <div class="queue-mini-item ${isHold ? 'is-holding' : ''}">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="queue-pos-badge tabular-nums">${q.position}</div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div style="font-size: 13px; font-weight: 600; color: var(--color-text-primary);">
                        ${escapeHtml(q.studentName)} <span class="mono" style="font-size: 11px; font-weight: 400; color: var(--color-text-secondary);">(${escapeHtml(q.studentId)})</span>
                      </div>
                      <div style="font-size: 11px; color: var(--color-text-muted);">
                        Đăng ký: ${escapeHtml(q.enqueueText || '')}
                        ${q.missCount > 0 ? `• <span style="color: var(--color-warning); font-weight: 600;">Lỡ hẹn: ${q.missCount}/2</span>` : ''}
                      </div>
                      ${isHold ? `
                        <div style="margin-top: 4px;">
                          <span class="expiring-badge" style="font-size: 11px; padding: 2px 6px;">
                            <i data-lucide="timer" style="width: 12px; height: 12px;"></i>
                            Đang giữ: Còn ${q.hoursLeft} giờ (Hạn: ${escapeHtml(q.holdUntilText || '')})
                          </span>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                    ${isHold ? `
                      <button class="btn btn-primary btn-sm btn-claim-queue" data-dev="${escapeHtml(dev.id)}" data-stuid="${escapeHtml(q.studentId)}" data-stuname="${escapeHtml(q.studentName)}" style="font-size: 11px; padding: 3px 8px;">
                        Nhận máy
                      </button>
                    ` : ''}
                    <button class="btn btn-outline btn-sm btn-cancel-queue" data-dev="${escapeHtml(dev.id)}" data-stuid="${escapeHtml(q.studentId)}" style="font-size: 10.5px; padding: 2px 6px; color: var(--color-text-muted);">
                      Huỷ
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Đóng panel
  panel.querySelector('#btn-close-panel').addEventListener('click', closeDevicePanel);

  // Xem chi tiết companion
  panel.querySelectorAll('.btn-view-companion').forEach(btn => {
    btn.addEventListener('click', () => {
      openDevicePanel(btn.dataset.id);
    });
  });

  // Nút Sửa thiết bị
  const editBtn = panel.querySelector('#btn-panel-edit');
  if (editBtn) editBtn.addEventListener('click', () => openEditDeviceModal(dev));

  // Nút Chuyển bảo trì
  const maintBtn = panel.querySelector('#btn-panel-maintenance');
  if (maintBtn && dev.available > 0) {
    maintBtn.addEventListener('click', () => openSendMaintenanceModal(dev));
  }

  // Nút Trả bảo trì
  const finishMaintBtn = panel.querySelector('#btn-panel-finish-maintenance');
  if (finishMaintBtn && dev.maintenance > 0) {
    finishMaintBtn.addEventListener('click', () => openFinishMaintenanceModal(dev));
  }

  // Nút Xoá thiết bị
  const deleteBtn = panel.querySelector('#btn-panel-delete');
  if (deleteBtn) deleteBtn.addEventListener('click', () => confirmDeleteDevice(dev));

  // Nút Đăng ký hàng đợi từ panel
  const registerQueueBtn = panel.querySelector('#btn-panel-register-queue');
  if (registerQueueBtn) {
    registerQueueBtn.addEventListener('click', () => openRegisterQueueModal(dev.id, dev.name));
  }

  // Nút Nhận thiết bị trong queue
  panel.querySelectorAll('.btn-claim-queue').forEach(btn => {
    btn.addEventListener('click', () => {
      openClaimModal(btn.dataset.dev, btn.dataset.stuid, btn.dataset.stuname);
    });
  });

  // Nút Huỷ đăng ký queue
  panel.querySelectorAll('.btn-cancel-queue').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm(`Bạn có chắc muốn huỷ đăng ký của sinh viên ${btn.dataset.stuid}?`)) {
        try {
          await api.delete(`/reservations/${btn.dataset.dev}/${btn.dataset.stuid}`);
          showToast('Đã huỷ đăng ký hàng đợi thành công', 'success');
          // Nạp lại panel và danh sách
          openDevicePanel(btn.dataset.dev);
          loadDevices();
        } catch (err) {
          showToast(err.message || 'Lỗi khi huỷ đăng ký', 'error');
        }
      }
    });
  });
}

/* ==========================================================================
   MODAL THAO TÁC (Thêm / Sửa / Bảo trì / Xoá / Hàng đợi)
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
      <div class="form-helper">Không chứa dấu phẩy, thanh đứng (|) hoặc ký tự xuống dòng (Quy tắc M5).</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="add-device-name">Tên thiết bị:</label>
      <input type="text" id="add-device-name" class="form-input" placeholder="VD: Kính thực tế ảo thế hệ 2..." required>
    </div>
    <div class="form-group">
      <label class="form-label" for="add-device-total">Tổng số lượng đơn vị:</label>
      <input type="number" id="add-device-total" class="form-input" min="1" max="999" value="1" required>
    </div>
  `;

  openModal({
    title: 'Thêm thiết bị mới vào phòng Lab',
    content,
    confirmText: 'Lưu thiết bị',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      const idInput = content.querySelector('#add-device-id').value.trim();
      const nameInput = content.querySelector('#add-device-name').value.trim();
      const totalInput = parseInt(content.querySelector('#add-device-total').value, 10);

      if (!idInput || !nameInput || isNaN(totalInput) || totalInput <= 0) {
        showToast('Vui lòng điền đầy đủ mã, tên và số lượng hợp lệ (> 0)', 'warning');
        throw new Error('Invalid input');
      }

      if (idInput.includes(',') || idInput.includes('|') || nameInput.includes(',') || nameInput.includes('|')) {
        showToast('Mã và tên thiết bị không được chứa ký tự "," hoặc "|"', 'warning');
        throw new Error('Invalid character');
      }

      try {
        await api.post('/devices', { id: idInput, name: nameInput, total: totalInput });
        showToast(`Đã thêm thiết bị ${idInput} thành công!`, 'success');
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Lỗi khi thêm thiết bị', 'error', 'Lỗi lưu thiết bị');
        throw err;
      }
    }
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
      <label class="form-label">Mã thiết bị:</label>
      <input type="text" class="form-input mono" value="${escapeHtml(dev.id)}" disabled style="background-color: var(--color-bg-muted); opacity: 0.8;">
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-device-name">Tên thiết bị:</label>
      <input type="text" id="edit-device-name" class="form-input" value="${escapeHtml(dev.name)}" required autofocus>
    </div>
    <div class="form-group">
      <label class="form-label" for="edit-device-total">Tổng số lượng đơn vị:</label>
      <input type="number" id="edit-device-total" class="form-input" min="${minAllowed}" value="${dev.total}" required>
      <div class="form-helper">
        Tối thiểu là <strong>${minAllowed}</strong> đơn vị (do đang có: ${dev.borrowed} mượn, ${dev.onHold} giữ, ${dev.maintenance} bảo trì — Quy tắc M3).
      </div>
    </div>
  `;

  openModal({
    title: `Chỉnh sửa thiết bị: ${dev.id}`,
    content,
    confirmText: 'Cập nhật',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      const nameInput = content.querySelector('#edit-device-name').value.trim();
      const totalInput = parseInt(content.querySelector('#edit-device-total').value, 10);

      if (!nameInput || isNaN(totalInput) || totalInput < minAllowed) {
        showToast(`Tổng số lượng không được nhỏ hơn ${minAllowed}`, 'warning');
        throw new Error('Invalid input');
      }

      try {
        await api.put(`/devices/${dev.id}`, { name: nameInput, total: totalInput });
        showToast(`Cập nhật thông tin ${dev.id} thành công!`, 'success');
        openDevicePanel(dev.id);
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Lỗi khi cập nhật thiết bị', 'error');
        throw err;
      }
    }
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
      <div style="font-weight: 600;">${escapeHtml(dev.name)} (<code class="mono">${dev.id}</code>)</div>
      <div class="form-helper">Hiện có <strong>${maxAvailable}</strong> đơn vị đang sẵn sàng.</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="maint-qty">Số lượng đơn vị cần bảo trì (1 – ${maxAvailable}):</label>
      <input type="number" id="maint-qty" class="form-input" min="1" max="${maxAvailable}" value="1" required autofocus>
    </div>
  `;

  openModal({
    title: `Chuyển sang bảo trì: ${dev.id}`,
    content,
    confirmText: 'Chuyển bảo trì',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      const qtyInput = parseInt(content.querySelector('#maint-qty').value, 10);
      if (isNaN(qtyInput) || qtyInput < 1 || qtyInput > maxAvailable) {
        showToast(`Số lượng phải từ 1 đến ${maxAvailable}`, 'warning');
        throw new Error('Invalid qty');
      }

      try {
        await api.post(`/devices/${dev.id}/maintenance`, { qty: qtyInput });
        showToast(`Đã chuyển ${qtyInput} đơn vị ${dev.id} sang bảo trì`, 'success');
        openDevicePanel(dev.id);
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Lỗi chuyển bảo trì', 'error');
        throw err;
      }
    }
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
      <div style="font-weight: 600;">${escapeHtml(dev.name)} (<code class="mono">${dev.id}</code>)</div>
      <div class="form-helper">Hiện có <strong>${maxMaint}</strong> đơn vị đang bảo trì.</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="finish-maint-qty">Số lượng đơn vị hoàn tất bảo trì (1 – ${maxMaint}):</label>
      <input type="number" id="finish-maint-qty" class="form-input" min="1" max="${maxMaint}" value="${maxMaint}" required autofocus>
      <div class="form-helper">Đơn vị sau khi sửa xong sẽ trở lại sẵn sàng hoặc phục vụ người chờ hàng đợi.</div>
    </div>
  `;

  openModal({
    title: `Hoàn tất bảo trì: ${dev.id}`,
    content,
    confirmText: 'Xác nhận hoàn tất',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      const qtyInput = parseInt(content.querySelector('#finish-maint-qty').value, 10);
      if (isNaN(qtyInput) || qtyInput < 1 || qtyInput > maxMaint) {
        showToast(`Số lượng phải từ 1 đến ${maxMaint}`, 'warning');
        throw new Error('Invalid qty');
      }

      try {
        await api.post(`/devices/${dev.id}/maintenance/finish`, { qty: qtyInput });
        showToast(`Đã phục hồi ${qtyInput} đơn vị ${dev.id} về kho`, 'success');

        // Kiểm tra thông báo sự kiện nếu có người trong queue nhận hàng
        const notiRes = await api.get('/notifications');
        if (notiRes && Array.isArray(notiRes.notifications)) {
          notiRes.notifications.forEach(n => {
            showToast(n.message, 'success', 'Hàng đợi được phục vụ', 5000);
          });
        }

        openDevicePanel(dev.id);
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Lỗi hoàn tất bảo trì', 'error');
        throw err;
      }
    }
  });
}

/**
 * 5. Modal Xoá thiết bị (DELETE /api/devices/{id})
 */
function confirmDeleteDevice(dev) {
  const content = document.createElement('div');
  content.innerHTML = `
    <p>Bạn có chắc chắn muốn xoá thiết bị <strong>${escapeHtml(dev.name)} (${dev.id})</strong>?</p>
    <div class="form-helper" style="margin-top: 10px; color: var(--color-danger);">
      ⚠️ Chỉ xoá được khi không còn phiếu mượn đang mở và không còn người trong hàng đợi (Quy tắc M4). Đỉnh và các cạnh liên quan trong đồ thị sẽ bị xoá vĩnh viễn.
    </div>
  `;

  openModal({
    title: `Xác nhận xoá thiết bị: ${dev.id}`,
    content,
    confirmText: 'Xoá vĩnh viễn',
    cancelText: 'Giữ lại',
    onConfirm: async () => {
      try {
        await api.delete(`/devices/${dev.id}`);
        showToast(`Đã xoá thiết bị ${dev.id} thành công`, 'success');
        closeDevicePanel();
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Không thể xoá thiết bị này', 'error', 'Từ chối xoá thiết bị');
        throw err;
      }
    }
  });
}

/**
 * 6. Modal Đăng ký hàng đợi từ panel (POST /api/reservations/{deviceId})
 */
function openRegisterQueueModal(deviceId, deviceName) {
  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Thiết bị đăng ký:</label>
      <div style="font-weight: 600;">${escapeHtml(deviceName)} (<code class="mono">${deviceId}</code>)</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="queue-student-id">Mã số sinh viên (MSSV):</label>
      <input type="text" id="queue-student-id" class="form-input mono" placeholder="VD: 25120199" required autofocus>
    </div>
    <div class="form-group">
      <label class="form-label" for="queue-student-name">Họ và tên sinh viên:</label>
      <input type="text" id="queue-student-name" class="form-input" placeholder="VD: Trần Văn An" required>
    </div>
  `;

  openModal({
    title: 'Đăng ký vào Hàng đợi đặt trước',
    content,
    confirmText: 'Đăng ký chờ',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      const stId = content.querySelector('#queue-student-id').value.trim();
      const stName = content.querySelector('#queue-student-name').value.trim();

      if (!stId || !stName) {
        showToast('Vui lòng nhập đầy đủ MSSV và Họ tên', 'warning');
        throw new Error('Missing input');
      }

      try {
        const res = await api.post(`/reservations/${deviceId}`, { studentId: stId, studentName: stName });
        showToast(`Đăng ký thành công! Bạn đứng vị trí số ${res.position} trong hàng đợi.`, 'success');
        openDevicePanel(deviceId);
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Lỗi đăng ký hàng đợi', 'error');
        throw err;
      }
    }
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
      <div style="font-weight: 600;">${escapeHtml(studentName)} (<code class="mono">${studentId}</code>)</div>
      <div class="form-helper">Thiết bị: <code class="mono">${deviceId}</code></div>
    </div>
    <div class="form-group">
      <label class="form-label" for="claim-days">Số ngày mượn (1 – 30 ngày):</label>
      <input type="number" id="claim-days" class="form-input" min="1" max="30" value="7" required autofocus>
      <div class="form-helper">Mặc định: 7 ngày (Quy tắc M13). Hệ thống sẽ tạo phiếu mượn 1 thiết bị.</div>
    </div>
  `;

  openModal({
    title: 'Nhận thiết bị từ Hàng đợi',
    content,
    confirmText: 'Xác nhận tạo phiếu mượn',
    cancelText: 'Huỷ',
    onConfirm: async () => {
      const days = parseInt(content.querySelector('#claim-days').value, 10);
      if (isNaN(days) || days < 1 || days > 30) {
        showToast('Số ngày mượn phải từ 1 đến 30 ngày', 'warning');
        throw new Error('Invalid days');
      }

      try {
        await api.post(`/reservations/${deviceId}/claim`, { studentId, days });
        showToast('Sinh viên đã nhận thiết bị thành công! Phiếu mượn đã được tạo.', 'success');
        openDevicePanel(deviceId);
        loadDevices();
      } catch (err) {
        showToast(err.message || 'Lỗi nhận thiết bị', 'error');
        throw err;
      }
    }
  });
}

/**
 * Khởi tạo giao diện trang Thiết bị
 */
export async function render(container) {
  currentContainer = container;

  container.innerHTML = `
    <div class="page">
      <!-- Tiêu đề trang & Nút thêm thiết bị -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="layers"></i> Danh mục Thiết bị
          </h1>
          <div class="page-desc">Quản lý toàn bộ danh mục thiết bị, theo dõi tỷ lệ kho 4 màu và xem gợi ý mượn kèm.</div>
        </div>
        <div class="page-actions">
          <button id="btn-add-device" class="btn btn-primary btn-sm">
            <i data-lucide="plus"></i> Thêm thiết bị mới
          </button>
        </div>
      </div>

      <!-- Thanh tìm kiếm và bộ lọc trạng thái -->
      <div class="card" style="padding: 14px 18px;">
        <div class="filter-bar">
          <div class="filter-group">
            <div class="search-input-wrapper">
              <i data-lucide="search" style="width: 16px; height: 16px;"></i>
              <input type="text" id="input-device-search" class="form-input" placeholder="Tìm theo mã hoặc tên thiết bị..." value="${escapeHtml(currentQuery)}">
            </div>

            <select id="select-device-status" class="form-select" style="width: 180px;">
              <option value="" ${currentStatus === '' ? 'selected' : ''}>Tất cả trạng thái</option>
              <option value="available" ${currentStatus === 'available' ? 'selected' : ''}>🟢 Sẵn sàng</option>
              <option value="borrowed" ${currentStatus === 'borrowed' ? 'selected' : ''}>🟡 Đang mượn</option>
              <option value="maintenance" ${currentStatus === 'maintenance' ? 'selected' : ''}>🔴 Bảo trì</option>
            </select>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <span id="devices-count-badge" class="badge badge-available" style="font-size: 12px;">Đang tải...</span>
            <button id="btn-devices-refresh" class="btn btn-secondary btn-sm" title="Tải lại danh sách">
              <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Bảng danh sách thiết bị -->
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 85px;">Mã</th>
              <th style="min-width: 220px; max-width: 340px;">Tên thiết bị</th>
              <th style="width: 125px;">Trạng thái</th>
              <th style="min-width: 260px;">Tỷ lệ kho (Sẵn / Mượn / Giữ / Bảo trì)</th>
              <th style="width: 95px; text-align: center;">Lượt mượn</th>
              <th style="width: 95px; text-align: center;">Hàng đợi</th>
              <th style="width: 95px; text-align: right;">Thao tác</th>
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
    refreshBtn.addEventListener('click', () => {
      loadDevices();
    });
  }

  // Gắn sự kiện click vào backdrop để đóng panel trượt
  const backdrop = document.getElementById('side-panel-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeDevicePanel);
  }

  // Phím Escape để đóng panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeDeviceId) {
      closeDevicePanel();
    }
  });

  // Nạp danh sách lần đầu
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
