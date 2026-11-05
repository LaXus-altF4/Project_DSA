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

function renderStatusBadge(status) {
  if (status === 'borrowed') {
    return '<span class="badge badge-borrowed"><span class="badge-dot"></span> Đang mượn</span>';
  }
  if (status === 'maintenance') {
    return '<span class="badge badge-maintenance"><span class="badge-dot"></span> Bảo trì</span>';
  }
  return '<span class="badge badge-available"><span class="badge-dot"></span> Sẵn sàng</span>';
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
 * Ghi chú học thuật cho người chấm (hiển thị xuyên suốt màn hình #/graph)
 */
function renderGraderNoteHtml() {
  return `
    <div class="graph-grader-note">
      <i data-lucide="info"></i>
      <span>Đỉnh = thiết bị, cạnh = số lần được mượn cùng phiếu (Graph vô hướng, danh sách kề tự cài ở lõi C++)</span>
    </div>
  `;
}

/**
 * Hiển thị khung tải Skeleton trong lúc chờ GET /api/graph
 */
function renderSkeleton(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="network"></i> Minh hoạ CTDL Đồ thị
          </h1>
          <div class="page-desc">Mạng lưới trực quan hoá quan hệ mượn kèm giữa các thiết bị phòng Lab.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" disabled>
            <i data-lucide="refresh-cw" class="spin-loading"></i> Đang tải…
          </button>
        </div>
      </div>

      ${renderGraderNoteHtml()}

      <div class="graph-toolbar-panel">
        <div class="skeleton skeleton-text" style="width: 280px; height: 22px; margin: 0;"></div>
        <div class="skeleton skeleton-text" style="width: 240px; height: 20px; margin: 0;"></div>
      </div>

      <div class="graph-workspace-grid">
        <div class="graph-canvas-panel">
          <div class="graph-skeleton-canvas">
            <div class="skeleton" style="width: 64px; height: 64px; border-radius: 9999px;"></div>
            <div class="skeleton skeleton-title" style="width: 220px; margin-top: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 300px;"></div>
          </div>
        </div>
        <aside class="graph-detail-panel">
          <div class="graph-detail-header">
            <div class="skeleton skeleton-title" style="width: 160px; margin: 0;"></div>
          </div>
          <div class="graph-detail-body">
            <div class="skeleton skeleton-card" style="height: 110px;"></div>
            <div class="skeleton skeleton-card" style="height: 150px;"></div>
            <div class="skeleton skeleton-text" style="height: 38px; border-radius: var(--radius-md);"></div>
          </div>
        </aside>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Hiển thị trạng thái Lỗi khi không tải được /api/graph
 */
function renderErrorState(container, errorMessage) {
  cleanupGraphResources();

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="network"></i> Minh hoạ CTDL Đồ thị
          </h1>
          <div class="page-desc">Mạng lưới trực quan hoá quan hệ mượn kèm giữa các thiết bị phòng Lab.</div>
        </div>
        <div class="page-actions">
          <button id="btn-graph-error-refresh" class="btn btn-secondary btn-sm">
            <i data-lucide="refresh-cw"></i> Làm mới
          </button>
        </div>
      </div>

      ${renderGraderNoteHtml()}

      <div class="graph-canvas-panel" style="min-height: 420px; justify-content: center;">
        <div class="error-state">
          <i data-lucide="alert-octagon" class="error-state-icon"></i>
          <div class="error-state-title">Không thể tải dữ liệu đồ thị mượn kèm</div>
          <div class="error-state-desc">${escapeHtml(errorMessage || 'Đã xảy ra lỗi kết nối với máy chủ API.')}</div>
          <button id="btn-graph-retry" class="btn btn-primary btn-sm">
            <i data-lucide="rotate-cw"></i> Thử lại
          </button>
        </div>
      </div>
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
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="network"></i> Minh hoạ CTDL Đồ thị
          </h1>
          <div class="page-desc">Mạng lưới trực quan hoá quan hệ mượn kèm giữa các thiết bị phòng Lab.</div>
        </div>
        <div class="page-actions">
          <button id="btn-graph-empty-refresh" class="btn btn-secondary btn-sm">
            <i data-lucide="refresh-cw"></i> Làm mới
          </button>
        </div>
      </div>

      ${renderGraderNoteHtml()}

      <div class="graph-canvas-panel" style="min-height: 420px; justify-content: center;">
        <div class="empty-state">
          <i data-lucide="share-2" class="empty-state-icon"></i>
          <div class="empty-state-title">Chưa có thiết bị nào trên đồ thị</div>
          <div class="empty-state-desc">
            Danh mục phòng Lab hiện đang trống. Hãy thêm thiết bị và tạo phiếu mượn nhiều món để hình thành mạng lưới liên kết.
          </div>
          <div style="display: flex; gap: 10px; margin-top: 8px;">
            <a href="#/devices" class="btn btn-primary btn-sm">
              <i data-lucide="layers"></i> Đi tới Thiết bị
            </a>
          </div>
        </div>
      </div>
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

  const filterBanner = currentContainer.querySelector('#graph-filter-empty-banner');
  if (filterBanner) {
    if (totalEdges === 0) {
      filterBanner.hidden = false;
      filterBanner.innerHTML = `
        <i data-lucide="sparkles"></i>
        <span>Chưa có cạnh mượn kèm nào (cần lập phiếu có từ 2 thiết bị trở lên). Bạn vẫn có thể bấm vào từng đỉnh để xem thiết bị.</span>
        <a href="#/borrow" class="graph-banner-link">Lập phiếu mượn →</a>
      `;
      if (window.lucide) window.lucide.createIcons({ nodes: [filterBanner] });
    } else if (visibleCount === 0) {
      filterBanner.hidden = false;
      filterBanner.innerHTML = `
        <i data-lucide="sliders-horizontal"></i>
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
      <div class="graph-detail-header">
        <div class="graph-detail-heading">
          <i data-lucide="mouse-pointer-click"></i>
          <span>Chi tiết đỉnh</span>
        </div>
      </div>

      <div class="graph-detail-body">
        <div class="graph-unselected-prompt">
          <div class="graph-unselected-icon">
            <i data-lucide="network"></i>
          </div>
          <div class="graph-unselected-title">Chọn một đỉnh trên đồ thị</div>
          <div class="graph-unselected-desc">
            Nhấp vào bất kỳ đỉnh thiết bị nào để làm nổi bật các cạnh liên kết trực tiếp, xem tồn kho, Top 3 gợi ý mượn kèm và hàng đợi đặt trước.
          </div>
        </div>

        <div class="graph-summary-box">
          <div class="side-panel-section-title">
            <i data-lucide="bar-chart-3"></i> Tóm tắt mạng lưới
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
              <i data-lucide="compass"></i> Chọn nhanh thiết bị tiêu biểu
            </div>
            <div class="graph-quick-chips">
              ${quickNodes.map((n) => `
                <button type="button" class="graph-quick-chip" data-node-id="${escapeHtml(n.id)}" title="Chọn đỉnh ${escapeHtml(n.name)} (${escapeHtml(n.id)})">
                  <span class="graph-tip-dot dot-${escapeHtml(n.status || 'available')}"></span>
                  <code class="mono">${escapeHtml(n.id)}</code>
                  <span class="graph-quick-chip-name">${escapeHtml(n.name)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons({ nodes: [panelEl] });

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
    <div class="graph-detail-header">
      <div class="graph-detail-heading">
        <i data-lucide="pin"></i>
        <span>Chi tiết đỉnh đang chọn</span>
      </div>
      <button type="button" id="btn-panel-unselect" class="btn-icon" title="Bỏ chọn đỉnh" aria-label="Bỏ chọn đỉnh">
        <i data-lucide="x" style="width: 16px; height: 16px;"></i>
      </button>
    </div>

    <div class="graph-detail-body">
      <!-- Khối 1: Thông tin thiết bị -->
      <div class="graph-node-info-card">
        <div class="graph-node-top-row">
          <code class="mono graph-node-code">${escapeHtml(dev.id)}</code>
          ${renderStatusBadge(dev.status)}
        </div>
        <div class="graph-node-name">${escapeHtml(dev.name)}</div>

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
            <i data-lucide="eye-off" style="width: 13px; height: 13px;"></i>
            <span>Đang ẩn <strong class="tabular-nums">${totalNeighbors - visibleNeighbors}</strong> cạnh có trọng số &lt; ${currentMinWeight}.</span>
          </div>
        ` : ''}

        ${hasFullStock ? `
          <div class="graph-stock-box">
            <div class="progress-bar-multi" style="height: 8px;" title="Kho: ${dev.available} sẵn sàng | ${dev.borrowed} đang mượn | ${dev.onHold} đang giữ | ${dev.maintenance} bảo trì">
              <div class="progress-segment segment-available" style="width: ${pAvail}%;"></div>
              <div class="progress-segment segment-borrowed" style="width: ${pBorrow}%;"></div>
              <div class="progress-segment segment-onhold" style="width: ${pHold}%;"></div>
              <div class="progress-segment segment-maintenance" style="width: ${pMaint}%;"></div>
            </div>
            <div class="graph-stock-numbers tabular-nums">
              <span><i class="stock-dot dot-available"></i> Sẵn: <strong>${dev.available}</strong></span>
              <span><i class="stock-dot dot-borrowed"></i> Mượn: <strong>${dev.borrowed}</strong></span>
              <span><i class="stock-dot dot-onhold"></i> Giữ: <strong>${dev.onHold}</strong></span>
              <span><i class="stock-dot dot-maintenance"></i> Bảo trì: <strong>${dev.maintenance}</strong></span>
            </div>
          </div>
        ` : (selectedDetailState.loading ? `
          <div class="skeleton skeleton-text" style="height: 36px; margin-top: 6px; border-radius: var(--radius-sm);"></div>
        ` : '')}
      </div>

      <!-- Khối 2: Top 3 mượn kèm từ API GET /api/suggestions/{id}?k=3 -->
      <div class="side-panel-section">
        <div class="side-panel-section-title">
          <i data-lucide="sparkles"></i> Top 3 thường mượn kèm
        </div>

        ${selectedDetailState.loading ? `
          <div class="graph-companions-list">
            <div class="skeleton" style="height: 54px; border-radius: var(--radius-md);"></div>
            <div class="skeleton" style="height: 54px; border-radius: var(--radius-md);"></div>
            <div class="skeleton" style="height: 54px; border-radius: var(--radius-md);"></div>
          </div>
        ` : selectedDetailState.error ? `
          <div class="graph-inline-error">
            <div>${escapeHtml(selectedDetailState.error)}</div>
            <button type="button" id="btn-retry-suggestions" class="btn btn-outline btn-sm">
              <i data-lucide="rotate-cw"></i> Thử lại
            </button>
          </div>
        ` : selectedDetailState.suggestions.length === 0 ? `
          <div class="graph-empty-companions">
            Thiết bị này chưa có gợi ý mượn kèm khả dụng${totalNeighbors > 0 ? ' (láng giềng hiện đang Bảo trì theo quy tắc M17)' : ' (chưa từng mượn cùng phiếu với thiết bị khác)'}.
          </div>
        ` : `
          <div class="graph-companions-list">
            ${selectedDetailState.suggestions.map((comp, idx) => `
              <button
                type="button"
                class="graph-companion-card suggestion-popin"
                style="animation-delay: ${idx * 50}ms;"
                data-companion-id="${escapeHtml(comp.id)}"
                title="Bấm để chuyển chọn sang đỉnh ${escapeHtml(comp.name)} (${escapeHtml(comp.id)})"
              >
                <div class="graph-companion-rank tabular-nums">#${idx + 1}</div>
                <div class="graph-companion-main">
                  <div class="graph-companion-title">
                    <span>${escapeHtml(comp.name)}</span>
                    <code class="mono">${escapeHtml(comp.id)}</code>
                  </div>
                  <div class="graph-companion-sub tabular-nums">
                    <span class="graph-weight-pill">w = ${comp.weight}</span>
                    <span>•</span>
                    ${comp.outOfStock
                      ? '<span class="comp-stock-out">Hết hàng</span>'
                      : `<span class="comp-stock-ok">Còn ${comp.available} sẵn sàng</span>`
                    }
                  </div>
                </div>
                <i data-lucide="arrow-up-right" class="graph-companion-arrow"></i>
              </button>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Khối 3: Điều hướng Hàng đợi đặt trước -->
      <div class="graph-detail-actions">
        <a href="#/reservations?id=${encodeURIComponent(baseNode.id)}" class="btn btn-primary graph-queue-btn">
          <i data-lucide="clock-4"></i>
          <span>Xem hàng đợi</span>
          ${queueLen !== null && queueLen > 0
            ? `<span class="graph-queue-count tabular-nums">${queueLen} đang chờ</span>`
            : ''
          }
        </a>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons({ nodes: [panelEl] });

  const unselectBtn = panelEl.querySelector('#btn-panel-unselect');
  if (unselectBtn) {
    unselectBtn.addEventListener('click', () => handleSelectNode(null));
  }

  const retrySugBtn = panelEl.querySelector('#btn-retry-suggestions');
  if (retrySugBtn) {
    retrySugBtn.addEventListener('click', () => fetchSelectedNodeDetails(baseNode.id));
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
    <div class="page">
      <!-- Header trang -->
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="network"></i> Minh hoạ CTDL Đồ thị
          </h1>
          <div class="page-desc">Mạng lưới trực quan hoá quan hệ mượn kèm giữa các thiết bị thực hành theo lịch sử phiếu mượn.</div>
        </div>
        <div class="page-actions">
          <button id="btn-graph-refresh" class="btn btn-secondary btn-sm" title="Tải lại dữ liệu đồ thị từ máy chủ">
            <i data-lucide="refresh-cw" id="icon-graph-refresh"></i>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      <!-- Ghi chú cho người chấm -->
      ${renderGraderNoteHtml()}

      <!-- Thanh điều khiển: Lọc trọng số cạnh + Chú giải trạng thái -->
      <div class="graph-toolbar-panel stagger-item stagger-delay-1">
        <div class="graph-slider-group">
          <label for="graph-weight-slider" class="graph-slider-label">
            <i data-lucide="sliders-horizontal"></i>
            <span>Chỉ hiện cạnh trọng số ≥ <strong id="graph-min-weight-val" class="tabular-nums">${currentMinWeight}</strong></span>
          </label>
          <div class="graph-slider-control">
            <span class="graph-slider-bound tabular-nums">1</span>
            <input
              type="range"
              id="graph-weight-slider"
              class="graph-range-input"
              min="1"
              max="${maxEdgeWeight}"
              step="1"
              value="${currentMinWeight}"
              ${sliderDisabled ? 'disabled' : ''}
            >
            <span id="graph-slider-max-bound" class="graph-slider-bound tabular-nums">${maxEdgeWeight}</span>
          </div>
          <span id="graph-edge-counter" class="graph-edge-counter"></span>
        </div>

        <div class="graph-legend-group" aria-label="Chú giải trạng thái đỉnh">
          <span class="graph-legend-item">
            <span class="graph-legend-dot dot-available"></span> Sẵn sàng
          </span>
          <span class="graph-legend-item">
            <span class="graph-legend-dot dot-borrowed"></span> Đang mượn
          </span>
          <span class="graph-legend-item">
            <span class="graph-legend-dot dot-maintenance"></span> Bảo trì
          </span>
          <span class="graph-legend-sep">•</span>
          <span class="graph-legend-hint">Cỡ đỉnh ~ lượt mượn, độ dày cạnh ~ trọng số</span>
        </div>
      </div>

      <!-- Khung 2 cột: Vùng vẽ đồ thị (Trái) + Panel Chi tiết Đỉnh (Phải) -->
      <div class="graph-workspace-grid stagger-item stagger-delay-2">
        <section class="graph-canvas-panel" aria-label="Không gian biểu diễn đồ thị mượn kèm">
          <!-- Cụm nút công cụ nổi góc trên canvas -->
          <div class="graph-canvas-controls">
            <button type="button" id="btn-graph-clear-select" class="btn btn-secondary btn-sm" hidden title="Bỏ chọn đỉnh hiện tại">
              <i data-lucide="x-circle"></i> Bỏ chọn
            </button>
            <button type="button" id="btn-graph-relayout" class="btn btn-secondary btn-sm" title="Bật lại mô phỏng lực trong giây lát để sắp xếp lại bố cục">
              <i data-lucide="orbit" id="icon-graph-relayout"></i>
              <span>Sắp xếp lại lực</span>
            </button>
            <div class="graph-zoom-group">
              <button type="button" id="btn-graph-zoom-in" class="btn-icon" title="Phóng to" aria-label="Phóng to">
                <i data-lucide="zoom-in" style="width: 16px; height: 16px;"></i>
              </button>
              <button type="button" id="btn-graph-zoom-out" class="btn-icon" title="Thu nhỏ" aria-label="Thu nhỏ">
                <i data-lucide="zoom-out" style="width: 16px; height: 16px;"></i>
              </button>
              <button type="button" id="btn-graph-fit" class="btn-icon" title="Căn vừa khung nhìn" aria-label="Căn vừa khung nhìn">
                <i data-lucide="maximize-2" style="width: 15px; height: 15px;"></i>
              </button>
            </div>
          </div>

          <!-- Thông báo nổi khi chưa có cạnh hoặc lọc ẩn toàn bộ cạnh -->
          <div id="graph-filter-empty-banner" class="graph-filter-banner" hidden></div>

          <!-- Host DOM cho module ui/graph-renderer.js -->
          <div id="graph-canvas-host" class="graph-canvas-host"></div>

          <!-- Dòng hướng dẫn tương tác dưới chân canvas -->
          <div class="graph-canvas-footer">
            <span><i data-lucide="hand" style="width: 13px; height: 13px;"></i> Kéo thả đỉnh • Lăn chuột để thu phóng • Bấm đỉnh xem liên kết</span>
            <span>Nhãn trọng số hiện khi <code class="mono">weight ≥ 2</code> hoặc khi trỏ/chọn đỉnh</span>
          </div>
        </section>

        <aside id="graph-detail-panel" class="graph-detail-panel" aria-live="polite"></aside>
      </div>
    </div>
  `;

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
