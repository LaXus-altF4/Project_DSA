/**
 * router.js - Bộ định tuyến SPA dựa trên Hash (#/route)
 */

import * as DashboardPage from './pages/dashboard.js';
import * as DevicesPage from './pages/devices.js';
import * as BorrowPage from './pages/borrow.js';
import * as ReturnPage from './pages/return.js';
import * as ReservationsPage from './pages/reservations.js';
import * as RecordsPage from './pages/records.js';
import * as GraphPage from './pages/graph.js';
import { isMotionAllowed, prefersReducedMotion } from './ui/fx.js';

const ROUTES = {
  '#/dashboard': DashboardPage,
  '#/devices': DevicesPage,
  '#/borrow': BorrowPage,
  '#/return': ReturnPage,
  '#/reservations': ReservationsPage,
  '#/records': RecordsPage,
  '#/graph': GraphPage
};

const DEFAULT_ROUTE = '#/dashboard';
let currentRoute = null;
let routeAnimTimer = 0;
let routeNavSeq = 0;

export function getRoute() {
  const hash = window.location.hash || DEFAULT_ROUTE;
  const cleanHash = hash.split('?')[0];
  return ROUTES[cleanHash] ? cleanHash : DEFAULT_ROUTE;
}

export async function navigateTo(hash) {
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    await handleRouteChange();
  }
}

export async function handleRouteChange() {
  const route = getRoute();
  currentRoute = route;

  // Đóng panel trượt chi tiết thiết bị & dọn vòng lặp đồ thị nếu điều hướng sang route khác
  if (typeof DevicesPage.closeDevicePanel === 'function') {
    DevicesPage.closeDevicePanel();
  }
  if (route !== '#/graph' && typeof GraphPage.cleanupGraphResources === 'function') {
    GraphPage.cleanupGraphResources();
  }

  // Cập nhật liên kết active trên Sidebar
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
    const href = link.getAttribute('href');
    if (href === route) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  const container = document.getElementById('page-container');
  if (!container) return;

  const seq = ++routeNavSeq;
  if (routeAnimTimer) {
    window.clearTimeout(routeAnimTimer);
    routeAnimTimer = 0;
  }

  // Chuyển trang phối cảnh 3D (260ms) khi bật 3D (trừ #/graph giữ nguyên 2D);
  // Tắt 3D dùng .page-enter phẳng (200ms); prefers-reduced-motion chuyển tức thì.
  container.classList.remove('page-enter', 'page-perspective-active');
  void container.offsetWidth;

  const usePerspective = isMotionAllowed() && route !== '#/graph';
  if (!prefersReducedMotion()) {
    container.classList.add(usePerspective ? 'page-perspective-active' : 'page-enter');
  }

  const pageModule = ROUTES[route];
  if (pageModule && typeof pageModule.render === 'function') {
    try {
      await pageModule.render(container);
    } catch (err) {
      console.error(`Lỗi render trang ${route}:`, err);
      container.innerHTML = `
        <div class="card" style="margin-top: 20px;">
          <div class="card-body" style="color: var(--color-danger);">
            <h3>Đã xảy ra lỗi khi tải trang</h3>
            <p>${err.message || 'Lỗi không xác định'}</p>
          </div>
        </div>
      `;
    }
  }

  // Sau khi hoàn tất 260ms, gỡ class hiệu ứng để transform trở về none hoàn toàn
  if (seq === routeNavSeq) {
    const clearTransitionClasses = () => {
      container.classList.remove('page-enter', 'page-perspective-active');
    };
    const pageEl = container.querySelector('.page');
    if (pageEl && usePerspective) {
      pageEl.addEventListener(
        'animationend',
        (ev) => {
          if (ev.target === pageEl) clearTransitionClasses();
        },
        { once: true }
      );
    }
    routeAnimTimer = window.setTimeout(() => {
      routeAnimTimer = 0;
      if (seq === routeNavSeq) clearTransitionClasses();
    }, 280);
  }

  // Chỉ tạo icon cho các thẻ <i data-lucide> chưa được chuyển sang <svg>,
  // tránh thay thế các thẻ <svg> đang gắn sự kiện/hiệu ứng trên trang.
  if (
    window.lucide &&
    typeof window.lucide.createIcons === 'function' &&
    container.querySelector('i[data-lucide]')
  ) {
    window.lucide.createIcons({ nodes: [container] });
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);

  // Lắng nghe sự kiện tua thời gian để trang hiện tại có thể phản ứng nếu cần
  window.addEventListener('lab:time-advanced', (e) => {
    const pageModule = ROUTES[currentRoute];
    if (pageModule && typeof pageModule.onTimeAdvanced === 'function') {
      pageModule.onTimeAdvanced(e.detail);
    }
  });

  // Kích hoạt định tuyến ban đầu
  if (!window.location.hash || !ROUTES[window.location.hash.split('?')[0]]) {
    window.location.hash = DEFAULT_ROUTE;
  } else {
    handleRouteChange();
  }
}
