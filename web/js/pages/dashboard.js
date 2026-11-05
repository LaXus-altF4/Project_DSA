/**
 * dashboard.js - Màn hình 1: Tổng quan (Dashboard)
 * Kết nối API thật: GET /api/stats?within=6&top=5
 * Tích hợp hệ thống animation 60fps (stagger, count-up, diff floating delta, pulse, bar fill)
 */

import { api } from '../api.js';
import { animateCountUp, triggerRedPulse } from '../ui/motion.js';

let currentContainer = null;
let lastStatsData = null;

// Định dạng tiền tệ VNĐ (không bao giờ ngắt dòng chữ đ)
function formatVND(amount) {
  if (amount === undefined || amount === null) return '0\u00A0đ';
  return Number(amount).toLocaleString('vi-VN') + '\u00A0đ';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));
}

/**
 * Hiển thị khung chờ Skeleton
 */
function renderSkeleton(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title"><i data-lucide="layout-dashboard"></i> Tổng quan phòng Lab</h1>
          <div class="page-desc">Thống kê hoạt động, tình trạng kho thiết bị và người chờ nhận theo thời gian thực.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" disabled><i data-lucide="refresh-cw" class="spin-loading"></i> Đang tải…</button>
        </div>
      </div>

      <!-- 4 Thẻ Skeleton -->
      <div class="grid-cols-4">
        <div class="metric-card skeleton-card skeleton"></div>
        <div class="metric-card skeleton-card skeleton"></div>
        <div class="metric-card skeleton-card skeleton"></div>
        <div class="metric-card skeleton-card skeleton"></div>
      </div>

      <!-- 2 Khối biểu đồ Skeleton -->
      <div class="grid-cols-2">
        <div class="card">
          <div class="card-header"><div class="card-title"><div class="skeleton" style="width: 160px; height: 18px;"></div></div></div>
          <div class="card-body">
            <div class="skeleton" style="width: 100%; height: 28px; margin-bottom: 12px;"></div>
            <div class="skeleton" style="width: 85%; height: 28px; margin-bottom: 12px;"></div>
            <div class="skeleton" style="width: 70%; height: 28px; margin-bottom: 12px;"></div>
            <div class="skeleton" style="width: 50%; height: 28px;"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title"><div class="skeleton" style="width: 180px; height: 18px;"></div></div></div>
          <div class="card-body">
            <div class="skeleton" style="width: 100%; height: 60px; margin-bottom: 12px;"></div>
            <div class="skeleton" style="width: 100%; height: 60px;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hiển thị trạng thái lỗi
 */
function renderError(container, errorMsg) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title"><i data-lucide="layout-dashboard"></i> Tổng quan phòng Lab</h1>
          <div class="page-desc">Thống kê hoạt động phòng Lab.</div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="error-state">
            <i data-lucide="alert-octagon" class="error-state-icon"></i>
            <div class="error-state-title">Không thể tải dữ liệu Tổng quan</div>
            <div class="error-state-desc">${escapeHtml(errorMsg)}</div>
            <button id="btn-dashboard-retry" class="btn btn-primary btn-sm">
              <i data-lucide="rotate-cw"></i> Thử lại
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const retryBtn = container.querySelector('#btn-dashboard-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadAndRender(container));
  }
}

/**
 * Tải dữ liệu từ API và hiển thị
 */
async function loadAndRender(container, isManualRefresh = false) {
  if (!isManualRefresh) {
    renderSkeleton(container);
  }

  try {
    const data = await api.get('/stats?within=6&top=5');
    renderContent(container, data, isManualRefresh);
  } catch (err) {
    renderError(container, err.message || 'Lỗi kết nối tới máy chủ');
  }
}

/**
 * Hiển thị dữ liệu hoàn chỉnh với Animation
 */
function renderContent(container, data, isUpdating = false) {
  const prevData = lastStatsData;
  lastStatsData = data;

  const totalUnits = data.totalUnits || 0;
  const borrowedUnits = data.borrowed || 0;
  const borrowPercent = totalUnits > 0 ? Math.round((borrowedUnits / totalUnits) * 100) : 0;
  const topList = Array.isArray(data.topBorrowed) ? data.topBorrowed : [];
  const maxTimes = topList.length > 0 ? Math.max(...topList.map(t => t.timesBorrowed), 1) : 1;
  const expiringList = Array.isArray(data.expiringHolds) ? data.expiringHolds : [];

  container.innerHTML = `
    <div class="page">
      <!-- Tiêu đề & Nút thao tác -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="layout-dashboard"></i> Tổng quan phòng Lab
          </h1>
          <div class="page-desc">Thống kê hoạt động, tình trạng kho thiết bị và người chờ nhận theo thời gian thực.</div>
        </div>
        <div class="page-actions">
          <button id="btn-dashboard-refresh" class="btn btn-secondary btn-sm" title="Làm mới số liệu">
            <i data-lucide="refresh-cw"></i> Làm mới
          </button>
        </div>
      </div>

      <!-- 4 Thẻ Số liệu Thống kê (Xuất hiện lần lượt - Stagger 60ms) -->
      <div class="grid-cols-4">
        <!-- Thẻ 1: Tổng thiết bị -->
        <div class="metric-card stagger-item stagger-delay-1">
          <div class="metric-info">
            <span class="metric-label">Tổng thiết bị</span>
            <div class="metric-value-wrapper">
              <span id="metric-device-count" class="metric-value tabular-nums">${data.deviceCount || 0}</span>
              <span style="font-size: 15px; font-weight: 500; color: var(--color-text-secondary); margin-left: 4px;">mã</span>
            </div>
            <span class="metric-sub">${totalUnits} đơn vị (${data.available || 0} sẵn sàng, ${data.maintenance || 0} bảo trì)</span>
          </div>
          <div class="metric-icon-box metric-icon-primary">
            <i data-lucide="cpu"></i>
          </div>
        </div>

        <!-- Thẻ 2: Đang mượn -->
        <div class="metric-card stagger-item stagger-delay-2">
          <div class="metric-info">
            <span class="metric-label">Đang mượn</span>
            <div class="metric-value-wrapper">
              <span id="metric-borrowed-count" class="metric-value tabular-nums">${borrowedUnits}</span>
              <span style="font-size: 15px; font-weight: 500; color: var(--color-text-secondary); margin-left: 4px;">món</span>
            </div>
            <span class="metric-sub">Tỷ lệ sử dụng kho: <strong>${borrowPercent}%</strong></span>
          </div>
          <div class="metric-icon-box metric-icon-warning">
            <i data-lucide="package-open"></i>
          </div>
        </div>

        <!-- Thẻ 3: Phiếu quá hạn (Có viền đỏ Pulse nếu tăng số phiếu) -->
        <div id="card-metric-overdue" class="metric-card stagger-item stagger-delay-3">
          <div class="metric-info">
            <span class="metric-label">Phiếu quá hạn</span>
            <div class="metric-value-wrapper">
              <span id="metric-overdue-count" class="metric-value tabular-nums" style="color: ${data.overdueRecords > 0 ? 'var(--color-danger)' : 'inherit'};">
                ${data.overdueRecords || 0}
              </span>
              <span style="font-size: 15px; font-weight: 500; color: var(--color-text-secondary); margin-left: 4px;">phiếu</span>
            </div>
            <span class="metric-sub" style="white-space: nowrap;">Phạt tạm tính: <strong class="tabular-nums" style="white-space: nowrap;">${formatVND(data.pendingFines)}</strong></span>
          </div>
          <div class="metric-icon-box metric-icon-danger">
            <i data-lucide="alert-triangle"></i>
          </div>
        </div>

        <!-- Thẻ 4: Hàng đợi đặt trước -->
        <div class="metric-card stagger-item stagger-delay-4">
          <div class="metric-info">
            <span class="metric-label">Hàng đợi đặt trước</span>
            <div class="metric-value-wrapper">
              <span id="metric-waiting-count" class="metric-value tabular-nums">${data.waitingPeople || 0}</span>
              <span style="font-size: 15px; font-weight: 500; color: var(--color-text-secondary); margin-left: 4px;">người</span>
            </div>
            <span class="metric-sub">${data.holdingPeople || 0} người đang được giữ 24h</span>
          </div>
          <div class="metric-icon-box metric-icon-success">
            <i data-lucide="clock"></i>
          </div>
        </div>
      </div>

      <!-- Khối chính 2 cột: Biểu đồ Top mượn & Danh sách sắp hết hạn giữ -->
      <div class="grid-cols-2">
        <!-- Cột 1: Biểu đồ CSS thuần Top thiết bị mượn nhiều nhất -->
        <div class="card stagger-item stagger-delay-5">
          <div class="card-header">
            <div class="card-title">
              <i data-lucide="bar-chart-2"></i> Top thiết bị mượn nhiều nhất
            </div>
            <a href="#/devices" class="btn btn-outline btn-sm">Xem tất cả</a>
          </div>
          <div class="card-body">
            ${topList.length === 0 ? `
              <div class="empty-state">
                <i data-lucide="inbox" class="empty-state-icon"></i>
                <div class="empty-state-title">Chưa có lượt mượn nào</div>
                <div class="empty-state-desc">Dữ liệu mượn trả sẽ hiển thị tại đây khi sinh viên phát sinh phiếu mượn.</div>
              </div>
            ` : `
              <div class="css-bar-chart">
                ${topList.map((item, idx) => {
                  const percent = Math.round((item.timesBorrowed / maxTimes) * 100);
                  const delayMs = idx * 60;
                  return `
                    <div class="css-bar-item">
                      <div class="css-bar-header">
                        <span><strong>${escapeHtml(item.name)}</strong> <code style="font-size: 11.5px; color: var(--color-text-muted);">${escapeHtml(item.id)}</code></span>
                        <span class="tabular-nums font-semibold">${item.timesBorrowed} lượt</span>
                      </div>
                      <div class="css-bar-track">
                        <div class="css-bar-fill css-bar-fill-animated" style="width: ${percent}%; animation-delay: ${delayMs}ms;"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Cột 2: Danh sách Sắp hết hạn giữ (< 6 giờ) -->
        <div class="card stagger-item stagger-delay-6">
          <div class="card-header">
            <div class="card-title">
              <i data-lucide="timer"></i> Sắp hết hạn giữ nhận (< 6 giờ)
            </div>
            <a href="#/reservations" class="btn btn-outline btn-sm">Xem hàng đợi</a>
          </div>
          <div class="card-body">
            ${expiringList.length === 0 ? `
              <div class="empty-state">
                <svg class="empty-state-icon svg-draw-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-success); width: 44px; height: 44px;">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <div class="empty-state-title">Không có lượt giữ nào sắp hết hạn</div>
                <div class="empty-state-desc">Tất cả sinh viên đang được giữ thiết bị còn nhiều hơn 6 giờ để đến nhận.</div>
              </div>
            ` : `
              <div class="expiring-list">
                ${expiringList.map(item => `
                  <div class="expiring-item">
                    <div class="expiring-meta">
                      <span class="expiring-device">${escapeHtml(item.deviceName)} <code style="font-size: 11px;">${escapeHtml(item.deviceId)}</code></span>
                      <span class="expiring-student">SV: <strong>${escapeHtml(item.studentName)}</strong> (${escapeHtml(item.studentId)})</span>
                      <span style="font-size: 11px; color: var(--color-text-muted);">Hạn nhận: ${escapeHtml(item.holdUntilText || '')}</span>
                    </div>
                    <div class="expiring-right">
                      <span class="expiring-badge">
                        <i data-lucide="hourglass" style="width: 13px; height: 13px;"></i>
                        Còn ${item.hoursLeft}h
                      </span>
                      <a href="#/reservations?id=${escapeHtml(item.deviceId)}" class="btn btn-secondary btn-sm" title="Mở hàng đợi thiết bị này">
                        Nhận
                      </a>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Kích hoạt Count-up và so sánh Delta
  const elDev = container.querySelector('#metric-device-count');
  const elBorrow = container.querySelector('#metric-borrowed-count');
  const elOverdue = container.querySelector('#metric-overdue-count');
  const elWait = container.querySelector('#metric-waiting-count');

  if (isUpdating && prevData) {
    if (elDev) animateCountUp(elDev, data.deviceCount || 0, 350, v => v, true);
    if (elBorrow) animateCountUp(elBorrow, borrowedUnits, 350, v => v, true);
    if (elOverdue) {
      animateCountUp(elOverdue, data.overdueRecords || 0, 350, v => v, true);
      // Nếu số phiếu quá hạn tăng sau khi tua, viền đỏ pulse 2 lần
      if ((data.overdueRecords || 0) > (prevData.overdueRecords || 0)) {
        const cardOverdue = container.querySelector('#card-metric-overdue');
        if (cardOverdue) triggerRedPulse(cardOverdue);
      }
    }
    if (elWait) animateCountUp(elWait, data.waitingPeople || 0, 350, v => v, true);
  } else {
    // Lần đầu tải: đếm từ 0 lên
    if (elDev) animateCountUp(elDev, data.deviceCount || 0, 350);
    if (elBorrow) animateCountUp(elBorrow, borrowedUnits, 350);
    if (elOverdue) animateCountUp(elOverdue, data.overdueRecords || 0, 350);
    if (elWait) animateCountUp(elWait, data.waitingPeople || 0, 350);
  }

  // Nút làm mới (Hiệu ứng xoay icon trong lúc fetch)
  const refreshBtn = container.querySelector('#btn-dashboard-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('i');
      if (icon) icon.classList.add('spin-loading');
      refreshBtn.disabled = true;
      try {
        await loadAndRender(container, true);
      } finally {
        if (icon) icon.classList.remove('spin-loading');
        refreshBtn.disabled = false;
      }
    });
  }
}

/**
 * Hàm render công khai của trang
 */
export async function render(container) {
  currentContainer = container;
  await loadAndRender(container, false);
}

/**
 * Hook tự động làm mới khi tua thời gian
 */
export async function onTimeAdvanced() {
  if (currentContainer && document.body.contains(currentContainer)) {
    try {
      const data = await api.get('/stats?within=6&top=5');
      renderContent(currentContainer, data, true);
    } catch (e) {
      console.warn('Không thể tự cập nhật Dashboard sau khi tua giờ:', e);
    }
  }
}
