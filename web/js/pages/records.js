/**
 * records.js - Màn hình 6: Quá hạn & Lịch sử (Records — #/records)
 * Theo bản thiết kế web/DESIGN.md (mục 2.6 và 3.6) và hợp đồng docs/api.md (mục 4.3).
 *
 * Nguyên tắc bắt buộc:
 * - 100% số liệu nghiệp vụ lấy trực tiếp từ API GET /api/records:
 *   + Số lượng từng tab từ res.counts { all, open, overdue, returned }.
 *   + Quá hạn (overdue), số ngày trễ (lateDays), tiền phạt (fine) và cờ chốt phạt (fineFinal).
 *   + Tuyệt đối không tự tính quá hạn hay tiền phạt ở frontend.
 * - Quy ước tab: "Đang mượn" = open (gồm cả phiếu quá hạn, dòng quá hạn tô nhạt đỏ); "Quá hạn" ⊂ "Đang mượn".
 * - Bấm một phiếu đang mở (open === true) -> chuyển sang #/return?id={recordId} với phiếu đó đã chọn.
 * - Tự động làm mới khi tua thời gian giả lập (onTimeAdvanced).
 */

import { api } from '../api.js';
import { navigateTo } from '../router.js';
import { showToast } from '../ui/toast.js';
import { deviceIconHtml, illustrationHtml as illusSvgHtml } from '../ui/device-images.js';

const VALID_STATUSES = ['all', 'overdue', 'open', 'returned'];
const PAGE_SIZE = 20;

let currentContainer = null;
let currentStatus = 'all';
let currentQuery = '';
let currentPage = 1;
let searchDebounceTimer = null;
let activeRequestSeq = 0;

let tabCounts = {
  all: null,
  overdue: null,
  open: null,
  returned: null
};

/**
 * Chống XSS khi chèn dữ liệu chuỗi vào HTML
 */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

/**
 * Định dạng tiền VNĐ giữ liền đơn vị trên cùng một dòng (\u00A0đ) theo DESIGN.md
 */
function formatVND(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('vi-VN') + '\u00A0đ';
}

/**
 * Đọc trạng thái khởi tạo từ URL Hash (VD: #/records?status=overdue&page=2&query=PM00)
 */
function parseHashState() {
  const hash = window.location.hash || '#/records';
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) {
    return null;
  }

  const params = new URLSearchParams(hash.substring(qIndex + 1));
  const rawStatus = (params.get('status') || '').toLowerCase();
  const rawPage = parseInt(params.get('page') || '1', 10);
  const rawQuery = params.get('query');

  return {
    status: VALID_STATUSES.includes(rawStatus) ? rawStatus : 'all',
    page: Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1,
    query: rawQuery !== null ? rawQuery : ''
  };
}

/**
 * Đồng bộ trạng thái lọc & phân trang lên URL Hash (?status=&page=) mà không gây reload trang
 */
function syncUrlHash() {
  const params = new URLSearchParams();
  params.set('status', currentStatus);
  params.set('page', String(currentPage));
  if (currentQuery.trim()) {
    params.set('query', currentQuery.trim());
  }

  const targetHash = `#/records?${params.toString()}`;
  if (window.location.hash !== targetHash) {
    history.replaceState(null, '', targetHash);
  }
}

/**
 * Khung ảnh minh hoạ trạng thái chừa sẵn (Đợt 7 gắn SVG theo data-illustration)
 */
function illustrationHtml(name, iconName, extraClass = '') {
  const svg = illusSvgHtml(name);
  return `<div class="empty-illustration ${extraClass}${svg ? ' has-svg' : ''}" data-illustration="${name}" aria-hidden="true">${svg || `<i data-lucide="${iconName}"></i>`}</div>`;
}

/**
 * Cập nhật giao diện các nút Tab và con số đếm từ API (res.counts)
 */
function updateTabsUI() {
  if (!currentContainer) return;

  currentContainer.querySelectorAll('.records-tab-btn').forEach(btn => {
    const tabStatus = btn.getAttribute('data-status');
    const isActive = tabStatus === currentStatus;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    // Roving tabindex: chỉ tab đang chọn nằm trong thứ tự Tab, các tab khác dùng phím mũi tên
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
    if (isActive) {
      const panelEl = currentContainer.querySelector('#records-tabpanel');
      if (panelEl) panelEl.setAttribute('aria-labelledby', btn.id);
    }

    const countEl = btn.querySelector('.records-tab-count');
    if (countEl && tabStatus) {
      const val = tabCounts[tabStatus];
      countEl.textContent = (val !== null && val !== undefined) ? String(val) : '—';
      if (tabStatus === 'overdue') {
        countEl.classList.toggle('has-overdue', Number(val) > 0);
      }
    }
  });

  // Cập nhật gợi ý ngữ cảnh bên phải thanh tìm kiếm
  const hintEl = currentContainer.querySelector('#records-context-hint');
  if (!hintEl) return;

  if (currentStatus === 'overdue') {
    hintEl.innerHTML = `
      <i data-lucide="arrow-down-wide-narrow"></i>
      <span>Sắp xếp theo số ngày trễ giảm dần • Bấm vào phiếu để chuyển sang trả thiết bị</span>
    `;
  } else if (currentStatus === 'open') {
    hintEl.innerHTML = `
      <i data-lucide="info"></i>
      <span>Gồm cả phiếu quá hạn (tô đỏ) • Bấm vào phiếu để chuyển sang màn Trả thiết bị</span>
    `;
  } else if (currentStatus === 'returned') {
    hintEl.innerHTML = `
      <i data-lucide="file-check-2"></i>
      <span>Lịch sử các phiếu đã hoàn tất trả • Tiền phạt đã được chốt cố định</span>
    `;
  } else {
    hintEl.innerHTML = `
      <i data-lucide="corner-down-left"></i>
      <span>Bấm vào bất kỳ phiếu đang mở nào để chuyển nhanh sang màn Trả thiết bị</span>
    `;
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hiển thị khung chờ Skeleton cho bảng phiếu mượn (7 cột)
 */
function renderSkeletonTable() {
  if (!currentContainer) return;
  const tbody = currentContainer.querySelector('#records-table-body');
  if (!tbody) return;

  tbody.innerHTML = Array(6).fill(0).map(() => `
    <tr aria-hidden="true">
      <td>
        <div class="skeleton records-sk records-sk-id"></div>
        <div class="skeleton records-sk records-sk-sub-s"></div>
      </td>
      <td>
        <div class="skeleton records-sk records-sk-name"></div>
        <div class="skeleton records-sk records-sk-sub-m"></div>
      </td>
      <td>
        <div class="records-sk-chips">
          <div class="skeleton records-sk records-sk-chip-a"></div>
          <div class="skeleton records-sk records-sk-chip-b"></div>
        </div>
      </td>
      <td><div class="skeleton records-sk records-sk-time"></div></td>
      <td>
        <div class="skeleton records-sk records-sk-time records-sk-gap"></div>
        <div class="skeleton records-sk records-sk-sub-m"></div>
      </td>
      <td><div class="skeleton records-sk records-sk-pill"></div></td>
      <td class="col-right">
        <div class="skeleton records-sk records-sk-fine"></div>
      </td>
    </tr>
  `).join('');
}

/**
 * Hiển thị trạng thái lỗi khi không gọi được API
 */
function renderErrorState(errorMsg) {
  if (!currentContainer) return;
  const tbody = currentContainer.querySelector('#records-table-body');
  const footerMeta = currentContainer.querySelector('#records-range-summary');
  const paginationEl = currentContainer.querySelector('#records-pagination-controls');

  if (footerMeta) footerMeta.textContent = 'Không thể tải dữ liệu phân trang.';
  if (paginationEl) paginationEl.innerHTML = '';
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7">
        <div class="error-state" role="alert">
          ${illustrationHtml('connection-error', 'alert-octagon', 'is-error')}
          <div class="error-state-title">Không thể tải danh sách phiếu mượn</div>
          <div class="error-state-desc">${escapeHtml(errorMsg)}</div>
          <button type="button" id="btn-records-retry" class="btn btn-primary btn-sm">
            <i data-lucide="refresh-cw"></i>
            <span>Thử lại</span>
          </button>
        </div>
      </td>
    </tr>
  `;

  if (window.lucide) window.lucide.createIcons();

  const retryBtn = tbody.querySelector('#btn-records-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadRecords());
  }
}

/**
 * Hiển thị trạng thái rỗng theo ngữ cảnh tab / từ khóa tìm kiếm
 */
function renderEmptyState() {
  if (!currentContainer) return;
  const tbody = currentContainer.querySelector('#records-table-body');
  if (!tbody) return;

  const trimmedQuery = currentQuery.trim();

  if (trimmedQuery) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            ${illustrationHtml('no-results', 'search-x')}
            <div class="empty-state-title">Không tìm thấy phiếu mượn phù hợp</div>
            <div class="empty-state-desc">
              Không có phiếu nào khớp với từ khoá <strong>"${escapeHtml(trimmedQuery)}"</strong> trong mục này.
            </div>
            <button type="button" id="btn-records-reset-query" class="btn btn-secondary btn-sm">
              <i data-lucide="x"></i>
              <span>Xoá bộ lọc tìm kiếm</span>
            </button>
          </div>
        </td>
      </tr>
    `;

    if (window.lucide) window.lucide.createIcons();

    const resetBtn = tbody.querySelector('#btn-records-reset-query');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        currentQuery = '';
        currentPage = 1;
        const input = currentContainer.querySelector('#input-records-search');
        const clearBtn = currentContainer.querySelector('#btn-records-search-clear');
        if (input) input.value = '';
        if (clearBtn) clearBtn.hidden = true;
        loadRecords();
      });
    }
    return;
  }

  // Trường hợp tab Quá hạn có 0 phiếu: dùng SVG Checkmark Stroke Draw (Animation #11 trong DESIGN.md)
  if (currentStatus === 'overdue') {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            ${illustrationHtml('no-overdue', 'shield-check', 'is-success')}
            <div class="empty-state-title">Không có phiếu mượn nào quá hạn</div>
            <div class="empty-state-desc">Tất cả các phiếu đang mượn hiện tại đều nằm trong thời hạn quy định.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  let emptyTitle = 'Chưa có phiếu mượn nào';
  let emptyDesc = 'Dữ liệu mượn trả thiết bị của phòng Lab sẽ xuất hiện tại đây.';

  if (currentStatus === 'open') {
    emptyTitle = 'Hiện không có phiếu nào đang mượn';
    emptyDesc = 'Mọi phiếu mượn trước đó đã được hoàn trả đầy đủ về kho.';
  } else if (currentStatus === 'returned') {
    emptyTitle = 'Chưa có phiếu đã trả trong lịch sử';
    emptyDesc = 'Các phiếu sau khi hoàn tất thu hồi sẽ được lưu trữ tại đây.';
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="7">
        <div class="empty-state">
          ${illustrationHtml('empty-data', 'inbox')}
          <div class="empty-state-title">${escapeHtml(emptyTitle)}</div>
          <div class="empty-state-desc">${escapeHtml(emptyDesc)}</div>
        </div>
      </td>
    </tr>
  `;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render danh sách thiết bị của một phiếu (hỗ trợ quy tắc M4: thiết bị đã xoá)
 */
function renderRecordDevicesHtml(devices) {
  if (!Array.isArray(devices) || devices.length === 0) {
    return `<span class="record-no-devices">Không có dữ liệu</span>`;
  }

  const chips = devices.map(dev => {
    const id = escapeHtml(dev.id || '');
    if (dev.deleted) {
      // Quy tắc M4: giữ mã thiết bị trong phiếu lịch sử, hiển thị "đã xoá"
      return `
        <span class="record-device-chip is-deleted" title="Thiết bị ${id} đã bị xoá khỏi danh mục (Quy tắc M4)">
          <code class="device-code-chip">${id}</code>
          <span class="badge badge-maintenance record-deleted-badge"><i data-lucide="trash-2" class="badge-icon"></i><span>Đã xoá (M4)</span></span>
        </span>
      `;
    }

    const name = escapeHtml(dev.name || '');
    return `
      <span class="record-device-chip" title="${name ? `${name} (${id})` : id}">
        <span class="record-device-thumb" data-device-id="${id}" aria-hidden="true">${deviceIconHtml(id, { size: 20 })}</span>
        <code class="device-code-chip">${id}</code>
        ${name ? `<span class="record-device-chip-name">${name}</span>` : ''}
      </span>
    `;
  }).join('');

  return `<div class="record-devices-list">${chips}</div>`;
}

/**
 * Render các dòng phiếu mượn vào bảng (100% số liệu lấy từ API)
 */
function renderRecordsRows(records) {
  if (!currentContainer) return;
  const tbody = currentContainer.querySelector('#records-table-body');
  if (!tbody) return;

  if (!Array.isArray(records) || records.length === 0) {
    renderEmptyState();
    return;
  }

  tbody.innerHTML = records.map(r => {
    const isOpen = Boolean(r.open);
    const isOverdue = Boolean(r.overdue);
    const lateDays = Number(r.lateDays) || 0;
    const fine = Number(r.fine) || 0;
    const isFineFinal = Boolean(r.fineFinal);

    // Phân loại class dòng: quá hạn tô nhạt đỏ; đang mở cho phép bấm chuyển sang #/return
    const rowClasses = [];
    if (isOverdue) rowClasses.push('record-row-overdue');
    if (isOpen) {
      rowClasses.push('clickable-row', 'record-row-open');
    } else {
      rowClasses.push('record-row-returned');
    }

    const rowTitle = isOpen
      ? `Bấm để chuyển sang màn Trả thiết bị cho phiếu #${escapeHtml(r.recordId)}`
      : `Phiếu #${escapeHtml(r.recordId)} đã hoàn tất trả`;
    const rowAriaLabel = isOpen
      ? `Mở phiếu ${escapeHtml(r.recordId)} của ${escapeHtml(r.studentName)} để trả thiết bị${isOverdue ? ', đang quá hạn' : ''}`
      : '';

    // Cột 1: Mã phiếu + chỉ báo mở/trả
    const statusSubHtml = isOpen
      ? `<span class="record-jump-hint"><i data-lucide="corner-down-left" class="record-mini-icon" aria-hidden="true"></i> Trả phiếu</span>`
      : `<span class="record-time-sub"><i data-lucide="check-circle-2" class="record-mini-icon is-success" aria-hidden="true"></i> Đã trả</span>`;

    // Cột 5: Hạn trả (nếu đang mở) hoặc Ngày trả (nếu đã trả)
    let dueOrReturnHtml = '';
    if (isOpen) {
      dueOrReturnHtml = `
        <div class="record-time-cell">
          <span class="record-time-main tabular-nums ${isOverdue ? 'is-overdue-due' : ''}">${escapeHtml(r.dueText || '—')}</span>
          <span class="record-time-sub">${isOverdue ? 'Hạn trả (đã quá hạn)' : 'Hạn trả'}</span>
        </div>
      `;
    } else {
      dueOrReturnHtml = `
        <div class="record-time-cell">
          <span class="record-time-main tabular-nums">${escapeHtml(r.returnText || '—')}</span>
          <span class="record-time-sub tabular-nums">Hạn: ${escapeHtml(r.dueText || '—')}</span>
        </div>
      `;
    }

    // Cột 6: Số ngày trễ (đọc trực tiếp lateDays từ API)
    let lateDaysHtml = '';
    if (lateDays > 0) {
      const lateClass = isOpen ? 'badge-late-days' : 'badge-late-days badge-late-returned';
      lateDaysHtml = `
        <span class="${lateClass} tabular-nums">
          <i data-lucide="alert-triangle" class="record-mini-icon" aria-hidden="true"></i>
          Trễ ${lateDays} ngày
        </span>
      `;
    } else {
      lateDaysHtml = `
        <span class="record-ontime-pill tabular-nums">
          <i data-lucide="check-circle-2" class="record-mini-icon is-success" aria-hidden="true"></i>
          ${isOpen ? 'Trong hạn (0)' : 'Đúng hạn (0)'}
        </span>
      `;
    }

    // Cột 7: Tiền phạt (đánh dấu * nếu fineFinal === false là tạm tính)
    const asteriskHtml = !isFineFinal
      ? `<span class="record-fine-asterisk" title="Tiền phạt tạm tính theo đồng hồ hiện tại">*</span>`
      : '';

    let fineClass = 'zero-fine';
    let fineSubTag = '';
    if (fine > 0) {
      if (!isFineFinal) {
        fineClass = 'has-fine-temp';
        fineSubTag = `<span class="record-fine-tag is-temp">Tạm tính</span>`;
      } else {
        fineClass = 'has-fine-final';
        fineSubTag = `<span class="record-fine-tag">Đã chốt</span>`;
      }
    } else if (!isFineFinal) {
      fineSubTag = `<span class="record-fine-tag">Tạm tính</span>`;
    } else {
      fineSubTag = `<span class="record-fine-tag">Đã chốt</span>`;
    }

    return `
      <tr
        class="${rowClasses.join(' ')}"
        data-record-id="${escapeHtml(r.recordId)}"
        data-record-open="${isOpen ? 'true' : 'false'}"
        ${isOpen ? `tabindex="0" role="link" aria-label="${rowAriaLabel}"` : ''}
        title="${rowTitle}"
      >
        <td>
          <div class="record-id-cell">
            <code class="mono record-id-code">${escapeHtml(r.recordId)}</code>
            ${statusSubHtml}
          </div>
        </td>
        <td>
          <div class="record-student-cell">
            <span class="record-student-name">${escapeHtml(r.studentName)}</span>
            <span class="record-student-id tabular-nums">MSSV: ${escapeHtml(r.studentId)}</span>
          </div>
        </td>
        <td>
          ${renderRecordDevicesHtml(r.devices)}
        </td>
        <td>
          <div class="record-time-cell">
            <span class="record-time-main tabular-nums">${escapeHtml(r.borrowText || '—')}</span>
            <span class="record-time-sub">${(r.devices && r.devices.length) || 0} thiết bị</span>
          </div>
        </td>
        <td>
          ${dueOrReturnHtml}
        </td>
        <td>
          ${lateDaysHtml}
        </td>
        <td class="col-right">
          <div class="record-fine-cell">
            <span class="record-fine-amount tabular-nums ${fineClass}">${formatVND(fine)}${asteriskHtml}</span>
            ${fineSubTag}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Gắn sự kiện click / bàn phím cho các dòng phiếu đang mở -> chuyển sang #/return?id={recordId}
  tbody.querySelectorAll('tr[data-record-open="true"]').forEach(row => {
    const goReturn = () => {
      const recId = row.getAttribute('data-record-id');
      if (recId) {
        navigateTo(`#/return?id=${encodeURIComponent(recId)}`);
      }
    };

    row.addEventListener('click', (e) => {
      // Không chặn nếu người dùng đang bôi đen văn bản để copy mã phiếu/MSSV
      const selection = window.getSelection ? String(window.getSelection()) : '';
      if (selection.length > 0) return;
      if (e.target.closest('button, a')) return;
      goReturn();
    });

    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goReturn();
      }
    });
  });
}

/**
 * Xây dựng danh sách số trang hiển thị gọn gàng (có dấu … khi nhiều trang)
 */
function buildPageItems(page, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push('...');
  for (let p = start; p <= end; p++) {
    items.push(p);
  }
  if (end < totalPages - 1) items.push('...');
  items.push(totalPages);

  return items;
}

/**
 * Render thanh phân trang và thông tin tổng hợp ở chân bảng
 */
function renderPaginationFooter({ page, pageSize, total, totalPages, countShown }) {
  if (!currentContainer) return;
  const summaryEl = currentContainer.querySelector('#records-range-summary');
  const controlsEl = currentContainer.querySelector('#records-pagination-controls');

  if (summaryEl) {
    if (total === 0 || countShown === 0) {
      summaryEl.textContent = 'Hiển thị 0 phiếu mượn';
    } else {
      const fromIdx = (page - 1) * pageSize + 1;
      const toIdx = fromIdx + countShown - 1;
      summaryEl.innerHTML = `Hiển thị <strong class="tabular-nums">${fromIdx}–${toIdx}</strong> trong tổng số <strong class="tabular-nums">${total}</strong> phiếu`;
    }
  }

  if (!controlsEl) return;

  const safeTotalPages = Math.max(1, Number(totalPages) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotalPages);
  const hasPrev = total > 0 && safePage > 1;
  const hasNext = total > 0 && safePage < safeTotalPages;

  const pageItems = total > 0 ? buildPageItems(safePage, safeTotalPages) : [1];

  const pageButtonsHtml = pageItems.map(item => {
    if (item === '...') {
      return `<span class="records-page-ellipsis" aria-hidden="true">…</span>`;
    }
    const isActive = item === safePage;
    return `
      <button
        type="button"
        class="records-page-btn tabular-nums ${isActive ? 'active' : ''}"
        data-page="${item}"
        ${total === 0 ? 'disabled' : ''}
        aria-label="Trang ${item}"
        ${isActive ? 'aria-current="page"' : ''}
      >
        ${item}
      </button>
    `;
  }).join('');

  controlsEl.innerHTML = `
    <span class="records-page-info tabular-nums">
      Trang <strong>${total > 0 ? safePage : 0}</strong> / ${total > 0 ? safeTotalPages : 0}
    </span>
    <button
      type="button"
      class="records-page-btn"
      data-page="${safePage - 1}"
      ${!hasPrev ? 'disabled' : ''}
      title="Trang trước"
      aria-label="Trang trước"
    >
      <i data-lucide="chevron-left" aria-hidden="true"></i>
      <span>Trước</span>
    </button>
    ${pageButtonsHtml}
    <button
      type="button"
      class="records-page-btn"
      data-page="${safePage + 1}"
      ${!hasNext ? 'disabled' : ''}
      title="Trang sau"
      aria-label="Trang sau"
    >
      <span>Sau</span>
      <i data-lucide="chevron-right" aria-hidden="true"></i>
    </button>
  `;

  if (window.lucide) window.lucide.createIcons();

  controlsEl.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const nextPage = parseInt(btn.getAttribute('data-page'), 10);
      if (!Number.isNaN(nextPage) && nextPage >= 1 && nextPage !== currentPage) {
        currentPage = nextPage;
        loadRecords({ scrollToTable: true });
      }
    });
  });
}

/**
 * Gọi API GET /api/records?status=&query=&page=&pageSize= và cập nhật toàn bộ giao diện
 */
async function loadRecords(options = {}) {
  const { showSkeleton = true, scrollToTable = false } = options;
  if (!currentContainer || !document.body.contains(currentContainer)) return;

  const reqSeq = ++activeRequestSeq;
  syncUrlHash();

  if (showSkeleton) {
    renderSkeletonTable();
  }

  try {
    const params = new URLSearchParams();
    params.set('status', currentStatus);
    if (currentQuery.trim()) {
      params.set('query', currentQuery.trim());
    }
    params.set('page', String(currentPage));
    params.set('pageSize', String(PAGE_SIZE));

    const res = await api.get(`/records?${params.toString()}`);

    // Bỏ qua phản hồi cũ nếu người dùng đã chuyển tab / gõ tìm kiếm mới hơn
    if (reqSeq !== activeRequestSeq) return;

    const total = Number(res.total) || 0;
    const totalPages = Number(res.totalPages) || 0;
    const page = Number(res.page) || currentPage;
    const pageSize = Number(res.pageSize) || PAGE_SIZE;
    const records = Array.isArray(res.records) ? res.records : [];

    // Cập nhật số lượng trên từng tab từ res.counts của API
    if (res.counts && typeof res.counts === 'object') {
      tabCounts = {
        all: res.counts.all ?? 0,
        overdue: res.counts.overdue ?? 0,
        open: res.counts.open ?? 0,
        returned: res.counts.returned ?? 0
      };
    } else {
      tabCounts[currentStatus] = total;
    }

    // Nếu trang hiện tại vượt quá tổng số trang sau khi lọc/trả phiếu -> tự lùi về trang cuối hợp lệ
    if (totalPages > 0 && currentPage > totalPages) {
      currentPage = totalPages;
      updateTabsUI();
      await loadRecords({ showSkeleton: false });
      return;
    }

    updateTabsUI();
    renderRecordsRows(records);
    renderPaginationFooter({
      page,
      pageSize,
      total,
      totalPages,
      countShown: records.length
    });

    if (scrollToTable && currentContainer) {
      const panelEl = currentContainer.querySelector('.records-control-panel');
      if (panelEl) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panelEl.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
      }
    }
  } catch (err) {
    if (reqSeq !== activeRequestSeq) return;
    renderErrorState(err.message || 'Không thể kết nối đến máy chủ API.');
  }
}

/**
 * Tự động làm mới dữ liệu bảng & số đếm các tab khi đồng hồ giả lập được tua
 */
export async function onTimeAdvanced() {
  if (currentContainer && document.body.contains(currentContainer)) {
    await loadRecords({ showSkeleton: false });
  }
}

/**
 * Hàm render chính của màn hình Quá hạn & Lịch sử (#/records)
 */
export async function render(container) {
  currentContainer = container;

  // Khôi phục trạng thái từ URL Hash nếu người dùng điều hướng có kèm ?status=&page=&query=
  const hashState = parseHashState();
  if (hashState) {
    currentStatus = hashState.status;
    currentPage = hashState.page;
    currentQuery = hashState.query;
  } else {
    currentPage = 1;
  }

  container.innerHTML = `
    <div class="page">
      <!-- Tiêu đề trang -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="clipboard-list"></i> Quá Hạn & Lịch Sử
          </h1>
          <div class="page-desc">
            Theo dõi các phiếu mượn quá hạn, tiền phạt từ hệ thống và tra cứu toàn bộ lịch sử mượn trả thiết bị.
          </div>
        </div>
        <div class="page-actions">
          <button type="button" id="btn-records-refresh" class="btn btn-secondary btn-sm" title="Tải lại danh sách từ máy chủ">
            <i data-lucide="refresh-cw"></i>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      <!-- Khối Tab trạng thái + Thanh tìm kiếm -->
      <section class="bento-card records-control-panel stagger-item stagger-delay-1" aria-label="Bộ lọc và tìm kiếm phiếu mượn">
        <div class="records-tabs-bar" role="tablist" aria-label="Bộ lọc trạng thái phiếu mượn">
          <button type="button" id="records-tab-all" class="records-tab-btn tab-all" data-status="all" role="tab" aria-controls="records-tabpanel">
            <i data-lucide="layers" class="records-tab-icon" aria-hidden="true"></i>
            <span>Tất cả</span>
            <span class="records-tab-count tabular-nums">—</span>
          </button>

          <button type="button" id="records-tab-overdue" class="records-tab-btn tab-overdue" data-status="overdue" role="tab" aria-controls="records-tabpanel">
            <i data-lucide="alert-triangle" class="records-tab-icon" aria-hidden="true"></i>
            <span>Quá hạn</span>
            <span class="records-tab-count tabular-nums">—</span>
          </button>

          <button
            type="button"
            id="records-tab-open"
            class="records-tab-btn tab-open"
            data-status="open"
            role="tab"
            aria-controls="records-tabpanel"
            title="Bao gồm tất cả các phiếu đang mở (cả trong hạn và quá hạn)"
          >
            <i data-lucide="package-open" class="records-tab-icon" aria-hidden="true"></i>
            <span>Đang mượn</span>
            <span class="records-tab-count tabular-nums">—</span>
          </button>

          <button type="button" id="records-tab-returned" class="records-tab-btn tab-returned" data-status="returned" role="tab" aria-controls="records-tabpanel">
            <i data-lucide="check-circle-2" class="records-tab-icon" aria-hidden="true"></i>
            <span>Đã trả</span>
            <span class="records-tab-count tabular-nums">—</span>
          </button>
        </div>

        <div class="records-toolbar">
          <div class="records-search-group">
            <label class="form-label" for="input-records-search">Tìm theo mã phiếu, MSSV hoặc họ tên</label>
            <div class="records-search-box">
              <i data-lucide="search" class="records-search-icon" aria-hidden="true"></i>
              <input
                type="text"
                id="input-records-search"
                class="records-search-input"
                placeholder="VD: PM0055, 25120104 hoặc Nguyễn Thị Lan"
                value="${escapeHtml(currentQuery)}"
                autocomplete="off"
              >
              <button
                type="button"
                id="btn-records-search-clear"
                class="records-search-clear"
                ${currentQuery ? '' : 'hidden'}
                title="Xoá tìm kiếm"
                aria-label="Xoá từ khoá tìm kiếm"
              ><i data-lucide="x" aria-hidden="true"></i></button>
            </div>
          </div>

          <div id="records-context-hint" class="records-toolbar-hint"></div>
        </div>
      </section>

      <!-- Bảng dữ liệu phiếu mượn & Chân trang phân trang -->
      <section id="records-tabpanel" class="bento-card bento-table-card records-table-panel stagger-item no-overshoot stagger-delay-2" role="tabpanel" aria-label="Danh sách phiếu mượn">
        <div class="records-table-scroll">
          <table class="data-table records-table">
            <thead>
              <tr>
                <th class="records-col-id">Mã phiếu</th>
                <th class="records-col-student">Sinh viên</th>
                <th class="records-col-devices">Thiết bị</th>
                <th class="records-col-borrow">Ngày mượn</th>
                <th class="records-col-due">Hạn trả / Ngày trả</th>
                <th class="records-col-late">Số ngày trễ</th>
                <th class="records-col-fine col-right">Tiền phạt</th>
              </tr>
            </thead>
            <tbody id="records-table-body"></tbody>
          </table>
        </div>

        <div class="records-footer">
          <div class="records-footer-meta">
            <span id="records-range-summary" aria-live="polite">Đang tải danh sách phiếu mượn…</span>
            <span class="records-temp-note">
              <strong>*</strong> Tiền phạt tạm tính theo đồng hồ giả lập hiện tại (chốt chính thức khi trả phiếu — Quy tắc M19).
            </span>
          </div>

          <nav id="records-pagination-controls" class="records-pagination" aria-label="Phân trang danh sách phiếu mượn"></nav>
        </div>
      </section>
    </div>
  `;

  updateTabsUI();

  // Sự kiện bấm chọn Tab lọc trạng thái
  const selectTab = (nextStatus, focusTab = false) => {
    if (!nextStatus || !VALID_STATUSES.includes(nextStatus)) return;
    if (nextStatus !== currentStatus) {
      currentStatus = nextStatus;
      currentPage = 1;
      updateTabsUI();
      loadRecords();
    }
    if (focusTab) {
      const tabEl = container.querySelector(`.records-tab-btn[data-status="${nextStatus}"]`);
      if (tabEl) tabEl.focus();
    }
  };

  const tabButtons = Array.from(container.querySelectorAll('.records-tab-btn'));
  tabButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => selectTab(btn.getAttribute('data-status')));

    // Phím mũi tên / Home / End chuyển tab theo chuẩn WAI-ARIA tablist
    btn.addEventListener('keydown', (e) => {
      let target = -1;
      if (e.key === 'ArrowRight') target = (idx + 1) % tabButtons.length;
      else if (e.key === 'ArrowLeft') target = (idx - 1 + tabButtons.length) % tabButtons.length;
      else if (e.key === 'Home') target = 0;
      else if (e.key === 'End') target = tabButtons.length - 1;
      if (target === -1) return;
      e.preventDefault();
      selectTab(tabButtons[target].getAttribute('data-status'), true);
    });
  });

  // Sự kiện tìm kiếm theo mã phiếu / MSSV / họ tên (Debounce 250ms)
  const searchInput = container.querySelector('#input-records-search');
  const clearBtn = container.querySelector('#btn-records-search-clear');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentQuery = e.target.value;
      if (clearBtn) {
        clearBtn.hidden = !currentQuery;
      }

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentPage = 1;
        loadRecords();
      }, 250);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchDebounceTimer);
        currentPage = 1;
        loadRecords();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearTimeout(searchDebounceTimer);
      currentQuery = '';
      currentPage = 1;
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      clearBtn.hidden = true;
      loadRecords();
    });
  }

  // Sự kiện nút Làm mới (kèm hiệu ứng xoay spin-loading)
  const refreshBtn = container.querySelector('#btn-records-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg, i');
      if (icon) icon.classList.add('spin-loading');
      refreshBtn.disabled = true;
      try {
        await loadRecords({ showSkeleton: false });
        showToast('Đã cập nhật danh sách phiếu mượn mới nhất', 'info', '', 2000);
      } finally {
        setTimeout(() => {
          if (icon) icon.classList.remove('spin-loading');
          refreshBtn.disabled = false;
        }, 350);
      }
    });
  }

  // Tải dữ liệu lần đầu
  await loadRecords();
}
