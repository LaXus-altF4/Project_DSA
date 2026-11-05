/**
 * return.js - Màn hình 4: Trả phiếu mượn (Return — #/return)
 * Theo bản thiết kế DESIGN.md (mục 2.4 và 3.4), docs/api.md và quy tắc M8, M19.
 * 
 * Chức năng:
 * - Ô tìm kiếm phiếu đang mở theo mã phiếu / MSSV / họ tên, danh sách kết quả trực quan.
 * - Hiển thị chi tiết phiếu chọn trả: sinh viên, ngày mượn, hạn trả (tính đến đúng giờ), các thiết bị.
 * - Khối Quá hạn & Tiền phạt: LẤY 100% TỪ API PREVIEW (record.lateDays, record.fine, record.fineFinal),
 *   tuyệt đối không tự tính toán trên frontend; nổi bật đỏ nếu quá hạn, xanh nếu đúng hạn.
 *   Hiển thị công thức chỉ để giải thích quy tắc M19.
 * - Nút "Xác nhận trả toàn bộ phiếu" (Quy tắc M8: trả cả phiếu một lần).
 * - Modal xác nhận trước khi gọi POST /api/return.
 * - Khi thành công: hiển thị toast tiền phạt chốt; sau đó gọi GET /api/notifications
 *   để lấy danh sách sự kiện và hiển thị toast cho từng sự kiện (ví dụ: người đầu hàng được giữ thiết bị).
 * - Khi thất bại: hiển thị error.message từ API.
 * - Đầy đủ skeleton loading, trạng thái rỗng (empty state) và trạng thái lỗi (error state).
 * - Tự động cập nhật lại số liệu khi tua thời gian giả lập (onTimeAdvanced).
 */

import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { triggerRedPulse } from '../ui/motion.js';

let currentContainer = null;
let openRecords = [];
let selectedRecord = null;
let selectedRecordId = null;
let searchQuery = '';
let filterOnlyOverdue = false;
let isLoadingRecords = false;
let isLoadingDetail = false;
let searchDebounceTimer = null;

/**
 * Tránh tấn công XSS khi render chuỗi HTML
 */
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * Định dạng tiền tệ VNĐ giữ nguyên trên 1 dòng theo DESIGN.md (\u00A0đ)
 */
function formatCurrency(val) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + '\u00A0đ';
}

/**
 * Đọc query param ID từ URL hash nếu có (ví dụ: #/return?id=PM0055)
 */
function getRecordIdFromUrl() {
  const hash = window.location.hash || '';
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.substring(qIdx));
  return params.get('id') || params.get('recordId') || null;
}

/**
 * Tải danh sách các phiếu mượn đang mở từ API (GET /api/records?status=open&query=...)
 * @param {string} query - Chuỗi tìm kiếm
 * @param {string|null} preferredId - ID phiếu ưu tiên chọn sau khi tải
 */
async function loadOpenRecords(query = '', preferredId = null) {
  isLoadingRecords = true;
  renderRecordsList();

  try {
    const statusParam = filterOnlyOverdue ? 'overdue' : 'open';
    const endpoint = `/records?status=${statusParam}&query=${encodeURIComponent(query.trim())}&pageSize=100`;
    const res = await api.get(endpoint);
    openRecords = (res && Array.isArray(res.records)) ? res.records : [];

    // Xác định ID phiếu sẽ hiển thị chi tiết
    let targetId = preferredId || selectedRecordId || getRecordIdFromUrl();

    // Kiểm tra xem targetId có nằm trong danh sách không
    const exists = targetId ? openRecords.find(r => r.recordId.toLowerCase() === targetId.toLowerCase()) : null;

    if (exists) {
      targetId = exists.recordId;
    } else if (openRecords.length > 0) {
      // Nếu ID cũ không còn hoặc chưa chọn ai, tự động chọn phiếu đầu tiên
      targetId = openRecords[0].recordId;
    } else {
      targetId = null;
    }

    selectedRecordId = targetId;

    if (targetId) {
      await loadRecordDetail(targetId, false);
    } else {
      selectedRecord = null;
      renderRecordDetail();
    }
  } catch (err) {
    console.error('Lỗi khi nạp danh sách phiếu mượn:', err);
    openRecords = [];
    selectedRecord = null;
    renderRecordsList(err);
    renderRecordDetail();
  } finally {
    isLoadingRecords = false;
    renderRecordsList();
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Tải chi tiết một phiếu mượn từ API (GET /api/records/{id})
 * Đảm bảo đọc trực tiếp lateDays, fine, fineFinal được tính toán mới nhất từ lõi C++
 * @param {string} recordId - Mã phiếu
 * @param {boolean} updateUrl - Có cập nhật hash URL không
 */
async function loadRecordDetail(recordId, updateUrl = true) {
  if (!recordId) {
    selectedRecord = null;
    renderRecordDetail();
    return;
  }

  selectedRecordId = recordId;
  isLoadingDetail = true;
  renderRecordDetail();

  // Cập nhật lại giao diện danh sách để highlight dòng đang chọn
  updateSelectedListItemUI();

  if (updateUrl) {
    // Cập nhật hash nhẹ nhàng không kích hoạt reload toàn bộ router
    const currentHash = window.location.hash.split('?')[0];
    const newHash = `${currentHash}?id=${encodeURIComponent(recordId)}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }

  try {
    const res = await api.get(`/records/${encodeURIComponent(recordId)}`);
    selectedRecord = (res && res.record) ? res.record : null;
  } catch (err) {
    console.error(`Lỗi khi nạp chi tiết phiếu ${recordId}:`, err);
    selectedRecord = null;
    renderRecordDetail(err);
  } finally {
    isLoadingDetail = false;
    renderRecordDetail();
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Cập nhật class active cho item trong danh sách
 */
function updateSelectedListItemUI() {
  const container = document.getElementById('return-records-list-container');
  if (!container) return;

  container.querySelectorAll('.return-record-item').forEach(el => {
    const id = el.getAttribute('data-record-id');
    if (id && selectedRecordId && id.toLowerCase() === selectedRecordId.toLowerCase()) {
      el.classList.add('is-selected');
    } else {
      el.classList.remove('is-selected');
    }
  });
}

/**
 * Hiển thị danh sách phiếu mượn ở cột bên trái
 */
function renderRecordsList(error = null) {
  const container = document.getElementById('return-records-list-container');
  const countBadge = document.getElementById('return-count-badge');
  const overdueBadge = document.getElementById('return-overdue-count');
  if (!container) return;

  // Cập nhật thống kê nhanh
  const overdueCount = openRecords.filter(r => r.overdue).length;
  if (countBadge) countBadge.textContent = `${openRecords.length} phiếu`;
  if (overdueBadge) {
    if (overdueCount > 0) {
      overdueBadge.innerHTML = `<span style="color: var(--color-danger); font-weight: 600;">⚠️ ${overdueCount} quá hạn</span>`;
    } else {
      overdueBadge.textContent = '0 quá hạn';
    }
  }

  // 1. Trạng thái Đang nạp dữ liệu (Skeleton)
  if (isLoadingRecords) {
    container.innerHTML = `
      <div class="skeleton skeleton-card" style="height: 78px; margin-bottom: 8px;"></div>
      <div class="skeleton skeleton-card" style="height: 78px; margin-bottom: 8px;"></div>
      <div class="skeleton skeleton-card" style="height: 78px; margin-bottom: 8px;"></div>
      <div class="skeleton skeleton-card" style="height: 78px; margin-bottom: 8px;"></div>
    `;
    return;
  }

  // 2. Trạng thái Lỗi (Error state)
  if (error) {
    container.innerHTML = `
      <div class="error-state" style="padding: 24px 12px;">
        <i data-lucide="alert-octagon" class="error-state-icon"></i>
        <div class="error-state-title">Không thể tải phiếu mượn</div>
        <div class="error-state-desc">${escapeHtml(error.message || 'Lỗi kết nối máy chủ')}</div>
        <button id="btn-retry-open-records" class="btn btn-secondary btn-sm" style="margin-top: 8px;">
          <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Thử lại
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    const retryBtn = container.querySelector('#btn-retry-open-records');
    if (retryBtn) retryBtn.addEventListener('click', () => loadOpenRecords(searchQuery));
    return;
  }

  // 3. Trạng thái Rỗng (Empty state)
  if (openRecords.length === 0) {
    if (searchQuery.trim() !== '') {
      container.innerHTML = `
        <div class="empty-state" style="padding: 32px 14px;">
          <i data-lucide="search-x" class="empty-state-icon"></i>
          <div class="empty-state-title">Không tìm thấy phiếu khớp</div>
          <div class="empty-state-desc">Không có phiếu đang mở nào chứa từ khóa "${escapeHtml(searchQuery)}".</div>
          <button id="btn-clear-search-return" class="btn btn-secondary btn-sm" style="margin-top: 10px;">
            Xóa tìm kiếm
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      const clearBtn = container.querySelector('#btn-clear-search-return');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          const input = document.getElementById('input-return-search');
          if (input) input.value = '';
          searchQuery = '';
          loadOpenRecords('');
        });
      }
    } else if (filterOnlyOverdue) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 32px 14px;">
          <i data-lucide="check-circle" class="empty-state-icon" style="color: var(--color-success);"></i>
          <div class="empty-state-title">Không có phiếu quá hạn</div>
          <div class="empty-state-desc">Tất cả các phiếu mượn hiện tại đều đang trong hạn quy định.</div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    } else {
      container.innerHTML = `
        <div class="empty-state" style="padding: 36px 14px;">
          <i data-lucide="inbox" class="empty-state-icon"></i>
          <div class="empty-state-title">Không có phiếu mượn nào</div>
          <div class="empty-state-desc">Phòng Lab hiện không có phiếu mượn nào đang mở cần thu hồi.</div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
    return;
  }

  // 4. Render danh sách các phiếu
  container.innerHTML = openRecords.map(r => {
    const isSelected = selectedRecordId && r.recordId.toLowerCase() === selectedRecordId.toLowerCase();
    const isOverdue = r.overdue || (r.lateDays > 0);
    const deviceCount = (r.devices && r.devices.length) || 0;

    let badgeHtml = '';
    if (isOverdue) {
      badgeHtml = `<span class="badge" style="background-color: var(--color-danger-bg); color: var(--color-danger); border: 1px solid var(--color-danger-border);"><span class="badge-dot" style="background-color: var(--color-danger);"></span>Trễ ${r.lateDays} ngày</span>`;
    } else {
      badgeHtml = `<span class="badge badge-borrowed"><span class="badge-dot"></span>Đang mượn</span>`;
    }

    return `
      <div class="return-record-item ${isSelected ? 'is-selected' : ''}" data-record-id="${escapeHtml(r.recordId)}">
        <div class="return-record-header">
          <span class="return-record-id">#${escapeHtml(r.recordId)}</span>
          ${badgeHtml}
        </div>
        <div class="return-record-student">
          <i data-lucide="user" style="width: 14px; height: 14px; color: var(--color-text-muted);"></i>
          <span>${escapeHtml(r.studentName)}</span>
          <span class="return-record-sub">(${escapeHtml(r.studentId)})</span>
        </div>
        <div class="return-record-meta">
          <span>${deviceCount} thiết bị</span>
          <span>Hạn trả: <strong>${escapeHtml(r.dueText)}</strong></span>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Gắn sự kiện click chọn phiếu
  container.querySelectorAll('.return-record-item').forEach(el => {
    el.addEventListener('click', () => {
      const recId = el.getAttribute('data-record-id');
      if (recId && recId !== selectedRecordId) {
        loadRecordDetail(recId);
      }
    });
  });

  // Cuộn mượt tới phiếu đang được chọn nếu chuyển từ màn #/records sang
  const selectedEl = container.querySelector('.return-record-item.is-selected');
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Hiển thị khối chi tiết phiếu ở cột bên phải
 */
function renderRecordDetail(error = null) {
  const container = document.getElementById('return-detail-container');
  if (!container) return;

  // 1. Trạng thái Đang tải chi tiết
  if (isLoadingDetail) {
    container.innerHTML = `
      <div class="return-detail-card">
        <div class="skeleton skeleton-title" style="width: 40%;"></div>
        <div class="skeleton skeleton-text" style="width: 60%; margin-bottom: 20px;"></div>
        <div class="skeleton skeleton-card" style="height: 120px; margin-bottom: 16px;"></div>
        <div class="skeleton skeleton-card" style="height: 100px; margin-bottom: 16px;"></div>
        <div class="skeleton skeleton-card" style="height: 50px;"></div>
      </div>
    `;
    return;
  }

  // 2. Trạng thái Lỗi khi tải chi tiết
  if (error) {
    container.innerHTML = `
      <div class="return-detail-card">
        <div class="error-state">
          <i data-lucide="alert-circle" class="error-state-icon"></i>
          <div class="error-state-title">Không thể nạp thông tin phiếu mượn</div>
          <div class="error-state-desc">${escapeHtml(error.message || 'Lỗi tra cứu phiếu')}</div>
          <button id="btn-retry-detail" class="btn btn-secondary btn-sm">
            <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Thử lại
          </button>
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    const retryBtn = container.querySelector('#btn-retry-detail');
    if (retryBtn && selectedRecordId) {
      retryBtn.addEventListener('click', () => loadRecordDetail(selectedRecordId));
    }
    return;
  }

  // 3. Trạng thái Chưa chọn phiếu nào
  if (!selectedRecord) {
    container.innerHTML = `
      <div class="return-detail-empty">
        <i data-lucide="receipt" class="return-detail-empty-icon"></i>
        <div style="font-size: 16px; font-weight: 600; color: var(--color-text-primary);">Chưa chọn phiếu mượn</div>
        <div style="font-size: 13px; max-width: 380px; line-height: 1.5;">
          Vui lòng nhấp vào một phiếu mượn từ danh sách bên trái hoặc sử dụng ô tìm kiếm phía trên để xem trước ngày quá hạn và tiền phạt.
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 4. Có dữ liệu chi tiết phiếu
  const r = selectedRecord;
  const isOverdue = r.overdue || (r.lateDays > 0);
  const devices = Array.isArray(r.devices) ? r.devices : [];

  // LẤY TRỰC TIẾP TỪ API PREVIEW (Quy tắc bắt buộc của DESIGN.md)
  const lateDaysFromApi = r.lateDays || 0;
  const fineFromApi = r.fine || 0;
  const isFineFinal = r.fineFinal === true;

  // Header status badge
  let statusBadgeHtml = '';
  if (!r.open) {
    statusBadgeHtml = `<span class="badge badge-available"><span class="badge-dot"></span>Đã hoàn tất (Đã trả)</span>`;
  } else if (isOverdue) {
    statusBadgeHtml = `<span class="badge" style="background-color: var(--color-danger-bg); color: var(--color-danger); border: 1px solid var(--color-danger-border);"><span class="badge-dot" style="background-color: var(--color-danger);"></span>Quá hạn ${lateDaysFromApi} ngày</span>`;
  } else {
    statusBadgeHtml = `<span class="badge badge-borrowed"><span class="badge-dot"></span>Đang mượn trong hạn</span>`;
  }

  // Khối quá hạn & tiền phạt nổi bật
  let penaltyBoxHtml = '';
  if (isOverdue) {
    penaltyBoxHtml = `
      <div class="return-penalty-box is-overdue" id="penalty-box">
        <div class="return-penalty-header">
          <i data-lucide="alert-triangle" style="width: 20px; height: 20px; color: var(--color-danger);"></i>
          <span>CẢNH BÁO QUÁ HẠN & TIỀN PHẠT TẠM TÍNH (LẤY TỪ MÁY CHỦ)</span>
        </div>

        <div class="return-penalty-metrics">
          <div class="return-metric-group">
            <span class="return-metric-label">Số ngày quá hạn:</span>
            <span class="return-metric-val text-danger" id="metric-late-days">${lateDaysFromApi} ngày</span>
          </div>
          <div class="return-metric-group">
            <span class="return-metric-label">Tiền phạt ${isFineFinal ? 'đã chốt' : 'tạm tính'}:</span>
            <span class="return-metric-val text-danger" id="metric-fine-val">${formatCurrency(fineFromApi)}</span>
          </div>
        </div>

        <div class="return-penalty-formula">
          <div style="font-weight: 600; color: var(--color-text-primary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            <i data-lucide="info" style="width: 15px; height: 15px; color: var(--color-primary);"></i>
            <span>Công thức giải thích (Quy tắc M19):</span>
          </div>
          <div>
            <code>${lateDaysFromApi} ngày trễ</code> &times; <code>${devices.length} thiết bị</code> &times; <code>36.000\u00A0đ</code> = <strong>${formatCurrency(fineFromApi)}</strong>
          </div>
          <div style="font-size: 11.5px; color: var(--color-text-muted); margin-top: 6px; line-height: 1.4;">
            * Ghi chú: Hạn trả tính đến đúng giờ (${escapeHtml(r.dueText)}). Hệ thống tính quá hạn khi giờ hiện tại vượt quá hạn trả; trễ chưa tròn ngày vẫn tính 1 ngày. Tiền phạt sẽ được chốt chính thức khi xác nhận thu hồi.
          </div>
        </div>
      </div>
    `;
  } else {
    penaltyBoxHtml = `
      <div class="return-penalty-box is-ontime">
        <div class="return-penalty-header">
          <i data-lucide="check-circle-2" style="width: 20px; height: 20px; color: var(--color-success);"></i>
          <span>PHIẾU MƯỢN TRONG HẠN HỢP LỆ</span>
        </div>

        <div class="return-penalty-metrics">
          <div class="return-metric-group">
            <span class="return-metric-label">Số ngày quá hạn:</span>
            <span class="return-metric-val text-success">0 ngày</span>
          </div>
          <div class="return-metric-group">
            <span class="return-metric-label">Tiền phạt phát sinh:</span>
            <span class="return-metric-val text-success">0\u00A0đ</span>
          </div>
        </div>

        <div style="font-size: 12.5px; color: var(--color-success-text); line-height: 1.4;">
          Phiếu mượn đang trong thời hạn cho phép (hạn trả: <strong>${escapeHtml(r.dueText)}</strong>). Thu hồi đúng hạn sẽ không phát sinh tiền phạt vi phạm.
        </div>
      </div>
    `;
  }

  // Khối nút hành động
  let actionHtml = '';
  if (r.open) {
    actionHtml = `
      <div class="return-actions">
        <button id="btn-submit-return" class="btn ${isOverdue ? 'btn-danger' : 'btn-primary'} btn-confirm-return">
          <i data-lucide="rotate-ccw"></i>
          <span>Xác nhận trả toàn bộ phiếu</span>
        </button>
        <div class="return-rule-hint">
          <i data-lucide="shield-alert" style="width: 14px; height: 14px;"></i>
          <span><strong>Quy tắc M8:</strong> Thu hồi toàn bộ thiết bị trong phiếu cùng một lần. Sau khi hoàn tất, hệ thống sẽ tự động chuyển quyền giữ chỗ cho sinh viên trong hàng đợi (nếu có).</span>
        </div>
      </div>
    `;
  } else {
    actionHtml = `
      <div style="background-color: var(--color-bg-muted); border-radius: var(--radius-md); padding: 14px 18px; border: 1px solid var(--color-border); display: flex; align-items: center; gap: 10px; font-size: 13px;">
        <i data-lucide="check-circle" style="width: 18px; height: 18px; color: var(--color-success);"></i>
        <div>
          Phiếu này đã được thu hồi hoàn tất vào lúc <strong>${escapeHtml(r.returnText || 'trước đó')}</strong>. Tiền phạt đã chốt: <strong>${formatCurrency(fineFromApi)}</strong>.
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="return-detail-card">
      <!-- Tiêu đề và trạng thái -->
      <div class="return-detail-header">
        <div class="return-detail-title-group">
          <div class="return-detail-title">
            <i data-lucide="receipt" style="color: var(--color-primary); width: 22px; height: 22px;"></i>
            <span>#${escapeHtml(r.recordId)}</span>
          </div>
          <div style="font-size: 12.5px; color: var(--color-text-secondary);">
            Chi tiết phiếu mượn thiết bị phòng Lab
          </div>
        </div>
        <div>${statusBadgeHtml}</div>
      </div>

      <!-- Thông tin sinh viên & Mốc thời gian -->
      <div class="return-detail-info-grid">
        <div class="return-info-box">
          <i data-lucide="user" class="return-info-box-icon"></i>
          <div class="return-info-box-content">
            <span class="return-info-label">Người mượn</span>
            <span class="return-info-val">${escapeHtml(r.studentName)}</span>
            <span style="font-size: 12px; color: var(--color-text-secondary); font-family: ui-monospace, Menlo, Consolas, monospace;">
              MSSV: ${escapeHtml(r.studentId)}
            </span>
          </div>
        </div>

        <div class="return-info-box">
          <i data-lucide="calendar" class="return-info-box-icon"></i>
          <div class="return-info-box-content">
            <span class="return-info-label">Mốc thời gian mượn / trả</span>
            <div style="font-size: 12.5px;">
              Mượn: <strong>${escapeHtml(r.borrowText)}</strong>
            </div>
            <div style="font-size: 12.5px; margin-top: 2px;">
              Hạn trả: <strong style="${isOverdue ? 'color: var(--color-danger);' : ''}">${escapeHtml(r.dueText)}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Danh sách thiết bị trong phiếu -->
      <div class="return-devices-section">
        <div class="return-section-title">
          <i data-lucide="package" style="width: 16px; height: 16px; color: var(--color-primary);"></i>
          <span>Danh sách thiết bị cần thu hồi (${devices.length} món — M7, M8):</span>
        </div>
        <div class="return-device-list">
          ${devices.map(dev => `
            <div class="return-device-item">
              <div class="return-device-meta">
                <i data-lucide="cpu" style="width: 16px; height: 16px; color: var(--color-text-secondary);"></i>
                <div>
                  <span class="return-device-name">${escapeHtml(dev.name || dev.id)}</span>
                  <code class="mono" style="font-size: 11.5px; margin-left: 6px;">${escapeHtml(dev.id)}</code>
                  ${dev.deleted ? '<span class="badge badge-maintenance" style="margin-left: 6px; font-size: 10.5px;">Đã xoá (M4)</span>' : ''}
                </div>
              </div>
              <span style="font-weight: 600; color: var(--color-text-secondary); font-size: 12px;">1 đơn vị</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Khối quá hạn & tiền phạt từ API -->
      ${penaltyBoxHtml}

      <!-- Nút hành động xác nhận trả -->
      ${actionHtml}
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Kích hoạt animation pulse viền đỏ nếu phiếu bị quá hạn
  if (isOverdue) {
    const penaltyBox = container.querySelector('#penalty-box');
    if (penaltyBox) triggerRedPulse(penaltyBox);
  }

  // Gắn sự kiện nút xác nhận trả
  const btnSubmit = container.querySelector('#btn-submit-return');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => handleReturnClick(r));
  }
}

/**
 * Xử lý khi bấm nút "Xác nhận trả toàn bộ phiếu"
 * Mở modal xác nhận -> gọi POST /api/return -> lấy /api/notifications -> thông báo
 * @param {object} record - Phiếu mượn
 */
function handleReturnClick(record) {
  if (!record || !record.recordId) return;

  const isOverdue = record.overdue || (record.lateDays > 0);
  const devices = Array.isArray(record.devices) ? record.devices : [];
  const fineDisplay = formatCurrency(record.fine || 0);

  const content = document.createElement('div');
  content.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background-color: var(--color-bg-muted); border-radius: var(--radius-md); padding: 12px 16px; font-size: 13px;">
        <div>Mã phiếu: <strong>#${escapeHtml(record.recordId)}</strong></div>
        <div style="margin-top: 4px;">Sinh viên: <strong>${escapeHtml(record.studentName)}</strong> (<code class="mono">${escapeHtml(record.studentId)}</code>)</div>
      </div>

      <div>
        <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px;">Các thiết bị sẽ thu hồi vào kho (${devices.length} món):</div>
        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 160px; overflow-y: auto;">
          ${devices.map(d => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: var(--radius-sm); background-color: var(--color-bg-muted); font-size: 12px;">
              <span><strong>${escapeHtml(d.name || d.id)}</strong> <code class="mono" style="font-size: 11px;">${escapeHtml(d.id)}</code></span>
              <span>1 đơn vị</span>
            </div>
          `).join('')}
        </div>
      </div>

      ${isOverdue ? `
        <div style="background-color: var(--color-danger-bg); border: 1px solid var(--color-danger-border); border-radius: var(--radius-md); padding: 12px 14px; color: var(--color-danger-text); font-size: 12.5px;">
          ⚠️ <strong>Phiếu quá hạn ${record.lateDays} ngày!</strong> Tiền phạt chốt thu là <strong>${fineDisplay}</strong>. Tiền phạt này sẽ được ghi nhận vào lịch sử lưu trữ CSV.
        </div>
      ` : `
        <div style="background-color: var(--color-success-bg); border: 1px solid var(--color-success-border); border-radius: var(--radius-md); padding: 10px 14px; color: var(--color-success-text); font-size: 12.5px;">
          ✓ Phiếu trả đúng hạn. Tiền phạt chốt: <strong>0\u00A0đ</strong>.
        </div>
      `}

      <div style="font-size: 12px; color: var(--color-text-muted); line-height: 1.4;">
        * Lưu ý: Thiết bị vừa trả nếu có người đặt trước trong hàng đợi sẽ được chuyển sang trạng thái <strong>Đang giữ (24h)</strong> cho người đầu hàng tiếp theo (Quy tắc M11).
      </div>
    </div>
  `;

  openModal({
    title: `Xác nhận thu hồi phiếu #${record.recordId}`,
    content,
    confirmText: 'Xác nhận trả toàn bộ',
    cancelText: 'Huỷ bỏ',
    onConfirm: async () => {
      try {
        // 1. Gọi API thu hồi phiếu
        const res = await api.post('/return', { recordId: record.recordId });
        const returnedRec = res.record;

        // 2. Toast thông báo kết quả tiền phạt chốt
        const finalFine = returnedRec.fine || 0;
        if (finalFine > 0) {
          showToast(
            `Thu hồi thành công phiếu #${returnedRec.recordId}! Tiền phạt chốt: ${formatCurrency(finalFine)}.`,
            'warning',
            'Đã thu hồi phiếu',
            7000
          );
        } else {
          showToast(
            `Thu hồi thành công phiếu #${returnedRec.recordId}! Trả đúng hạn, không có tiền phạt.`,
            'success',
            'Đã thu hồi phiếu',
            6000
          );
        }

        // 3. Gọi /api/notifications để lấy các sự kiện chuyển quyền giữ hàng cho hàng đợi
        try {
          const notiRes = await api.get('/notifications');
          if (notiRes && Array.isArray(notiRes.notifications) && notiRes.notifications.length > 0) {
            notiRes.notifications.forEach(n => {
              let toastType = 'info';
              let toastTitle = 'Sự kiện hệ thống';
              if (n.type === 'hold_granted') {
                toastType = 'success';
                toastTitle = 'Hàng đợi: Giữ chỗ 24h';
              } else if (n.type === 'missed') {
                toastType = 'warning';
                toastTitle = 'Hàng đợi: Lỡ hẹn';
              } else if (n.type === 'removed') {
                toastType = 'error';
                toastTitle = 'Hàng đợi: Bị loại';
              }

              showToast(n.message, toastType, toastTitle, 8000);
            });
          }
        } catch (notiErr) {
          console.warn('Lỗi khi lấy thông báo hệ thống:', notiErr);
        }

        // 4. Cập nhật lại giao diện
        selectedRecord = returnedRec;
        renderRecordDetail();
        await loadOpenRecords(searchQuery, null);
      } catch (err) {
        console.error('Lỗi khi thu hồi phiếu:', err);
        showToast(err.message || 'Lỗi khi thu hồi phiếu', 'error', 'Thu hồi thất bại');
        throw err;
      }
    }
  });
}

/**
 * Xử lý sự kiện tua thời gian giả lập từ Topbar
 */
export async function onTimeAdvanced() {
  console.log('Màn hình Trả phiếu: Nhận sự kiện tua thời gian giả lập, đang cập nhật lại số liệu...');
  await loadOpenRecords(searchQuery, selectedRecordId);
}

/**
 * Hàm render chính của màn hình Trả phiếu (#/return)
 */
export async function render(container) {
  currentContainer = container;

  // Nếu điều hướng trực tiếp từ màn #/records kèm ?id=..., gỡ bộ lọc cũ để đảm bảo hiển thị đúng phiếu được chọn
  const initialUrlRecordId = getRecordIdFromUrl();
  if (initialUrlRecordId) {
    searchQuery = '';
    filterOnlyOverdue = false;
    selectedRecordId = initialUrlRecordId;
  }

  container.innerHTML = `
    <div class="page">
      <!-- Tiêu đề trang -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="rotate-ccw"></i> Trả Thiết Bị
          </h1>
          <div class="page-desc">
            Thu hồi toàn bộ thiết bị theo phiếu mượn (M8), xem trước ngày quá hạn và tiền phạt tạm tính từ hệ thống.
          </div>
        </div>
        <div class="page-actions">
          <button id="btn-refresh-return-page" class="btn btn-secondary btn-sm" title="Làm mới dữ liệu từ máy chủ">
            <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      <!-- Bố cục 2 cột -->
      <div class="return-layout">
        <!-- Cột trái: Tìm kiếm và danh sách phiếu đang mở -->
        <div class="return-search-pane card">
          <div class="card-header">
            <div class="card-title">
              <i data-lucide="search" style="width: 16px; height: 16px; color: var(--color-primary);"></i>
              <span>Tra cứu phiếu mượn</span>
            </div>
            <span id="return-count-badge" class="badge badge-borrowed">0 phiếu</span>
          </div>

          <div class="card-body" style="padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;">
            <!-- Ô tìm kiếm -->
            <div class="return-search-box">
              <i data-lucide="search" class="search-icon"></i>
              <input 
                type="text" 
                id="input-return-search" 
                class="return-search-input" 
                placeholder="Nhập mã phiếu PM..., MSSV hoặc họ tên..."
                value="${escapeHtml(searchQuery)}"
                autocomplete="off"
              >
              <button id="btn-clear-search-input" class="return-search-clear" style="display: ${searchQuery ? 'flex' : 'none'};" title="Xóa tìm kiếm">&times;</button>
            </div>

            <!-- Thanh thống kê & bộ lọc nhanh -->
            <div class="return-stats-bar">
              <span id="return-overdue-count">0 quá hạn</span>
              <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11.5px;">
                <input type="checkbox" id="chk-filter-overdue" ${filterOnlyOverdue ? 'checked' : ''}>
                <span>Chỉ hiện quá hạn</span>
              </label>
            </div>

            <!-- Danh sách cuộn phiếu đang mở -->
            <div id="return-records-list-container" class="return-record-list">
              <!-- Render động từ JS -->
            </div>
          </div>
        </div>

        <!-- Cột phải: Chi tiết phiếu và Khối quá hạn / Tiền phạt / Xác nhận trả -->
        <div class="return-detail-pane" id="return-detail-container">
          <!-- Render động từ JS -->
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Gắn sự kiện ô tìm kiếm (Debounce 250ms)
  const searchInput = container.querySelector('#input-return-search');
  const clearBtn = container.querySelector('#btn-clear-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      searchQuery = val;
      if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        loadOpenRecords(searchQuery);
      }, 250);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      searchQuery = '';
      clearBtn.style.display = 'none';
      loadOpenRecords('');
    });
  }

  // Gắn sự kiện bộ lọc "Chỉ hiện quá hạn"
  const filterChk = container.querySelector('#chk-filter-overdue');
  if (filterChk) {
    filterChk.addEventListener('change', (e) => {
      filterOnlyOverdue = e.target.checked;
      loadOpenRecords(searchQuery);
    });
  }

  // Gắn sự kiện nút "Làm mới"
  const btnRefresh = container.querySelector('#btn-refresh-return-page');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      const icon = btnRefresh.querySelector('i');
      if (icon) icon.classList.add('spinning');
      await loadOpenRecords(searchQuery, selectedRecordId);
      setTimeout(() => {
        if (icon) icon.classList.remove('spinning');
      }, 400);
      showToast('Đã làm mới dữ liệu từ máy chủ', 'info', '', 2000);
    });
  }

  // Tải dữ liệu ban đầu
  const urlRecordId = getRecordIdFromUrl();
  await loadOpenRecords(searchQuery, urlRecordId);
}
