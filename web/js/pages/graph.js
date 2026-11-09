/**
 * graph.js - Màn hình 7: Đồ thị mượn kèm (#/graph)
 * Tuân thủ web/DESIGN.md (mục 2 & 3.7), docs/api.md (mục 4.2 & 4.5) và AGENTS.md (quy tắc M17).
 *
 * Tính năng chính:
 * 1. Nạp dữ liệu đỉnh/cạnh từ GET /api/graph và vẽ bằng module tách rời ui/graph-renderer.js.
 * 2. Đỉnh = thiết bị (màu theo trạng thái, kích thước theo lượt mượn);
 *    Cạnh = quan hệ mượn kèm (độ dày theo trọng số, nhãn hiện khi weight >= 2 hoặc hover/chọn đỉnh).
 * 3. Mô phỏng lực ổn định xong tự tắt physics để đồ thị đứng yên; nút "Sắp xếp lại lực" bật lại tạm thời rồi tắt.
 * 4. Thanh trượt lọc "Chỉ hiện cạnh trọng số >= N".
 * 5. Bấm chọn đỉnh: làm mờ phần không liên quan, làm sáng các cạnh nối trực tiếp;
 *    Panel phải hiển thị thông tin thiết bị + Top 3 mượn kèm (gọi GET /api/suggestions/{id}?k=3)
 *    + nút "Xem hàng đợi" (#/reservations?id=...).
 * 6. Hỗ trợ đầy đủ giao diện Sáng / Tối, trạng thái Skeleton / Rỗng / Lỗi và ghi chú cho người chấm.
 */

import { api } from '../api.js';
import { createGraphRenderer, makeUndirectedEdgeKey } from '../ui/graph-renderer.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';

let currentContainer = null;
let graphRenderer = null;
let themeObserver = null;
let cleanupListenerBound = false;

let graphData = { nodes: [], edges: [] };
let currentMinWeight = 1;
let maxEdgeWeight = 1;
let lastSessionEdgeWeights = null;

let selectedNodeId = null;
let selectedDetailState = {
  loading: false,
  error: null,
  device: null,
  suggestions: []
};

let loadRequestSeq = 0;
let detailRequestSeq = 0;

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function getInitialNodeIdFromHash() {
  const hash = window.location.hash || '';
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  return params.get('id');
}

function getNodeDegreeStats(nodeId) {
  let totalNeighbors = 0;
  let visibleNeighbors = 0;
  let totalCoBorrows = 0;

  for (const e of graphData.edges) {
    if (e.from === nodeId || e.to === nodeId) {
      totalNeighbors += 1;
      totalCoBorrows += Number(e.weight) || 0;
      if ((Number(e.weight) || 0) >= currentMinWeight) {
        visibleNeighbors += 1;
      }
    }
  }

  return { totalNeighbors, visibleNeighbors, totalCoBorrows };
}

/**
 * Đối chiếu trọng số cạnh mới với phiên trước để phát hiện cạnh có trọng số thay đổi
 */
function diffAndRecordEdgeWeights(edges = []) {
  const nextMap = new Map();
  const changedKeys = [];

  for (const e of edges) {
    const key = makeUndirectedEdgeKey(e.from, e.to);
    const w = Number(e.weight) || 1;
    nextMap.set(key, w);
    if (lastSessionEdgeWeights !== null) {
      const oldW = lastSessionEdgeWeights.get(key);
      if (oldW === undefined || oldW !== w) {
        changedKeys.push(key);
      }
    }
  }

  lastSessionEdgeWeights = nextMap;
  return changedKeys;
}

/**
 * Dọn dẹp renderer & observer khi rời màn hình #/graph
 */
export function cleanupGraphResources() {
  if (graphRenderer) {
    graphRenderer.destroy();
    graphRenderer = null;
  }
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
}

function ensureRouteCleanupHook() {
  if (cleanupListenerBound) return;
  cleanupListenerBound = true;

  // Esc bỏ chọn đỉnh (không can thiệp khi modal đang mở hoặc đang gõ trong ô nhập)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !selectedNodeId || !currentContainer || !graphRenderer) return;
    if (document.getElementById('modal-backdrop')?.classList.contains('active')) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    handleSelectNode(null);
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '';
    const route = hash.split('?')[0];
    if (route !== '#/graph') {
      cleanupGraphResources();
      currentContainer = null;
    }
  });
}

function bindThemeObserver() {
  if (themeObserver) {
    themeObserver.disconnect();
  }
  themeObserver = new MutationObserver(() => {
    if (graphRenderer) {
      const nextTheme = document.documentElement.getAttribute('data-theme') || 'light';
      graphRenderer.setTheme(nextTheme);
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
}

/**
 * Nạp thư viện vis-network theo nhu cầu (chỉ khi vào #/graph) từ vendor cục bộ — vẫn offline 100%.
 */
let visLoadPromise = null;
function loadVisNetwork() {
  if (window.vis && typeof window.vis.Network === 'function') {
    return Promise.resolve(true);
  }
  if (!visLoadPromise) {
    visLoadPromise = new Promise((resolve, reject) => {
      const scriptEl = document.createElement('script');
      scriptEl.src = 'vendor/vis-network.min.js';
      scriptEl.async = true;
      scriptEl.onload = () => {
        if (window.vis && typeof window.vis.Network === 'function') {
          resolve(true);
        } else {
          reject(new Error('Thư viện vẽ đồ thị đã tải nhưng không khả dụng.'));
        }
      };
      scriptEl.onerror = () => {
        reject(new Error('Không tải được thư viện vẽ đồ thị (vendor/vis-network.min.js).'));
      };
      document.head.appendChild(scriptEl);
    }).catch((err) => {
      visLoadPromise = null; // Cho phép bấm "Thử lại"
      throw err;
    });
  }
  return visLoadPromise;
}

/**
 * Siêu dữ liệu trạng thái thiết bị: màu token + icon Lucide + chữ tiếng Việt (quy tắc M1)
 */
const STATUS_META = {
  available: { label: 'Sẵn sàng', icon: 'check-circle-2', badge: 'badge-available' },
  borrowed: { label: 'Đang mượn', icon: 'clock', badge: 'badge-borrowed' },
  maintenance: { label: 'Bảo trì', icon: 'wrench', badge: 'badge-maintenance' }
};

function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.available;
}

function renderStatusBadge(status) {
  const meta = getStatusMeta(status);
  return `<span class="badge ${meta.badge}"><i data-lucide="${meta.icon}" class="badge-icon" aria-hidden="true"></i><span>${meta.label}</span></span>`;
}

/**
 * Khung ảnh thiết bị chừa sẵn (Đợt 7 sẽ thay icon bằng SVG theo mã thiết bị)
 */
function deviceThumbHtml(deviceId, sizeClass = '') {
  return `<div class="graph-device-thumb ${sizeClass}" data-device-id="${escapeHtml(deviceId)}" aria-hidden="true"><i data-lucide="cpu"></i></div>`;
}

/**
 * Khung minh hoạ trạng thái chừa sẵn (Đợt 7 gắn SVG theo data-illustration)
 */
function illustrationHtml(name, iconName, extraClass = '') {
  return `<div class="empty-illustration ${extraClass}" data-illustration="${name}" aria-hidden="true"><i data-lucide="${iconName}"></i></div>`;
}

/**
 * Mô tả ngắn cho trình đọc màn hình về vùng canvas đồ thị
 */
function buildCanvasSummary() {
  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.edges.length;
  return `Đồ thị mượn kèm gồm ${nodeCount} thiết bị và ${edgeCount} cạnh. Dùng danh sách thiết bị bên dưới để chọn bằng bàn phím.`;
}

function renderPageHeader(actionHtml) {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">
          <i data-lucide="network" aria-hidden="true"></i> Minh hoạ CTDL Đồ thị
        </h1>
        <div class="page-desc">Mạng lưới trực quan hoá quan hệ mượn kèm giữa các thiết bị thực hành theo lịch sử phiếu mượn.</div>
      </div>
      <div class="page-actions">${actionHtml}</div>
    </div>
  `;
}

/**
 * Ghi chú học thuật cho người chấm (hiển thị xuyên suốt màn hình #/graph)
 */
function renderGraderNoteHtml() {
  return `
    <div class="graph-grader-note">
      <i data-lucide="info" aria-hidden="true"></i>
      <span>Đỉnh = thiết bị, cạnh = số lần được mượn cùng phiếu (Graph vô hướng, danh sách kề tự cài ở lõi C++)</span>
    </div>
  `;
}

/**
 * Hiển thị khung tải Skeleton trong lúc chờ GET /api/graph
 */
function renderSkeleton(container) {
  container.innerHTML = `
    <div class="page graph-page" aria-busy="true">
      ${renderPageHeader(`
        <button type="button" class="btn btn-secondary btn-sm" disabled>
          <i data-lucide="refresh-cw" class="spin-loading"></i>
          <span>Đang tải…</span>
        </button>
      `)}

      ${renderGraderNoteHtml()}

      <div class="bento-card bento-table-card graph-toolbar-panel" aria-hidden="true">
        <div class="skeleton skeleton-text graph-sk-toolbar-a"></div>
        <div class="skeleton skeleton-text graph-sk-toolbar-b"></div>
      </div>

      <div class="graph-workspace-grid">
        <section class="bento-card bento-table-card graph-canvas-panel" aria-label="Đang tải đồ thị">
          <div class="graph-skeleton-canvas" aria-hidden="true">
            <div class="skeleton graph-sk-circle"></div>
            <div class="skeleton skeleton-title graph-sk-title"></div>
            <div class="skeleton skeleton-text graph-sk-text"></div>
          </div>
        </section>
        <aside class="bento-card bento-table-card graph-detail-panel" aria-hidden="true">
          <div class="card-header graph-detail-header">
            <div class="skeleton skeleton-title graph-sk-detail-title"></div>
          </div>
          <div class="graph-detail-body">
            <div class="skeleton skeleton-card graph-sk-card-a"></div>
            <div class="skeleton skeleton-card graph-sk-card-b"></div>
            <div class="skeleton skeleton-text graph-sk-btn"></div>
          </div>
        </aside>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hiển thị trạng thái Lỗi khi không tải được /api/graph (hoặc thư viện vẽ đồ thị)
 */
function renderErrorState(container, errorMessage) {
  cleanupGraphResources();

  container.innerHTML = `
    <div class="page graph-page">
      ${renderPageHeader(`
        <button type="button" id="btn-graph-error-refresh" class="btn btn-secondary btn-sm">
          <i data-lucide="refresh-cw"></i>
          <span>Làm mới</span>
        </button>
      `)}

      ${renderGraderNoteHtml()}

      <section class="bento-card bento-table-card graph-canvas-panel graph-state-panel" aria-label="Lỗi tải đồ thị">
        <div class="error-state" role="alert">
          ${illustrationHtml('connection-error', 'alert-octagon', 'is-error')}
          <div class="error-state-title">Không thể tải dữ liệu đồ thị mượn kèm</div>
          <div class="error-state-desc">${escapeHtml(errorMessage || 'Đã xảy ra lỗi kết nối với máy chủ API.')}</div>
          <button type="button" id="btn-graph-retry" class="btn btn-primary btn-sm">
            <i data-lucide="refresh-cw"></i>
            <span>Thử lại</span>
          </button>
        </div>
      </section>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const retryHandler = () => loadGraphData(container, false);
  const btnRetry = container.querySelector('#btn-graph-retry');
  const btnRefresh = container.querySelector('#btn-graph-error-refresh');
  if (btnRetry) btnRetry.addEventListener('click', retryHandler);
  if (btnRefresh) btnRefresh.addEventListener('click', retryHandler);
}

/**
 * Hiển thị trạng thái Rỗng hoàn toàn khi danh mục chưa có thiết bị nào (nodes.length === 0)
 */
function renderEmptyDevicesState(container) {
  cleanupGraphResources();

  container.innerHTML = `
    <div class="page graph-page">
      ${renderPageHeader(`
        <button type="button" id="btn-graph-empty-refresh" class="btn btn-secondary btn-sm">
          <i data-lucide="refresh-cw"></i>
          <span>Làm mới</span>
        </button>
      `)}

      ${renderGraderNoteHtml()}

      <section class="bento-card bento-table-card graph-canvas-panel graph-state-panel" aria-label="Chưa có thiết bị trên đồ thị">
        <div class="empty-state">
          ${illustrationHtml('no-results', 'share-2')}
          <div class="empty-state-title">Chưa có thiết bị nào trên đồ thị</div>
          <div class="empty-state-desc">
            Danh mục phòng Lab hiện đang trống. Hãy thêm thiết bị và tạo phiếu mượn nhiều món để hình thành mạng lưới liên kết.
          </div>
          <div class="graph-state-actions">
            <a href="#/devices" class="btn btn-primary btn-sm">
              <i data-lucide="layers"></i>
              <span>Đi tới Thiết bị</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const btnRefresh = container.querySelector('#btn-graph-empty-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => loadGraphData(container, false));
  }
}

/**
 * Cập nhật thông tin bộ đếm cạnh & thông báo lọc trên khung vẽ
 */
function updateFilterIndicators() {
  if (!currentContainer) return;

  const valEl = currentContainer.querySelector('#graph-min-weight-val');
  if (valEl) valEl.textContent = String(currentMinWeight);

  const visibleCount = graphData.edges.filter((e) => e.weight >= currentMinWeight).length;
  const totalEdges = graphData.edges.length;
  const totalNodes = graphData.nodes.length;

  const statsEl = currentContainer.querySelector('#graph-edge-counter');
  if (statsEl) {
    statsEl.innerHTML = `
      Hiện <strong class="tabular-nums">${visibleCount}</strong>/${totalEdges} cạnh •
      <strong class="tabular-nums">${totalNodes}</strong> đỉnh
    `;
  }

  const clearBtn = currentContainer.querySelector('#btn-graph-clear-select');
  if (clearBtn) {
    clearBtn.hidden = !selectedNodeId;
  }

  updateAccessibleList();

  const filterBanner = currentContainer.querySelector('#graph-filter-empty-banner');
  if (filterBanner) {
    if (totalEdges === 0) {
      filterBanner.hidden = false;
      filterBanner.innerHTML = `
        <i data-lucide="sparkles" aria-hidden="true"></i>
        <span>Chưa có cạnh mượn kèm nào (cần lập phiếu có từ 2 thiết bị trở lên). Bạn vẫn có thể bấm vào từng đỉnh để xem thiết bị.</span>
        <a href="#/borrow" class="graph-banner-link">Lập phiếu mượn</a>
      `;
      if (window.lucide) window.lucide.createIcons({ nodes: [filterBanner] });
    } else if (visibleCount === 0) {
      filterBanner.hidden = false;
      filterBanner.innerHTML = `
        <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
        <span>Không có cạnh nào đạt trọng số ≥ <strong class="tabular-nums">${currentMinWeight}</strong>.</span>
        <button type="button" id="btn-reset-weight-filter" class="graph-banner-reset">Đặt lại ≥ 1</button>
      `;
      if (window.lucide) window.lucide.createIcons({ nodes: [filterBanner] });
      const resetBtn = filterBanner.querySelector('#btn-reset-weight-filter');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          applyWeightFilter(1);
        });
      }
    } else {
      filterBanner.hidden = true;
    }
  }
}

/**
 * Áp dụng ngưỡng lọc trọng số mới từ thanh trượt hoặc nút đặt lại
 */
function applyWeightFilter(nextMinWeight) {
  currentMinWeight = Math.max(1, Math.min(maxEdgeWeight, Number(nextMinWeight) || 1));

  if (currentContainer) {
    const slider = currentContainer.querySelector('#graph-weight-slider');
    if (slider && Number(slider.value) !== currentMinWeight) {
      slider.value = String(currentMinWeight);
    }
  }

  if (graphRenderer) {
    graphRenderer.setMinWeight(currentMinWeight);
  }

  updateFilterIndicators();
  if (selectedNodeId) {
    renderDetailPanel();
  }
}

/**
 * Thông báo ngắn cho trình đọc màn hình (vùng live riêng, không đọc lại cả panel)
 */
function announce(message) {
  if (!currentContainer) return;
  const el = currentContainer.querySelector('#graph-sr-status');
  if (!el) return;
  el.textContent = '';
  // Đặt lại nội dung ở khung hình kế tiếp để cùng một câu vẫn được đọc lại
  window.requestAnimationFrame(() => {
    el.textContent = message;
  });
}

/**
 * Danh sách thiết bị + cạnh dạng bảng/danh sách: lối thay thế cho canvas khi dùng bàn phím / đọc màn hình.
 * Chỉ hiển thị lại dữ liệu từ GET /api/graph, không tính thêm nghiệp vụ.
 */
function renderAccessibleListHtml() {
  const nodes = graphData.nodes;
  const visibleEdges = graphData.edges
    .filter((e) => (Number(e.weight) || 0) >= currentMinWeight)
    .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0)
      || String(a.from).localeCompare(String(b.from))
      || String(a.to).localeCompare(String(b.to)));
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));

  const nodeRows = nodes.map((n) => {
    const meta = getStatusMeta(n.status);
    const stats = getNodeDegreeStats(n.id);
    const isSelected = n.id === selectedNodeId;
    return `
      <tr class="${isSelected ? 'is-selected' : ''}">
        <td><code class="device-code-chip">${escapeHtml(n.id)}</code></td>
        <td>${escapeHtml(n.name)}</td>
        <td>
          <span class="graph-list-status is-${escapeHtml(n.status || 'available')}">
            <i data-lucide="${meta.icon}" aria-hidden="true"></i><span>${meta.label}</span>
          </span>
        </td>
        <td class="tabular-nums col-right">${stats.totalNeighbors}</td>
        <td class="tabular-nums col-right">${Number(n.timesBorrowed) || 0}</td>
        <td class="col-right">
          <button type="button" class="btn btn-secondary btn-sm" data-select-node="${escapeHtml(n.id)}" aria-label="Chọn đỉnh ${escapeHtml(n.name)} (${escapeHtml(n.id)})"${isSelected ? ' aria-pressed="true"' : ''}>
            <span>${isSelected ? 'Đang chọn' : 'Chọn'}</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const edgeItems = visibleEdges.length === 0
    ? '<li class="graph-list-empty">Không có cạnh nào đạt ngưỡng lọc hiện tại.</li>'
    : visibleEdges.map((e) => `
        <li>
          <code class="device-code-chip">${escapeHtml(e.from)}</code>
          <span>${escapeHtml(nameById.get(e.from) || e.from)}</span>
          <span class="graph-list-link" aria-hidden="true">↔</span>
          <span class="sr-only">và</span>
          <code class="device-code-chip">${escapeHtml(e.to)}</code>
          <span>${escapeHtml(nameById.get(e.to) || e.to)}</span>
          <strong class="tabular-nums">mượn cùng ${Number(e.weight) || 0} lần</strong>
        </li>
      `).join('');

  return `
    <summary class="graph-a11y-summary">
      <i data-lucide="list-tree" aria-hidden="true"></i>
      <span>Danh sách thiết bị và quan hệ mượn kèm (dùng bàn phím / trình đọc màn hình)</span>
      <span class="badge badge-onhold tabular-nums">${nodes.length} đỉnh · ${visibleEdges.length} cạnh</span>
    </summary>
    <div class="graph-a11y-body">
      <div class="table-responsive graph-a11y-table-wrap">
        <table class="data-table graph-a11y-table">
          <caption class="sr-only">Danh sách thiết bị trên đồ thị mượn kèm</caption>
          <thead>
            <tr>
              <th scope="col">Mã</th>
              <th scope="col">Thiết bị</th>
              <th scope="col">Trạng thái</th>
              <th scope="col" class="col-right">Láng giềng</th>
              <th scope="col" class="col-right">Lượt mượn</th>
              <th scope="col" class="col-right"><span class="sr-only">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>${nodeRows}</tbody>
        </table>
      </div>
      <div class="graph-a11y-edges">
        <h2 class="graph-a11y-heading">Cạnh mượn kèm${currentMinWeight > 1 ? ` (trọng số ≥ ${currentMinWeight})` : ''}</h2>
        <ul class="graph-a11y-edge-list">${edgeItems}</ul>
      </div>
    </div>
  `;
}

function updateAccessibleList() {
  if (!currentContainer) return;
  const listEl = currentContainer.querySelector('#graph-a11y-list');
  if (!listEl) return;
  // Giữ trạng thái mở/đóng của <details>, chỉ thay phần bên trong
  listEl.innerHTML = renderAccessibleListHtml();
  if (window.lucide) window.lucide.createIcons();
}

/**
 * M17: xem TOÀN BỘ láng giềng của một đỉnh, gồm cả thiết bị đang bảo trì (kèm trạng thái)
 * Gọi GET /api/devices/{id}/companions (đã có trong docs/api.md)
 */
async function openAllNeighborsModal(dev) {
  try {
    const res = await api.get(`/devices/${encodeURIComponent(dev.id)}/companions`);
    const list = Array.isArray(res && res.companions) ? res.companions : [];

    const content = document.createElement('div');
    if (list.length === 0) {
      content.innerHTML = `
        <div class="graph-empty-companions">
          Thiết bị <strong>${escapeHtml(dev.name)}</strong> chưa có láng giềng nào trong đồ thị mượn kèm.
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="all-companions-modal-list">
          ${list.map((c) => `
            <div class="companion-card" data-glow="${escapeHtml(c.status || 'available')}">
              <div class="companion-left">
                <div class="companion-thumb" aria-hidden="true"><i data-lucide="cpu"></i></div>
                <div class="companion-info">
                  <div class="companion-name">
                    ${escapeHtml(c.name)} <code class="device-code-chip">${escapeHtml(c.id)}</code>
                  </div>
                  <div class="companion-weight">
                    Mượn kèm: <strong class="tabular-nums">${Number(c.weight) || 0}</strong> lần · Sẵn sàng: <strong class="tabular-nums">${Number(c.available) || 0}</strong>
                  </div>
                </div>
              </div>
              ${renderStatusBadge(c.status)}
            </div>
          `).join('')}
        </div>
      `;
    }

    openModal({
      title: `Toàn bộ láng giềng của ${dev.id}`,
      content,
      cancelText: 'Đóng'
    });
    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    showToast(err.message || 'Không tải được danh sách láng giềng của thiết bị này.', 'error', 'Láng giềng đồ thị');
  }
}

/**
 * Render nội dung Panel bên phải (mặc định khi chưa chọn đỉnh hoặc chi tiết khi đã chọn đỉnh)
 */
function renderDetailPanel() {
  if (!currentContainer) return;
  const panelEl = currentContainer.querySelector('#graph-detail-panel');
  if (!panelEl) return;

  // 1. Trạng thái mặc định: Chưa chọn đỉnh nào
  if (!selectedNodeId) {
    const isolatedCount = graphData.nodes.filter((n) => getNodeDegreeStats(n.id).totalNeighbors === 0).length;
    const quickNodes = [...graphData.nodes]
      .sort((a, b) => {
        const degDiff = getNodeDegreeStats(b.id).totalNeighbors - getNodeDegreeStats(a.id).totalNeighbors;
        if (degDiff !== 0) return degDiff;
        return (b.timesBorrowed || 0) - (a.timesBorrowed || 0);
      })
      .slice(0, 5);

    panelEl.innerHTML = `
      <div class="card-header graph-detail-header">
        <h2 class="card-title graph-detail-heading">
          <i data-lucide="mouse-pointer-click" aria-hidden="true"></i>
          <span>Chi tiết đỉnh</span>
        </h2>
      </div>

      <div class="graph-detail-body">
        <div class="graph-unselected-prompt">
          <div class="graph-unselected-icon" aria-hidden="true">
            <i data-lucide="network"></i>
          </div>
          <div class="graph-unselected-title">Chọn một đỉnh trên đồ thị</div>
          <div class="graph-unselected-desc">
            Nhấp vào bất kỳ đỉnh thiết bị nào (hoặc dùng danh sách bên dưới đồ thị) để làm nổi bật các cạnh liên kết trực tiếp, xem tồn kho, Top 3 gợi ý mượn kèm và hàng đợi đặt trước.
          </div>
        </div>

        <div class="graph-summary-box">
          <div class="side-panel-section-title">
            <i data-lucide="bar-chart-3" aria-hidden="true"></i> Tóm tắt mạng lưới
          </div>
          <div class="graph-summary-grid">
            <div class="graph-summary-stat">
              <span class="graph-summary-label">Tổng số đỉnh</span>
              <strong class="graph-summary-value tabular-nums">${graphData.nodes.length}</strong>
            </div>
            <div class="graph-summary-stat">
              <span class="graph-summary-label">Tổng cạnh mượn kèm</span>
              <strong class="graph-summary-value tabular-nums">${graphData.edges.length}</strong>
            </div>
            <div class="graph-summary-stat">
              <span class="graph-summary-label">Trọng số lớn nhất</span>
              <strong class="graph-summary-value tabular-nums">${graphData.edges.length > 0 ? maxEdgeWeight : 0}</strong>
            </div>
            <div class="graph-summary-stat">
              <span class="graph-summary-label">Đỉnh độc lập (bậc 0)</span>
              <strong class="graph-summary-value tabular-nums">${isolatedCount}</strong>
            </div>
          </div>
        </div>

        ${quickNodes.length > 0 ? `
          <div class="graph-quick-pick-section">
            <div class="side-panel-section-title">
              <i data-lucide="compass" aria-hidden="true"></i> Chọn nhanh thiết bị tiêu biểu
            </div>
            <div class="graph-quick-chips">
              ${quickNodes.map((n) => {
                const meta = getStatusMeta(n.status);
                return `
                <button type="button" class="graph-quick-chip" data-node-id="${escapeHtml(n.id)}" aria-label="Chọn đỉnh ${escapeHtml(n.name)} (${escapeHtml(n.id)}), trạng thái ${meta.label}" title="Chọn đỉnh ${escapeHtml(n.name)} (${escapeHtml(n.id)})">
                  ${deviceThumbHtml(n.id, 'is-sm')}
                  <code class="device-code-chip">${escapeHtml(n.id)}</code>
                  <span class="graph-quick-chip-name">${escapeHtml(n.name)}</span>
                  <span class="graph-chip-status is-${escapeHtml(n.status || 'available')}">
                    <i data-lucide="${meta.icon}" aria-hidden="true"></i><span>${meta.label}</span>
                  </span>
                </button>`;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    panelEl.querySelectorAll('.graph-quick-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleSelectNode(btn.dataset.nodeId, { focusOnCanvas: true });
      });
    });
    return;
  }

  // 2. Trạng thái đã chọn 1 đỉnh
  const baseNode = graphData.nodes.find((n) => n.id === selectedNodeId);
  if (!baseNode) {
    selectedNodeId = null;
    renderDetailPanel();
    return;
  }

  const dev = selectedDetailState.device || baseNode;
  const { totalNeighbors, visibleNeighbors, totalCoBorrows } = getNodeDegreeStats(baseNode.id);
  const hasFullStock = selectedDetailState.device !== null;

  const totalUnits = hasFullStock ? Math.max(1, Number(dev.total) || 1) : 1;
  const pAvail = hasFullStock ? Math.round(((dev.available || 0) / totalUnits) * 100) : 0;
  const pBorrow = hasFullStock ? Math.round(((dev.borrowed || 0) / totalUnits) * 100) : 0;
  const pHold = hasFullStock ? Math.round(((dev.onHold || 0) / totalUnits) * 100) : 0;
  const pMaint = hasFullStock ? Math.round(((dev.maintenance || 0) / totalUnits) * 100) : 0;
  const queueLen = hasFullStock ? (Number(dev.queueLength) || 0) : null;

  panelEl.innerHTML = `
    <div class="card-header graph-detail-header">
      <h2 class="card-title graph-detail-heading">
        <i data-lucide="pin" aria-hidden="true"></i>
        <span>Chi tiết đỉnh đang chọn</span>
      </h2>
      <button type="button" id="btn-panel-unselect" class="btn-icon" title="Bỏ chọn đỉnh" aria-label="Bỏ chọn đỉnh">
        <i data-lucide="x" aria-hidden="true"></i>
      </button>
    </div>

    <div class="graph-detail-body">
      <!-- Khối 1: Thông tin thiết bị -->
      <div class="graph-node-info-card">
        <div class="graph-node-top-row">
          ${deviceThumbHtml(dev.id)}
          <div class="graph-node-top-info">
            <div class="graph-node-top-badges">
              <code class="device-code-chip graph-node-code">${escapeHtml(dev.id)}</code>
              ${renderStatusBadge(dev.status)}
            </div>
            <div class="graph-node-name">${escapeHtml(dev.name)}</div>
          </div>
        </div>

        <div class="graph-node-metrics">
          <div class="graph-node-metric-item">
            <span class="graph-node-metric-label">Đã mượn</span>
            <strong class="tabular-nums">${Number(dev.timesBorrowed ?? baseNode.timesBorrowed) || 0} lần</strong>
          </div>
          <div class="graph-node-metric-item">
            <span class="graph-node-metric-label">Láng giềng</span>
            <strong class="tabular-nums">${totalNeighbors} thiết bị</strong>
          </div>
          <div class="graph-node-metric-item">
            <span class="graph-node-metric-label">Tổng lượt kèm</span>
            <strong class="tabular-nums">${totalCoBorrows}</strong>
          </div>
        </div>

        ${currentMinWeight > 1 && visibleNeighbors < totalNeighbors ? `
          <div class="graph-hidden-edges-hint">
            <i data-lucide="eye-off" class="graph-inline-icon" aria-hidden="true"></i>
            <span>Đang ẩn <strong class="tabular-nums">${totalNeighbors - visibleNeighbors}</strong> cạnh có trọng số &lt; ${currentMinWeight}.</span>
          </div>
        ` : ''}

        ${hasFullStock ? `
          <div class="graph-stock-box">
            <div class="progress-bar-multi graph-stock-bar" role="img" aria-label="Kho: ${dev.available} sẵn sàng, ${dev.borrowed} đang mượn, ${dev.onHold} đang giữ, ${dev.maintenance} bảo trì">
              <div class="progress-segment segment-available" style="width: ${pAvail}%;"></div>
              <div class="progress-segment segment-borrowed" style="width: ${pBorrow}%;"></div>
              <div class="progress-segment segment-onhold" style="width: ${pHold}%;"></div>
              <div class="progress-segment segment-maintenance" style="width: ${pMaint}%;"></div>
            </div>
            <div class="graph-stock-numbers tabular-nums">
              <span><i class="stock-dot dot-available" aria-hidden="true"></i> Sẵn: <strong>${dev.available}</strong></span>
              <span><i class="stock-dot dot-borrowed" aria-hidden="true"></i> Mượn: <strong>${dev.borrowed}</strong></span>
              <span><i class="stock-dot dot-onhold" aria-hidden="true"></i> Giữ: <strong>${dev.onHold}</strong></span>
              <span><i class="stock-dot dot-maintenance" aria-hidden="true"></i> Bảo trì: <strong>${dev.maintenance}</strong></span>
            </div>
          </div>
        ` : (selectedDetailState.loading ? `
          <div class="skeleton skeleton-text graph-sk-stock"></div>
        ` : '')}
      </div>

      <!-- Khối 2: Top 3 mượn kèm từ API GET /api/suggestions/{id}?k=3 (M17) -->
      <div class="side-panel-section">
        <div class="side-panel-section-title">
          <i data-lucide="sparkles" aria-hidden="true"></i> Top 3 thường mượn kèm (M17)
        </div>

        ${selectedDetailState.loading ? `
          <div class="graph-companions-list" aria-hidden="true">
            <div class="skeleton graph-sk-companion"></div>
            <div class="skeleton graph-sk-companion"></div>
            <div class="skeleton graph-sk-companion"></div>
          </div>
        ` : selectedDetailState.error ? `
          <div class="graph-inline-error" role="alert">
            <div>${escapeHtml(selectedDetailState.error)}</div>
            <button type="button" id="btn-retry-suggestions" class="btn btn-outline btn-sm">
              <i data-lucide="refresh-cw"></i>
              <span>Thử lại</span>
            </button>
          </div>
        ` : selectedDetailState.suggestions.length === 0 ? `
          <div class="graph-empty-companions">
            Chưa có gợi ý Top 3 khả dụng cho thiết bị này${totalNeighbors > 0
              ? '. Bấm “Xem tất cả láng giềng” để xem toàn bộ quan hệ mượn kèm, kể cả thiết bị đang bảo trì.'
              : ' (thiết bị chưa từng mượn cùng phiếu với thiết bị khác).'}
          </div>
        ` : `
          <div class="graph-companions-list">
            ${selectedDetailState.suggestions.map((comp, idx) => `
              <button
                type="button"
                class="graph-companion-card suggestion-popin"
                style="animation-delay: ${idx * 50}ms;"
                data-companion-id="${escapeHtml(comp.id)}"
                aria-label="Hạng ${idx + 1}: ${escapeHtml(comp.name)} (${escapeHtml(comp.id)}), mượn kèm ${comp.weight} lần, ${comp.outOfStock ? 'hết hàng' : `còn ${comp.available} sẵn sàng`}. Bấm để chuyển chọn sang đỉnh này."
                title="Bấm để chuyển chọn sang đỉnh ${escapeHtml(comp.name)} (${escapeHtml(comp.id)})"
              >
                <div class="graph-companion-rank tabular-nums" aria-hidden="true">#${idx + 1}</div>
                ${deviceThumbHtml(comp.id, 'is-sm')}
                <div class="graph-companion-main">
                  <div class="graph-companion-title">
                    <span>${escapeHtml(comp.name)}</span>
                    <code class="device-code-chip">${escapeHtml(comp.id)}</code>
                  </div>
                  <div class="graph-companion-sub tabular-nums">
                    <span class="graph-weight-pill">w = ${comp.weight}</span>
                    <span aria-hidden="true">•</span>
                    ${comp.outOfStock
                      ? '<span class="comp-stock-out"><i data-lucide="alert-circle" aria-hidden="true"></i>Hết hàng</span>'
                      : `<span class="comp-stock-ok"><i data-lucide="check-circle-2" aria-hidden="true"></i>Còn ${comp.available} sẵn sàng</span>`
                    }
                  </div>
                </div>
                <i data-lucide="arrow-up-right" class="graph-companion-arrow" aria-hidden="true"></i>
              </button>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Khối 3: Láng giềng đầy đủ (M17) + điều hướng Hàng đợi đặt trước -->
      <div class="graph-detail-actions">
        <button type="button" id="btn-all-neighbors" class="btn btn-secondary graph-all-neighbors-btn">
          <i data-lucide="list-tree"></i>
          <span>Xem tất cả láng giềng</span>
        </button>
        <a href="#/reservations?id=${encodeURIComponent(baseNode.id)}" class="btn btn-primary graph-queue-btn">
          <i data-lucide="clock-4"></i>
          <span>Xem hàng đợi <code class="mono">${escapeHtml(baseNode.id)}</code></span>
          ${queueLen !== null && queueLen > 0
            ? `<span class="graph-queue-count tabular-nums">${queueLen} đang chờ</span>`
            : ''
          }
        </a>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const unselectBtn = panelEl.querySelector('#btn-panel-unselect');
  if (unselectBtn) {
    unselectBtn.addEventListener('click', () => handleSelectNode(null));
  }

  const retrySugBtn = panelEl.querySelector('#btn-retry-suggestions');
  if (retrySugBtn) {
    retrySugBtn.addEventListener('click', () => fetchSelectedNodeDetails(baseNode.id));
  }

  const allNeighborsBtn = panelEl.querySelector('#btn-all-neighbors');
  if (allNeighborsBtn) {
    allNeighborsBtn.addEventListener('click', () => openAllNeighborsModal(dev));
  }

  panelEl.querySelectorAll('.graph-companion-card').forEach((cardBtn) => {
    cardBtn.addEventListener('click', () => {
      const targetId = cardBtn.dataset.companionId;
      handleSelectNode(targetId, { focusOnCanvas: true });
    });
  });
}

/**
 * Gọi API gợi ý Top 3 (GET /api/suggestions/{id}?k=3) & chi tiết tồn kho (GET /api/devices/{id})
 */
async function fetchSelectedNodeDetails(nodeId) {
  const reqId = ++detailRequestSeq;
  selectedDetailState = {
    loading: true,
    error: null,
    device: null,
    suggestions: []
  };
  renderDetailPanel();

  const encodedId = encodeURIComponent(nodeId);
  const [sugResult, devResult] = await Promise.allSettled([
    api.get(`/suggestions/${encodedId}?k=3`),
    api.get(`/devices/${encodedId}`)
  ]);

  // Bỏ qua nếu người dùng đã chuyển sang đỉnh khác trong lúc chờ
  if (reqId !== detailRequestSeq || selectedNodeId !== nodeId) return;

  const nextState = {
    loading: false,
    error: null,
    device: null,
    suggestions: []
  };

  if (devResult.status === 'fulfilled' && devResult.value && devResult.value.device) {
    nextState.device = devResult.value.device;
  }

  if (sugResult.status === 'fulfilled' && sugResult.value) {
    nextState.suggestions = Array.isArray(sugResult.value.suggestions)
      ? sugResult.value.suggestions
      : [];
  } else if (sugResult.status === 'rejected') {
    nextState.error = (sugResult.reason && sugResult.reason.message)
      ? sugResult.reason.message
      : 'Không thể tải danh sách gợi ý Top 3.';
  }

  selectedDetailState = nextState;

  if (nextState.error) {
    announce(`Không tải được gợi ý mượn kèm cho ${nodeId}.`);
  } else {
    announce(`Đã tải ${nextState.suggestions.length} gợi ý mượn kèm cho ${nodeId}.`);
  }

  // Cập nhật highlight Top 3 láng giềng trên đồ thị
  if (graphRenderer && selectedNodeId === nodeId) {
    const topIds = nextState.suggestions.map((s) => s.id);
    graphRenderer.selectNode(nodeId, topIds);
  }

  renderDetailPanel();
}

/**
 * Xử lý khi người dùng bấm vào một đỉnh (hoặc bấm vùng trống để bỏ chọn)
 */
function handleSelectNode(nodeId, { focusOnCanvas = false, fromCanvas = false } = {}) {
  if (!nodeId) {
    selectedNodeId = null;
    detailRequestSeq += 1;
    selectedDetailState = {
      loading: false,
      error: null,
      device: null,
      suggestions: []
    };
    if (graphRenderer) {
      graphRenderer.clearSelection();
    }
    updateFilterIndicators();
    renderDetailPanel();
    updateAccessibleList();
    announce('Đã bỏ chọn đỉnh.');
    return;
  }

  const exists = graphData.nodes.some((n) => n.id === nodeId);
  if (!exists) return;

  selectedNodeId = nodeId;
  if (graphRenderer) {
    graphRenderer.selectNode(nodeId, []);
    if (focusOnCanvas) {
      graphRenderer.focusNode(nodeId, { fromCanvas });
    }
  }

  updateFilterIndicators();
  updateAccessibleList();
  const selectedName = (graphData.nodes.find((n) => n.id === nodeId) || {}).name || nodeId;
  announce(`Đã chọn đỉnh ${selectedName} (${nodeId}). Đang tải gợi ý mượn kèm.`);
  fetchSelectedNodeDetails(nodeId);
}

/**
 * Đồng bộ giới hạn thanh trượt lọc trọng số khi dữ liệu cạnh thay đổi tại chỗ
 */
function syncSliderBoundsDom() {
  if (!currentContainer) return;
  const sliderDisabled = graphData.edges.length === 0 || maxEdgeWeight <= 1;
  const sliderEl = currentContainer.querySelector('#graph-weight-slider');
  const maxBoundEl = currentContainer.querySelector('#graph-slider-max-bound');
  if (sliderEl) {
    sliderEl.max = String(maxEdgeWeight);
    sliderEl.value = String(currentMinWeight);
    sliderEl.disabled = sliderDisabled;
  }
  if (maxBoundEl) {
    maxBoundEl.textContent = String(maxEdgeWeight);
  }
}

/**
 * Dựng khung giao diện hoàn chỉnh của màn hình #/graph và gắn graphRenderer
 */
function renderGraphWorkspace(container, { changedEdgeKeys = [] } = {}) {
  cleanupGraphResources();

  const sliderDisabled = graphData.edges.length === 0 || maxEdgeWeight <= 1;

  container.innerHTML = `
    <div class="page graph-page">
      ${renderPageHeader(`
        <button type="button" id="btn-graph-refresh" class="btn btn-secondary btn-sm" title="Tải lại dữ liệu đồ thị từ máy chủ">
          <i data-lucide="refresh-cw" id="icon-graph-refresh"></i>
          <span>Làm mới</span>
        </button>
      `)}

      <!-- Ghi chú cho người chấm -->
      ${renderGraderNoteHtml()}

      <!-- Vùng thông báo cho trình đọc màn hình (không đọc lại cả panel) -->
      <div id="graph-sr-status" class="sr-only" role="status" aria-live="polite"></div>

      <!-- Thanh điều khiển: Lọc trọng số cạnh + Chú giải trạng thái -->
      <div class="bento-card bento-table-card graph-toolbar-panel stagger-item stagger-delay-1">
        <div class="graph-slider-group">
          <label for="graph-weight-slider" class="graph-slider-label">
            <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
            <span>Chỉ hiện cạnh trọng số ≥ <strong id="graph-min-weight-val" class="tabular-nums">${currentMinWeight}</strong></span>
          </label>
          <div class="graph-slider-control">
            <span class="graph-slider-bound tabular-nums" aria-hidden="true">1</span>
            <input
              type="range"
              id="graph-weight-slider"
              class="graph-range-input"
              min="1"
              max="${maxEdgeWeight}"
              step="1"
              value="${currentMinWeight}"
              aria-describedby="graph-edge-counter"
              ${sliderDisabled ? 'disabled' : ''}
            >
            <span id="graph-slider-max-bound" class="graph-slider-bound tabular-nums" aria-hidden="true">${maxEdgeWeight}</span>
          </div>
          <span id="graph-edge-counter" class="graph-edge-counter"></span>
        </div>

        <ul class="graph-legend-group" aria-label="Chú giải trạng thái đỉnh">
          <li class="graph-legend-item">
            <i data-lucide="check-circle-2" class="graph-legend-icon is-available" aria-hidden="true"></i>
            Sẵn sàng
          </li>
          <li class="graph-legend-item">
            <i data-lucide="clock" class="graph-legend-icon is-borrowed" aria-hidden="true"></i>
            Đang mượn
          </li>
          <li class="graph-legend-item">
            <i data-lucide="wrench" class="graph-legend-icon is-maintenance" aria-hidden="true"></i>
            Bảo trì
          </li>
          <li class="graph-legend-hint">Cỡ đỉnh ~ lượt mượn, độ dày cạnh ~ trọng số</li>
        </ul>
      </div>

      <!-- Khung 2 cột: Vùng vẽ đồ thị (Trái) + Panel Chi tiết Đỉnh (Phải) -->
      <div class="graph-workspace-grid stagger-item stagger-delay-2">
        <section class="bento-card bento-table-card graph-canvas-panel" aria-label="Không gian biểu diễn đồ thị mượn kèm">
          <div class="card-header graph-canvas-header">
            <h2 class="card-title">
              <i data-lucide="network" aria-hidden="true"></i>
              <span>Mạng lưới mượn kèm</span>
            </h2>
            <span class="badge badge-onhold">
              <i data-lucide="git-branch" class="badge-icon" aria-hidden="true"></i>
              <span>Graph vô hướng</span>
            </span>
          </div>

          <div class="graph-canvas-stage">
            <!-- Cụm nút công cụ nổi góc trên canvas -->
            <div class="graph-canvas-controls">
              <button type="button" id="btn-graph-clear-select" class="btn btn-secondary btn-sm" hidden title="Bỏ chọn đỉnh hiện tại (Esc)">
                <i data-lucide="x-circle"></i>
                <span>Bỏ chọn</span>
              </button>
              <button type="button" id="btn-graph-relayout" class="btn btn-secondary btn-sm" title="Bật lại mô phỏng lực trong giây lát để sắp xếp lại bố cục">
                <i data-lucide="orbit" id="icon-graph-relayout"></i>
                <span>Sắp xếp lại lực</span>
              </button>
              <div class="graph-zoom-group" role="group" aria-label="Thu phóng đồ thị">
                <button type="button" id="btn-graph-zoom-in" class="btn-icon" title="Phóng to" aria-label="Phóng to">
                  <i data-lucide="zoom-in" aria-hidden="true"></i>
                </button>
                <button type="button" id="btn-graph-zoom-out" class="btn-icon" title="Thu nhỏ" aria-label="Thu nhỏ">
                  <i data-lucide="zoom-out" aria-hidden="true"></i>
                </button>
                <button type="button" id="btn-graph-fit" class="btn-icon" title="Căn vừa khung nhìn" aria-label="Căn vừa khung nhìn">
                  <i data-lucide="maximize-2" aria-hidden="true"></i>
                </button>
              </div>
            </div>

            <!-- Thông báo nổi khi chưa có cạnh hoặc lọc ẩn toàn bộ cạnh -->
            <div id="graph-filter-empty-banner" class="graph-filter-banner" role="status" hidden></div>

            <!-- Host DOM cho module ui/graph-renderer.js -->
            <div id="graph-canvas-host" class="graph-canvas-host" role="img" aria-label="${escapeHtml(buildCanvasSummary())}"></div>
          </div>

          <!-- Dòng hướng dẫn tương tác dưới chân canvas -->
          <div class="graph-canvas-footer">
            <span><i data-lucide="hand" class="graph-inline-icon" aria-hidden="true"></i> Kéo thả đỉnh • Lăn chuột để thu phóng • Bấm đỉnh xem liên kết • Esc để bỏ chọn</span>
            <span>Nhãn trọng số hiện khi <code class="mono">weight ≥ 2</code> hoặc khi trỏ/chọn đỉnh</span>
          </div>
        </section>

        <aside id="graph-detail-panel" class="bento-card bento-table-card graph-detail-panel" aria-label="Chi tiết đỉnh đang chọn"></aside>
      </div>

      <!-- Lối thay thế cho canvas: danh sách thiết bị và cạnh (bàn phím / trình đọc màn hình) -->
      <details id="graph-a11y-list" class="bento-card bento-table-card graph-a11y-card stagger-item stagger-delay-3"></details>
    </div>
  `;

  updateAccessibleList();
  const a11yListEl = container.querySelector('#graph-a11y-list');
  if (a11yListEl) {
    a11yListEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-select-node]');
      if (btn) {
        handleSelectNode(btn.dataset.selectNode, { focusOnCanvas: true });
      }
    });
  }

  if (window.lucide) window.lucide.createIcons();

  // Khởi tạo module vẽ đồ thị tách rời
  const hostEl = container.querySelector('#graph-canvas-host');
  const relayoutBtn = container.querySelector('#btn-graph-relayout');
  let relayoutUiTimer = 0;

  const setRelayoutButtonSimulating = (isSimulating) => {
    const liveBtn = container.querySelector('#btn-graph-relayout');
    if (relayoutUiTimer) {
      window.clearTimeout(relayoutUiTimer);
      relayoutUiTimer = 0;
    }
    if (!liveBtn) return;

    if (isSimulating) {
      // Khởi động lại animation xoay 1 vòng (~600ms) và tự ngắt tối đa < 2 giây
      liveBtn.classList.remove('is-simulating');
      void liveBtn.offsetWidth;
      liveBtn.classList.add('is-simulating');
      relayoutUiTimer = window.setTimeout(() => {
        relayoutUiTimer = 0;
        liveBtn.classList.remove('is-simulating');
      }, 1900);
    } else {
      liveBtn.classList.remove('is-simulating');
    }
  };

  graphRenderer = createGraphRenderer(hostEl, {
    onNodeClick: (clickedNodeId) => {
      handleSelectNode(clickedNodeId, {
        focusOnCanvas: Boolean(clickedNodeId),
        fromCanvas: true
      });
    },
    onPhysicsChange: (isSimulating) => {
      setRelayoutButtonSimulating(isSimulating);
    }
  });

  const activeTheme = document.documentElement.getAttribute('data-theme') || 'light';
  graphRenderer.setTheme(activeTheme);
  graphRenderer.setData(graphData, {
    minWeight: currentMinWeight,
    changedEdgeKeys
  });

  bindThemeObserver();

  // Gắn sự kiện cho các nút điều khiển
  const refreshBtn = container.querySelector('#btn-graph-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadGraphData(container, true));
  }

  const sliderEl = container.querySelector('#graph-weight-slider');
  if (sliderEl) {
    sliderEl.addEventListener('input', (e) => {
      applyWeightFilter(Number(e.target.value));
    });
  }

  const clearSelectBtn = container.querySelector('#btn-graph-clear-select');
  if (clearSelectBtn) {
    clearSelectBtn.addEventListener('click', () => handleSelectNode(null));
  }

  if (relayoutBtn) {
    relayoutBtn.addEventListener('click', () => {
      if (graphRenderer) graphRenderer.relayout();
    });
  }

  const zoomInBtn = container.querySelector('#btn-graph-zoom-in');
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => graphRenderer && graphRenderer.zoomIn());

  const zoomOutBtn = container.querySelector('#btn-graph-zoom-out');
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => graphRenderer && graphRenderer.zoomOut());

  const fitBtn = container.querySelector('#btn-graph-fit');
  if (fitBtn) fitBtn.addEventListener('click', () => graphRenderer && graphRenderer.fitView(true));

  updateFilterIndicators();

  // Phục hồi đỉnh đang chọn (nếu có) hoặc đọc từ ?id=... trên URL
  const hashNodeId = getInitialNodeIdFromHash();
  const targetSelected = selectedNodeId && graphData.nodes.some((n) => n.id === selectedNodeId)
    ? selectedNodeId
    : (hashNodeId && graphData.nodes.some((n) => n.id === hashNodeId) ? hashNodeId : null);

  if (targetSelected) {
    handleSelectNode(targetSelected, { focusOnCanvas: false });
  } else {
    selectedNodeId = null;
    renderDetailPanel();
  }
}

/**
 * Nạp dữ liệu từ GET /api/graph
 */
async function loadGraphData(container, isManualRefresh = false) {
  const reqId = ++loadRequestSeq;

  const refreshIcon = container.querySelector('#icon-graph-refresh');
  const refreshBtn = container.querySelector('#btn-graph-refresh');

  if (isManualRefresh) {
    if (refreshIcon) refreshIcon.classList.add('spin-loading');
    if (refreshBtn) refreshBtn.disabled = true;
  } else {
    renderSkeleton(container);
  }

  try {
    const res = await api.get('/graph');
    if (reqId !== loadRequestSeq || currentContainer !== container) return;

    const nodes = Array.isArray(res && res.nodes) ? res.nodes : [];
    const edges = Array.isArray(res && res.edges) ? res.edges : [];
    const changedEdgeKeys = diffAndRecordEdgeWeights(edges);

    graphData = { nodes, edges };
    maxEdgeWeight = edges.reduce((acc, e) => Math.max(acc, Number(e.weight) || 1), 1);
    if (currentMinWeight > maxEdgeWeight) {
      currentMinWeight = 1;
    }

    if (nodes.length === 0) {
      renderEmptyDevicesState(container);
      return;
    }

    // Khi bấm "Làm mới" mà đồ thị đã mount: cập nhật tại chỗ để giữ bố cục & nháy sáng cạnh đổi trọng số
    if (isManualRefresh && graphRenderer) {
      syncSliderBoundsDom();
      graphRenderer.updateGraphData(graphData, { minWeight: currentMinWeight });
      if (selectedNodeId && nodes.some((n) => n.id === selectedNodeId)) {
        await fetchSelectedNodeDetails(selectedNodeId);
      } else {
        selectedNodeId = null;
        renderDetailPanel();
      }
      updateFilterIndicators();
    } else {
      // Chỉ nạp vis-network khi thật sự cần vẽ (lỗi nạp -> trạng thái lỗi có nút Thử lại)
      await loadVisNetwork();
      if (reqId !== loadRequestSeq || currentContainer !== container) return;
      renderGraphWorkspace(container, { changedEdgeKeys });
    }

    if (isManualRefresh) {
      showToast('Đã làm mới dữ liệu đồ thị mượn kèm.', 'info', 'Đồ thị', 2200);
    }
  } catch (err) {
    if (reqId !== loadRequestSeq || currentContainer !== container) return;
    renderErrorState(container, err.message || 'Không thể tải dữ liệu đồ thị.');
  } finally {
    if (isManualRefresh && currentContainer === container) {
      const nextRefreshIcon = container.querySelector('#icon-graph-refresh');
      const nextRefreshBtn = container.querySelector('#btn-graph-refresh');
      if (nextRefreshIcon) nextRefreshIcon.classList.remove('spin-loading');
      if (nextRefreshBtn) nextRefreshBtn.disabled = false;
    }
  }
}

/**
 * Điểm vào chính khi router chuyển tới #/graph
 */
export async function render(container) {
  ensureRouteCleanupHook();
  currentContainer = container;
  currentMinWeight = 1;
  selectedNodeId = null;
  await loadGraphData(container, false);
}

/**
 * Tự động cập nhật lại trạng thái thiết bị trên đồ thị & panel khi tua đồng hồ giả lập
 */
export async function onTimeAdvanced() {
  if (!currentContainer) return;
  try {
    const res = await api.get('/graph');
    const nodes = Array.isArray(res && res.nodes) ? res.nodes : [];
    const edges = Array.isArray(res && res.edges) ? res.edges : [];
    diffAndRecordEdgeWeights(edges);

    graphData = { nodes, edges };
    maxEdgeWeight = edges.reduce((acc, e) => Math.max(acc, Number(e.weight) || 1), 1);
    if (currentMinWeight > maxEdgeWeight) {
      currentMinWeight = 1;
    }

    if (graphRenderer && nodes.length > 0) {
      // Cập nhật đỉnh & cạnh tại chỗ để không xê dịch vị trí đỉnh và nháy sáng 1 lần cạnh đổi trọng số
      syncSliderBoundsDom();
      graphRenderer.updateGraphData(graphData, { minWeight: currentMinWeight });
      if (selectedNodeId && nodes.some((n) => n.id === selectedNodeId)) {
        await fetchSelectedNodeDetails(selectedNodeId);
      } else {
        selectedNodeId = null;
        renderDetailPanel();
      }
      updateFilterIndicators();
    }
  } catch (err) {
    console.warn('Không thể cập nhật đồ thị sau khi tua giờ:', err);
  }
}
