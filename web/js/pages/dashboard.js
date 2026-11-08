/**
 * dashboard.js - Màn hình 1: Tổng quan Bento (Dashboard v2)
 * Kết nối API thật: GET /api/stats?within=25&top=5
 * Tích hợp Bento Grid 4->2->1 cột, SVG vòng đếm 24h, 4 KPI (count-up + delta +N/-N,
 * pulse đỏ 2 lần khi tăng quá hạn/phạt), Top 5 mượn nhiều và Hàng đợi giữ chỗ nổi bật.
 */

import { api } from '../api.js';
import { prefersReducedMotion } from '../ui/fx.js';
import { animateCountUp, triggerRedPulse } from '../ui/motion.js';
import { isHeroCollapsed, mountLabHero3D } from '../ui/lab-hero-3d.js';
import { showToast } from '../ui/toast.js';
import { navigateTo } from '../router.js';

const RING_RADIUS = 48;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

let currentContainer = null;
let lastStatsData = null;

// Định dạng tiền tệ VNĐ (không bao giờ ngắt dòng chữ đ)
function formatVND(amount) {
  if (amount === undefined || amount === null) return '0\u00A0đ';
  return Number(amount).toLocaleString('vi-VN') + '\u00A0đ';
}

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
 * Hiển thị khung chờ Bento Skeleton (tránh layout shift khi dữ liệu về)
 */
function renderSkeleton(container) {
  const heroCollapsed = isHeroCollapsed();
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title"><i data-lucide="layout-dashboard"></i> Tổng quan phòng Lab</h1>
          <div class="page-desc">Thống kê hoạt động, tình trạng kho thiết bị và hàng đợi giữ chỗ theo thời gian thực.</div>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-secondary btn-sm" disabled>
            <i data-lucide="refresh-cw" class="spin-loading"></i> Đang tải…
          </button>
        </div>
      </div>

      <div class="bento-grid ${heroCollapsed ? 'is-hero-collapsed' : ''}" aria-busy="true" aria-label="Đang tải dữ liệu Tổng quan">
        <div class="bento-span-3 skeleton bento-skeleton-hero ${heroCollapsed ? 'is-collapsed' : ''}"></div>
        <div class="bento-span-1 skeleton bento-skeleton-ring"></div>

        <div class="bento-span-1 skeleton skeleton-card"></div>
        <div class="bento-span-1 skeleton skeleton-card"></div>
        <div class="bento-span-1 skeleton skeleton-card"></div>
        <div class="bento-span-1 skeleton skeleton-card"></div>

        <div class="bento-card bento-span-2">
          <div class="card-header">
            <div class="card-title"><div class="skeleton bento-skeleton-wide-title"></div></div>
          </div>
          <div class="card-body">
            <div class="skeleton bento-skeleton-bar"></div>
            <div class="skeleton bento-skeleton-bar is-w85"></div>
            <div class="skeleton bento-skeleton-bar is-w70"></div>
            <div class="skeleton bento-skeleton-bar is-w55"></div>
          </div>
        </div>

        <div class="bento-card bento-span-2">
          <div class="card-header">
            <div class="card-title"><div class="skeleton bento-skeleton-wide-title"></div></div>
          </div>
          <div class="card-body">
            <div class="skeleton bento-skeleton-row"></div>
            <div class="skeleton bento-skeleton-row"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hiển thị trạng thái lỗi kết nối
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

      <div class="bento-card">
        <div class="card-body">
          <div class="error-state">
            <i data-lucide="wifi-off" class="error-state-icon"></i>
            <div class="error-state-title">Không thể tải dữ liệu Tổng quan</div>
            <div class="error-state-desc">${escapeHtml(errorMsg)}</div>
            <button id="btn-dashboard-retry" type="button" class="btn btn-primary btn-sm">
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
 * Chuẩn bị dữ liệu cho Thẻ Bento Vòng đếm ngược Hàng đợi 24h
 */
function buildQueueRingState(data, expiringList) {
  const holdingPeople = Number(data.holdingPeople) || 0;
  const waitingPeople = Number(data.waitingPeople) || 0;
  const leadHold = expiringList.length > 0 ? expiringList[0] : null;

  if (leadHold) {
    const hoursLeft = Math.max(0, Number(leadHold.hoursLeft) || 0);
    const isUrgent = hoursLeft <= 6;
    const ratio = Math.max(0, Math.min(1, hoursLeft / 24));
    const dashOffset = (RING_CIRCUMFERENCE * (1 - ratio)).toFixed(2);
    return {
      leadHold,
      glow: isUrgent ? 'maintenance' : 'onhold',
      pillClass: isUrgent ? 'is-danger' : 'is-onhold',
      pillIcon: isUrgent ? 'alert-triangle' : 'clock',
      pillText: isUrgent ? 'Sắp hết' : 'Đang giữ',
      ringClass: isUrgent ? 'is-urgent' : '',
      valueClass: isUrgent ? 'is-urgent' : '',
      centerValue: `${hoursLeft}h`,
      centerUnit: '/ 24h',
      dashOffset,
      deviceLine: `${leadHold.deviceId} · ${leadHold.deviceName}`,
      studentLine: `${leadHold.studentName} (${leadHold.studentId})`,
      countsHtml: `<span class="metric-phrase">Đang giữ: <strong class="tabular-nums">${holdingPeople}</strong></span> · <span class="metric-phrase">Đang chờ: <strong class="tabular-nums">${waitingPeople}</strong></span>`,
      ctaHref: `#/reservations?id=${encodeURIComponent(leadHold.deviceId)}`,
      ctaText: 'Xử lý nhận ngay',
      ariaLabel: `Vòng đếm ngược 24 giờ cho ${leadHold.deviceName}, còn ${hoursLeft} giờ`,
    };
  }

  if (holdingPeople > 0) {
    return {
      leadHold: null,
      glow: 'onhold',
      pillClass: 'is-onhold',
      pillIcon: 'clock',
      pillText: 'Đang giữ',
      ringClass: '',
      valueClass: '',
      centerValue: `${holdingPeople}`,
      centerUnit: 'đang giữ',
      dashOffset: '0',
      deviceLine: 'Đang có lượt giữ chỗ 24h',
      studentLine: `${waitingPeople} sinh viên trong hàng đợi`,
      countsHtml: `<span class="metric-phrase">Đang giữ: <strong class="tabular-nums">${holdingPeople}</strong></span> · <span class="metric-phrase">Đang chờ: <strong class="tabular-nums">${waitingPeople}</strong></span>`,
      ctaHref: '#/reservations',
      ctaText: 'Xem hàng đợi',
      ariaLabel: `Đang giữ chỗ 24 giờ cho ${holdingPeople} sinh viên`,
    };
  }

  if (waitingPeople > 0) {
    const dashOffset = (RING_CIRCUMFERENCE * 0.72).toFixed(2);
    return {
      leadHold: null,
      glow: 'borrowed',
      pillClass: 'is-borrowed',
      pillIcon: 'users',
      pillText: 'Xếp hàng',
      ringClass: 'is-waiting',
      valueClass: '',
      centerValue: `${waitingPeople}`,
      centerUnit: 'người chờ',
      dashOffset,
      deviceLine: 'Chưa có lượt giữ 24h',
      studentLine: 'Đang chờ thiết bị được trả về kho',
      countsHtml: `<span class="metric-phrase">Đang giữ: <strong class="tabular-nums">0</strong></span> · <span class="metric-phrase">Đang chờ: <strong class="tabular-nums">${waitingPeople}</strong></span>`,
      ctaHref: '#/reservations',
      ctaText: 'Xem hàng đợi',
      ariaLabel: `Có ${waitingPeople} sinh viên đang xếp hàng chờ thiết bị`,
    };
  }

  return {
    leadHold: null,
    glow: 'available',
    pillClass: 'is-available',
    pillIcon: 'check-circle-2',
    pillText: 'Trống',
    ringClass: 'is-idle',
    valueClass: '',
    centerValue: '0h',
    centerUnit: '/ 24h',
    dashOffset: RING_CIRCUMFERENCE.toFixed(2),
    deviceLine: 'Không có lượt giữ 24h',
    studentLine: 'Hàng đợi đặt trước hiện đang trống',
    countsHtml: '<span class="metric-phrase">Đang giữ: <strong class="tabular-nums">0</strong></span> · <span class="metric-phrase">Đang chờ: <strong class="tabular-nums">0</strong></span>',
    ctaHref: '#/reservations',
    ctaText: 'Mở hàng đợi',
    ariaLabel: 'Hàng đợi đặt trước hiện đang trống',
  };
}

/**
 * Tải dữ liệu từ API và hiển thị
 */
async function loadAndRender(container, isManualRefresh = false) {
  if (!isManualRefresh) {
    renderSkeleton(container);
  }

  try {
    const data = await api.get('/stats?within=25&top=5');
    renderContent(container, data, isManualRefresh);
  } catch (err) {
    renderError(container, err.message || 'Lỗi kết nối tới máy chủ');
  }
}

/**
 * Hiển thị dữ liệu hoàn chỉnh dạng Bento Grid với Animation
 */
function renderContent(container, data, isUpdating = false) {
  const prevData = lastStatsData;
  lastStatsData = data;

  const totalUnits = Number(data.totalUnits) || 0;
  const availableUnits = Number(data.available) || 0;
  const borrowedUnits = Number(data.borrowed) || 0;
  const onHoldUnits = Number(data.onHold) || 0;
  const maintenanceUnits = Number(data.maintenance) || 0;
  const openRecords = Number(data.openRecords) || 0;
  const overdueRecords = Number(data.overdueRecords) || 0;
  const pendingFines = Number(data.pendingFines) || 0;
  const waitingPeople = Number(data.waitingPeople) || 0;
  const holdingPeople = Number(data.holdingPeople) || 0;

  const borrowPercent = totalUnits > 0 ? Math.round((borrowedUnits / totalUnits) * 100) : 0;
  const denom = Math.max(totalUnits, 1);
  const pctAvail = ((availableUnits / denom) * 100).toFixed(2);
  const pctBorrow = ((borrowedUnits / denom) * 100).toFixed(2);
  const pctHold = ((onHoldUnits / denom) * 100).toFixed(2);
  const pctMaint = ((maintenanceUnits / denom) * 100).toFixed(2);

  const topList = Array.isArray(data.topBorrowed) ? data.topBorrowed : [];
  const maxTimes = topList.length > 0 ? Math.max(...topList.map((t) => Number(t.timesBorrowed) || 0), 1) : 1;

  const allHolds = Array.isArray(data.expiringHolds) ? data.expiringHolds : [];
  const featuredHolds = allHolds.slice(0, 5);
  const urgentCount = allHolds.filter((h) => (Number(h.hoursLeft) || 0) <= 6).length;

  const ring = buildQueueRingState(data, allHolds);
  const stagger = (idx) => (isUpdating ? '' : `stagger-item stagger-delay-${idx}`);
  const heroCollapsed = isHeroCollapsed();

  // Thông tin giữ hàng thu gọn trên thanh banner khi Hero đóng (icon đồng hồ cát + mã thiết bị + giờ còn + nút Xử lý)
  const leadHold = allHolds.length > 0 ? allHolds[0] : null;
  let leadHoldSnippetHtml = '';
  if (leadHold) {
    const leadHoursLeft = Math.max(0, Number(leadHold.hoursLeft) || 0);
    const isLeadUrgent = leadHoursLeft <= 6;
    leadHoldSnippetHtml = `
      <div class="hero-collapsed-hold ${isLeadUrgent ? 'is-urgent' : ''}" title="${escapeHtml(leadHold.deviceName)} — Còn ${leadHoursLeft} giờ giữ thiết bị">
        <i data-lucide="hourglass" class="hero-collapsed-hold-icon" aria-hidden="true"></i>
        <span class="hero-collapsed-hold-text">
          <strong>${escapeHtml(leadHold.deviceId)}</strong> · còn <span class="tabular-nums">${leadHoursLeft}h</span>/24h
        </span>
        <a
          href="#/reservations?id=${encodeURIComponent(leadHold.deviceId)}"
          class="btn btn-secondary btn-xs hero-collapsed-hold-btn"
          title="Mở hàng đợi ${escapeHtml(leadHold.deviceId)} để xử lý"
        >
          Xử lý
        </a>
      </div>
    `;
  }

  let heroStatusClass = 'is-healthy';
  let heroStatusIcon = 'check-circle-2';
  let heroStatusText = `Kho thiết bị ổn định · ${availableUnits}/${totalUnits} đơn vị sẵn sàng`;
  if (overdueRecords > 0) {
    heroStatusClass = 'is-overdue';
    heroStatusIcon = 'alert-triangle';
    heroStatusText = `Cần chú ý: ${overdueRecords} phiếu đang quá hạn`;
  } else if (holdingPeople > 0) {
    heroStatusClass = 'is-holding';
    heroStatusIcon = 'clock';
    heroStatusText = `Đang giữ hàng 24h cho ${holdingPeople} sinh viên`;
  }

  container.innerHTML = `
    <div class="page">
      <!-- Tiêu đề & Nút thao tác -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="layout-dashboard"></i> Tổng quan phòng Lab
          </h1>
          <div class="page-desc">Thống kê hoạt động, tình trạng kho thiết bị và hàng đợi giữ chỗ theo thời gian thực.</div>
        </div>
        <div class="page-actions">
          <button id="btn-dashboard-refresh" type="button" class="btn btn-secondary btn-sm" title="Làm mới số liệu Tổng quan">
            <i data-lucide="refresh-cw"></i> Làm mới
          </button>
        </div>
      </div>

      <!-- Lưới Bento 4 -> 2 -> 1 cột -->
      <div class="bento-grid ${heroCollapsed ? 'is-hero-collapsed' : ''}">
        <!-- Hàng 1 · Cột 1–3 (hoặc cả hàng ~64px khi thu gọn): Thẻ giới thiệu + STM32 Blue Pill 3D -->
        <section
          id="dashboard-hero-3d"
          class="dashboard-hero-3d bento-span-3 ${heroCollapsed ? 'is-collapsed' : ''} ${stagger(1)}"
          aria-label="Không gian thực hành công nghệ Lab HCMUS"
        >
          <div class="dashboard-hero-header-row">
            <div class="dashboard-hero-header-left">
              <span class="hero-status-pill ${heroStatusClass}">
                <i data-lucide="${heroStatusIcon}" class="hero-status-icon"></i>
                <span>${escapeHtml(heroStatusText)}</span>
              </span>
              <span class="hero-collapsed-title">Phòng Lab Thực hành Nhúng &amp; Công nghệ — HCMUS</span>
            </div>

            <div class="dashboard-hero-header-actions">
              ${leadHoldSnippetHtml}
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
            </div>
          </div>

          <div class="dashboard-hero-collapsible" aria-hidden="${heroCollapsed ? 'true' : 'false'}">
            <div class="dashboard-hero-collapsible-inner">
              <div class="dashboard-hero-main">
                <div class="dashboard-hero-copy">
                  <h2 class="dashboard-hero-title">Phòng Lab Thực hành Nhúng &amp; Công nghệ — HCMUS</h2>
                  <div class="dashboard-hero-desc">
                    Quản lý danh mục thiết bị bằng <strong>Doubly Linked List</strong>, hàng đợi giữ chỗ 24h bằng <strong>Reservation Queue</strong> và gợi ý linh kiện mượn kèm qua <strong>Graph</strong>.
                  </div>
                  <div class="dashboard-hero-actions">
                    <a href="#/borrow" class="btn btn-primary btn-sm hero-btn-primary">
                      <i data-lucide="file-plus-2" class="hero-action-icon"></i>
                      <span>Lập phiếu mượn</span>
                    </a>
                    <a href="#/devices" class="btn btn-secondary btn-sm hero-btn-secondary" title="Xem danh mục thiết bị phòng Lab">
                      <i data-lucide="cpu" class="hero-action-icon"></i>
                      <span>Kho thiết bị</span>
                    </a>
                    <a href="#/graph" class="btn btn-outline btn-sm hero-btn-secondary" title="Mở đồ thị quan hệ mượn kèm">
                      <i data-lucide="network" class="hero-action-icon"></i>
                      <span>Đồ thị</span>
                    </a>
                  </div>
                </div>

                <div class="dashboard-hero-stage-wrap">
                  <div id="lab-hero-stage" class="lab-hero-stage" title="Board phát triển STM32F103 Blue Pill — Rê chuột để xoay nghiêng nhẹ &amp; phát sáng mạch">
                    <img
                      src="assets/stm32-bluepill.svg"
                      alt="Minh hoạ tĩnh board phát triển STM32F103 Blue Pill"
                      class="lab-hero-static-svg"
                      width="360"
                      height="164"
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Hàng 1 · Cột 4: Thẻ Hàng đợi có Vòng đếm ngược 24h -->
        <section
          class="bento-card bento-span-1 bento-queue-ring-card ${stagger(2)}"
          data-glow="${ring.glow}"
          aria-label="${escapeHtml(ring.ariaLabel)}"
        >
          <div class="bento-ring-header">
            <span class="bento-ring-title">
              <i data-lucide="hourglass" class="bento-ring-title-icon"></i>
              <span>Giữ hàng 24h</span>
            </span>
            <span class="bento-status-pill ${ring.pillClass}">
              <i data-lucide="${ring.pillIcon}" class="bento-status-pill-icon"></i>
              <span>${escapeHtml(ring.pillText)}</span>
            </span>
          </div>

          <div class="bento-ring-body">
            <div class="ring-countdown-wrap">
              <svg class="ring-svg" viewBox="0 0 120 120" width="106" height="106" aria-hidden="true">
                <circle class="ring-track" cx="60" cy="60" r="${RING_RADIUS}"></circle>
                <circle
                  class="ring-progress ${ring.ringClass}"
                  cx="60"
                  cy="60"
                  r="${RING_RADIUS}"
                  stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}"
                  stroke-dashoffset="${ring.dashOffset}"
                ></circle>
              </svg>
              <div class="ring-center">
                <span class="ring-value tabular-nums ${ring.valueClass}">${escapeHtml(ring.centerValue)}</span>
                <span class="ring-unit">${escapeHtml(ring.centerUnit)}</span>
              </div>
            </div>

            <div class="bento-ring-meta">
              <div class="bento-ring-device" title="${escapeHtml(ring.deviceLine)}">${escapeHtml(ring.deviceLine)}</div>
              <div class="bento-ring-student" title="${escapeHtml(ring.studentLine)}">${escapeHtml(ring.studentLine)}</div>
              <div class="bento-ring-counts">${ring.countsHtml}</div>
            </div>
          </div>

          <a href="${ring.ctaHref}" class="btn btn-secondary btn-sm bento-ring-cta">
            <span>${escapeHtml(ring.ctaText)}</span>
            <i data-lucide="arrow-right" class="hero-action-icon"></i>
          </a>
        </section>

        <!-- Hàng 2: 4 Thẻ Số liệu KPI (Mỗi thẻ 1 cột) -->
        <!-- KPI 1: Tổng thiết bị & thanh tỷ lệ kho 4 màu -->
        <div class="metric-card bento-kpi-card ${stagger(2)}" data-glow="available">
          <div class="metric-top">
            <div class="metric-info">
              <span class="metric-label">Tổng thiết bị</span>
              <div class="metric-value-wrapper">
                <span id="metric-device-count" class="metric-value tabular-nums">${data.deviceCount || 0}</span>
                <span class="metric-unit">mã</span>
              </div>
            </div>
            <div class="metric-icon-box metric-icon-primary">
              <i data-lucide="cpu"></i>
            </div>
          </div>
          <div class="metric-footer">
            <div class="metric-sub">
              <span class="metric-phrase"><strong class="tabular-nums">${totalUnits}</strong> đơn vị</span> ·
              <span class="metric-phrase"><strong class="tabular-nums">${availableUnits}</strong> sẵn sàng</span> ·
              <span class="metric-phrase"><strong class="tabular-nums">${maintenanceUnits}</strong> bảo trì</span>
            </div>
            <div class="metric-bottom-slot kpi-stock-visual">
              <div class="progress-bar-tooltip-wrap">
                <div class="progress-bar-hover-tip" role="tooltip">
                  Sẵn sàng: ${availableUnits} · Đang mượn: ${borrowedUnits}${onHoldUnits > 0 ? ` · Giữ 24h: ${onHoldUnits}` : ''} · Bảo trì: ${maintenanceUnits}
                </div>
                <div
                  class="progress-bar-multi"
                  role="img"
                  aria-label="Phân bổ kho: ${availableUnits} sẵn sàng, ${borrowedUnits} đang mượn, ${onHoldUnits} đang giữ 24h, ${maintenanceUnits} bảo trì"
                >
                  <div class="progress-segment segment-available" style="width: ${pctAvail}%;" title="Sẵn sàng: ${availableUnits} đơn vị (${Math.round(Number(pctAvail))}%)"></div>
                  <div class="progress-segment segment-borrowed" style="width: ${pctBorrow}%;" title="Đang mượn: ${borrowedUnits} đơn vị (${Math.round(Number(pctBorrow))}%)"></div>
                  <div class="progress-segment segment-onhold" style="width: ${pctHold}%;" title="Đang giữ 24h: ${onHoldUnits} đơn vị (${Math.round(Number(pctHold))}%)"></div>
                  <div class="progress-segment segment-maintenance" style="width: ${pctMaint}%;" title="Bảo trì: ${maintenanceUnits} đơn vị (${Math.round(Number(pctMaint))}%)"></div>
                </div>
              </div>
              <div class="progress-legend" aria-label="Chú thích thanh trạng thái kho">
                <span class="progress-legend-item" title="Thiết bị sẵn sàng cho mượn">
                  <span class="progress-legend-dot is-available" aria-hidden="true"></span>
                  <span>Sẵn sàng</span>
                </span>
                <span class="progress-legend-item" title="Thiết bị đang có sinh viên mượn">
                  <span class="progress-legend-dot is-borrowed" aria-hidden="true"></span>
                  <span>Đang mượn</span>
                </span>
                ${onHoldUnits > 0 ? `
                <span class="progress-legend-item" title="Đang giữ cho sinh viên trong hàng đợi">
                  <span class="progress-legend-dot is-onhold" aria-hidden="true"></span>
                  <span>Giữ 24h</span>
                </span>` : ''}
                <span class="progress-legend-item" title="Thiết bị đang bảo trì, tạm ngưng mượn">
                  <span class="progress-legend-dot is-maintenance" aria-hidden="true"></span>
                  <span>Bảo trì</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- KPI 2: Đang mượn -->
        <div class="metric-card bento-kpi-card ${stagger(3)}" data-glow="borrowed">
          <div class="metric-top">
            <div class="metric-info">
              <span class="metric-label">Đang mượn</span>
              <div class="metric-value-wrapper">
                <span id="metric-borrowed-count" class="metric-value tabular-nums">${borrowedUnits}</span>
                <span class="metric-unit">món</span>
              </div>
            </div>
            <div class="metric-icon-box metric-icon-warning">
              <i data-lucide="package-open"></i>
            </div>
          </div>
          <div class="metric-footer">
            <div class="metric-sub">
              <span class="metric-phrase">Đang mở: <strong id="metric-open-records" class="tabular-nums">${openRecords}</strong> phiếu</span> ·
              <span class="metric-phrase">Tỷ lệ dùng: <strong class="tabular-nums">${borrowPercent}%</strong></span>
            </div>
            <div class="metric-bottom-slot">
              <div class="metric-mini-bar" aria-hidden="true" title="Tỷ lệ sử dụng kho: ${borrowPercent}%">
                <div class="metric-mini-fill-borrowed" style="width: ${borrowPercent}%;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- KPI 3: Hàng đợi đặt trước -->
        <div class="metric-card bento-kpi-card ${stagger(4)}" data-glow="${holdingPeople > 0 ? 'onhold' : 'available'}">
          <div class="metric-top">
            <div class="metric-info">
              <span class="metric-label">Hàng đợi đặt trước</span>
              <div class="metric-value-wrapper">
                <span id="metric-waiting-count" class="metric-value tabular-nums">${waitingPeople}</span>
                <span class="metric-unit">người</span>
              </div>
            </div>
            <div class="metric-icon-box metric-icon-accent">
              <i data-lucide="clock"></i>
            </div>
          </div>
          <div class="metric-footer">
            <div class="metric-sub">
              <span class="metric-phrase"><strong class="tabular-nums">${holdingPeople}</strong> đang giữ 24h</span> ·
              <span class="metric-phrase"><strong class="tabular-nums">${onHoldUnits}</strong> đơn vị giữ</span>
            </div>
            <div class="metric-badge-row">
              <span class="bento-status-pill ${holdingPeople > 0 ? 'is-onhold' : 'is-available'}">
                <i data-lucide="${holdingPeople > 0 ? 'bell-ring' : 'check-circle-2'}" class="bento-status-pill-icon"></i>
                <span>${holdingPeople > 0 ? 'Có giữ chỗ' : 'Ổn định'}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- KPI 4: Quá hạn & Phạt (Click mở #/records?status=overdue, Pulse đỏ 2 lần khi tăng) -->
        <div
          id="card-metric-overdue"
          class="metric-card bento-kpi-card metric-card-clickable ${overdueRecords > 0 ? 'is-overdue-active' : ''} ${stagger(5)}"
          data-glow="${overdueRecords > 0 ? 'maintenance' : 'available'}"
          role="link"
          tabindex="0"
          aria-label="Phiếu quá hạn: ${overdueRecords} phiếu, phạt tạm tính ${formatVND(pendingFines)}. Bấm để xem chi tiết."
          title="Bấm để xem danh sách các phiếu mượn quá hạn"
        >
          <div class="metric-top">
            <div class="metric-info">
              <span class="metric-label">
                <span>Quá hạn &amp; Phạt</span>
                <i data-lucide="arrow-up-right" class="metric-label-arrow"></i>
              </span>
              <div class="metric-value-wrapper">
                <span id="metric-overdue-count" class="metric-value tabular-nums ${overdueRecords > 0 ? 'is-danger' : ''}">${overdueRecords}</span>
                <span class="metric-unit">phiếu</span>
              </div>
            </div>
            <div class="metric-icon-box ${overdueRecords > 0 ? 'metric-icon-danger' : 'metric-icon-success'}">
              <i data-lucide="${overdueRecords > 0 ? 'alert-triangle' : 'shield-check'}"></i>
            </div>
          </div>
          <div class="metric-footer">
            <div class="metric-sub metric-fine-sub">
              <span class="metric-fine-label">Phạt tạm tính:</span>
              <strong id="metric-pending-fines" class="metric-fine-value tabular-nums ${pendingFines > 0 ? 'is-danger' : ''}" title="${formatVND(pendingFines)}">${formatVND(pendingFines)}</strong>
            </div>
            <div class="metric-badge-row">
              <span class="bento-status-pill ${overdueRecords > 0 ? 'is-danger' : 'is-available'}">
                <i data-lucide="${overdueRecords > 0 ? 'alert-circle' : 'check-circle-2'}" class="bento-status-pill-icon"></i>
                <span>${overdueRecords > 0 ? 'Đang quá hạn' : 'Đúng hạn'}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Hàng 3 · Cột 1–2: Bento rộng Top thiết bị mượn nhiều nhất -->
        <section class="bento-card bento-span-2 ${stagger(6)}" aria-label="Top thiết bị mượn nhiều nhất">
          <div class="card-header">
            <div class="bento-card-title-wrap">
              <div class="card-title">
                <i data-lucide="bar-chart-2"></i> Top thiết bị mượn nhiều nhất
              </div>
              <div class="bento-card-header-meta">Thống kê 5 thiết bị có lượt mượn cao nhất trong phòng Lab</div>
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
                  const tooltipLeft = `clamp(0px, calc(${percent}% - 28px), calc(100% - 64px))`;
                  return `
                    <div class="css-bar-item">
                      <div class="css-bar-header">
                        <div class="css-bar-title-group">
                          <span class="css-bar-rank ${idx === 0 ? 'is-top-1' : ''}">#${idx + 1}</span>
                          <span class="css-bar-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                          <code class="device-code-chip">${escapeHtml(item.id)}</code>
                        </div>
                        <span class="top-bar-count" data-device-id="${escapeHtml(item.id)}" data-count="${borrowCount}" data-delay="${delayMs}">${borrowCount} lượt</span>
                      </div>
                      <div class="css-bar-track-wrap">
                        <span class="css-bar-tooltip" style="left: ${tooltipLeft};" role="tooltip">${borrowCount} lượt</span>
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
        </section>

        <!-- Hàng 3 · Cột 3–4: Bento rộng Hàng đợi nổi bật -->
        <section class="bento-card bento-span-2 ${stagger(7)}" aria-label="Hàng đợi giữ chỗ 24h nổi bật">
          <div class="card-header">
            <div class="bento-card-title-wrap">
              <div class="card-title">
                <i data-lucide="timer"></i> Hàng đợi nổi bật
              </div>
              <div class="bento-card-header-meta">
                ${allHolds.length > 0
                  ? `${allHolds.length} lượt đang giữ 24h${urgentCount > 0 ? ` · ${urgentCount} lượt sắp hết hạn (≤ 6h)` : ''}`
                  : 'Theo dõi các lượt giữ chỗ 24h sắp đến hạn nhận thiết bị'}
              </div>
            </div>
            <a href="#/reservations" class="btn btn-outline btn-sm">Xem hàng đợi</a>
          </div>
          <div class="card-body">
            ${featuredHolds.length === 0 ? `
              <div class="empty-state">
                <svg class="empty-state-icon is-success svg-draw-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <div class="empty-state-title">Chưa có lượt giữ 24h đang hoạt động</div>
                <div class="empty-state-desc">Khi có thiết bị được trả cho sinh viên trong hàng đợi, đồng hồ giữ chỗ 24 giờ sẽ hiển thị tại đây.</div>
              </div>
            ` : `
              <div class="expiring-list">
                ${featuredHolds.map((item) => {
                  const hoursLeft = Math.max(0, Number(item.hoursLeft) || 0);
                  const isUrgent = hoursLeft <= 6;
                  const missCount = Number(item.missCount) || 0;
                  return `
                    <div class="expiring-item" data-glow="${isUrgent ? 'maintenance' : 'onhold'}">
                      <div class="expiring-left">
                        <div class="expiring-thumb ${isUrgent ? 'is-urgent' : ''}" aria-hidden="true">
                          <i data-lucide="${isUrgent ? 'alert-circle' : 'clock'}"></i>
                        </div>
                        <div class="expiring-meta">
                          <div class="expiring-device">
                            <span>${escapeHtml(item.deviceName)}</span>
                            <code class="device-code-chip">${escapeHtml(item.deviceId)}</code>
                          </div>
                          <div class="expiring-student">
                            SV: <strong>${escapeHtml(item.studentName)}</strong> (${escapeHtml(item.studentId)})
                          </div>
                          <div class="expiring-deadline">
                            Hạn nhận: ${escapeHtml(item.holdUntilText || 'Đang cập nhật')} · Lỡ hạn: ${missCount}/2
                          </div>
                        </div>
                      </div>
                      <div class="expiring-right">
                        <span class="expiring-badge ${isUrgent ? 'is-urgent' : ''}">
                          <i data-lucide="${isUrgent ? 'alert-triangle' : 'hourglass'}" class="expiring-badge-icon"></i>
                          <span>${isUrgent ? `Sắp hết · ${hoursLeft}h` : `Giữ 24h · ${hoursLeft}h`}</span>
                        </span>
                        <a
                          href="#/reservations?id=${encodeURIComponent(item.deviceId)}"
                          class="btn btn-secondary btn-sm"
                          title="Mở hàng đợi ${escapeHtml(item.deviceId)} để nhận hoặc xử lý"
                        >
                          Xử lý
                        </a>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        </section>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Khởi chạy / cập nhật mô hình 3D Board STM32F103 Blue Pill ở đầu trang
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
  const elOpenRec = container.querySelector('#metric-open-records');
  const elOverdue = container.querySelector('#metric-overdue-count');
  const elWait = container.querySelector('#metric-waiting-count');
  const elFines = container.querySelector('#metric-pending-fines');

  if (prevData) {
    if (elDev) {
      elDev._lastValue = prevData.deviceCount || 0;
      animateCountUp(elDev, data.deviceCount || 0, 360, (v) => v, true);
    }
    if (elBorrow) {
      elBorrow._lastValue = prevData.borrowed || 0;
      animateCountUp(elBorrow, borrowedUnits, 360, (v) => v, true);
    }
    if (elOpenRec) {
      elOpenRec._lastValue = prevData.openRecords || 0;
      animateCountUp(elOpenRec, openRecords, 360, (v) => v, false);
    }
    if (elOverdue) {
      elOverdue._lastValue = prevData.overdueRecords || 0;
      animateCountUp(elOverdue, overdueRecords, 360, (v) => v, true);
    }
    if (elWait) {
      elWait._lastValue = prevData.waitingPeople || 0;
      animateCountUp(elWait, waitingPeople, 360, (v) => v, true);
    }
    if (elFines) {
      elFines._lastValue = prevData.pendingFines || 0;
      animateCountUp(elFines, pendingFines, 360, formatVND, false);
    }

    // Tua giờ khiến số phiếu quá hạn hoặc tiền phạt tăng -> nháy viền đỏ đúng 2 lần
    const overdueIncreased = overdueRecords > (prevData.overdueRecords || 0);
    const finesIncreased = pendingFines > (prevData.pendingFines || 0);
    if ((overdueIncreased || finesIncreased) && cardOverdue) {
      triggerRedPulse(cardOverdue);
    }
  } else {
    // Lần đầu tiên trong phiên: đếm từ 0 lên
    if (elDev) animateCountUp(elDev, data.deviceCount || 0, 360);
    if (elBorrow) animateCountUp(elBorrow, borrowedUnits, 360);
    if (elOpenRec) elOpenRec._lastValue = openRecords;
    if (elOverdue) animateCountUp(elOverdue, overdueRecords, 360);
    if (elWait) animateCountUp(elWait, waitingPeople, 360);
    if (elFines) elFines._lastValue = pendingFines;
  }

  // Hiệu ứng đếm số lượt mượn lên đồng bộ theo stagger của Top mượn nhiều
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
      animateCountUp(countEl, targetCount, 360, formatLuot, false);
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

  // Nút làm mới số liệu Tổng quan
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
      const data = await api.get('/stats?within=25&top=5');
      renderContent(currentContainer, data, true);
    } catch (e) {
      console.warn('Không thể tự cập nhật Dashboard sau khi tua giờ:', e);
    }
  }
}
