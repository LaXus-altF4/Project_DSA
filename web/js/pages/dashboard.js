/**
 * dashboard.js - Màn hình 1: Tổng quan (Dashboard)
 * Kết nối API thật: GET /api/stats?within=6&top=5
 * Tích hợp hệ thống animation 60fps (stagger, count-up, diff floating delta, pulse, bar fill)
 */

import { api } from '../api.js';
import { prefersReducedMotion } from '../ui/fx.js';
import { animateCountUp, triggerRedPulse } from '../ui/motion.js';
import { isHeroCollapsed, mountLabHero3D } from '../ui/lab-hero-3d.js';
import { showToast } from '../ui/toast.js';
import { navigateTo } from '../router.js';

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
  const stagger = (idx) => (isUpdating ? '' : `stagger-item stagger-delay-${idx}`);
  const heroCollapsed = isHeroCollapsed();

  let heroStatusClass = 'is-healthy';
  let heroStatusText = `Kho thiết bị ổn định • ${data.available || 0}/${totalUnits} đơn vị sẵn sàng`;
  if ((data.overdueRecords || 0) > 0) {
    heroStatusClass = 'is-overdue';
    heroStatusText = `Cần chú ý: ${data.overdueRecords} phiếu đang quá hạn`;
  } else if ((data.holdingPeople || 0) > 0) {
    heroStatusClass = 'is-holding';
    heroStatusText = `Đang giữ hàng 24h cho ${data.holdingPeople} sinh viên`;
  }

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

      <!-- Khối giới thiệu đầu trang: Mô hình 3D Board STM32F103 "Blue Pill" (Đợt B.1, có thể thu gọn; tắt 3D hiện SVG tĩnh) -->
      <section
        id="dashboard-hero-3d"
        class="dashboard-hero-3d ${heroCollapsed ? 'is-collapsed' : ''} ${isUpdating ? '' : 'stagger-item stagger-delay-1'}"
        aria-label="Không gian thực hành công nghệ Lab HCMUS"
      >
        <div class="dashboard-hero-main">
          <div class="dashboard-hero-copy">
            <div class="dashboard-hero-topline">
              <span class="hero-status-pill ${heroStatusClass}">
                <span class="hero-status-dot"></span>
                <span>${escapeHtml(heroStatusText)}</span>
              </span>
            </div>
            <div class="dashboard-hero-title">Phòng Lab Thực hành Nhúng & Công nghệ — HCMUS</div>
            <div class="dashboard-hero-desc">
              Quản lý danh mục thiết bị bằng <strong>Doubly Linked List</strong>, hàng đợi giữ chỗ 24h bằng <strong>Reservation Queue</strong> và gợi ý linh kiện mượn kèm thông minh qua <strong>Graph</strong>.
            </div>
            <div class="dashboard-hero-actions">
              <a href="#/borrow" class="btn btn-primary btn-sm">
                <i data-lucide="file-plus-2" style="width: 14px; height: 14px;"></i>
                <span>Lập phiếu mượn</span>
              </a>
              <a href="#/graph" class="btn btn-outline btn-sm">
                <i data-lucide="network" style="width: 14px; height: 14px;"></i>
                <span>Đồ thị mượn kèm</span>
              </a>
            </div>
          </div>

          <div class="dashboard-hero-stage-wrap">
            <div id="lab-hero-stage" class="lab-hero-stage" title="Board phát triển STM32F103 Blue Pill — Rê chuột để xoay nghiêng nhẹ & phát sáng mạch">
              <img
                src="assets/stm32-bluepill.svg"
                alt="Minh hoạ tĩnh board phát triển STM32F103 Blue Pill"
                class="lab-hero-static-svg"
                width="300"
                height="136"
              >
            </div>
          </div>
        </div>

        <button
          id="btn-toggle-hero-3d"
          type="button"
          class="hero-collapse-btn"
          aria-expanded="${heroCollapsed ? 'false' : 'true'}"
          title="Thu gọn hoặc mở rộng thẻ giới thiệu phòng Lab"
        >
          <span class="hero-collapse-label">${heroCollapsed ? 'Mở giới thiệu' : 'Thu gọn'}</span>
          <svg class="hero-collapse-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </section>

      <!-- 4 Thẻ Số liệu Thống kê (Xuất hiện lần lượt - Stagger 60ms) -->
      <div class="grid-cols-4">
        <!-- Thẻ 1: Tổng thiết bị -->
        <div class="metric-card ${stagger(1)}" data-glow="onhold">
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
        <div class="metric-card ${stagger(2)}" data-glow="borrowed">
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

        <!-- Thẻ 3: Phiếu quá hạn (Có viền đỏ Pulse nếu tăng số phiếu, bấm mở #/records?status=overdue) -->
        <div id="card-metric-overdue" class="metric-card metric-card-clickable ${data.overdueRecords > 0 ? 'is-overdue-active' : ''} ${stagger(3)}" data-glow="${data.overdueRecords > 0 ? 'maintenance' : 'available'}" role="link" tabindex="0" title="Bấm để xem danh sách các phiếu mượn quá hạn">
          <div class="metric-info">
            <span class="metric-label" style="display: inline-flex; align-items: center; gap: 4px;">
              <span>Phiếu quá hạn</span>
              <i data-lucide="arrow-up-right" style="width: 13px; height: 13px; opacity: 0.7;"></i>
            </span>
            <div class="metric-value-wrapper">
              <span id="metric-overdue-count" class="metric-value tabular-nums" style="color: ${data.overdueRecords > 0 ? 'var(--color-danger)' : 'inherit'};">
                ${data.overdueRecords || 0}
              </span>
              <span style="font-size: 15px; font-weight: 500; color: var(--color-text-secondary); margin-left: 4px;">phiếu</span>
            </div>
            <span class="metric-sub" style="white-space: nowrap;">Phạt tạm tính: <strong id="metric-pending-fines" class="tabular-nums" style="white-space: nowrap;">${formatVND(data.pendingFines)}</strong></span>
          </div>
          <div class="metric-icon-box metric-icon-danger">
            <i data-lucide="alert-triangle"></i>
          </div>
        </div>

        <!-- Thẻ 4: Hàng đợi đặt trước -->
        <div class="metric-card ${stagger(4)}" data-glow="${(data.holdingPeople || 0) > 0 ? 'onhold' : 'available'}">
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
        <div class="card ${stagger(5)}">
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
                  const borrowCount = Number(item.timesBorrowed) || 0;
                  const percent = Math.round((borrowCount / maxTimes) * 100);
                  const delayMs = isUpdating ? 0 : idx * 70;
                  const tooltipLeft = `clamp(0px, calc(${percent}% - 26px), calc(100% - 54px))`;
                  return `
                    <div class="css-bar-item">
                      <div class="css-bar-header">
                        <span><strong>${escapeHtml(item.name)}</strong> <code style="font-size: 11.5px; color: var(--color-text-muted);">${escapeHtml(item.id)}</code></span>
                        <span class="top-bar-count tabular-nums font-semibold" data-device-id="${escapeHtml(item.id)}" data-count="${borrowCount}" data-delay="${delayMs}">${borrowCount} lượt</span>
                      </div>
                      <div class="css-bar-track-wrap">
                        <span class="css-bar-tooltip tabular-nums" style="left: ${tooltipLeft};" role="tooltip">${borrowCount} lượt</span>
                        <div class="css-bar-track">
                          <div class="css-bar-fill ${isUpdating ? '' : 'css-bar-fill-animated'}" style="width: ${percent}%; ${isUpdating ? '' : `animation-delay: ${delayMs}ms;`}"></div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Cột 2: Danh sách Sắp hết hạn giữ (< 6 giờ) -->
        <div class="card ${stagger(6)}">
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

  // Khởi chạy / cập nhật mô hình 3D Board STM32F103 Blue Pill ở đầu trang (Đợt B.1)
  mountLabHero3D(container);
  const cardOverdue = container.querySelector('#card-metric-overdue');
  if (cardOverdue) {
    const openOverdueRecords = () => navigateTo('#/records?status=overdue');
    cardOverdue.addEventListener('click', openOverdueRecords);
    cardOverdue.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openOverdueRecords();
      }
    });
  }

  // Kích hoạt Count-up và so sánh Delta (gán lại _lastValue từ prevData vì DOM vừa render mới)
  const elDev = container.querySelector('#metric-device-count');
  const elBorrow = container.querySelector('#metric-borrowed-count');
  const elOverdue = container.querySelector('#metric-overdue-count');
  const elWait = container.querySelector('#metric-waiting-count');
  const elFines = container.querySelector('#metric-pending-fines');

  if (prevData) {
    if (elDev) {
      elDev._lastValue = prevData.deviceCount || 0;
      animateCountUp(elDev, data.deviceCount || 0, 350, v => v, true);
    }
    if (elBorrow) {
      elBorrow._lastValue = prevData.borrowed || 0;
      animateCountUp(elBorrow, borrowedUnits, 350, v => v, true);
    }
    if (elOverdue) {
      elOverdue._lastValue = prevData.overdueRecords || 0;
      animateCountUp(elOverdue, data.overdueRecords || 0, 350, v => v, true);
      // Nếu số phiếu quá hạn tăng so với lần xem trước / trước khi tua, viền đỏ pulse 2 lần
      if ((data.overdueRecords || 0) > (prevData.overdueRecords || 0) && cardOverdue) {
        triggerRedPulse(cardOverdue);
      }
    }
    if (elWait) {
      elWait._lastValue = prevData.waitingPeople || 0;
      animateCountUp(elWait, data.waitingPeople || 0, 350, v => v, true);
    }
    if (elFines) {
      elFines._lastValue = prevData.pendingFines || 0;
      animateCountUp(elFines, data.pendingFines || 0, 350, formatVND, false);
    }
  } else {
    // Lần đầu tiên trong phiên: đếm từ 0 lên
    if (elDev) animateCountUp(elDev, data.deviceCount || 0, 350);
    if (elBorrow) animateCountUp(elBorrow, borrowedUnits, 350);
    if (elOverdue) animateCountUp(elOverdue, data.overdueRecords || 0, 350);
    if (elWait) animateCountUp(elWait, data.waitingPeople || 0, 350);
    if (elFines) elFines._lastValue = data.pendingFines || 0;
  }

  // Hiệu ứng đếm số lượt mượn lên (Count-up) đồng bộ theo stagger của biểu đồ thanh Top mượn
  const prevTopMap = new Map(
    prevData && Array.isArray(prevData.topBorrowed)
      ? prevData.topBorrowed.map((it) => [String(it.id), Number(it.timesBorrowed) || 0])
      : []
  );
  const reducedMotion = prefersReducedMotion();
  container.querySelectorAll('.top-bar-count').forEach((countEl) => {
    const targetCount = Number(countEl.dataset.count) || 0;
    const delayMs = Number(countEl.dataset.delay) || 0;
    const devId = countEl.dataset.deviceId || '';
    const formatLuot = (v) => `${v} lượt`;

    if (prevData) {
      countEl._lastValue = prevTopMap.has(devId) ? prevTopMap.get(devId) : targetCount;
      animateCountUp(countEl, targetCount, 350, formatLuot, false);
    } else if (!reducedMotion && targetCount > 0) {
      countEl._lastValue = 0;
      countEl.textContent = '0 lượt';
      if (delayMs > 0) {
        window.setTimeout(() => {
          if (countEl.isConnected) {
            animateCountUp(countEl, targetCount, 380, formatLuot, false);
          }
        }, delayMs);
      } else {
        animateCountUp(countEl, targetCount, 380, formatLuot, false);
      }
    } else {
      countEl._lastValue = targetCount;
      countEl.textContent = formatLuot(targetCount);
    }
  });

  // Nút làm mới (Hiệu ứng xoay icon SVG trong lúc fetch)
  const refreshBtn = container.querySelector('#btn-dashboard-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('svg, i');
      if (icon) icon.classList.add('spin-loading');
      refreshBtn.disabled = true;
      try {
        await loadAndRender(container, true);
        showToast('Đã cập nhật số liệu Tổng quan', 'info', '', 2000);
      } finally {
        setTimeout(() => {
          if (icon) icon.classList.remove('spin-loading');
          refreshBtn.disabled = false;
        }, 300);
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
