/**
 * return.js - Màn hình 4: Trả phiếu mượn (Return v2 — #/return)
 * Theo bản thiết kế DESIGN.md, docs/api.md và quy tắc M8, M19.
 *
 * Chức năng:
 * - Ô tìm kiếm phiếu đang mở theo mã phiếu / MSSV / họ tên (có label rõ, nút xoá 44×44px).
 * - Hiển thị chi tiết phiếu chọn trả: sinh viên, ngày mượn, hạn trả (tính đến đúng giờ), các thiết bị.
 * - Khối Quá hạn & Tiền phạt: LẤY 100% TỪ API PREVIEW (record.lateDays, record.fine, record.fineFinal),
 *   tuyệt đối không tự tính toán trên frontend; nổi bật đỏ (+ pulse 2 lần) nếu quá hạn, xanh nếu đúng hạn.
 * - Nút "Xác nhận trả toàn bộ phiếu" (Quy tắc M8: trả cả phiếu một lần).
 * - Khi thành công: toast tiền phạt chốt + gọi GET /api/notifications để hiển thị các sự kiện hàng đợi.
 * - Chuẩn Dark-tech Glassmorphism + Bento Grid & Checklist UI/UX (màu + icon Lucide + chữ, >= 12px, keyboard).
 */

import { api } from '../api.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { triggerRedPulse } from '../ui/motion.js';
import { deviceIconHtml, illustrationHtml } from '../ui/device-images.js';

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
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Định dạng tiền tệ VNĐ giữ nguyên trên 1 dòng theo DESIGN.md (\u00A0đ)
 */
function formatCurrency(val) {
  const num = Number(val) || 0;
  return `${new Intl.NumberFormat('vi-VN').format(num)}\u00A0đ`;
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
    const exists = targetId ? openRecords.find((r) => r.recordId.toLowerCase() === targetId.toLowerCase()) : null;

    if (exists) {
      targetId = exists.recordId;
    } else if (openRecords.length > 0) {
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
    isLoadingRecords = false;
    renderRecordsList(err);
    renderRecordDetail();
    return;
  }

  isLoadingRecords = false;
  renderRecordsList();
  if (window.lucide) window.lucide.createIcons();
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
  updateSelectedListItemUI();

  if (updateUrl) {
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
    isLoadingDetail = false;
    renderRecordDetail(err);
    return;
  }

  isLoadingDetail = false;
  renderRecordDetail();
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Cập nhật class active & aria-pressed cho item trong danh sách
 */
function updateSelectedListItemUI() {
  const container = document.getElementById('return-records-list-container');
  if (!container) return;

  container.querySelectorAll('.return-record-item').forEach((el) => {
    const id = el.getAttribute('data-record-id');
    const selected = Boolean(id && selectedRecordId && id.toLowerCase() === selectedRecordId.toLowerCase());
    el.classList.toggle('is-selected', selected);
    el.setAttribute('aria-pressed', selected ? 'true' : 'false');
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

  const overdueCount = openRecords.filter((r) => r.overdue).length;
  if (countBadge) countBadge.textContent = `${openRecords.length} phiếu`;
  if (overdueBadge) {
    if (overdueCount > 0) {
      overdueBadge.innerHTML = `
        <span class="return-overdue-summary is-danger">
          <i data-lucide="alert-triangle"></i>
          <span class="tnum">${overdueCount} quá hạn</span>
        </span>
      `;
    } else {
      overdueBadge.innerHTML = `
        <span class="return-overdue-summary is-ok">
          <i data-lucide="check-circle-2"></i>
          <span>0 quá hạn</span>
        </span>
      `;
    }
  }

  // 1. Trạng thái Đang nạp dữ liệu (Skeleton)
  if (isLoadingRecords) {
    container.innerHTML = `
      <div class="skeleton return-skeleton-item"></div>
      <div class="skeleton return-skeleton-item"></div>
      <div class="skeleton return-skeleton-item"></div>
      <div class="skeleton return-skeleton-item"></div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 2. Trạng thái Lỗi (Error state)
  if (error) {
    container.innerHTML = `
      <div class="error-state">
        ${illustrationHtml('connection-error')}
        <div class="error-state-title">Không thể tải phiếu mượn</div>
        <div class="error-state-desc">${escapeHtml(error.message || 'Lỗi kết nối máy chủ')}</div>
        <button id="btn-retry-open-records" type="button" class="btn btn-primary btn-sm">
          <i data-lucide="rotate-cw"></i>
          <span>Thử lại</span>
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
        <div class="empty-state">
          ${illustrationHtml('no-results')}
          <div class="empty-state-title">Không tìm thấy phiếu khớp</div>
          <div class="empty-state-desc">Không có phiếu đang mở nào chứa từ khóa "${escapeHtml(searchQuery)}".</div>
          <button id="btn-clear-search-return" type="button" class="btn btn-secondary btn-sm">
            <span>Xóa tìm kiếm</span>
          </button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      const clearBtn = container.querySelector('#btn-clear-search-return');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          const input = document.getElementById('input-return-search');
          const inlineClear = document.getElementById('btn-clear-search-input');
          if (input) input.value = '';
          if (inlineClear) inlineClear.style.display = 'none';
          searchQuery = '';
          loadOpenRecords('');
        });
      }
    } else if (filterOnlyOverdue) {
      container.innerHTML = `
        <div class="empty-state">
          ${illustrationHtml('no-overdue')}
          <div class="empty-state-title">Không có phiếu quá hạn</div>
          <div class="empty-state-desc">Tất cả các phiếu mượn hiện tại đều đang trong hạn quy định.</div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    } else {
      container.innerHTML = `
        <div class="empty-state">
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
  container.innerHTML = openRecords.map((r) => {
    const isSelected = Boolean(selectedRecordId && r.recordId.toLowerCase() === selectedRecordId.toLowerCase());
    const isOverdue = Boolean(r.overdue || (r.lateDays > 0));
    const deviceCount = (r.devices && r.devices.length) || 0;

    const badgeHtml = isOverdue
      ? `
        <span class="badge badge-maintenance tnum">
          <i data-lucide="alert-triangle" class="badge-icon"></i>
          <span>Trễ ${r.lateDays} ngày</span>
        </span>
      `
      : `
        <span class="badge badge-borrowed">
          <i data-lucide="clock" class="badge-icon"></i>
          <span>Đang mượn</span>
        </span>
      `;

    const statusDesc = isOverdue ? `quá hạn ${r.lateDays} ngày` : 'đang mượn trong hạn';

    return `
      <div
        class="return-record-item ${isSelected ? 'is-selected' : ''} ${isOverdue ? 'is-overdue-record' : ''}"
        role="button"
        tabindex="0"
        aria-pressed="${isSelected ? 'true' : 'false'}"
        aria-label="Chọn phiếu #${escapeHtml(r.recordId)} của ${escapeHtml(r.studentName)} (${escapeHtml(r.studentId)}), ${escapeHtml(statusDesc)}"
        data-glow="${isOverdue ? 'maintenance' : 'borrowed'}"
        data-record-id="${escapeHtml(r.recordId)}"
      >
        <div class="return-record-header">
          <span class="return-record-id">#${escapeHtml(r.recordId)}</span>
          ${badgeHtml}
        </div>
        <div class="return-record-student">
          <i data-lucide="user"></i>
          <span>${escapeHtml(r.studentName)}</span>
          <code class="device-code-chip">${escapeHtml(r.studentId)}</code>
        </div>
        <div class="return-record-meta">
          <span class="tabular-nums">${deviceCount} thiết bị</span>
          <span class="tnum">Hạn trả: <strong class="tabular-nums">${escapeHtml(r.dueText)}</strong></span>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Gắn sự kiện click & bàn phím (Enter / Space) chọn phiếu
  container.querySelectorAll('.return-record-item').forEach((el) => {
    const selectItem = () => {
      const recId = el.getAttribute('data-record-id');
      if (recId && recId !== selectedRecordId) {
        loadRecordDetail(recId);
      }
    };
    el.addEventListener('click', selectItem);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectItem();
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
      <div class="return-detail-card bento-card bento-table-card" aria-busy="true" aria-label="Đang tải chi tiết phiếu mượn">
        <div class="skeleton return-skeleton-title"></div>
        <div class="skeleton return-skeleton-sub"></div>
        <div class="skeleton return-skeleton-box"></div>
        <div class="skeleton return-skeleton-box"></div>
        <div class="skeleton return-skeleton-btn"></div>
      </div>
    `;
    return;
  }

  // 2. Trạng thái Lỗi khi tải chi tiết
  if (error) {
    container.innerHTML = `
      <div class="return-detail-card bento-card bento-table-card">
        <div class="error-state">
          ${illustrationHtml('connection-error')}
          <div class="error-state-title">Không thể nạp thông tin phiếu mượn</div>
          <div class="error-state-desc">${escapeHtml(error.message || 'Lỗi tra cứu phiếu')}</div>
          <button id="btn-retry-detail" type="button" class="btn btn-primary btn-sm">
            <i data-lucide="rotate-cw"></i>
            <span>Thử lại</span>
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
      <div class="return-detail-empty bento-card bento-table-card">
        <i data-lucide="receipt" class="return-detail-empty-icon"></i>
        <div class="return-detail-empty-title">Chưa chọn phiếu mượn</div>
        <div class="return-detail-empty-desc">
          Chọn một phiếu mượn từ danh sách tra cứu hoặc nhập mã phiếu, MSSV, họ tên để xem trước ngày quá hạn và tiền phạt.
        </div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 4. Có dữ liệu chi tiết phiếu
  const r = selectedRecord;
  const isOverdue = Boolean(r.overdue || (r.lateDays > 0));
  const devices = Array.isArray(r.devices) ? r.devices : [];

  // LẤY TRỰC TIẾP TỪ API PREVIEW (không tự tính nghiệp vụ ở frontend)
  const lateDaysFromApi = r.lateDays || 0;
  const fineFromApi = r.fine || 0;
  const isFineFinal = r.fineFinal === true;

  let statusBadgeHtml = '';
  if (!r.open) {
    statusBadgeHtml = `
      <span class="badge badge-available">
        <i data-lucide="check-circle-2" class="badge-icon"></i>
        <span>Đã hoàn tất (Đã trả)</span>
      </span>
    `;
  } else if (isOverdue) {
    statusBadgeHtml = `
      <span class="badge badge-maintenance tnum">
        <i data-lucide="alert-triangle" class="badge-icon"></i>
        <span>Quá hạn ${lateDaysFromApi} ngày</span>
      </span>
    `;
  } else {
    statusBadgeHtml = `
      <span class="badge badge-borrowed">
        <i data-lucide="clock" class="badge-icon"></i>
        <span>Đang mượn trong hạn</span>
      </span>
    `;
  }

  // Khối quá hạn & tiền phạt nổi bật
  let penaltyBoxHtml = '';
  if (isOverdue) {
    penaltyBoxHtml = `
      <div class="return-penalty-box is-overdue" id="penalty-box">
        <div class="return-penalty-header">
          <i data-lucide="alert-triangle"></i>
          <span>CẢNH BÁO QUÁ HẠN & TIỀN PHẠT TẠM TÍNH (TỪ MÁY CHỦ)</span>
        </div>

        <div class="return-penalty-metrics">
          <div class="return-metric-group">
            <span class="return-metric-label">Số ngày quá hạn</span>
            <span class="return-metric-val text-danger" id="metric-late-days">${lateDaysFromApi} ngày</span>
          </div>
          <div class="return-metric-group">
            <span class="return-metric-label">Tiền phạt ${isFineFinal ? 'đã chốt' : 'tạm tính'}</span>
            <span class="return-metric-val text-danger" id="metric-fine-val">${formatCurrency(fineFromApi)}</span>
          </div>
        </div>

        <div class="return-penalty-formula">
          <div class="return-formula-heading">
            <i data-lucide="info"></i>
            <span>Công thức giải thích:</span>
          </div>
          <div class="tnum">
            <code>${lateDaysFromApi} ngày trễ</code> &times; <code>${devices.length} thiết bị</code> &times; <code>36.000\u00A0đ</code> = <strong>${formatCurrency(fineFromApi)}</strong>
          </div>
          <div class="return-formula-note">
            * Hạn trả tính đến đúng giờ (${escapeHtml(r.dueText)}). Quá hạn khi giờ hiện tại vượt quá hạn trả; trễ chưa tròn ngày vẫn tính 1 ngày. Tiền phạt chốt chính thức khi xác nhận thu hồi.
          </div>
        </div>
      </div>
    `;
  } else {
    penaltyBoxHtml = `
      <div class="return-penalty-box is-ontime">
        <div class="return-penalty-header">
          <i data-lucide="check-circle-2"></i>
          <span>PHIẾU MƯỢN TRONG HẠN HỢP LỆ</span>
        </div>

        <div class="return-penalty-metrics">
          <div class="return-metric-group">
            <span class="return-metric-label">Số ngày quá hạn</span>
            <span class="return-metric-val text-success">0 ngày</span>
          </div>
          <div class="return-metric-group">
            <span class="return-metric-label">Tiền phạt phát sinh</span>
            <span class="return-metric-val text-success">0\u00A0đ</span>
          </div>
        </div>

        <div class="return-ontime-note">
          Phiếu mượn đang trong thời hạn cho phép (hạn trả: <strong class="tabular-nums">${escapeHtml(r.dueText)}</strong>). Thu hồi đúng hạn không phát sinh tiền phạt vi phạm.
        </div>
      </div>
    `;
  }

  // Khối nút hành động
  let actionHtml = '';
  if (r.open) {
    actionHtml = `
      <div class="return-actions">
        <button id="btn-submit-return" type="button" class="btn ${isOverdue ? 'btn-danger' : 'btn-primary'} btn-confirm-return">
          <i data-lucide="rotate-ccw"></i>
          <span>Xác nhận trả toàn bộ phiếu</span>
        </button>
        <div class="return-rule-hint">
          <i data-lucide="shield-alert"></i>
          <span><strong>Lưu ý:</strong> Thu hồi toàn bộ thiết bị trong phiếu cùng một lần. Sau khi hoàn tất, hệ thống tự động giữ chỗ 24h cho sinh viên đầu hàng đợi (nếu có).</span>
        </div>
      </div>
    `;
  } else {
    actionHtml = `
      <div class="return-completed-banner">
        <i data-lucide="check-circle-2"></i>
        <div>
          Phiếu này đã được thu hồi hoàn tất vào lúc <strong class="tabular-nums">${escapeHtml(r.returnText || 'trước đó')}</strong>. Tiền phạt đã chốt: <strong class="tabular-nums">${formatCurrency(fineFromApi)}</strong>.
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="return-detail-card bento-card bento-table-card">
      <!-- Tiêu đề và trạng thái -->
      <div class="return-detail-header">
        <div class="return-detail-title-group">
          <div class="return-detail-title">
            <i data-lucide="receipt"></i>
            <span>#${escapeHtml(r.recordId)}</span>
          </div>
          <div class="return-detail-subtitle">
            Chi tiết phiếu mượn thiết bị phòng Lab
          </div>
        </div>
        <div>${statusBadgeHtml}</div>
      </div>

      <!-- Thông tin sinh viên & Mốc thời gian -->
      <div class="return-detail-info-grid">
        <div class="return-info-box bento-subcard">
          <i data-lucide="user" class="return-info-box-icon"></i>
          <div class="return-info-box-content">
            <span class="return-info-label">Người mượn</span>
            <span class="return-info-val">${escapeHtml(r.studentName)}</span>
            <span class="return-info-subline">
              MSSV: <code class="device-code-chip">${escapeHtml(r.studentId)}</code>
            </span>
          </div>
        </div>

        <div class="return-info-box bento-subcard">
          <i data-lucide="calendar" class="return-info-box-icon"></i>
          <div class="return-info-box-content">
            <span class="return-info-label">Mốc thời gian mượn / trả</span>
            <div class="return-info-subline">
              Mượn: <strong class="tabular-nums">${escapeHtml(r.borrowText)}</strong>
            </div>
            <div class="return-info-subline">
              Hạn trả: <strong class="tabular-nums ${isOverdue ? 'return-due-overdue' : ''}">${escapeHtml(r.dueText)}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Danh sách thiết bị trong phiếu -->
      <div class="return-devices-section">
        <div class="return-section-title">
          <i data-lucide="package"></i>
          <span>Danh sách thiết bị cần thu hồi (<span class="tabular-nums">${devices.length}</span> món):</span>
        </div>
        <div class="return-device-list">
          ${devices.map((dev) => `
            <div class="return-device-item bento-subcard">
              <div class="return-device-meta">
                <div class="return-device-thumb" aria-hidden="true">${deviceIconHtml(dev.id, { size: 36 })}</div>
                <div class="return-device-text">
                  <span class="return-device-name">${escapeHtml(dev.name || dev.id)}</span>
                  <code class="device-code-chip">${escapeHtml(dev.id)}</code>
                  ${dev.deleted
                    ? `
                      <span class="badge badge-maintenance">
                        <i data-lucide="trash-2" class="badge-icon"></i>
                        <span>Đã xoá</span>
                      </span>
                    `
                    : ''}
                </div>
              </div>
              <div class="return-device-right">
                <span class="return-device-qty tabular-nums">1 đơn vị</span>
                ${!r.open && !dev.deleted ? `
                  <a
                    href="#/reservations?id=${encodeURIComponent(dev.id)}"
                    class="btn btn-outline btn-sm"
                    title="Kiểm tra hàng đợi đặt trước của thiết bị này"
                  >
                    <span>Xem hàng đợi</span>
                    <i data-lucide="arrow-right" class="btn-action-icon-sm"></i>
                  </a>
                ` : ''}
              </div>
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

  // Kích hoạt animation pulse viền đỏ 2 lần nếu phiếu bị quá hạn
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

  const isOverdue = Boolean(record.overdue || (record.lateDays > 0));
  const devices = Array.isArray(record.devices) ? record.devices : [];
  const fineDisplay = formatCurrency(record.fine || 0);

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="borrow-modal-stack">
      <div class="borrow-modal-summary">
        <div>Mã phiếu: <strong class="tabular-nums">#${escapeHtml(record.recordId)}</strong></div>
        <div>Sinh viên: <strong>${escapeHtml(record.studentName)}</strong> (<code class="device-code-chip">${escapeHtml(record.studentId)}</code>)</div>
      </div>

      <div>
        <div class="borrow-modal-section-label">Các thiết bị sẽ thu hồi vào kho (<span class="tabular-nums">${devices.length}</span> món):</div>
        <div class="borrow-modal-list">
          ${devices.map((d) => `
            <div class="borrow-modal-item">
              <span class="borrow-modal-item-left">
                <strong>${escapeHtml(d.name || d.id)}</strong>
                <code class="device-code-chip">${escapeHtml(d.id)}</code>
              </span>
              <span class="tabular-nums">1 đơn vị</span>
            </div>
          `).join('')}
        </div>
      </div>

      ${isOverdue ? `
        <div class="return-modal-alert is-danger" role="alert">
          <i data-lucide="alert-triangle"></i>
          <div>
            <strong>Phiếu quá hạn <span class="tabular-nums">${record.lateDays}</span> ngày!</strong> Tiền phạt chốt thu là <strong class="tabular-nums">${fineDisplay}</strong> và sẽ được lưu vào lịch sử CSV.
          </div>
        </div>
      ` : `
        <div class="return-modal-alert is-success">
          <i data-lucide="check-circle-2"></i>
          <div>
            Phiếu trả đúng hạn. Tiền phạt chốt: <strong class="tabular-nums">0\u00A0đ</strong>.
          </div>
        </div>
      `}

      <div class="return-modal-note">
        * Thiết bị vừa trả nếu có sinh viên đang chờ trong hàng đợi sẽ tự động chuyển sang trạng thái <strong>Đang giữ (24h)</strong> cho người đầu hàng tiếp theo (Quy tắc M11).
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
            notiRes.notifications.forEach((n) => {
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
    },
  });

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Xử lý sự kiện tua thời gian giả lập từ Topbar
 */
export async function onTimeAdvanced() {
  if (currentContainer && document.body.contains(currentContainer)) {
    await loadOpenRecords(searchQuery, selectedRecordId);
  }
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
            Thu hồi toàn bộ thiết bị theo phiếu mượn, xem trước số ngày quá hạn và tiền phạt tạm tính từ hệ thống.
          </div>
        </div>
        <div class="page-actions">
          <button id="btn-refresh-return-page" type="button" class="btn btn-secondary btn-sm" title="Làm mới dữ liệu từ máy chủ">
            <i data-lucide="refresh-cw"></i>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      <!-- Bố cục 2 cột Bento -->
      <div class="return-layout">
        <!-- Cột trái: Tìm kiếm và danh sách phiếu đang mở -->
        <section class="return-search-pane bento-card bento-table-card stagger-item stagger-delay-1" aria-label="Tra cứu phiếu mượn đang mở">
          <div class="card-header">
            <div class="card-title">
              <i data-lucide="search"></i>
              <span>Tra cứu phiếu mượn</span>
            </div>
            <span id="return-count-badge" class="badge badge-borrowed tabular-nums">0 phiếu</span>
          </div>

          <div class="card-body return-search-body">
            <!-- Ô tìm kiếm có label hiển thị rõ -->
            <div class="return-search-field">
              <label class="form-label" for="input-return-search">Tìm theo mã phiếu, MSSV hoặc họ tên</label>
              <div class="return-search-box">
                <i data-lucide="search" class="search-icon"></i>
                <input
                  type="text"
                  id="input-return-search"
                  class="return-search-input"
                  placeholder="Nhập PM..., MSSV hoặc họ tên..."
                  value="${escapeHtml(searchQuery)}"
                  autocomplete="off"
                >
                <button
                  type="button"
                  id="btn-clear-search-input"
                  class="return-search-clear"
                  style="display: ${searchQuery ? 'flex' : 'none'};"
                  aria-label="Xóa từ khóa tìm phiếu"
                  title="Xóa tìm kiếm"
                >
                  <i data-lucide="x"></i>
                </button>
              </div>
            </div>

            <!-- Thanh thống kê & bộ lọc nhanh -->
            <div class="return-stats-bar">
              <span id="return-overdue-count">
                <span class="return-overdue-summary is-ok">
                  <i data-lucide="check-circle-2"></i>
                  <span>0 quá hạn</span>
                </span>
              </span>
              <label class="return-filter-toggle" for="chk-filter-overdue">
                <input type="checkbox" id="chk-filter-overdue" ${filterOnlyOverdue ? 'checked' : ''}>
                <span>Chỉ hiện quá hạn</span>
              </label>
            </div>

            <!-- Danh sách cuộn phiếu đang mở -->
            <div id="return-records-list-container" class="return-record-list">
              <!-- Render động từ JS -->
            </div>
          </div>
        </section>

        <!-- Cột phải: Chi tiết phiếu và Khối quá hạn / Tiền phạt / Xác nhận trả -->
        <section class="return-detail-pane stagger-item no-overshoot stagger-delay-2" id="return-detail-container" aria-label="Chi tiết phiếu mượn và xác nhận trả">
          <!-- Render động từ JS -->
        </section>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Gắn sự kiện ô tìm kiếm (Debounce 220ms)
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
      }, 220);
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

  // Gắn sự kiện nút "Làm mới" (hiệu ứng xoay SVG chuẩn spin-loading)
  const btnRefresh = container.querySelector('#btn-refresh-return-page');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      const icon = btnRefresh.querySelector('svg, i');
      if (icon) icon.classList.add('spin-loading');
      btnRefresh.disabled = true;
      try {
        await loadOpenRecords(searchQuery, selectedRecordId);
        showToast('Đã làm mới dữ liệu từ máy chủ', 'info', '', 2000);
      } finally {
        setTimeout(() => {
          if (icon) icon.classList.remove('spin-loading');
          btnRefresh.disabled = false;
        }, 350);
      }
    });
  }

  // Tải dữ liệu ban đầu
  const urlRecordId = getRecordIdFromUrl();
  await loadOpenRecords(searchQuery, urlRecordId);
}
