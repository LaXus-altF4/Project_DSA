/**
 * borrow.js - Màn hình 3: Lập phiếu mượn thiết bị (Borrow v2)
 * Kết nối API thật:
 * - GET /api/devices (danh sách thiết bị chọn vào giỏ)
 * - GET /api/suggestions?ids={id1,id2}&k=3 (gợi ý theo giỏ hàng suggestForBasket)
 * - POST /api/borrow (tạo phiếu nguyên tử, M6, M7, M9)
 * - POST /api/reservations/{deviceId} (đăng ký hàng đợi cho món hết hàng)
 * Chuẩn Dark-tech Glassmorphism + Bento Grid & Checklist UI/UX:
 * - Cột trái: Danh mục thiết bị chọn mượn; Cột phải: Giỏ -> Gợi ý mượn kèm M17 -> Form SV & Xác nhận
 * - Trạng thái thiết bị = Màu token + Icon Lucide + Chữ tiếng Việt (không emoji)
 * - Label rõ + lỗi form hiện ngay dưới/cạnh ô nhập (.form-error-inline)
 */

import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/modal.js';
import { launchSuccessConfetti } from '../ui/confetti.js';
import { deviceIconHtml, illustrationHtml } from '../ui/device-images.js';

let currentContainer = null;
let allDevices = [];
let basket = []; // Mảng thiết bị trong giỏ [{ id, name, available, total, status }]
let suggestions = [];
let isSuggesting = false;
let unavailableIds = []; // Mảng ID thiết bị hết hàng khi tạo phiếu thất bại
let deviceQuery = '';
let deviceFilter = 'all'; // 'all' | 'available' | 'out_of_stock'
let searchDebounce = null;

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
 * Helper hiển thị / xoá lỗi trực tiếp cạnh ô nhập liệu
 */
function clearFieldErrors(root) {
  if (!root) return;
  root.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
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
    if (shouldFocus) input.focus();
  }
  if (errEl) {
    errEl.textContent = message;
  }
}

function bindClearErrorsOnInput(root, pairs) {
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
 * Hiển thị trạng thái kho inline = Màu token + Icon Lucide + Chữ (M1)
 */
function buildStockStatusHtml(device) {
  const total = Number(device.total) || 0;
  const available = Number(device.available) || 0;
  const maintenance = Number(device.maintenance) || 0;

  if (device.status === 'maintenance') {
    return `
      <span class="borrow-stock-inline is-maintenance">
        <i data-lucide="wrench"></i>
        <span>Bảo trì (<span class="tabular-nums">${maintenance}/${total}</span>)</span>
      </span>
    `;
  }
  if (available === 0) {
    return `
      <span class="borrow-stock-inline is-out">
        <i data-lucide="x-circle"></i>
        <span>Hết hàng (Tổng: <span class="tabular-nums">${total}</span>)</span>
      </span>
    `;
  }
  return `
    <span class="borrow-stock-inline is-available">
      <i data-lucide="check-circle-2"></i>
      <span>Sẵn sàng (<strong class="tabular-nums">${available}</strong>/<span class="tabular-nums">${total}</span>)</span>
    </span>
  `;
}

/**
 * Lấy mã thiết bị cần thêm vào giỏ từ tham số URL (VD: #/borrow?id=ARD01)
 */
function getAddDeviceIdFromHash() {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex !== -1) {
    const params = new URLSearchParams(hash.substring(queryIndex + 1));
    return params.get('id') || params.get('add');
  }
  return null;
}

/**
 * Tải danh sách tất cả thiết bị từ API thật
 */
async function loadAllDevices() {
  try {
    const res = await api.get('/devices');
    allDevices = res.devices || [];

    // Đồng bộ lại thông tin kho mới nhất cho các món đang nằm trong giỏ (khi đổi màn hoặc tua giờ)
    if (basket.length > 0) {
      const byId = new Map(allDevices.map((d) => [d.id, d]));
      basket = basket.map((item) => byId.get(item.id)).filter(Boolean);
      unavailableIds = unavailableIds.filter((id) => {
        const dev = byId.get(id);
        return !dev || dev.available === 0;
      });
    }

    renderBasket();
    renderDeviceList();
  } catch (err) {
    console.error('Lỗi tải danh mục thiết bị:', err);
    const container = document.getElementById('device-select-container');
    const countBadge = document.getElementById('borrow-catalog-count');
    if (countBadge) countBadge.textContent = '0 mã';
    if (container) {
      container.innerHTML = `
        <div class="error-state">
          ${illustrationHtml('connection-error')}
          <div class="error-state-title">Không thể nạp danh sách thiết bị</div>
          <div class="error-state-desc">${escapeHtml(err.message || 'Lỗi kết nối')}</div>
          <button id="btn-retry-devices" type="button" class="btn btn-primary btn-sm">
            <i data-lucide="rotate-cw"></i>
            <span>Thử lại</span>
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      const retryBtn = container.querySelector('#btn-retry-devices');
      if (retryBtn) retryBtn.addEventListener('click', loadAllDevices);
    }
  }
}

/**
 * Gọi API gợi ý mượn kèm theo toàn bộ giỏ hiện tại (suggestForBasket)
 */
async function fetchBasketSuggestions() {
  if (basket.length === 0) {
    suggestions = [];
    isSuggesting = false;
    renderSuggestions();
    return;
  }

  isSuggesting = true;
  renderSuggestions();

  try {
    const ids = basket.map((d) => d.id).join(',');
    const res = await api.get(`/suggestions?ids=${encodeURIComponent(ids)}&k=3`);

    // Loại trừ các món đã có trong giỏ (phòng ngừa)
    const basketIdSet = new Set(basket.map((d) => d.id));
    suggestions = (res.suggestions || []).filter((s) => !basketIdSet.has(s.id));
  } catch (err) {
    console.warn('Lỗi gọi API suggestForBasket:', err);
    suggestions = [];
  } finally {
    isSuggesting = false;
    renderSuggestions();
  }
}

/**
 * Thêm thiết bị vào giỏ (M7: mỗi mã tối đa 1 đơn vị trong 1 phiếu)
 */
function addToBasket(device) {
  if (basket.some((d) => d.id === device.id)) {
    showToast(`Thiết bị ${device.id} đã có trong giỏ (mỗi thiết bị tối đa 1 món trong 1 phiếu).`, 'warning');
    return;
  }

  basket.push(device);
  unavailableIds = unavailableIds.filter((id) => id !== device.id);

  renderBasket();
  renderDeviceList();
  fetchBasketSuggestions();
}

/**
 * Xóa thiết bị khỏi giỏ
 */
function removeFromBasket(deviceId) {
  basket = basket.filter((d) => d.id !== deviceId);
  unavailableIds = unavailableIds.filter((id) => id !== deviceId);

  renderBasket();
  renderDeviceList();
  fetchBasketSuggestions();
}

/**
 * Hiển thị giỏ thiết bị đã chọn
 */
function renderBasket() {
  const container = document.getElementById('basket-container');
  const countBadge = document.getElementById('basket-count-badge');
  const warningContainer = document.getElementById('basket-warning-container');
  const btnCheckout = document.getElementById('btn-borrow-checkout');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${basket.length} món`;
  }

  // Kiểm tra xem trong giỏ có món nào hết hàng không (available === 0)
  const hasOutOfStock = basket.some((d) => d.available === 0 || unavailableIds.includes(d.id));

  if (warningContainer) {
    if (hasOutOfStock) {
      warningContainer.innerHTML = `
        <div class="borrow-atomic-warning" role="alert">
          <i data-lucide="alert-triangle"></i>
          <div>
            <strong>Cảnh báo hết hàng (Quy tắc M6):</strong> Giỏ hàng đang chứa thiết bị không còn sẵn sàng. Phiếu mượn là nguyên tử — nếu còn món hết hàng thì <strong>toàn bộ phiếu sẽ thất bại</strong>. Hãy xóa món hết hàng hoặc đăng ký hàng đợi.
          </div>
        </div>
      `;
    } else {
      warningContainer.innerHTML = '';
    }
  }

  if (btnCheckout) {
    btnCheckout.disabled = basket.length === 0;
  }

  if (basket.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${illustrationHtml('empty-basket')}
        <div class="empty-state-title">Giỏ mượn đang trống</div>
        <div class="empty-state-desc">Chọn thiết bị từ danh mục phòng Lab hoặc từ khu vực gợi ý mượn kèm để thêm vào phiếu (tối đa 1 đơn vị mỗi mã).</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="basket-list">
      ${basket.map((d) => {
        const isUnavailable = d.available === 0 || unavailableIds.includes(d.id);
        return `
          <div class="basket-item ${isUnavailable ? 'is-unavailable' : 'bento-subcard'}">
            <div class="borrow-item-main">
              <div class="borrow-item-thumb ${isUnavailable ? 'is-danger' : ''}" aria-hidden="true">${deviceIconHtml(d.id, { size: 36 })}</div>
              <div class="borrow-item-info">
                <div class="borrow-item-title-row">
                  <span class="borrow-item-name">${escapeHtml(d.name)}</span>
                  <code class="device-code-chip">${escapeHtml(d.id)}</code>
                </div>
                <div class="borrow-item-meta-row">
                  ${isUnavailable
                    ? `
                      <span class="borrow-stock-inline is-out">
                        <i data-lucide="alert-triangle"></i>
                        <span>Hết hàng (Không thể mượn trực tiếp)</span>
                      </span>
                    `
                    : `
                      <span class="borrow-stock-inline is-available">
                        <i data-lucide="check-circle-2"></i>
                        <span>Sẵn sàng (Kho còn <strong class="tabular-nums">${d.available}</strong>)</span>
                      </span>
                    `}
                </div>
              </div>
            </div>
            <div class="borrow-item-actions">
              ${isUnavailable ? `
                <button
                  type="button"
                  class="btn btn-outline btn-sm btn-basket-queue"
                  data-id="${escapeHtml(d.id)}"
                  data-name="${escapeHtml(d.name)}"
                  title="Đăng ký vào hàng đợi đặt trước"
                >
                  <i data-lucide="clock" class="btn-action-icon-sm"></i>
                  <span>Đăng ký chờ</span>
                </button>
              ` : ''}
              <button
                type="button"
                class="btn-icon basket-remove-btn btn-remove-basket"
                data-id="${escapeHtml(d.id)}"
                aria-label="Xóa ${escapeHtml(d.name)} khỏi giỏ mượn"
                title="Xóa khỏi giỏ"
              >
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  container.querySelectorAll('.btn-basket-queue').forEach((btn) => {
    btn.addEventListener('click', () => {
      openRegisterQueueModal(btn.dataset.id, btn.dataset.name);
    });
  });

  container.querySelectorAll('.btn-remove-basket').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeFromBasket(btn.dataset.id);
    });
  });
}

/**
 * Hiển thị khu vực gợi ý mượn kèm (Companion Suggestions theo giỏ — M17)
 */
function renderSuggestions() {
  const container = document.getElementById('suggestions-container');
  if (!container) return;

  if (isSuggesting) {
    container.innerHTML = `
      <div class="borrow-skeleton-stack">
        <div class="skeleton borrow-skeleton-row"></div>
        <div class="skeleton borrow-skeleton-row"></div>
      </div>
    `;
    return;
  }

  if (basket.length === 0) {
    container.innerHTML = `
      <div class="borrow-inline-hint">
        <i data-lucide="sparkles"></i>
        <div>Thêm thiết bị vào giỏ để hệ thống phân tích đồ thị và gợi ý tối đa 3 thiết bị thường được mượn kèm nhiều nhất.</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (suggestions.length === 0) {
    container.innerHTML = `
      <div class="borrow-inline-hint">
        <i data-lucide="git-branch"></i>
        <div>Không tìm thấy thiết bị khả dụng nào thường được mượn kèm với các món trong giỏ hiện tại.</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="suggestion-grid">
      ${suggestions.map((s) => {
        const isOutOfStock = s.outOfStock === true || s.available === 0;
        return `
          <div class="suggestion-card suggestion-popin" data-glow="${isOutOfStock ? 'borrowed' : 'available'}">
            <div class="borrow-item-main">
              <div class="borrow-item-thumb ${isOutOfStock ? 'is-danger' : ''}" aria-hidden="true">${deviceIconHtml(s.id, { size: 36 })}</div>
              <div class="borrow-item-info">
                <div class="borrow-item-title-row">
                  <span class="borrow-item-name">${escapeHtml(s.name)}</span>
                  <code class="device-code-chip">${escapeHtml(s.id)}</code>
                </div>
                <div class="borrow-item-meta-row">
                  <span class="suggestion-badge-weight tabular-nums" title="Tổng trọng số cạnh trên đồ thị với các món trong giỏ">
                    <i data-lucide="link"></i>
                    <span>Cùng giỏ: <strong>${s.weight}</strong> lần</span>
                  </span>
                  ${isOutOfStock
                    ? `
                      <span class="borrow-stock-inline is-out">
                        <i data-lucide="x-circle"></i>
                        <span>Hết hàng</span>
                      </span>
                    `
                    : `
                      <span class="borrow-stock-inline is-available">
                        <i data-lucide="check-circle-2"></i>
                        <span>Còn <strong class="tabular-nums">${s.available}</strong> sẵn sàng</span>
                      </span>
                    `}
                </div>
              </div>
            </div>

            <div class="borrow-item-actions">
              ${isOutOfStock ? `
                <button
                  type="button"
                  class="btn btn-outline btn-sm btn-suggest-queue"
                  data-id="${escapeHtml(s.id)}"
                  data-name="${escapeHtml(s.name)}"
                  title="Đăng ký vào hàng đợi"
                >
                  <i data-lucide="clock" class="btn-action-icon-sm"></i>
                  <span>Đăng ký chờ</span>
                </button>
              ` : `
                <button
                  type="button"
                  class="btn btn-primary btn-sm btn-add-suggest"
                  data-id="${escapeHtml(s.id)}"
                  title="Thêm nhanh vào giỏ mượn"
                >
                  <i data-lucide="plus" class="btn-action-icon-sm"></i>
                  <span>Thêm</span>
                </button>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Nút thêm nhanh gợi ý vào giỏ
  container.querySelectorAll('.btn-add-suggest').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dev = allDevices.find((d) => d.id === btn.dataset.id);
      if (dev) {
        addToBasket(dev);
      }
    });
  });

  // Nút đăng ký hàng đợi từ gợi ý
  container.querySelectorAll('.btn-suggest-queue').forEach((btn) => {
    btn.addEventListener('click', () => {
      openRegisterQueueModal(btn.dataset.id, btn.dataset.name);
    });
  });
}

/**
 * Hiển thị danh sách thiết bị có sẵn để chọn
 */
function renderDeviceList() {
  const container = document.getElementById('device-select-container');
  const countBadge = document.getElementById('borrow-catalog-count');
  if (!container) return;

  const basketIds = new Set(basket.map((d) => d.id));
  const q = deviceQuery.trim().toLowerCase();

  const filtered = allDevices.filter((d) => {
    const matchQ = !q || d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q);
    if (!matchQ) return false;

    if (deviceFilter === 'available') return d.available > 0;
    if (deviceFilter === 'out_of_stock') return d.available === 0;
    return true;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} mã`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${illustrationHtml('no-results')}
        <div class="empty-state-title">Không tìm thấy thiết bị</div>
        <div class="empty-state-desc">Thử tìm kiếm với từ khóa khác hoặc chuyển sang tab lọc "Tất cả".</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="device-select-list">
      ${filtered.map((d) => {
        const inBasket = basketIds.has(d.id);
        const isOutOfStock = d.available === 0;
        const glowStatus = d.status || (isOutOfStock ? 'borrowed' : 'available');

        return `
          <div
            class="device-select-item ${inBasket ? 'in-basket' : ''}"
            data-glow="${escapeHtml(glowStatus)}"
          >
            <div class="borrow-item-main">
              <div class="borrow-device-thumb ${isOutOfStock ? 'is-danger' : ''}" aria-hidden="true">${deviceIconHtml(d.id, { size: 40 })}</div>
              <div class="borrow-item-info">
                <div class="borrow-item-title-row">
                  <span class="borrow-item-name">${escapeHtml(d.name)}</span>
                  <code class="device-code-chip">${escapeHtml(d.id)}</code>
                </div>
                <div class="borrow-item-meta-row">
                  ${buildStockStatusHtml(d)}
                  ${(d.queueLength || 0) > 0
                    ? `
                      <span class="borrow-queue-chip tabular-nums">
                        <i data-lucide="users"></i>
                        <span>${d.queueLength} người chờ</span>
                      </span>
                    `
                    : ''}
                </div>
              </div>
            </div>

            <div class="borrow-item-actions">
              ${inBasket ? `
                <button type="button" class="btn btn-secondary btn-sm" disabled>
                  <i data-lucide="check" class="btn-action-icon-sm"></i>
                  <span>Đã trong giỏ</span>
                </button>
              ` : isOutOfStock ? `
                <button
                  type="button"
                  class="btn btn-outline btn-sm btn-queue-from-list"
                  data-id="${escapeHtml(d.id)}"
                  data-name="${escapeHtml(d.name)}"
                  title="Đăng ký vào hàng đợi đặt trước"
                >
                  <i data-lucide="clock" class="btn-action-icon-sm"></i>
                  <span>Đăng ký chờ</span>
                </button>
              ` : `
                <button
                  type="button"
                  class="btn btn-primary btn-sm btn-add-from-list"
                  data-id="${escapeHtml(d.id)}"
                  title="Thêm ${escapeHtml(d.name)} vào giỏ"
                >
                  <i data-lucide="plus" class="btn-action-icon-sm"></i>
                  <span>Chọn</span>
                </button>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Nút chọn thêm vào giỏ
  container.querySelectorAll('.btn-add-from-list').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dev = allDevices.find((d) => d.id === btn.dataset.id);
      if (dev) addToBasket(dev);
    });
  });

  // Nút đăng ký hàng đợi
  container.querySelectorAll('.btn-queue-from-list').forEach((btn) => {
    btn.addEventListener('click', () => {
      openRegisterQueueModal(btn.dataset.id, btn.dataset.name);
    });
  });
}

/**
 * Modal Đăng ký hàng đợi cho món hết hàng (POST /api/reservations/{deviceId})
 */
function openRegisterQueueModal(deviceId, deviceName) {
  const inputStId = document.getElementById('borrow-student-id')?.value.trim() || '';
  const inputStName = document.getElementById('borrow-student-name')?.value.trim() || '';
  const localDev = allDevices.find((d) => d.id === deviceId);
  const fallbackNextPos = localDev ? (Number(localDev.queueLength || 0) + 1) : null;

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <div class="form-label">Thiết bị đăng ký:</div>
      <div class="borrow-item-title-row">
        <span class="modal-static-val">${escapeHtml(deviceName)}</span>
        <code class="device-code-chip">${escapeHtml(deviceId)}</code>
      </div>
      <div id="borrow-next-queue-pos" class="form-helper modal-highlight-note tabular-nums">
        ${fallbackNextPos ? `Vị trí dự kiến trong hàng đợi: #${fallbackNextPos}` : 'Đang kiểm tra vị trí hàng đợi…'}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="borrow-queue-student-id">Mã số sinh viên (MSSV) <span class="borrow-required-mark">*</span>:</label>
      <input type="text" id="borrow-queue-student-id" class="form-input mono" placeholder="VD: 25120199" value="${escapeHtml(inputStId)}" required autofocus>
      <div id="err-queue-student-id" class="form-error-inline" role="alert"></div>
    </div>
    <div class="form-group">
      <label class="form-label" for="borrow-queue-student-name">Họ và tên sinh viên <span class="borrow-required-mark">*</span>:</label>
      <input type="text" id="borrow-queue-student-name" class="form-input" placeholder="VD: Trần Văn An" value="${escapeHtml(inputStName)}" required>
      <div id="err-queue-student-name" class="form-error-inline" role="alert"></div>
      <div class="form-helper">Không chứa dấu phẩy (,), gạch đứng (|) hoặc xuống dòng (M5).</div>
    </div>
    <div>
      <a href="#/reservations?id=${escapeHtml(deviceId)}" id="borrow-jump-reservation" class="borrow-modal-link">
        <span>Mở toàn màn hình Hàng đợi của thiết bị này</span>
        <i data-lucide="arrow-right"></i>
      </a>
    </div>
  `;

  bindClearErrorsOnInput(content, [
    ['borrow-queue-student-id', 'err-queue-student-id'],
    ['borrow-queue-student-name', 'err-queue-student-name'],
  ]);

  // Lấy chính xác nextQueuePosition từ GET /api/devices/{id}
  api.get(`/devices/${encodeURIComponent(deviceId)}`).then((res) => {
    const posEl = content.querySelector('#borrow-next-queue-pos');
    if (posEl && res) {
      const pos = res.nextQueuePosition || ((res.queue ? res.queue.length : 0) + 1);
      posEl.textContent = `Vị trí dự kiến trong hàng đợi: #${pos}`;
    }
  }).catch(() => {});

  const jumpLink = content.querySelector('#borrow-jump-reservation');
  if (jumpLink) {
    jumpLink.addEventListener('click', () => closeModal());
  }

  openModal({
    title: 'Đăng ký vào Hàng đợi đặt trước',
    content,
    confirmText: 'Đăng ký chờ',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      clearFieldErrors(content);
      const stId = content.querySelector('#borrow-queue-student-id').value.trim();
      const stName = content.querySelector('#borrow-queue-student-name').value.trim();
      let hasError = false;
      let firstFocus = false;

      if (!stId) {
        setFieldError(content, 'borrow-queue-student-id', 'err-queue-student-id', 'Vui lòng nhập MSSV.', !firstFocus);
        firstFocus = true;
        hasError = true;
      } else if (/[,|\n\r]/.test(stId)) {
        setFieldError(content, 'borrow-queue-student-id', 'err-queue-student-id', 'MSSV không được chứa ",", "|" hoặc xuống dòng.', !firstFocus);
        firstFocus = true;
        hasError = true;
      }

      if (!stName) {
        setFieldError(content, 'borrow-queue-student-name', 'err-queue-student-name', 'Vui lòng nhập họ và tên sinh viên.', !firstFocus);
        firstFocus = true;
        hasError = true;
      } else if (/[,|\n\r]/.test(stName)) {
        setFieldError(content, 'borrow-queue-student-name', 'err-queue-student-name', 'Họ tên không được chứa ",", "|" hoặc xuống dòng.', !firstFocus);
        firstFocus = true;
        hasError = true;
      }

      if (hasError) {
        throw new Error('Validation failed');
      }

      try {
        const res = await api.post(`/reservations/${deviceId}`, { studentId: stId, studentName: stName });
        showToast(`Đăng ký hàng đợi thành công! Sinh viên ${stName} đứng vị trí #${res.position}.`, 'success');
        await loadAllDevices();
        if (basket.length > 0) fetchBasketSuggestions();
      } catch (err) {
        setFieldError(content, 'borrow-queue-student-id', 'err-queue-student-id', err.message || 'Lỗi khi đăng ký hàng đợi', true);
        showToast(err.message || 'Lỗi khi đăng ký hàng đợi', 'error');
        throw err;
      }
    },
  });

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Xác nhận và tạo phiếu mượn (POST /api/borrow)
 */
function handleCheckout() {
  if (!currentContainer) return;
  clearFieldErrors(currentContainer);

  const stIdInput = document.getElementById('borrow-student-id');
  const stNameInput = document.getElementById('borrow-student-name');
  const daysInput = document.getElementById('borrow-days');

  const studentId = stIdInput ? stIdInput.value.trim() : '';
  const studentName = stNameInput ? stNameInput.value.trim() : '';
  const daysRaw = daysInput ? daysInput.value.trim() : '';
  const days = Number(daysRaw);

  let hasError = false;
  let focusedFirst = false;

  if (!studentId) {
    setFieldError(currentContainer, 'borrow-student-id', 'err-borrow-student-id', 'Vui lòng nhập mã số sinh viên.', !focusedFirst);
    focusedFirst = true;
    hasError = true;
  } else if (/[,|\n\r]/.test(studentId)) {
    setFieldError(currentContainer, 'borrow-student-id', 'err-borrow-student-id', 'MSSV không được chứa dấu phẩy (,), gạch đứng (|) hoặc xuống dòng.', !focusedFirst);
    focusedFirst = true;
    hasError = true;
  }

  if (!studentName) {
    setFieldError(currentContainer, 'borrow-student-name', 'err-borrow-student-name', 'Vui lòng nhập họ và tên sinh viên.', !focusedFirst);
    focusedFirst = true;
    hasError = true;
  } else if (/[,|\n\r]/.test(studentName)) {
    setFieldError(currentContainer, 'borrow-student-name', 'err-borrow-student-name', 'Họ tên không được chứa dấu phẩy (,), gạch đứng (|) hoặc xuống dòng.', !focusedFirst);
    focusedFirst = true;
    hasError = true;
  }

  if (!daysRaw || !Number.isInteger(days) || days < 1 || days > 30) {
    setFieldError(currentContainer, 'borrow-days', 'err-borrow-days', 'Số ngày mượn hợp lệ từ 1 đến 30 ngày (Quy tắc M9).', !focusedFirst);
    focusedFirst = true;
    hasError = true;
  }

  if (hasError) {
    showToast('Vui lòng kiểm tra lại thông tin người mượn và thời hạn.', 'warning');
    return;
  }

  if (basket.length === 0) {
    showToast('Giỏ mượn chưa có thiết bị nào. Hãy chọn ít nhất 1 thiết bị.', 'warning');
    return;
  }

  // Kiểm tra cảnh báo món hết hàng
  const outOfStockItems = basket.filter((d) => d.available === 0);
  const hasOut = outOfStockItems.length > 0;

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="borrow-modal-stack">
      <div class="borrow-modal-summary">
        <div>Sinh viên: <strong>${escapeHtml(studentName)}</strong> (<code class="device-code-chip">${escapeHtml(studentId)}</code>)</div>
        <div>Thời hạn mượn: <strong class="tabular-nums">${days} ngày</strong> (tính đến đúng giờ theo đồng hồ giả lập)</div>
      </div>

      <div>
        <div class="borrow-modal-section-label">Danh sách thiết bị (<span class="tabular-nums">${basket.length}</span> món):</div>
        <div class="borrow-modal-list">
          ${basket.map((d) => `
            <div class="borrow-modal-item">
              <span class="borrow-modal-item-left">
                <strong>${escapeHtml(d.name)}</strong>
                <code class="device-code-chip">${escapeHtml(d.id)}</code>
              </span>
              <span class="tabular-nums">
                1 đơn vị
                ${d.available === 0 ? '<span class="borrow-modal-item-out">(HẾT HÀNG)</span>' : ''}
              </span>
            </div>
          `).join('')}
        </div>
      </div>

      ${hasOut ? `
        <div class="borrow-atomic-warning" role="alert">
          <i data-lucide="alert-triangle"></i>
          <div>
            <strong>Cảnh báo nguyên tử (M6):</strong> Có ${outOfStockItems.length} món hết hàng (${escapeHtml(outOfStockItems.map((d) => d.id).join(', '))}). Nếu tiếp tục, máy chủ sẽ <strong>từ chối toàn bộ phiếu</strong>!
          </div>
        </div>
      ` : ''}
    </div>
  `;

  openModal({
    title: 'Xác nhận tạo phiếu mượn thiết bị',
    content,
    confirmText: 'Xác nhận mượn',
    cancelText: 'Chỉnh sửa lại',
    onConfirm: async () => {
      try {
        const payload = {
          studentId,
          studentName,
          deviceIds: basket.map((d) => d.id),
          days,
        };

        const res = await api.post('/borrow', payload);
        const rec = res.record;

        launchSuccessConfetti(
          document.querySelector('#modal-backdrop.active #modal-footer .btn-primary') ||
            document.getElementById('btn-borrow-checkout')
        );

        showToast(
          `Tạo phiếu #${rec.recordId} thành công cho SV ${studentName}! Hạn trả: ${rec.dueText}`,
          'success',
          'Phiếu mượn đã tạo',
          7000
        );

        // Làm mới giỏ và tải lại trạng thái kho + gợi ý
        basket = [];
        unavailableIds = [];
        renderBasket();
        fetchBasketSuggestions();
        await loadAllDevices();
      } catch (err) {
        console.error('Lỗi tạo phiếu mượn:', err);

        // Nếu lỗi hết hàng nguyên tử từ API, highlight các món bị hết
        if (err.details && Array.isArray(err.details.unavailableIds)) {
          unavailableIds = err.details.unavailableIds;
          renderBasket();
          showToast(
            `${err.message}. Món không khả dụng: ${unavailableIds.join(', ')}`,
            'error',
            'Tạo phiếu thất bại',
            6000
          );
        } else {
          showToast(err.message || 'Lỗi khi tạo phiếu mượn', 'error', 'Tạo phiếu thất bại');
        }

        throw err;
      }
    },
  });

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Khởi tạo giao diện trang Mượn thiết bị
 */
export async function render(container) {
  currentContainer = container;
  deviceQuery = '';
  deviceFilter = 'all';

  container.innerHTML = `
    <div class="page">
      <!-- Tiêu đề trang -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="file-plus-2"></i> Lập Phiếu Mượn Thiết Bị
          </h1>
          <div class="page-desc">Chọn thiết bị theo quy tắc phiếu nguyên tử (M6, M7), xem gợi ý mượn kèm theo giỏ hàng (M17) và xác nhận lập phiếu.</div>
        </div>
        <div class="page-actions">
          <button id="btn-refresh-borrow-page" type="button" class="btn btn-secondary btn-sm" title="Làm mới danh mục thiết bị từ máy chủ">
            <i data-lucide="refresh-cw"></i>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      <div class="borrow-grid">
        <!-- CỘT TRÁI: Chọn thiết bị phòng Lab -->
        <div class="borrow-column">
          <section class="bento-card bento-table-card stagger-item stagger-delay-1" aria-label="Danh mục chọn thiết bị phòng Lab">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="layers"></i>
                <span>Chọn thiết bị phòng Lab</span>
              </div>
              <span id="borrow-catalog-count" class="badge badge-borrowed tabular-nums">0 mã</span>
            </div>
            <div class="card-body borrow-card-body">
              <div class="borrow-catalog-controls">
                <div class="borrow-search-group">
                  <label class="form-label" for="input-borrow-search">Tìm thiết bị theo mã hoặc tên</label>
                  <div class="borrow-search-wrapper">
                    <i data-lucide="search" class="search-input-icon"></i>
                    <input
                      type="text"
                      id="input-borrow-search"
                      class="form-input"
                      placeholder="Nhập mã (VD: VR01) hoặc tên thiết bị..."
                      autocomplete="off"
                    >
                    <button
                      type="button"
                      id="btn-clear-borrow-search"
                      class="borrow-search-clear"
                      style="display: none;"
                      aria-label="Xóa từ khóa tìm thiết bị"
                      title="Xóa tìm kiếm"
                    >
                      <i data-lucide="x"></i>
                    </button>
                  </div>
                </div>

                <div class="filter-pills" role="group" aria-label="Lọc theo tình trạng sẵn sàng">
                  <button type="button" class="filter-pill active" data-filter="all" aria-pressed="true">
                    <span>Tất cả</span>
                  </button>
                  <button type="button" class="filter-pill" data-filter="available" aria-pressed="false">
                    <i data-lucide="check-circle-2" class="filter-pill-icon is-available"></i>
                    <span>Có sẵn</span>
                  </button>
                  <button type="button" class="filter-pill" data-filter="out_of_stock" aria-pressed="false">
                    <i data-lucide="alert-circle" class="filter-pill-icon is-out"></i>
                    <span>Hết hàng</span>
                  </button>
                </div>
              </div>

              <div id="device-select-container">
                <div class="borrow-skeleton-stack">
                  <div class="skeleton borrow-skeleton-row"></div>
                  <div class="skeleton borrow-skeleton-row"></div>
                  <div class="skeleton borrow-skeleton-row"></div>
                  <div class="skeleton borrow-skeleton-row"></div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- CỘT PHẢI: Giỏ thiết bị -> Gợi ý mượn kèm M17 -> Thông tin SV & Xác nhận -->
        <div class="borrow-column">
          <!-- 1. Giỏ thiết bị đã chọn -->
          <section class="bento-card bento-table-card stagger-item stagger-delay-2" aria-label="Giỏ thiết bị mượn">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="shopping-cart"></i>
                <span>Giỏ thiết bị đã chọn</span>
              </div>
              <span id="basket-count-badge" class="badge badge-available tabular-nums">0 món</span>
            </div>
            <div class="card-body borrow-card-body">
              <div id="basket-container"></div>
              <div id="basket-warning-container"></div>
            </div>
          </section>

          <!-- 2. Gợi ý mượn kèm động (M17: hiện trước bước nhập số ngày / xác nhận) -->
          <section class="bento-card bento-table-card stagger-item stagger-delay-3" aria-label="Gợi ý thiết bị mượn kèm">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="sparkles"></i>
                <span>Thường được mượn kèm</span>
              </div>
              <span class="badge badge-onhold">
                <i data-lucide="git-branch" class="badge-icon"></i>
                <span>Đồ thị M17</span>
              </span>
            </div>
            <div class="card-body borrow-card-body">
              <div class="form-helper">Tự động phân tích đồ thị lịch sử dựa trên toàn bộ thiết bị đang có trong giỏ hàng.</div>
              <div id="suggestions-container"></div>
            </div>
          </section>

          <!-- 3. Form thông tin sinh viên & Xác nhận lập phiếu -->
          <section class="bento-card bento-table-card stagger-item stagger-delay-4" aria-label="Thông tin người mượn và xác nhận">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="user-check"></i>
                <span>Thông tin người mượn & Thời hạn</span>
              </div>
            </div>
            <div class="card-body">
              <div class="borrow-student-fields">
                <div class="form-group">
                  <label class="form-label" for="borrow-student-id">
                    Mã số sinh viên (MSSV) <span class="borrow-required-mark">*</span>
                  </label>
                  <input
                    type="text"
                    id="borrow-student-id"
                    class="form-input mono"
                    placeholder="VD: 25120199"
                    autocomplete="off"
                    required
                  >
                  <div id="err-borrow-student-id" class="form-error-inline" role="alert"></div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="borrow-student-name">
                    Họ và tên sinh viên <span class="borrow-required-mark">*</span>
                  </label>
                  <input
                    type="text"
                    id="borrow-student-name"
                    class="form-input"
                    placeholder="VD: Trần Văn An"
                    autocomplete="off"
                    required
                  >
                  <div id="err-borrow-student-name" class="form-error-inline" role="alert"></div>
                </div>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="borrow-days">
                  Số ngày mượn (1 – 30 ngày) <span class="borrow-required-mark">*</span>
                </label>
                <input
                  type="number"
                  id="borrow-days"
                  class="form-input tabular-nums"
                  min="1"
                  max="30"
                  value="7"
                  required
                >
                <div id="err-borrow-days" class="form-error-inline" role="alert"></div>
                <div class="form-helper">Mặc định: 7 ngày (Quy tắc M9). Hạn trả tính đến đúng giờ sau số ngày mượn.</div>
              </div>

              <div class="borrow-checkout-footer">
                <button type="button" id="btn-borrow-checkout" class="btn btn-primary borrow-checkout-btn" disabled>
                  <i data-lucide="check-circle-2"></i>
                  <span>Xem lại & Xác nhận tạo phiếu</span>
                </button>
                <div class="borrow-rule-caption">
                  <i data-lucide="shield-check"></i>
                  <span>Phiếu nguyên tử (M6): nếu có thiết bị hết hàng, toàn bộ phiếu sẽ không tạo và giữ nguyên đồ thị.</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Xóa lỗi form khi người dùng sửa lại input
  bindClearErrorsOnInput(container, [
    ['borrow-student-id', 'err-borrow-student-id'],
    ['borrow-student-name', 'err-borrow-student-name'],
    ['borrow-days', 'err-borrow-days'],
  ]);

  // Bắt sự kiện tìm kiếm + nút xóa nhanh
  const searchInput = container.querySelector('#input-borrow-search');
  const clearSearchBtn = container.querySelector('#btn-clear-borrow-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      deviceQuery = val;
      if (clearSearchBtn) clearSearchBtn.style.display = val ? 'inline-flex' : 'none';

      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        renderDeviceList();
      }, 180);
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      deviceQuery = '';
      clearSearchBtn.style.display = 'none';
      renderDeviceList();
    });
  }

  // Bắt sự kiện tab lọc
  container.querySelectorAll('.filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-pill').forEach((p) => {
        p.classList.remove('active');
        p.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      deviceFilter = btn.dataset.filter;
      renderDeviceList();
    });
  });

  // Nút làm mới trang
  const btnRefresh = container.querySelector('#btn-refresh-borrow-page');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      const icon = btnRefresh.querySelector('svg, i');
      if (icon) icon.classList.add('spin-loading');
      btnRefresh.disabled = true;
      try {
        await loadAllDevices();
        if (basket.length > 0) await fetchBasketSuggestions();
        showToast('Đã làm mới danh mục thiết bị từ máy chủ', 'info', '', 2000);
      } finally {
        setTimeout(() => {
          if (icon) icon.classList.remove('spin-loading');
          btnRefresh.disabled = false;
        }, 350);
      }
    });
  }

  // Nút tạo phiếu mượn
  const btnCheckout = container.querySelector('#btn-borrow-checkout');
  if (btnCheckout) {
    btnCheckout.addEventListener('click', handleCheckout);
  }

  // Khởi tạo giỏ và tải dữ liệu thiết bị ban đầu
  renderBasket();
  renderSuggestions();
  await loadAllDevices();
  if (basket.length > 0) {
    fetchBasketSuggestions();
  }

  // Tự động thêm thiết bị vào giỏ nếu được truyền từ màn hình khác sang (VD: thông báo M12 của Hàng đợi)
  const autoAddId = getAddDeviceIdFromHash();
  if (autoAddId && allDevices.length > 0) {
    const devToAdd = allDevices.find((d) => d.id === autoAddId);
    if (devToAdd) {
      if (devToAdd.available > 0) {
        addToBasket(devToAdd);
        showToast(`Đã thêm thiết bị "${devToAdd.name}" (${devToAdd.id}) vào giỏ mượn`, 'success');
      } else {
        showToast(`Thiết bị "${devToAdd.name}" (${devToAdd.id}) hiện đã hết hàng trong kho`, 'warning');
      }
    }
    history.replaceState(null, '', '#/borrow');
  }
}

/**
 * Hook tự động làm mới khi tua thời gian
 */
export async function onTimeAdvanced() {
  if (currentContainer && document.body.contains(currentContainer)) {
    await loadAllDevices();
    if (basket.length > 0) {
      await fetchBasketSuggestions();
    }
  }
}
