/**
 * borrow.js - Màn hình 3: Lập phiếu mượn thiết bị (Borrow)
 * Kết nối API thật:
 * - GET /api/devices (danh sách thiết bị chọn vào giỏ)
 * - GET /api/suggestions?ids={id1,id2}&k=3 (gợi ý theo giỏ hàng suggestForBasket)
 * - POST /api/borrow (tạo phiếu nguyên tử, M6, M7, M9)
 * - POST /api/reservations/{deviceId} (đăng ký hàng đợi cho món hết hàng)
 */

import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';

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
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}

/**
 * Tải danh sách tất cả thiết bị từ API thật
 */
async function loadAllDevices() {
  try {
    const res = await api.get('/devices');
    allDevices = res.devices || [];
    renderDeviceList();
  } catch (err) {
    console.error('Lỗi tải danh mục thiết bị:', err);
    const container = document.getElementById('device-select-container');
    if (container) {
      container.innerHTML = `
        <div class="error-state" style="padding: 24px;">
          <i data-lucide="alert-octagon" class="error-state-icon"></i>
          <div class="error-state-title">Không thể nạp danh sách thiết bị</div>
          <div class="error-state-desc">${escapeHtml(err.message || 'Lỗi kết nối')}</div>
          <button id="btn-retry-devices" class="btn btn-secondary btn-sm">Thử lại</button>
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
    const ids = basket.map(d => d.id).join(',');
    const res = await api.get(`/suggestions?ids=${encodeURIComponent(ids)}&k=3`);
    
    // Loại trừ các món đã có trong giỏ (phòng ngừa)
    const basketIdSet = new Set(basket.map(d => d.id));
    suggestions = (res.suggestions || []).filter(s => !basketIdSet.has(s.id));
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
  if (basket.some(d => d.id === device.id)) {
    showToast(`Thiết bị ${device.id} đã có trong giỏ (mỗi thiết bị tối đa 1 món trong 1 phiếu).`, 'warning');
    return;
  }

  basket.push(device);
  // Xóa cảnh báo nếu món này trước đó bị báo unavailable
  unavailableIds = unavailableIds.filter(id => id !== device.id);

  renderBasket();
  renderDeviceList();
  fetchBasketSuggestions();
}

/**
 * Xóa thiết bị khỏi giỏ
 */
function removeFromBasket(deviceId) {
  basket = basket.filter(d => d.id !== deviceId);
  unavailableIds = unavailableIds.filter(id => id !== deviceId);

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
  const hasOutOfStock = basket.some(d => d.available === 0 || unavailableIds.includes(d.id));

  if (warningContainer) {
    if (hasOutOfStock) {
      warningContainer.innerHTML = `
        <div style="background-color: var(--color-danger-bg); border: 1px solid var(--color-danger-border); border-radius: var(--radius-md); padding: 10px 14px; display: flex; align-items: flex-start; gap: 8px; color: var(--color-danger-text); font-size: 12.5px; margin-top: 10px;">
          <i data-lucide="alert-triangle" style="width: 18px; height: 18px; flex-shrink: 0; color: var(--color-danger);"></i>
          <div>
            <strong>Cảnh báo hết hàng (Quy tắc M6):</strong> Giỏ hàng đang chứa thiết bị không còn sẵn sàng. Phiếu mượn là nguyên tử, nếu có thiết bị hết hàng thì <strong>toàn bộ phiếu sẽ thất bại</strong>! Bạn nên xóa món hết hàng hoặc đăng ký hàng đợi.
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
      <div class="empty-state" style="padding: 28px 16px;">
        <i data-lucide="shopping-cart" class="empty-state-icon"></i>
        <div class="empty-state-title">Giỏ mượn đang trống</div>
        <div class="empty-state-desc">Chọn thiết bị từ danh mục bên phải hoặc từ khu vực gợi ý mượn kèm để thêm vào phiếu.</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="basket-list">
      ${basket.map(d => {
        const isUnavailable = d.available === 0 || unavailableIds.includes(d.id);
        return `
          <div class="basket-item ${isUnavailable ? 'is-unavailable' : ''}">
            <div class="basket-meta">
              <div class="basket-name">
                ${escapeHtml(d.name)}
                <code class="mono" style="font-size: 11px; margin-left: 4px;">${escapeHtml(d.id)}</code>
              </div>
              <div class="basket-sub">
                ${isUnavailable
                  ? `<span style="color: var(--color-danger); font-weight: 600;">⚠️ Hết hàng (Không thể mượn)</span>`
                  : `<span style="color: var(--color-success); font-weight: 500;">✓ Sẵn sàng (Kho còn ${d.available})</span>`
                }
              </div>
            </div>
            <button class="btn-icon btn-remove-basket" data-id="${escapeHtml(d.id)}" title="Xóa khỏi giỏ" style="color: var(--color-danger);">
              <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  container.querySelectorAll('.btn-remove-basket').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFromBasket(btn.dataset.id);
    });
  });
}

/**
 * Hiển thị khu vực gợi ý mượn kèm (Companion Suggestions theo giỏ)
 */
function renderSuggestions() {
  const container = document.getElementById('suggestions-container');
  if (!container) return;

  if (isSuggesting) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
        <div class="skeleton" style="width: 100%; height: 50px; border-radius: var(--radius-md);"></div>
        <div class="skeleton" style="width: 100%; height: 50px; border-radius: var(--radius-md);"></div>
      </div>
    `;
    return;
  }

  if (basket.length === 0) {
    container.innerHTML = `
      <div style="font-size: 12.5px; color: var(--color-text-muted); padding: 18px 14px; background-color: var(--color-bg-muted); border-radius: var(--radius-md); text-align: center; margin-top: 10px;">
        <i data-lucide="sparkles" style="width: 20px; height: 20px; color: var(--color-primary); margin-bottom: 4px;"></i>
        <div>Thêm thiết bị vào giỏ để hệ thống phân tích đồ thị và gợi ý thiết bị thực hành thường được mượn kèm nhiều nhất.</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (suggestions.length === 0) {
    container.innerHTML = `
      <div style="font-size: 12.5px; color: var(--color-text-muted); padding: 14px; background-color: var(--color-bg-muted); border-radius: var(--radius-md); text-align: center; margin-top: 10px;">
        Không tìm thấy thiết bị nào thường được mượn kèm với các món trong giỏ hiện tại.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="suggestion-grid">
      ${suggestions.map(s => {
        const isOutOfStock = s.outOfStock === true || s.available === 0;
        return `
          <div class="suggestion-card suggestion-popin">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div style="font-size: 13.5px; font-weight: 600; color: var(--color-text-primary);">
                ${escapeHtml(s.name)}
                <code class="mono" style="font-size: 11px; margin-left: 4px;">${escapeHtml(s.id)}</code>
              </div>
              <div style="display: flex; align-items: center; gap: 8px; font-size: 11.5px;">
                <span class="suggestion-badge-weight" title="Tổng số phiếu chứa cả món này và các món trong giỏ">
                  <i data-lucide="link" style="width: 11px; height: 11px;"></i>
                  Cùng giỏ: <strong>${s.weight}</strong> lần
                </span>
                ${isOutOfStock 
                  ? `<span style="color: var(--color-danger); font-weight: 600;">Hết hàng</span>`
                  : `<span style="color: var(--color-success); font-weight: 500;">Còn ${s.available} sẵn</span>`
                }
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;">
              ${isOutOfStock ? `
                <button class="btn btn-outline btn-sm btn-suggest-queue" data-id="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" title="Đăng ký vào hàng đợi">
                  Đăng ký chờ
                </button>
              ` : `
                <button class="btn btn-primary btn-sm btn-add-suggest" data-id="${escapeHtml(s.id)}" title="Thêm ngay vào giỏ">
                  <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
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
  container.querySelectorAll('.btn-add-suggest').forEach(btn => {
    btn.addEventListener('click', () => {
      const dev = allDevices.find(d => d.id === btn.dataset.id);
      if (dev) {
        addToBasket(dev);
      }
    });
  });

  // Nút đăng ký hàng đợi từ gợi ý
  container.querySelectorAll('.btn-suggest-queue').forEach(btn => {
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
  if (!container) return;

  const basketIds = new Set(basket.map(d => d.id));
  const q = deviceQuery.trim().toLowerCase();

  let filtered = allDevices.filter(d => {
    const matchQ = !q || d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q);
    if (!matchQ) return false;

    if (deviceFilter === 'available') return d.available > 0;
    if (deviceFilter === 'out_of_stock') return d.available === 0;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <i data-lucide="search-x" class="empty-state-icon"></i>
        <div class="empty-state-title">Không tìm thấy thiết bị</div>
        <div class="empty-state-desc">Thử tìm kiếm với từ khóa khác hoặc chuyển sang tab lọc "Tất cả".</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = `
    <div class="device-select-list">
      ${filtered.map(d => {
        const inBasket = basketIds.has(d.id);
        const isOutOfStock = d.available === 0;

        return `
          <div class="device-select-item ${inBasket ? 'in-basket' : ''}">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div style="font-size: 13.5px; font-weight: 600; color: var(--color-text-primary);">
                ${escapeHtml(d.name)}
                <code class="mono" style="font-size: 11px; margin-left: 4px;">${escapeHtml(d.id)}</code>
              </div>
              <div style="font-size: 11.5px; color: var(--color-text-secondary);">
                ${isOutOfStock 
                  ? `<span style="color: var(--color-danger); font-weight: 600;">Hết hàng (Tổng: ${d.total})</span>`
                  : `<span style="color: var(--color-success); font-weight: 500;">Còn <strong>${d.available}</strong>/${d.total} sẵn sàng</span>`
                }
                ${d.queueLength > 0 ? ` • <span style="color: var(--status-onhold-bar); font-weight: 600;">${d.queueLength} người chờ</span>` : ''}
              </div>
            </div>

            <div>
              ${inBasket ? `
                <button class="btn btn-secondary btn-sm" disabled style="opacity: 0.7;">
                  <i data-lucide="check" style="width: 14px; height: 14px; color: var(--color-success);"></i>
                  <span>Đã trong giỏ</span>
                </button>
              ` : isOutOfStock ? `
                <button class="btn btn-outline btn-sm btn-queue-from-list" data-id="${escapeHtml(d.id)}" data-name="${escapeHtml(d.name)}" title="Đăng ký vào hàng đợi đặt trước">
                  Đăng ký chờ
                </button>
              ` : `
                <button class="btn btn-primary btn-sm btn-add-from-list" data-id="${escapeHtml(d.id)}">
                  <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
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
  container.querySelectorAll('.btn-add-from-list').forEach(btn => {
    btn.addEventListener('click', () => {
      const dev = allDevices.find(d => d.id === btn.dataset.id);
      if (dev) addToBasket(dev);
    });
  });

  // Nút đăng ký hàng đợi
  container.querySelectorAll('.btn-queue-from-list').forEach(btn => {
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

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="form-group">
      <label class="form-label">Thiết bị đăng ký:</label>
      <div style="font-weight: 600;">${escapeHtml(deviceName)} (<code class="mono">${deviceId}</code>)</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="borrow-queue-student-id">Mã số sinh viên (MSSV):</label>
      <input type="text" id="borrow-queue-student-id" class="form-input mono" placeholder="VD: 25120199" value="${escapeHtml(inputStId)}" required autofocus>
    </div>
    <div class="form-group">
      <label class="form-label" for="borrow-queue-student-name">Họ và tên sinh viên:</label>
      <input type="text" id="borrow-queue-student-name" class="form-input" placeholder="VD: Trần Văn An" value="${escapeHtml(inputStName)}" required>
    </div>
  `;

  openModal({
    title: 'Đăng ký vào Hàng đợi đặt trước',
    content,
    confirmText: 'Đăng ký chờ',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      const stId = content.querySelector('#borrow-queue-student-id').value.trim();
      const stName = content.querySelector('#borrow-queue-student-name').value.trim();

      if (!stId || !stName) {
        showToast('Vui lòng nhập đầy đủ MSSV và Họ tên sinh viên', 'warning');
        throw new Error('Missing student info');
      }

      try {
        const res = await api.post(`/reservations/${deviceId}`, { studentId: stId, studentName: stName });
        showToast(`Đăng ký hàng đợi thành công! Bạn đứng vị trí số ${res.position}.`, 'success');
        await loadAllDevices();
      } catch (err) {
        showToast(err.message || 'Lỗi khi đăng ký hàng đợi', 'error');
        throw err;
      }
    }
  });
}

/**
 * Xác nhận và tạo phiếu mượn (POST /api/borrow)
 */
function handleCheckout() {
  const stIdInput = document.getElementById('borrow-student-id');
  const stNameInput = document.getElementById('borrow-student-name');
  const daysInput = document.getElementById('borrow-days');

  const studentId = stIdInput ? stIdInput.value.trim() : '';
  const studentName = stNameInput ? stNameInput.value.trim() : '';
  const days = daysInput ? parseInt(daysInput.value, 10) : 7;

  if (!studentId || !studentName) {
    showToast('Vui lòng nhập đầy đủ MSSV và Họ tên sinh viên', 'warning');
    if (!studentId && stIdInput) stIdInput.focus();
    else if (!studentName && stNameInput) stNameInput.focus();
    return;
  }

  if (studentId.includes(',') || studentId.includes('|') || studentName.includes(',') || studentName.includes('|')) {
    showToast('MSSV và Họ tên không được chứa ký tự "," hoặc "|"', 'warning');
    return;
  }

  if (isNaN(days) || days < 1 || days > 30) {
    showToast('Số ngày mượn phải nằm trong khoảng từ 1 đến 30 ngày (Quy tắc M9)', 'warning');
    if (daysInput) daysInput.focus();
    return;
  }

  if (basket.length === 0) {
    showToast('Giỏ mượn chưa có thiết bị nào. Hãy chọn ít nhất 1 thiết bị.', 'warning');
    return;
  }

  // Kiểm tra cảnh báo món hết hàng
  const outOfStockItems = basket.filter(d => d.available === 0);
  const hasOut = outOfStockItems.length > 0;

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background-color: var(--color-bg-muted); border-radius: var(--radius-md); padding: 12px 16px; font-size: 13px;">
        <div>Sinh viên: <strong>${escapeHtml(studentName)}</strong> (<code class="mono">${escapeHtml(studentId)}</code>)</div>
        <div style="margin-top: 4px;">Thời hạn mượn: <strong>${days} ngày</strong> (tính đến đúng giờ theo đồng hồ giả lập)</div>
      </div>

      <div>
        <div style="font-weight: 600; font-size: 13px; margin-bottom: 8px;">Danh sách thiết bị (${basket.length} món):</div>
        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;">
          ${basket.map(d => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--color-bg-muted); font-size: 12.5px;">
              <span><strong>${escapeHtml(d.name)}</strong> <code class="mono" style="font-size: 11px;">${escapeHtml(d.id)}</code></span>
              <span>1 đơn vị ${d.available === 0 ? '<strong style="color: var(--color-danger);">(HẾT HÀNG)</strong>' : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>

      ${hasOut ? `
        <div style="background-color: var(--color-danger-bg); border: 1px solid var(--color-danger-border); border-radius: var(--radius-md); padding: 10px 14px; color: var(--color-danger-text); font-size: 12px;">
          ⚠️ <strong>Cảnh báo nguyên tử (M6):</strong> Có ${outOfStockItems.length} món hết hàng (${outOfStockItems.map(d => d.id).join(', ')}). Nếu tiếp tục, máy chủ sẽ <strong>từ chối toàn bộ phiếu</strong>!
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
          deviceIds: basket.map(d => d.id),
          days
        };

        const res = await api.post('/borrow', payload);
        const rec = res.record;

        showToast(
          `Tạo phiếu #${rec.recordId} thành công cho SV ${escapeHtml(studentName)}! Hạn trả: ${rec.dueText}`,
          'success',
          'Phiếu mượn đã tạo',
          7000
        );

        // Làm mới form và giỏ
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
    }
  });
}

/**
 * Khởi tạo giao diện trang Mượn thiết bị
 */
export async function render(container) {
  currentContainer = container;

  container.innerHTML = `
    <div class="page">
      <!-- Tiêu đề trang -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="file-plus-2"></i> Lập Phiếu Mượn Thiết Bị
          </h1>
          <div class="page-desc">Tạo phiếu mượn thiết bị nguyên tử cho sinh viên, hỗ trợ giỏ mượn nhiều món và gợi ý thông minh (suggestForBasket).</div>
        </div>
      </div>

      <div class="borrow-grid">
        <!-- CỘT 1: Form sinh viên & Giỏ thiết bị -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- 1.1 Form thông tin sinh viên -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="user-check"></i> Thông tin người mượn
              </div>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label" for="borrow-student-id">Mã số sinh viên (MSSV) <span style="color: var(--color-danger);">*</span>:</label>
                <input type="text" id="borrow-student-id" class="form-input mono" placeholder="VD: 25120199" required>
              </div>

              <div class="form-group">
                <label class="form-label" for="borrow-student-name">Họ và tên sinh viên <span style="color: var(--color-danger);">*</span>:</label>
                <input type="text" id="borrow-student-name" class="form-input" placeholder="VD: Trần Văn An" required>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="borrow-days">Số ngày mượn (1 – 30 ngày) <span style="color: var(--color-danger);">*</span>:</label>
                <input type="number" id="borrow-days" class="form-input" min="1" max="30" value="7" required>
                <div class="form-helper">Mặc định: 7 ngày (Quy tắc M9). Hạn trả tính đến đúng giờ sau số ngày mượn.</div>
              </div>
            </div>
          </div>

          <!-- 1.2 Giỏ thiết bị đã chọn -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="shopping-cart"></i> Giỏ thiết bị mượn
              </div>
              <span id="basket-count-badge" class="badge badge-available">0 món</span>
            </div>
            <div class="card-body">
              <div id="basket-container"></div>
              <div id="basket-warning-container"></div>

              <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
                <button id="btn-borrow-checkout" class="btn btn-primary" style="width: 100%; padding: 10px;" disabled>
                  <i data-lucide="check-circle"></i>
                  <span>Xem lại & Xác nhận tạo phiếu</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- CỘT 2: Gợi ý mượn kèm theo giỏ & Danh mục thiết bị để chọn -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- 2.1 Khu vực gợi ý mượn kèm động (suggestForBasket) -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="sparkles" style="color: var(--color-primary);"></i> Thường được mượn kèm
              </div>
              <span class="badge badge-onhold" style="font-size: 11px;">Đồ thị mượn kèm</span>
            </div>
            <div class="card-body">
              <div class="form-helper">Tự động phân tích các cặp thiết bị trong đồ thị dựa trên các món đang có trong giỏ hàng.</div>
              <div id="suggestions-container"></div>
            </div>
          </div>

          <!-- 2.2 Danh mục thiết bị để tìm và chọn -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i data-lucide="layers"></i> Danh mục thiết bị phòng Lab
              </div>
            </div>
            <div class="card-body">
              <!-- Ô tìm kiếm & Tab lọc nhanh -->
              <div class="search-input-wrapper" style="width: 100%;">
                <i data-lucide="search" style="width: 16px; height: 16px;"></i>
                <input type="text" id="input-borrow-search" class="form-input" placeholder="Tìm theo mã hoặc tên thiết bị...">
              </div>

              <div class="filter-pills">
                <button class="filter-pill active" data-filter="all">Tất cả</button>
                <button class="filter-pill" data-filter="available">🟢 Có sẵn</button>
                <button class="filter-pill" data-filter="out_of_stock">🔴 Hết hàng</button>
              </div>

              <!-- Danh sách thiết bị -->
              <div id="device-select-container">
                <div style="padding: 20px 0; display: flex; flex-direction: column; gap: 8px;">
                  <div class="skeleton" style="width: 100%; height: 50px; border-radius: var(--radius-md);"></div>
                  <div class="skeleton" style="width: 100%; height: 50px; border-radius: var(--radius-md);"></div>
                  <div class="skeleton" style="width: 100%; height: 50px; border-radius: var(--radius-md);"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Bắt sự kiện tìm kiếm
  const searchInput = container.querySelector('#input-borrow-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      deviceQuery = e.target.value;
      searchDebounce = setTimeout(() => {
        renderDeviceList();
      }, 200);
    });
  }

  // Bắt sự kiện tab lọc
  container.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      deviceFilter = btn.dataset.filter;
      renderDeviceList();
    });
  });

  // Nút tạo phiếu mượn
  const btnCheckout = container.querySelector('#btn-borrow-checkout');
  if (btnCheckout) {
    btnCheckout.addEventListener('click', handleCheckout);
  }

  // Khởi tạo giỏ và tải dữ liệu thiết bị ban đầu
  renderBasket();
  renderSuggestions();
  await loadAllDevices();
}

/**
 * Hook tự động làm mới khi tua thời gian
 */
export async function onTimeAdvanced() {
  if (currentContainer && document.body.contains(currentContainer)) {
    await loadAllDevices();
  }
}
