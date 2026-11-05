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

  // Hiệu ứng chuyển trang: fade + trượt lên 8px (200ms)
  container.classList.remove('page-enter');
  void container.offsetWidth;
  container.classList.add('page-enter');

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

  // Tái tạo lại Lucide icons nếu có
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
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
