/**
 * graph-renderer.js - Module dựng đồ thị mượn kèm 2D bằng vis-network cục bộ.
 *
 * Hỗ trợ hệ thống hiệu ứng 2D trực quan hoá CTDL Đồ thị (danh sách kề):
 * - Mở trang: đỉnh xuất hiện lần lượt (scale từ 0), cạnh vẽ dần theo sau, physics chạy ngắn rồi tắt.
 * - Hover đỉnh: phóng to nhẹ, viền toả sáng theo màu trạng thái (M1), các cạnh nối sáng lên.
 * - Chọn đỉnh: camera zoom mượt, đỉnh không liên quan mờ dần (transition), xung sáng chạy dọc
 *   cạnh từ đỉnh chọn ra các láng giềng (minh hoạ duyệt danh sách kề), đánh số 1-2-3 trên Top 3.
 * - Đỉnh đang mượn / bảo trì: vòng sáng thở rất nhẹ (chậm, độ mờ thấp).
 * - Lọc trọng số >= N: cạnh bị ẩn mờ dần thay vì biến mất đột ngột.
 * - Tua giờ / dữ liệu đổi: cạnh có trọng số thay đổi nháy sáng 1 lần.
 *
 * Ràng buộc: Tắt toàn bộ hiệu ứng khi tắt công tắc "Hiệu ứng 3D" hoặc bật prefers-reduced-motion;
 * không gây giật khi kéo thả đỉnh; dừng sạch mọi vòng lặp animation trong destroy().
 */

import { isMotionAllowed, isTabVisible, onFxChange } from './fx.js';

const STATUS_LABELS = {
  available: 'Sẵn sàng',
  borrowed: 'Đang mượn',
  maintenance: 'Bảo trì'
};

/**
 * Bảng màu theo giao diện Sáng / Tối đồng bộ với theme.css & DESIGN.md mục 2.1, 2.2
 */
function getThemePalette(theme) {
  const isDark = theme === 'dark';

  if (isDark) {
    return {
      isDark: true,
      textPrimary: '#F8FAFC',
      textSecondary: '#CBD5E1',
      textDimmed: 'rgba(148, 163, 184, 0.22)',
      labelStroke: 'rgba(15, 23, 42, 0.92)',
      edgeDefault: '#475569',
      edgeHover: '#60A5FA',
      edgeHoverGlowRgb: '96, 165, 250',
      edgeConnected: '#60A5FA',
      edgeTopCompanion: '#93C5FD',
      edgeDimmed: 'rgba(71, 85, 105, 0.18)',
      edgeLabelColor: '#CBD5E1',
      edgeLabelConnected: '#93C5FD',
      edgeLabelDimmed: 'rgba(100, 116, 139, 0.18)',
      selectedShadow: 'rgba(96, 165, 250, 0.58)',
      companionShadow: 'rgba(52, 211, 153, 0.40)',
      nodeShadow: 'rgba(0, 0, 0, 0.45)',
      pulseTopRgb: '96, 165, 250',
      pulseNeighborRgb: '147, 197, 253',
      flashRgb: '56, 189, 248',
      rankBadgeBg: '#3B82F6',
      rankBadgeBorder: '#0F172A',
      rankBadgeOuterRing: 'rgba(147, 197, 253, 0.85)',
      rankBadgeText: '#FFFFFF',
      status: {
        available: {
          bg: '#10B981',
          border: '#34D399',
          selectedBg: '#059669',
          selectedBorder: '#ECFDF5',
          dimBg: 'rgba(16, 185, 129, 0.14)',
          dimBorder: 'rgba(52, 211, 153, 0.18)',
          glowRgb: '52, 211, 153',
          hoverShadow: 'rgba(52, 211, 153, 0.62)'
        },
        borrowed: {
          bg: '#F59E0B',
          border: '#FBBF24',
          selectedBg: '#D97706',
          selectedBorder: '#FFFBEB',
          dimBg: 'rgba(245, 158, 11, 0.14)',
          dimBorder: 'rgba(251, 191, 36, 0.18)',
          glowRgb: '251, 191, 36',
          hoverShadow: 'rgba(251, 191, 36, 0.65)'
        },
        maintenance: {
          bg: '#EF4444',
          border: '#F87171',
          selectedBg: '#DC2626',
          selectedBorder: '#FEF2F2',
          dimBg: 'rgba(239, 68, 68, 0.14)',
          dimBorder: 'rgba(248, 113, 113, 0.18)',
          glowRgb: '248, 113, 113',
          hoverShadow: 'rgba(248, 113, 113, 0.65)'
        }
      }
    };
  }

  return {
    isDark: false,
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    textDimmed: 'rgba(100, 116, 139, 0.26)',
    labelStroke: 'rgba(255, 255, 255, 0.94)',
    edgeDefault: '#94A3B8',
    edgeHover: '#2563EB',
    edgeHoverGlowRgb: '37, 99, 235',
    edgeConnected: '#2563EB',
    edgeTopCompanion: '#1D4ED8',
    edgeDimmed: 'rgba(148, 163, 184, 0.18)',
    edgeLabelColor: '#334155',
    edgeLabelConnected: '#1D4ED8',
    edgeLabelDimmed: 'rgba(148, 163, 184, 0.22)',
    selectedShadow: 'rgba(37, 99, 235, 0.44)',
    companionShadow: 'rgba(16, 185, 129, 0.34)',
    nodeShadow: 'rgba(15, 23, 42, 0.12)',
    pulseTopRgb: '37, 99, 235',
    pulseNeighborRgb: '59, 130, 246',
    flashRgb: '2, 132, 199',
    rankBadgeBg: '#1D4ED8',
    rankBadgeBorder: '#FFFFFF',
    rankBadgeOuterRing: 'rgba(29, 78, 216, 0.32)',
    rankBadgeText: '#FFFFFF',
    status: {
      available: {
        bg: '#10B981',
        border: '#059669',
        selectedBg: '#059669',
        selectedBorder: '#064E3B',
        dimBg: 'rgba(16, 185, 129, 0.15)',
        dimBorder: 'rgba(5, 150, 105, 0.18)',
        glowRgb: '16, 185, 129',
        hoverShadow: 'rgba(16, 185, 129, 0.52)'
      },
      borrowed: {
        bg: '#F59E0B',
        border: '#D97706',
        selectedBg: '#D97706',
        selectedBorder: '#78350F',
        dimBg: 'rgba(245, 158, 11, 0.15)',
        dimBorder: 'rgba(217, 119, 6, 0.18)',
        glowRgb: '245, 158, 11',
        hoverShadow: 'rgba(245, 158, 11, 0.55)'
      },
      maintenance: {
        bg: '#EF4444',
        border: '#DC2626',
        selectedBg: '#DC2626',
        selectedBorder: '#7F1D1D',
        dimBg: 'rgba(239, 68, 68, 0.15)',
        dimBorder: 'rgba(220, 38, 38, 0.18)',
        glowRgb: '239, 68, 68',
        hoverShadow: 'rgba(239, 68, 68, 0.55)'
      }
    }
  };
}

const colorParseCache = new Map();

function parseColorRgba(str) {
  if (colorParseCache.has(str)) {
    return colorParseCache.get(str);
  }
  let parsed = [148, 163, 184, 1];
  const clean = String(str || '').trim();
  if (clean.startsWith('#')) {
    const hex = clean.slice(1);
    if (hex.length === 3) {
      parsed = [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1
      ];
    } else if (hex.length >= 6) {
      parsed = [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        1
      ];
    }
  } else {
    const m = clean.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (m) {
      parsed = [
        Number(m[1]) || 0,
        Number(m[2]) || 0,
        Number(m[3]) || 0,
        m[4] !== undefined ? Number(m[4]) : 1
      ];
    }
  }
  colorParseCache.set(str, parsed);
  return parsed;
}

function lerpColor(colorA, colorB, t) {
  if (t <= 0.001) return colorA;
  if (t >= 0.999) return colorB;
  const a = parseColorRgba(colorA);
  const b = parseColorRgba(colorB);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  const al = Number((a[3] + (b[3] - a[3]) * t).toFixed(3));
  return `rgba(${r}, ${g}, ${bl}, ${al})`;
}

function clamp01(v) {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeOutQuad(t) {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

function easeOutBack(t) {
  const x = clamp01(t);
  const c1 = 1.55;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function makeUndirectedEdgeKey(fromId, toId) {
  const a = String(fromId);
  const b = String(toId);
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function truncateText(text, maxLen = 20) {
  const clean = String(text || '').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Khởi tạo bộ dựng đồ thị 2D trên phần tử DOM chỉ định
 * @param {HTMLElement} containerEl - Vùng chứa canvas đồ thị
 * @param {object} callbacks - Các hàm phản hồi sự kiện (onNodeClick, onPhysicsChange)
 */
export function createGraphRenderer(containerEl, callbacks = {}) {
  if (!containerEl) {
    throw new Error('Không tìm thấy vùng chứa đồ thị.');
  }

  const visLib = window.vis;
  if (!visLib || typeof visLib.Network !== 'function' || typeof visLib.DataSet !== 'function') {
    throw new Error('Thư viện cục bộ vis-network.min.js chưa được nạp.');
  }

  const {
    onNodeClick = () => {},
    onPhysicsChange = () => {}
  } = callbacks;

  // Chuẩn bị lớp bọc canvas + tooltip tuỳ biến theo theme
  containerEl.innerHTML = '';
  const surfaceEl = document.createElement('div');
  surfaceEl.className = 'graph-vis-surface';
  containerEl.appendChild(surfaceEl);

  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'graph-floating-tooltip';
  tooltipEl.setAttribute('aria-hidden', 'true');
  containerEl.appendChild(tooltipEl);

  let currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  let palette = getThemePalette(currentTheme);

  let rawNodes = [];
  let rawEdges = [];
  const nodeMap = new Map();
  const edgeMap = new Map();
  const undirectedToEdgeId = new Map();
  const degreeMap = new Map();

  let minWeightThreshold = 1;
  let maxTimesBorrowed = 1;
  let maxEdgeWeight = 1;
  let hasPulsingStatusNodes = false;

  let selectedNodeId = null;
  let topCompanionSet = new Set();
  const topCompanionRankMap = new Map();
  let rankBadgeRevealMs = 0;
  let selectionPulseStartMs = 0;
  let selectionPulseUntilMs = 0;
  const SELECTION_PULSE_DURATION_MS = 2300;

  let hoveredNodeId = null;
  let hoveredEdgeId = null;

  let physicsTimer = null;
  let isDestroyed = false;
  let isDragging = false;

  // Trạng thái các hiệu ứng 2D trên Canvas
  let rafId = 0;
  let lastAmbientDrawMs = 0;

  const introState = {
    active: false,
    startMs: 0,
    nodeStaggerMs: 22,
    nodeDurationMs: 320,
    edgeStartBaseMs: 200,
    edgeStaggerMs: 12,
    edgeDurationMs: 360,
    totalDurationMs: 820,
    pendingFlashKeys: []
  };

  const dimTransition = {
    active: false,
    startMs: 0,
    durationMs: 240
  };
  const nodeDimStart = new Map();
  const nodeDimCurrent = new Map();
  const nodeDimTarget = new Map();
  const edgeDimStart = new Map();
  const edgeDimCurrent = new Map();
  const edgeDimTarget = new Map();

  // Map<edgeId, { edge, startMs, durationMs, perpRatio, width, colorStr }>
  const fadingOutEdges = new Map();
  // Map<edgeId, { startMs, durationMs }>
  const flashingEdges = new Map();

  const canAnimate = () => !isDestroyed && isMotionAllowed() && isTabVisible();

  const nodesDataSet = new visLib.DataSet();
  const edgesDataSet = new visLib.DataSet();

  const networkOptions = {
    autoResize: true,
    height: '100%',
    width: '100%',
    interaction: {
      hover: true,
      hoverConnectedEdges: false,
      selectConnectedEdges: false,
      dragNodes: true,
      dragView: true,
      zoomView: true,
      multiselect: false,
      navigationButtons: false,
      keyboard: false,
      tooltipDelay: 120
    },
    nodes: {
      shape: 'dot',
      chosen: false,
      borderWidth: 2.5,
      font: {
        face: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        size: 12,
        vadjust: 2
      }
    },
    edges: {
      chosen: false,
      arrows: { to: { enabled: false }, from: { enabled: false } },
      // Dùng continuous thay vì dynamic để khi tắt physics kéo thả đỉnh không bị cong cứng cạnh
      smooth: {
        enabled: true,
        type: 'continuous',
        roundness: 0.12
      },
      font: {
        face: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        size: 11,
        align: 'middle'
      }
    },
    physics: {
      enabled: true,
      solver: 'barnesHut',
      barnesHut: {
        gravitationalConstant: -3200,
        centralGravity: 0.28,
        springLength: 148,
        springConstant: 0.045,
        damping: 0.26,
        avoidOverlap: 0.42
      },
      stabilization: {
        enabled: true,
        iterations: 160,
        updateInterval: 25,
        fit: true
      }
    }
  };

  const network = new visLib.Network(
    surfaceEl,
    { nodes: nodesDataSet, edges: edgesDataSet },
    networkOptions
  );

  function refreshPulsingStatusFlag() {
    hasPulsingStatusNodes = rawNodes.some(
      (n) => n.status === 'borrowed' || n.status === 'maintenance'
    );
  }

  /**
   * Lấy toạ độ thế giới (world space) hiện tại của 1 đỉnh trong O(1), kể cả khi đang kéo thả
   */
  function getNodeWorldPos(nodeId) {
    const bodyNodes = network.body && network.body.nodes;
    const bn = bodyNodes ? bodyNodes[nodeId] : null;
    if (bn && Number.isFinite(bn.x) && Number.isFinite(bn.y)) {
      return { x: bn.x, y: bn.y };
    }
    try {
      const posMap = network.getPositions([nodeId]);
      const p = posMap && posMap[nodeId];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        return { x: p.x, y: p.y };
      }
    } catch (_) {
      // Bỏ qua nếu đỉnh chưa khởi tạo toạ độ
    }
    return null;
  }

  /**
   * Lấy điểm trên đường cong cạnh tại tham số t ∈ [0, 1] tính từ edge.from -> edge.to
   */
  function sampleEdgePoint(edge, t, fallbackPerpRatio = null) {
    const clampedT = clamp01(t);
    const bodyEdges = network.body && network.body.edges;
    const be = bodyEdges ? bodyEdges[edge.id] : null;
    if (be && be.edgeType && typeof be.edgeType.getPoint === 'function') {
      const param = be.fromId === edge.to && be.toId === edge.from ? 1 - clampedT : clampedT;
      try {
        const pt = be.edgeType.getPoint(param);
        if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
          return { x: pt.x, y: pt.y };
        }
      } catch (_) {
        // Fallback nội suy bên dưới
      }
    }

    const p0 = getNodeWorldPos(edge.from);
    const p1 = getNodeWorldPos(edge.to);
    if (!p0 || !p1) return null;

    if (fallbackPerpRatio !== null && Math.abs(fallbackPerpRatio) > 0.0005) {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const mx = (p0.x + p1.x) * 0.5;
      const my = (p0.y + p1.y) * 0.5;
      const cx = mx - dy * fallbackPerpRatio * 2;
      const cy = my + dx * fallbackPerpRatio * 2;
      const omt = 1 - clampedT;
      return {
        x: omt * omt * p0.x + 2 * omt * clampedT * cx + clampedT * clampedT * p1.x,
        y: omt * omt * p0.y + 2 * omt * clampedT * cy + clampedT * clampedT * p1.y
      };
    }

    return {
      x: p0.x + (p1.x - p0.x) * clampedT,
      y: p0.y + (p1.y - p0.y) * clampedT
    };
  }

  /**
   * Đo độ cong tương đối hiện tại của cạnh trước khi gỡ khỏi DataSet để vẽ mờ dần chính xác
   */
  function captureEdgePerpRatio(edge) {
    const p0 = getNodeWorldPos(edge.from);
    const p1 = getNodeWorldPos(edge.to);
    const pMid = sampleEdgePoint(edge, 0.5, null);
    if (!p0 || !p1 || !pMid) return 0;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return 0;
    const mx = (p0.x + p1.x) * 0.5;
    const my = (p0.y + p1.y) * 0.5;
    // Vector pháp tuyến (-dy, dx)
    return ((pMid.x - mx) * (-dy) + (pMid.y - my) * dx) / lenSq;
  }

  /**
   * Vẽ một đoạn đường cong của cạnh từ tStart đến tEnd trên Canvas 2D (world space)
   */
  function strokeEdgeSegment(ctx, edge, tStart, tEnd, segments = 14, perpRatio = null) {
    const a = clamp01(tStart);
    const b = clamp01(tEnd);
    if (Math.abs(b - a) < 0.002) return false;

    const first = sampleEdgePoint(edge, a, perpRatio);
    if (!first) return false;

    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i <= segments; i++) {
      const u = a + ((b - a) * i) / segments;
      const pt = sampleEdgePoint(edge, u, perpRatio);
      if (pt) {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();
    return true;
  }

  /**
   * Tắt mô phỏng lực vật lý để đồ thị đứng yên hoàn toàn sau khi ổn định
   */
  function stopPhysics() {
    if (isDestroyed) return;
    if (physicsTimer) {
      clearTimeout(physicsTimer);
      physicsTimer = null;
    }
    network.setOptions({ physics: { enabled: false } });
    onPhysicsChange(false);
  }

  /**
   * Bật mô phỏng lực trong thời gian ngắn (tối đa <= 1.8s < 2s) để sắp xếp lại bố cục rồi tự động tắt
   */
  function startTemporaryPhysics(durationMs = 950, shouldFitAfter = false, notifyUi = false) {
    if (isDestroyed) return;
    if (physicsTimer) {
      clearTimeout(physicsTimer);
      physicsTimer = null;
    }

    const safeDurationMs = Math.min(Math.max(Number(durationMs) || 950, 300), 1800);

    if (rawNodes.length <= 1) {
      stopPhysics();
      if (shouldFitAfter && rawNodes.length === 1) {
        fitView(false);
      }
      return;
    }

    if (!isMotionAllowed()) {
      network.setOptions({
        physics: {
          enabled: true,
          stabilization: { enabled: true, iterations: 160, fit: true }
        }
      });
      network.stabilize(160);
      stopPhysics();
      if (shouldFitAfter) fitView(false);
      return;
    }

    if (notifyUi) {
      onPhysicsChange(true);
    }

    network.setOptions({
      physics: {
        enabled: true,
        stabilization: { enabled: false }
      }
    });
    network.startSimulation();

    physicsTimer = setTimeout(() => {
      stopPhysics();
      if (shouldFitAfter) {
        fitView(true);
      }
    }, safeDurationMs);
  }

  /**
   * Tính danh sách các cạnh đang hiển thị theo ngưỡng trọng số hiện tại
   */
  function getVisibleRawEdges() {
    return rawEdges.filter((e) => e.weight >= minWeightThreshold);
  }

  /**
   * Xác định tập đỉnh kề trực tiếp với đỉnh đang chọn trong tập cạnh đang hiển thị
   */
  function getConnectedNeighborSet(targetNodeId, visibleEdges) {
    const neighbors = new Set();
    if (!targetNodeId) return neighbors;
    for (const e of visibleEdges) {
      if (e.from === targetNodeId) neighbors.add(e.to);
      else if (e.to === targetNodeId) neighbors.add(e.from);
    }
    return neighbors;
  }

  /**
   * Tính kích thước đỉnh tỷ lệ với lượt mượn (timesBorrowed)
   */
  function computeNodeSize(timesBorrowed) {
    const count = Math.max(0, Number(timesBorrowed) || 0);
    if (maxTimesBorrowed <= 0) return 18;
    const ratio = Math.min(1, count / maxTimesBorrowed);
    return Math.round(16 + Math.sqrt(ratio) * 20);
  }

  /**
   * Tính độ dày cạnh tỷ lệ với trọng số (weight)
   */
  function computeEdgeWidth(weight) {
    const w = Math.max(1, Number(weight) || 1);
    if (maxEdgeWeight <= 1) return 2.2;
    const ratio = Math.min(1, (w - 1) / (maxEdgeWeight - 1));
    return Number((1.6 + ratio * 5.6).toFixed(2));
  }

  function getNodeDimFactor(nodeId, connectedNeighbors) {
    if (dimTransition.active && nodeDimCurrent.has(nodeId)) {
      return nodeDimCurrent.get(nodeId);
    }
    if (!selectedNodeId) return 0;
    if (nodeId === selectedNodeId || connectedNeighbors.has(nodeId)) return 0;
    return 1;
  }

  function getEdgeDimFactor(edge) {
    if (dimTransition.active && edgeDimCurrent.has(edge.id)) {
      return edgeDimCurrent.get(edge.id);
    }
    if (!selectedNodeId) return 0;
    const isIncidentSelected = edge.from === selectedNodeId || edge.to === selectedNodeId;
    if (isIncidentSelected || hoveredEdgeId === edge.id) return 0;
    return 1;
  }

  /**
   * Khởi tạo chuyển tiếp mượt (transition) khi làm mờ / khôi phục các đỉnh & cạnh không liên quan
   */
  function startSelectionDimTransition() {
    const visibleEdges = getVisibleRawEdges();
    const connectedNeighbors = getConnectedNeighborSet(selectedNodeId, visibleEdges);

    if (!canAnimate() || isDragging) {
      dimTransition.active = false;
      for (const n of rawNodes) {
        const target = selectedNodeId && n.id !== selectedNodeId && !connectedNeighbors.has(n.id) ? 1 : 0;
        nodeDimCurrent.set(n.id, target);
        nodeDimTarget.set(n.id, target);
      }
      for (const e of rawEdges) {
        const isIncident = Boolean(selectedNodeId && (e.from === selectedNodeId || e.to === selectedNodeId));
        const target = selectedNodeId && !isIncident ? 1 : 0;
        edgeDimCurrent.set(e.id, target);
        edgeDimTarget.set(e.id, target);
      }
      syncVisualStyles();
      return;
    }

    let hasDiff = false;
    for (const n of rawNodes) {
      const cur = nodeDimCurrent.has(n.id) ? nodeDimCurrent.get(n.id) : 0;
      const target = selectedNodeId && n.id !== selectedNodeId && !connectedNeighbors.has(n.id) ? 1 : 0;
      nodeDimStart.set(n.id, cur);
      nodeDimCurrent.set(n.id, cur);
      nodeDimTarget.set(n.id, target);
      if (Math.abs(target - cur) > 0.01) hasDiff = true;
    }

    for (const e of rawEdges) {
      const cur = edgeDimCurrent.has(e.id) ? edgeDimCurrent.get(e.id) : 0;
      const isIncident = Boolean(selectedNodeId && (e.from === selectedNodeId || e.to === selectedNodeId));
      const target = selectedNodeId && !isIncident ? 1 : 0;
      edgeDimStart.set(e.id, cur);
      edgeDimCurrent.set(e.id, cur);
      edgeDimTarget.set(e.id, target);
      if (Math.abs(target - cur) > 0.01) hasDiff = true;
    }

    if (!hasDiff) {
      dimTransition.active = false;
      syncVisualStyles();
      return;
    }

    dimTransition.active = true;
    dimTransition.startMs = performance.now();
    dimTransition.durationMs = selectedNodeId ? 240 : 210;
    syncVisualStyles();
    ensureAnimLoop();
  }

  function settleDimTransitionNow() {
    if (!dimTransition.active) return;
    dimTransition.active = false;
    nodeDimTarget.forEach((val, id) => nodeDimCurrent.set(id, val));
    edgeDimTarget.forEach((val, id) => edgeDimCurrent.set(id, val));
    syncVisualStyles();
  }

  /**
   * Dựng cấu hình hiển thị cho 1 đỉnh theo trạng thái chọn / hover / transition / theme
   */
  function buildVisNode(node, connectedNeighbors) {
    const statusKey = palette.status[node.status] ? node.status : 'available';
    const stColors = palette.status[statusKey];
    const baseSize = computeNodeSize(node.timesBorrowed);
    const shortName = truncateText(node.name, 20);
    const label = `${node.id}\n${shortName}`;

    // Trong pha intro mở trang, ẩn nét vẽ mặc định của vis-network để vẽ scale 0 -> 1 mượt trên canvas
    if (introState.active) {
      return {
        id: node.id,
        label,
        size: baseSize,
        borderWidth: 0,
        color: {
          background: 'rgba(0, 0, 0, 0)',
          border: 'rgba(0, 0, 0, 0)',
          highlight: { background: 'rgba(0, 0, 0, 0)', border: 'rgba(0, 0, 0, 0)' },
          hover: { background: 'rgba(0, 0, 0, 0)', border: 'rgba(0, 0, 0, 0)' }
        },
        font: {
          color: 'rgba(0, 0, 0, 0)',
          size: 12,
          strokeWidth: 0,
          strokeColor: 'rgba(0, 0, 0, 0)'
        },
        shadow: { enabled: false }
      };
    }

    const hasSelection = Boolean(selectedNodeId);
    const isSelected = selectedNodeId === node.id;
    const isDirectNeighbor = hasSelection && connectedNeighbors.has(node.id);
    const isTopCompanion = isDirectNeighbor && topCompanionSet.has(node.id);
    const isHovered = hoveredNodeId === node.id;
    const dimFactor = isHovered ? Math.min(0.25, getNodeDimFactor(node.id, connectedNeighbors)) : getNodeDimFactor(node.id, connectedNeighbors);
    const motionOn = isMotionAllowed();

    let bg = lerpColor(stColors.bg, stColors.dimBg, dimFactor);
    let border = lerpColor(stColors.border, stColors.dimBorder, dimFactor);
    let borderWidth = 2.5 - dimFactor * 1.0;
    let fontColor = lerpColor(palette.textPrimary, palette.textDimmed, dimFactor);
    let strokeWidth = dimFactor > 0.55 ? 0 : 3;
    let size = baseSize;
    let shadow = {
      enabled: dimFactor < 0.5,
      color: palette.nodeShadow,
      size: 8,
      x: 0,
      y: 2
    };

    if (isSelected) {
      bg = stColors.selectedBg;
      border = stColors.selectedBorder;
      borderWidth = 4;
      size = baseSize + (isHovered && motionOn ? 4.2 : 3);
      fontColor = palette.textPrimary;
      strokeWidth = 3.2;
      shadow = {
        enabled: true,
        color: isHovered && motionOn ? stColors.hoverShadow : palette.selectedShadow,
        size: isHovered && motionOn ? 22 : 18,
        x: 0,
        y: 0
      };
    } else if (isHovered) {
      // Hover đỉnh: phóng to nhẹ + viền phát sáng theo màu trạng thái thiết bị
      bg = stColors.bg;
      border = stColors.border;
      borderWidth = motionOn ? 3.8 : 3.2;
      size = baseSize + (motionOn ? 3.4 : 1.5);
      fontColor = palette.textPrimary;
      strokeWidth = 3.2;
      shadow = motionOn ? {
        enabled: true,
        color: stColors.hoverShadow,
        size: 20,
        x: 0,
        y: 0
      } : shadow;
    } else if (isTopCompanion) {
      borderWidth = 3.5;
      shadow = {
        enabled: true,
        color: palette.companionShadow,
        size: 13,
        x: 0,
        y: 0
      };
    }

    return {
      id: node.id,
      label,
      size,
      borderWidth,
      color: {
        background: bg,
        border,
        highlight: { background: bg, border },
        hover: { background: bg, border }
      },
      font: {
        color: fontColor,
        size: isSelected || (isHovered && motionOn) ? 13 : 12,
        strokeWidth,
        strokeColor: palette.labelStroke
      },
      shadow
    };
  }

  /**
   * Dựng cấu hình hiển thị cho 1 cạnh theo trọng số, chọn đỉnh, hover, transition và theme.
   */
  function buildVisEdge(edge) {
    const baseWidth = computeEdgeWidth(edge.weight);

    if (introState.active) {
      return {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        width: baseWidth,
        label: '',
        color: {
          color: 'rgba(0, 0, 0, 0)',
          highlight: 'rgba(0, 0, 0, 0)',
          hover: 'rgba(0, 0, 0, 0)'
        },
        font: {
          color: 'rgba(0, 0, 0, 0)',
          size: 11,
          strokeWidth: 0,
          strokeColor: 'rgba(0, 0, 0, 0)'
        }
      };
    }

    const hasSelection = Boolean(selectedNodeId);
    const isIncidentSelected = hasSelection && (edge.from === selectedNodeId || edge.to === selectedNodeId);
    const otherNodeId = isIncidentSelected
      ? (edge.from === selectedNodeId ? edge.to : edge.from)
      : null;
    const isTopCompanionEdge = Boolean(isIncidentSelected && otherNodeId && topCompanionSet.has(otherNodeId));

    const isHoveredDirect = hoveredEdgeId === edge.id;
    const isIncidentHovered = Boolean(hoveredNodeId && (edge.from === hoveredNodeId || edge.to === hoveredNodeId));
    const isHoverContext = isHoveredDirect || isIncidentHovered;

    const dimFactor = isHoverContext ? 0 : getEdgeDimFactor(edge);
    const motionOn = isMotionAllowed();

    let edgeColor = lerpColor(palette.edgeDefault, palette.edgeDimmed, dimFactor);
    let width = baseWidth * (1 - dimFactor * 0.16);
    let labelColor = lerpColor(palette.edgeLabelColor, palette.edgeLabelDimmed, dimFactor);
    let labelStrokeWidth = dimFactor > 0.55 ? 0 : 3;

    if (isHoverContext) {
      edgeColor = palette.edgeHover;
      width = baseWidth + (motionOn ? 1.35 : 0.8);
      labelColor = palette.edgeLabelConnected;
      labelStrokeWidth = 3.5;
    } else if (isIncidentSelected) {
      edgeColor = isTopCompanionEdge ? palette.edgeTopCompanion : palette.edgeConnected;
      width = baseWidth + (isTopCompanionEdge ? 1.6 : 1.0);
      labelColor = palette.edgeLabelConnected;
      labelStrokeWidth = 3.5;
    }

    const shouldShowLabel = edge.weight >= 2 || isIncidentSelected || isHoverContext;
    const labelText = shouldShowLabel ? String(edge.weight) : '';

    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      width: Math.max(1, width),
      label: labelText,
      color: {
        color: edgeColor,
        highlight: edgeColor,
        hover: edgeColor
      },
      font: {
        color: labelColor,
        size: isIncidentSelected || isHoverContext ? 12 : 11,
        strokeWidth: labelStrokeWidth,
        strokeColor: palette.labelStroke
      }
    };
  }

  /**
   * Đồng bộ lại toàn bộ kiểu dáng Đỉnh và Cạnh trên DataSet mà không khởi động lại vật lý
   */
  function syncVisualStyles({ allowEdgeFadeOut = false } = {}) {
    if (isDestroyed) return;

    const visibleEdges = getVisibleRawEdges();
    const visibleEdgeIds = new Set(visibleEdges.map((e) => e.id));
    const connectedNeighbors = getConnectedNeighborSet(selectedNodeId, visibleEdges);

    // Xử lý các cạnh vừa bị lọc ẩn bởi thanh trượt trọng số >= N
    const existingEdgeIds = edgesDataSet.getIds();
    const toRemove = existingEdgeIds.filter((id) => !visibleEdgeIds.has(id));
    if (toRemove.length > 0) {
      if (allowEdgeFadeOut && canAnimate() && !introState.active) {
        const nowMs = performance.now();
        for (const id of toRemove) {
          const rawEdge = edgeMap.get(id);
          if (rawEdge) {
            fadingOutEdges.set(id, {
              edge: rawEdge,
              startMs: nowMs,
              durationMs: 250,
              perpRatio: captureEdgePerpRatio(rawEdge),
              width: computeEdgeWidth(rawEdge.weight),
              colorStr: palette.edgeDefault
            });
          }
        }
        ensureAnimLoop();
      }
      edgesDataSet.remove(toRemove);
    }

    // Nếu người dùng kéo thanh trượt giảm xuống làm cạnh hiện lại -> huỷ mờ dần của cạnh đó
    if (fadingOutEdges.size > 0) {
      for (const id of visibleEdgeIds) {
        fadingOutEdges.delete(id);
      }
    }

    if (visibleEdges.length > 0) {
      const visEdges = visibleEdges.map((e) => buildVisEdge(e));
      edgesDataSet.update(visEdges);
    }

    if (rawNodes.length > 0) {
      const visNodes = rawNodes.map((n) => buildVisNode(n, connectedNeighbors));
      nodesDataSet.update(visNodes);
    }
  }

  /**
   * Kết thúc ngay lập tức pha intro mở trang và trả quyền vẽ tĩnh cho vis-network
   */
  function finishIntroImmediately() {
    if (!introState.active) return;
    introState.active = false;
    syncVisualStyles();
    if (introState.pendingFlashKeys.length > 0) {
      const keys = introState.pendingFlashKeys.slice();
      introState.pendingFlashKeys = [];
      flashEdgesByKeys(keys);
    }
  }

  /**
   * Vẽ lớp nền dưới đỉnh/cạnh (beforeDrawing — toạ độ world space):
   * 1. Cạnh vẽ dần lúc mở trang (intro)
   * 2. Cạnh đang mờ dần khi kéo thanh trượt trọng số >= N
   * 3. Vòng sáng nhấp nháy rất nhẹ, chậm của đỉnh Đang mượn / Bảo trì
   * 4. Vòng hào quang trạng thái + vệt sáng cạnh nối khi Hover đỉnh
   */
  function handleBeforeDrawing(ctx) {
    if (isDestroyed || !isMotionAllowed()) return;
    const nowMs = performance.now();

    // 1. Vẽ dần các cạnh trong pha mở trang (intro)
    if (introState.active) {
      const elapsed = nowMs - introState.startMs;
      const visibleEdges = getVisibleRawEdges();
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < visibleEdges.length; i++) {
        const edge = visibleEdges[i];
        const delay = introState.edgeStartBaseMs + i * introState.edgeStaggerMs;
        const prog = clamp01((elapsed - delay) / introState.edgeDurationMs);
        if (prog <= 0) continue;

        const eased = easeOutCubic(prog);
        ctx.strokeStyle = palette.edgeDefault;
        ctx.globalAlpha = 0.25 + 0.75 * eased;
        ctx.lineWidth = computeEdgeWidth(edge.weight);
        strokeEdgeSegment(ctx, edge, 0, eased, 14, null);

        if (edge.weight >= 2 && eased > 0.75) {
          const mid = sampleEdgePoint(edge, 0.5, null);
          if (mid) {
            const lblAlpha = clamp01((eased - 0.75) / 0.25);
            ctx.globalAlpha = lblAlpha;
            ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = palette.labelStroke;
            ctx.strokeText(String(edge.weight), mid.x, mid.y);
            ctx.fillStyle = palette.edgeLabelColor;
            ctx.fillText(String(edge.weight), mid.x, mid.y);
          }
        }
      }
      ctx.restore();
      return;
    }

    // 2. Vẽ các cạnh đang mờ dần khi lọc trọng số >= N
    if (fadingOutEdges.size > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      fadingOutEdges.forEach((item, edgeId) => {
        const prog = clamp01((nowMs - item.startMs) / item.durationMs);
        if (prog >= 1) {
          fadingOutEdges.delete(edgeId);
          return;
        }
        const alpha = (1 - easeOutQuad(prog)) * (selectedNodeId ? 0.42 : 0.85);
        if (alpha <= 0.01) return;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = item.colorStr;
        ctx.lineWidth = item.width;
        strokeEdgeSegment(ctx, item.edge, 0, 1, 12, item.perpRatio);
      });
      ctx.restore();
    }

    const visibleEdges = getVisibleRawEdges();
    const connectedNeighbors = getConnectedNeighborSet(selectedNodeId, visibleEdges);

    // 3. Vòng sáng thở rất nhẹ, chậm, độ mờ thấp cho đỉnh Đang mượn / Bảo trì
    if (hasPulsingStatusNodes) {
      ctx.save();
      for (let i = 0; i < rawNodes.length; i++) {
        const node = rawNodes[i];
        if (node.status !== 'borrowed' && node.status !== 'maintenance') continue;
        const dimFactor = getNodeDimFactor(node.id, connectedNeighbors);
        if (dimFactor > 0.72) continue;

        const pos = getNodeWorldPos(node.id);
        if (!pos) continue;

        const stColors = palette.status[node.status];
        const baseR = computeNodeSize(node.timesBorrowed);
        // Nhịp thở rất chậm ~3.9 giây, độ mờ thấp (0.05 -> 0.17)
        const wave = 0.5 + 0.5 * Math.sin(nowMs * 0.0016 + i * 1.15);
        const alpha = (0.05 + wave * 0.12) * (1 - dimFactor);
        const ringR = baseR + 3.5 + wave * 4.6;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, ringR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${stColors.glowRgb}, ${(alpha * 0.28).toFixed(3)})`;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = `rgba(${stColors.glowRgb}, ${alpha.toFixed(3)})`;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Hào quang viền theo màu trạng thái & làm sáng cạnh nối khi Hover đỉnh
    if (hoveredNodeId && nodeMap.has(hoveredNodeId)) {
      const hNode = nodeMap.get(hoveredNodeId);
      const stKey = palette.status[hNode.status] ? hNode.status : 'available';
      const stColors = palette.status[stKey];
      const hPos = getNodeWorldPos(hoveredNodeId);

      ctx.save();
      ctx.lineCap = 'round';
      for (const edge of visibleEdges) {
        if (edge.from !== hoveredNodeId && edge.to !== hoveredNodeId) continue;
        ctx.strokeStyle = `rgba(${palette.edgeHoverGlowRgb}, ${palette.isDark ? 0.28 : 0.20})`;
        ctx.lineWidth = computeEdgeWidth(edge.weight) + 5.5;
        strokeEdgeSegment(ctx, edge, 0, 1, 12, null);
      }

      if (hPos) {
        const nodeR = computeNodeSize(hNode.timesBorrowed) + 3.4;
        const outerR = nodeR + 10;
        const grad = ctx.createRadialGradient(hPos.x, hPos.y, nodeR * 0.85, hPos.x, hPos.y, outerR);
        grad.addColorStop(0, `rgba(${stColors.glowRgb}, ${palette.isDark ? 0.42 : 0.34})`);
        grad.addColorStop(1, `rgba(${stColors.glowRgb}, 0)`);
        ctx.beginPath();
        ctx.arc(hPos.x, hPos.y, outerR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * Vẽ lớp nổi trên đỉnh/cạnh (afterDrawing — toạ độ world space):
   * 1. Đỉnh scale từ 0 lần lượt khi mở trang (intro)
   * 2. Cạnh nháy sáng 1 lần khi trọng số thay đổi (tua giờ / làm mới dữ liệu)
   * 3. Xung tín hiệu sáng chạy dọc cạnh từ đỉnh chọn ra các láng giềng (duyệt danh sách kề)
   * 4. Huy hiệu đánh số thứ tự 1 - 2 - 3 trực tiếp trên 3 láng giềng Top 3
   */
  function handleAfterDrawing(ctx) {
    if (isDestroyed || !isMotionAllowed()) return;
    const nowMs = performance.now();

    // 1. Vẽ các đỉnh xuất hiện lần lượt (scale 0 -> 1) lúc mở trang
    if (introState.active) {
      const elapsed = nowMs - introState.startMs;
      ctx.save();
      for (let i = 0; i < rawNodes.length; i++) {
        const node = rawNodes[i];
        const delay = i * introState.nodeStaggerMs;
        const prog = clamp01((elapsed - delay) / introState.nodeDurationMs);
        if (prog <= 0) continue;

        const pos = getNodeWorldPos(node.id);
        if (!pos) continue;

        const scale = Math.max(0.02, easeOutBack(prog));
        const baseR = computeNodeSize(node.timesBorrowed);
        const r = baseR * scale;
        const stKey = palette.status[node.status] ? node.status : 'available';
        const stColors = palette.status[stKey];

        ctx.save();
        ctx.globalAlpha = clamp01(prog * 1.35);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = stColors.bg;
        ctx.fill();
        ctx.lineWidth = 2.5 * Math.min(1, scale);
        ctx.strokeStyle = stColors.border;
        ctx.stroke();

        if (prog > 0.42) {
          const lblAlpha = clamp01((prog - 0.42) / 0.58);
          ctx.globalAlpha = lblAlpha;
          ctx.font = "500 12px 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.lineWidth = 3;
          ctx.strokeStyle = palette.labelStroke;
          ctx.fillStyle = palette.textPrimary;

          const shortName = truncateText(node.name, 20);
          const line1Y = pos.y + baseR + 5;
          const line2Y = line1Y + 15;
          ctx.strokeText(node.id, pos.x, line1Y);
          ctx.fillText(node.id, pos.x, line1Y);
          ctx.strokeText(shortName, pos.x, line2Y);
          ctx.fillText(shortName, pos.x, line2Y);
        }
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    const visibleEdges = getVisibleRawEdges();
    const visibleEdgeSet = new Set(visibleEdges.map((e) => e.id));
    const connectedNeighbors = getConnectedNeighborSet(selectedNodeId, visibleEdges);

    // 2. Hiệu ứng nháy sáng 1 lần trên cạnh vừa đổi trọng số
    if (flashingEdges.size > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      flashingEdges.forEach((info, edgeId) => {
        const prog = (nowMs - info.startMs) / info.durationMs;
        if (prog >= 1) {
          flashingEdges.delete(edgeId);
          return;
        }
        if (!visibleEdgeSet.has(edgeId)) return;
        const edge = edgeMap.get(edgeId);
        if (!edge) return;

        // Xung nháy đơn: tăng nhanh 24% đầu rồi dịu mượt về 0
        const intensity = prog < 0.24
          ? prog / 0.24
          : Math.pow(1 - (prog - 0.24) / 0.76, 1.85);
        const w = computeEdgeWidth(edge.weight);

        ctx.strokeStyle = `rgba(${palette.flashRgb}, ${(0.48 * intensity).toFixed(3)})`;
        ctx.lineWidth = w + 8;
        strokeEdgeSegment(ctx, edge, 0, 1, 14, null);

        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.88 * intensity).toFixed(3)})`;
        ctx.lineWidth = w + 1.8;
        strokeEdgeSegment(ctx, edge, 0, 1, 14, null);

        const mid = sampleEdgePoint(edge, 0.5, null);
        if (mid) {
          const ringR = 8 + easeOutQuad(prog) * 18;
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, ringR, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = `rgba(${palette.flashRgb}, ${(0.65 * (1 - prog)).toFixed(3)})`;
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // 3. Xung sáng chạy dọc các cạnh nối trực tiếp từ đỉnh chọn ra láng giềng (hữu hạn ~2 đợt rồi nghỉ)
    if (selectedNodeId && nodeMap.has(selectedNodeId)) {
      const incidentEdges = visibleEdges.filter(
        (e) => e.from === selectedNodeId || e.to === selectedNodeId
      );

      if (incidentEdges.length > 0 && nowMs < selectionPulseUntilMs) {
        const pulseElapsed = Math.max(0, nowMs - selectionPulseStartMs);
        const fadeOutTail = clamp01((selectionPulseUntilMs - nowMs) / 360);
        ctx.save();
        ctx.lineCap = 'round';

        for (let idx = 0; idx < incidentEdges.length; idx++) {
          const edge = incidentEdges[idx];
          const fromSelected = edge.from === selectedNodeId;
          const neighborId = fromSelected ? edge.to : edge.from;
          const isTop = topCompanionSet.has(neighborId);
          const pulseRgb = isTop ? palette.pulseTopRgb : palette.pulseNeighborRgb;

          // Chạy từ rìa đỉnh chọn (uMin) ra rìa đỉnh láng giềng (uMax)
          const uMin = 0.08;
          const uMax = 0.90;
          const localTime = pulseElapsed - idx * 95;
          if (localTime < 0) continue;
          const phase = (localTime / 1050) % 1;
          const uHead = uMin + phase * (uMax - uMin);
          const uTail = Math.max(uMin, uHead - 0.15);
          const env = Math.sin(phase * Math.PI) * fadeOutTail;
          if (env <= 0.01) continue;

          const toEdgeT = (u) => (fromSelected ? u : 1 - u);
          const headPt = sampleEdgePoint(edge, toEdgeT(uHead), null);
          if (!headPt) continue;

          // Vệt đuôi sáng mảnh phía sau xung
          const tailSteps = 4;
          for (let s = 0; s < tailSteps; s++) {
            const segA = uTail + ((uHead - uTail) * s) / tailSteps;
            const segB = uTail + ((uHead - uTail) * (s + 1)) / tailSteps;
            const frac = (s + 1) / tailSteps;
            ctx.strokeStyle = `rgba(${pulseRgb}, ${(env * frac * (isTop ? 0.72 : 0.52)).toFixed(3)})`;
            ctx.lineWidth = (isTop ? 3.2 : 2.4) * frac + 0.8;
            strokeEdgeSegment(ctx, edge, toEdgeT(segA), toEdgeT(segB), 3, null);
          }

          // Hạt nhân xung sáng ở đầu mũi duyệt
          const glowR = isTop ? 8.5 : 6.8;
          const grad = ctx.createRadialGradient(headPt.x, headPt.y, 0.8, headPt.x, headPt.y, glowR);
          grad.addColorStop(0, `rgba(255, 255, 255, ${(0.95 * env).toFixed(3)})`);
          grad.addColorStop(0.42, `rgba(${pulseRgb}, ${(0.78 * env).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${pulseRgb}, 0)`);

          ctx.beginPath();
          ctx.arc(headPt.x, headPt.y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
        ctx.restore();
      }

      // 4. Đánh số thứ tự 1 - 2 - 3 trực tiếp trên 3 đỉnh láng giềng Top 3
      if (topCompanionRankMap.size > 0) {
        ctx.save();
        topCompanionRankMap.forEach((rank, compId) => {
          if (!connectedNeighbors.has(compId)) return;
          const compNode = nodeMap.get(compId);
          const pos = getNodeWorldPos(compId);
          if (!compNode || !pos) return;

          const popProg = clamp01((nowMs - rankBadgeRevealMs - (rank - 1) * 45) / 220);
          if (popProg <= 0) return;
          const popScale = Math.max(0.1, easeOutBack(popProg));

          const nodeR = computeNodeSize(compNode.timesBorrowed) + (hoveredNodeId === compId ? 3.4 : 0);
          const bx = pos.x + nodeR * 0.72;
          const by = pos.y - nodeR * 0.72;
          const badgeR = 9.5 * popScale;

          // Vòng viền ngoài mảnh giúp nổi bật trên mọi nền sáng/tối
          ctx.beginPath();
          ctx.arc(bx, by, badgeR + 1.4, 0, Math.PI * 2);
          ctx.fillStyle = palette.rankBadgeOuterRing;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
          ctx.fillStyle = palette.rankBadgeBg;
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = palette.rankBadgeBorder;
          ctx.stroke();

          if (popProg > 0.35) {
            ctx.font = `700 ${Math.max(9, Math.round(10.5 * Math.min(1.05, popScale)))}px 'Be Vietnam Pro', sans-serif`;
            ctx.fillStyle = palette.rankBadgeText;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(rank), bx, by + 0.5);
          }
        });
        ctx.restore();
      }
    }
  }

  network.on('beforeDrawing', handleBeforeDrawing);
  network.on('afterDrawing', handleAfterDrawing);

  function isSelectionAnimRunning(nowMs = performance.now()) {
    if (!selectedNodeId) return false;
    const rankPopEndMs = rankBadgeRevealMs + 400;
    return nowMs < selectionPulseUntilMs || nowMs < rankPopEndMs;
  }

  /**
   * Kiểm tra xem hiện tại có cần duy trì vòng lặp animation rAF hay không
   */
  function hasActiveFrameAnimations(nowMs = performance.now()) {
    if (!canAnimate()) return false;
    return (
      introState.active ||
      dimTransition.active ||
      isSelectionAnimRunning(nowMs) ||
      fadingOutEdges.size > 0 ||
      flashingEdges.size > 0 ||
      hasPulsingStatusNodes
    );
  }

  function hasHighFrequencyAnimations(nowMs = performance.now()) {
    return (
      introState.active ||
      dimTransition.active ||
      isSelectionAnimRunning(nowMs) ||
      fadingOutEdges.size > 0 ||
      flashingEdges.size > 0
    );
  }

  function animTick(nowMs) {
    rafId = 0;
    if (isDestroyed || !surfaceEl.isConnected) {
      destroy();
      return;
    }
    if (!canAnimate()) {
      return;
    }

    // Cập nhật pha intro mở trang
    if (introState.active && nowMs - introState.startMs >= introState.totalDurationMs) {
      finishIntroImmediately();
    }

    // Khi xung duyệt danh sách kề vừa chạy xong đợt cuối -> vẽ lại 1 khung sạch không còn đuôi xung
    if (selectionPulseUntilMs > 0 && nowMs >= selectionPulseUntilMs) {
      selectionPulseUntilMs = 0;
      if (!isDragging) {
        network.redraw();
      }
    }

    // Cập nhật chuyển tiếp làm mờ đỉnh/cạnh không liên quan (chỉ chạy khi không kéo thả)
    if (dimTransition.active && !isDragging) {
      const prog = clamp01((nowMs - dimTransition.startMs) / dimTransition.durationMs);
      const eased = easeOutCubic(prog);
      nodeDimTarget.forEach((target, id) => {
        const start = nodeDimStart.get(id) ?? target;
        nodeDimCurrent.set(id, start + (target - start) * eased);
      });
      edgeDimTarget.forEach((target, id) => {
        const start = edgeDimStart.get(id) ?? target;
        edgeDimCurrent.set(id, start + (target - start) * eased);
      });
      if (prog >= 1) {
        dimTransition.active = false;
      }
      syncVisualStyles();
    }

    // Dọn các cạnh đã mờ xong hoặc nháy xong
    fadingOutEdges.forEach((item, id) => {
      if (nowMs - item.startMs >= item.durationMs) fadingOutEdges.delete(id);
    });
    flashingEdges.forEach((info, id) => {
      if (nowMs - info.startMs >= info.durationMs) flashingEdges.delete(id);
    });

    // Không gọi redraw phụ trong lúc người dùng đang kéo thả để tránh giật lag tuyệt đối
    if (!isDragging) {
      if (hasHighFrequencyAnimations(nowMs)) {
        network.redraw();
      } else if (hasPulsingStatusNodes && nowMs - lastAmbientDrawMs >= 42) {
        lastAmbientDrawMs = nowMs;
        network.redraw();
      }
    }

    if (hasActiveFrameAnimations(nowMs)) {
      rafId = window.requestAnimationFrame(animTick);
    }
  }

  function ensureAnimLoop() {
    if (rafId || !hasActiveFrameAnimations()) return;
    rafId = window.requestAnimationFrame(animTick);
  }

  function stopAnimLoopAndResetFlat() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    const wasIntro = introState.active;
    introState.active = false;
    introState.pendingFlashKeys = [];
    dimTransition.active = false;
    fadingOutEdges.clear();
    flashingEdges.clear();

    const visibleEdges = getVisibleRawEdges();
    const connectedNeighbors = getConnectedNeighborSet(selectedNodeId, visibleEdges);
    for (const n of rawNodes) {
      const target = selectedNodeId && n.id !== selectedNodeId && !connectedNeighbors.has(n.id) ? 1 : 0;
      nodeDimCurrent.set(n.id, target);
      nodeDimTarget.set(n.id, target);
    }
    for (const e of rawEdges) {
      const isIncident = Boolean(selectedNodeId && (e.from === selectedNodeId || e.to === selectedNodeId));
      const target = selectedNodeId && !isIncident ? 1 : 0;
      edgeDimCurrent.set(e.id, target);
      edgeDimTarget.set(e.id, target);
    }

    if (wasIntro) {
      stopPhysics();
    }
    syncVisualStyles();
    if (!isDestroyed) {
      network.redraw();
    }
  }

  // Lắng nghe công tắc "Hiệu ứng 3D", prefers-reduced-motion và trạng thái ẩn/hiện tab
  const unsubscribeFx = onFxChange(({ motionAllowed, tabVisible }) => {
    if (isDestroyed) return;
    if (!motionAllowed) {
      stopAnimLoopAndResetFlat();
      return;
    }
    if (!tabVisible) {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (introState.active) {
        finishIntroImmediately();
      }
      settleDimTransitionNow();
      return;
    }
    syncVisualStyles();
    ensureAnimLoop();
    network.redraw();
  });

  /**
   * Định vị và hiển thị tooltip nổi theo con trỏ trên khung đồ thị
   */
  function showTooltip(htmlContent, domPos) {
    if (!tooltipEl || !domPos) return;
    tooltipEl.innerHTML = htmlContent;
    tooltipEl.classList.add('visible');

    const pad = 14;
    const rect = containerEl.getBoundingClientRect();
    const tipWidth = tooltipEl.offsetWidth || 220;
    const tipHeight = tooltipEl.offsetHeight || 72;

    let left = domPos.x + pad;
    let top = domPos.y + pad;

    if (left + tipWidth > rect.width - 10) {
      left = Math.max(10, domPos.x - tipWidth - pad);
    }
    if (top + tipHeight > rect.height - 10) {
      top = Math.max(10, domPos.y - tipHeight - pad);
    }

    tooltipEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.classList.remove('visible');
  }

  let shouldFitOnStabilizeDone = false;

  network.on('stabilizationIterationsDone', () => {
    if (!introState.active) {
      stopPhysics();
    }
    if (shouldFitOnStabilizeDone) {
      shouldFitOnStabilizeDone = false;
      fitView(false);
    }
  });

  // Lắng nghe click chọn đỉnh hoặc bấm vùng trống để bỏ chọn
  network.on('click', (params) => {
    if (introState.active) {
      finishIntroImmediately();
    }
    network.unselectAll();
    if (params.nodes && params.nodes.length > 0) {
      const clickedId = params.nodes[0];
      onNodeClick(clickedId);
    } else {
      onNodeClick(null);
    }
  });

  // Sự kiện hover Đỉnh
  network.on('hoverNode', (params) => {
    if (isDragging) return;
    hoveredNodeId = params.node;
    surfaceEl.style.cursor = 'pointer';
    if (!introState.active) {
      syncVisualStyles();
    }

    const node = nodeMap.get(params.node);
    if (node && params.pointer && params.pointer.DOM) {
      const stLabel = STATUS_LABELS[node.status] || 'Sẵn sàng';
      const deg = degreeMap.get(node.id) || 0;
      showTooltip(`
        <div class="graph-tip-header">
          <span class="graph-tip-dot dot-${escapeHtml(node.status || 'available')}"></span>
          <span class="graph-tip-status">${escapeHtml(stLabel)}</span>
          <code class="mono graph-tip-code">${escapeHtml(node.id)}</code>
        </div>
        <div class="graph-tip-title">${escapeHtml(node.name)}</div>
        <div class="graph-tip-meta tabular-nums">
          Đã mượn: <strong>${Number(node.timesBorrowed) || 0}</strong> lần • Liên kết: <strong>${deg}</strong> thiết bị
        </div>
      `, params.pointer.DOM);
    }
  });

  network.on('blurNode', () => {
    hoveredNodeId = null;
    surfaceEl.style.cursor = '';
    hideTooltip();
    if (!introState.active && !isDragging) {
      syncVisualStyles();
    }
  });

  // Sự kiện hover Cạnh
  network.on('hoverEdge', (params) => {
    if (hoveredNodeId || isDragging) return;
    hoveredEdgeId = params.edge;
    if (!introState.active) {
      syncVisualStyles();
    }

    const edge = edgeMap.get(params.edge);
    if (edge && params.pointer && params.pointer.DOM) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      showTooltip(`
        <div class="graph-tip-header">
          <code class="mono graph-tip-code">${escapeHtml(edge.from)}</code>
          <span style="color: var(--color-text-muted);">↔</span>
          <code class="mono graph-tip-code">${escapeHtml(edge.to)}</code>
        </div>
        <div class="graph-tip-title" style="font-size: 12px;">
          ${escapeHtml(fromNode ? fromNode.name : edge.from)} + ${escapeHtml(toNode ? toNode.name : edge.to)}
        </div>
        <div class="graph-tip-meta tabular-nums">
          Mượn cùng phiếu: <strong>${edge.weight}</strong> lần
        </div>
      `, params.pointer.DOM);
    }
  });

  network.on('blurEdge', () => {
    if (!hoveredEdgeId) return;
    hoveredEdgeId = null;
    hideTooltip();
    if (!introState.active && !isDragging) {
      syncVisualStyles();
    }
  });

  network.on('dragStart', () => {
    isDragging = true;
    hideTooltip();
    if (introState.active) {
      finishIntroImmediately();
    }
    if (dimTransition.active) {
      settleDimTransitionNow();
    }
  });

  network.on('dragEnd', () => {
    isDragging = false;
    ensureAnimLoop();
  });

  network.on('zoom', () => {
    hideTooltip();
  });

  const handleMouseLeave = () => {
    if (hoveredNodeId || hoveredEdgeId) {
      hoveredNodeId = null;
      hoveredEdgeId = null;
      surfaceEl.style.cursor = '';
      if (!introState.active && !isDragging) {
        syncVisualStyles();
      }
    }
    hideTooltip();
  };
  containerEl.addEventListener('mouseleave', handleMouseLeave);

  let resizeObserver = null;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => {
      if (!isDestroyed) {
        network.redraw();
      }
    });
    resizeObserver.observe(containerEl);
  }

  /**
   * Xây dựng lại các bảng tra cứu nội bộ từ rawNodes & rawEdges
   */
  function rebuildLookupMaps() {
    nodeMap.clear();
    edgeMap.clear();
    undirectedToEdgeId.clear();
    degreeMap.clear();

    for (const n of rawNodes) {
      nodeMap.set(n.id, n);
      degreeMap.set(n.id, 0);
    }
    for (const e of rawEdges) {
      edgeMap.set(e.id, e);
      undirectedToEdgeId.set(makeUndirectedEdgeKey(e.from, e.to), e.id);
      if (degreeMap.has(e.from)) degreeMap.set(e.from, (degreeMap.get(e.from) || 0) + 1);
      if (degreeMap.has(e.to)) degreeMap.set(e.to, (degreeMap.get(e.to) || 0) + 1);
    }

    maxTimesBorrowed = rawNodes.reduce((acc, n) => Math.max(acc, n.timesBorrowed), 1);
    maxEdgeWeight = rawEdges.reduce((acc, e) => Math.max(acc, e.weight), 1);
    refreshPulsingStatusFlag();
  }

  /**
   * Kích hoạt nháy sáng 1 lần cho danh sách khoá cạnh vô hướng có trọng số thay đổi
   */
  function flashEdgesByKeys(undirectedKeys = []) {
    if (isDestroyed || !canAnimate() || !Array.isArray(undirectedKeys) || undirectedKeys.length === 0) {
      return;
    }
    const nowMs = performance.now();
    let triggered = false;
    for (const key of undirectedKeys) {
      const edgeId = undirectedToEdgeId.get(key) || (edgeMap.has(key) ? key : null);
      if (edgeId) {
        flashingEdges.set(edgeId, { startMs: nowMs, durationMs: 720 });
        triggered = true;
      }
    }
    if (triggered) {
      ensureAnimLoop();
      network.redraw();
    }
  }

  /**
   * Nạp dữ liệu đỉnh/cạnh mới từ API /api/graph (dùng khi mở trang)
   */
  function setData({ nodes = [], edges = [] } = {}, options = {}) {
    if (isDestroyed) return;

    fadingOutEdges.clear();
    flashingEdges.clear();
    dimTransition.active = false;
    introState.active = false;
    introState.pendingFlashKeys = Array.isArray(options.changedEdgeKeys) ? options.changedEdgeKeys : [];

    rawNodes = Array.isArray(nodes) ? nodes.map((n) => ({
      id: String(n.id),
      name: String(n.name || n.id),
      status: n.status || 'available',
      timesBorrowed: Number(n.timesBorrowed) || 0
    })) : [];

    rawEdges = Array.isArray(edges) ? edges.map((e) => ({
      id: `${e.from}__${e.to}`,
      from: String(e.from),
      to: String(e.to),
      weight: Number(e.weight) || 1
    })) : [];

    rebuildLookupMaps();

    if (typeof options.minWeight === 'number') {
      minWeightThreshold = Math.max(1, options.minWeight);
    }
    if (minWeightThreshold > maxEdgeWeight) {
      minWeightThreshold = 1;
    }

    if (selectedNodeId && !nodeMap.has(selectedNodeId)) {
      selectedNodeId = null;
      topCompanionSet.clear();
      topCompanionRankMap.clear();
    }

    const visibleEdges = getVisibleRawEdges();
    const connectedNeighbors = getConnectedNeighborSet(selectedNodeId, visibleEdges);
    nodeDimCurrent.clear();
    nodeDimTarget.clear();
    edgeDimCurrent.clear();
    edgeDimTarget.clear();

    for (const n of rawNodes) {
      const d = selectedNodeId && n.id !== selectedNodeId && !connectedNeighbors.has(n.id) ? 1 : 0;
      nodeDimCurrent.set(n.id, d);
      nodeDimTarget.set(n.id, d);
    }
    for (const e of rawEdges) {
      const isInc = Boolean(selectedNodeId && (e.from === selectedNodeId || e.to === selectedNodeId));
      const d = selectedNodeId && !isInc ? 1 : 0;
      edgeDimCurrent.set(e.id, d);
      edgeDimTarget.set(e.id, d);
    }

    const shouldPlayIntro = options.playIntro !== false && canAnimate() && rawNodes.length > 0;
    if (shouldPlayIntro) {
      const nodeStaggerMs = Math.min(26, 320 / Math.max(1, rawNodes.length));
      const nodeDurationMs = 320;
      const edgeStartBaseMs = Math.round(Math.min(250, rawNodes.length * nodeStaggerMs * 0.62 + 95));
      const edgeStaggerMs = Math.min(15, 210 / Math.max(1, visibleEdges.length));
      const edgeDurationMs = 360;

      introState.active = true;
      introState.startMs = performance.now();
      introState.nodeStaggerMs = nodeStaggerMs;
      introState.nodeDurationMs = nodeDurationMs;
      introState.edgeStartBaseMs = edgeStartBaseMs;
      introState.edgeStaggerMs = edgeStaggerMs;
      introState.edgeDurationMs = edgeDurationMs;
      introState.totalDurationMs = Math.max(
        rawNodes.length * nodeStaggerMs + nodeDurationMs,
        edgeStartBaseMs + visibleEdges.length * edgeStaggerMs + edgeDurationMs
      ) + 25;
    }

    nodesDataSet.clear();
    edgesDataSet.clear();

    if (rawNodes.length > 0) {
      nodesDataSet.add(rawNodes.map((n) => buildVisNode(n, connectedNeighbors)));
    }
    if (visibleEdges.length > 0) {
      edgesDataSet.add(visibleEdges.map((e) => buildVisEdge(e)));
    }

    if (rawNodes.length <= 1) {
      stopPhysics();
      if (rawNodes.length === 1) fitView(false);
    } else if (!canAnimate()) {
      network.setOptions({
        physics: {
          enabled: true,
          stabilization: { enabled: true, iterations: 180, fit: true }
        }
      });
      network.stabilize(180);
      stopPhysics();
      fitView(false);
    } else {
      // Tính nhanh bố cục chuẩn rồi cho mô phỏng lực chạy mượt ngắn (~880ms) trước khi đứng yên
      // (Không bật trạng thái xoay trên nút "Sắp xếp lại lực" lúc mới mở trang)
      network.setOptions({
        physics: {
          enabled: true,
          stabilization: { enabled: true, iterations: 135, fit: true }
        }
      });
      network.stabilize(135);
      fitView(false);

      network.setOptions({
        physics: {
          enabled: true,
          stabilization: { enabled: false }
        }
      });
      network.startSimulation();

      if (physicsTimer) clearTimeout(physicsTimer);
      physicsTimer = setTimeout(() => {
        stopPhysics();
      }, 880);
    }

    if (!shouldPlayIntro && introState.pendingFlashKeys.length > 0) {
      const keys = introState.pendingFlashKeys.slice();
      introState.pendingFlashKeys = [];
      flashEdgesByKeys(keys);
    }

    ensureAnimLoop();
  }

  /**
   * Cập nhật dữ liệu đỉnh & cạnh tại chỗ (khi tua giờ hoặc bấm "Làm mới") mà không phá vỡ bố cục,
   * đồng thời nháy sáng 1 lần các cạnh có trọng số thay đổi.
   */
  function updateGraphData({ nodes = [], edges = [] } = {}, options = {}) {
    if (isDestroyed) return { changedEdgeKeys: [] };
    if (introState.active) {
      finishIntroImmediately();
    }

    const prevEdgeWeightByKey = new Map();
    for (const e of rawEdges) {
      prevEdgeWeightByKey.set(makeUndirectedEdgeKey(e.from, e.to), e.weight);
    }
    const prevNodeIds = new Set(rawNodes.map((n) => n.id));

    const nextNodes = Array.isArray(nodes) ? nodes.map((n) => ({
      id: String(n.id),
      name: String(n.name || n.id),
      status: n.status || 'available',
      timesBorrowed: Number(n.timesBorrowed) || 0
    })) : [];

    const nextEdges = Array.isArray(edges) ? edges.map((e) => ({
      id: `${e.from}__${e.to}`,
      from: String(e.from),
      to: String(e.to),
      weight: Number(e.weight) || 1
    })) : [];

    const changedEdgeKeys = [];
    for (const e of nextEdges) {
      const key = makeUndirectedEdgeKey(e.from, e.to);
      const oldW = prevEdgeWeightByKey.get(key);
      if (oldW === undefined || oldW !== e.weight) {
        changedEdgeKeys.push(key);
      }
    }

    rawNodes = nextNodes;
    rawEdges = nextEdges;
    rebuildLookupMaps();

    if (typeof options.minWeight === 'number') {
      minWeightThreshold = Math.max(1, options.minWeight);
    }
    if (minWeightThreshold > maxEdgeWeight) {
      minWeightThreshold = 1;
    }

    if (selectedNodeId && !nodeMap.has(selectedNodeId)) {
      selectedNodeId = null;
      topCompanionSet.clear();
      topCompanionRankMap.clear();
    }

    // Xoá các đỉnh không còn tồn tại (nếu thiết bị bị xoá theo M4)
    const nextNodeIdSet = new Set(rawNodes.map((n) => n.id));
    const existingVisNodeIds = nodesDataSet.getIds();
    const removedNodeIds = existingVisNodeIds.filter((id) => !nextNodeIdSet.has(id));
    if (removedNodeIds.length > 0) {
      nodesDataSet.remove(removedNodeIds);
    }

    const addedNodesCount = rawNodes.filter((n) => !prevNodeIds.has(n.id)).length;
    syncVisualStyles({ allowEdgeFadeOut: false });

    // Chỉ bật physics ngắn nếu xuất hiện đỉnh thiết bị hoàn toàn mới chưa có toạ độ
    if (addedNodesCount > 0) {
      startTemporaryPhysics(680, true);
    }

    if (changedEdgeKeys.length > 0) {
      flashEdgesByKeys(changedEdgeKeys);
    } else {
      ensureAnimLoop();
    }

    return { changedEdgeKeys };
  }

  /**
   * Lọc chỉ hiển thị cạnh có weight >= minWeight (cạnh bị ẩn sẽ mờ dần mượt)
   */
  function setMinWeight(minWeight) {
    if (introState.active) {
      finishIntroImmediately();
    }
    minWeightThreshold = Math.max(1, Number(minWeight) || 1);
    syncVisualStyles({ allowEdgeFadeOut: true });
    return {
      minWeight: minWeightThreshold,
      visibleEdgeCount: getVisibleRawEdges().length,
      totalEdgeCount: rawEdges.length
    };
  }

  /**
   * Chọn một đỉnh để làm nổi bật các cạnh/đỉnh nối trực tiếp, chạy xung danh sách kề,
   * đánh số Top 3 (1-2-3) và làm mờ mượt phần còn lại.
   */
  function selectNode(nodeId, topCompanionIds = []) {
    if (!nodeId || !nodeMap.has(nodeId)) {
      clearSelection();
      return;
    }
    if (introState.active) {
      finishIntroImmediately();
    }

    const prevSelected = selectedNodeId;
    selectedNodeId = nodeId;
    const nowMs = performance.now();

    const orderedIds = Array.isArray(topCompanionIds) ? topCompanionIds.slice(0, 3) : [];
    topCompanionSet = new Set(orderedIds);
    topCompanionRankMap.clear();
    orderedIds.forEach((id, idx) => {
      topCompanionRankMap.set(String(id), idx + 1);
    });
    if (orderedIds.length > 0) {
      rankBadgeRevealMs = nowMs;
    }

    // Khi mới chọn đỉnh (chưa truyền topCompanionIds hoặc đổi sang đỉnh khác), phát 2 đợt xung hữu hạn
    if (prevSelected !== nodeId || orderedIds.length === 0) {
      selectionPulseStartMs = nowMs;
      selectionPulseUntilMs = nowMs + SELECTION_PULSE_DURATION_MS;
    }

    if (prevSelected !== nodeId) {
      startSelectionDimTransition();
    } else {
      syncVisualStyles();
      network.redraw();
    }
    ensureAnimLoop();
  }

  /**
   * Bỏ chọn đỉnh, khôi phục mượt độ sáng toàn đồ thị
   */
  function clearSelection() {
    if (!selectedNodeId && topCompanionSet.size === 0) return;
    selectedNodeId = null;
    selectionPulseUntilMs = 0;
    topCompanionSet.clear();
    topCompanionRankMap.clear();
    startSelectionDimTransition();
    ensureAnimLoop();
  }

  /**
   * Đưa camera zoom mượt tới 1 đỉnh cụ thể
   */
  function focusNode(nodeId, { fromCanvas = false } = {}) {
    if (isDestroyed || !nodeId || !nodeMap.has(nodeId)) return;
    if (!isMotionAllowed()) {
      // Khi tắt "Hiệu ứng 3D" hoặc prefers-reduced-motion: không tự zoom khi click trên canvas
      if (fromCanvas) return;
      const currentScale = network.getScale() || 1;
      network.focus(nodeId, {
        scale: Math.min(Math.max(currentScale, 0.95), 1.35),
        animation: false
      });
      return;
    }

    const currentScale = network.getScale() || 1;
    const targetScale = Math.min(Math.max(currentScale, 1.06), 1.38);
    network.focus(nodeId, {
      scale: targetScale,
      animation: {
        duration: 380,
        easingFunction: 'easeInOutQuad'
      }
    });
  }

  /**
   * Căn vừa toàn bộ đồ thị vào khung nhìn
   */
  function fitView(animate = true) {
    if (isDestroyed || rawNodes.length === 0) return;
    network.fit({
      animation: (!animate || !isMotionAllowed()) ? false : {
        duration: 280,
        easingFunction: 'easeInOutQuad'
      }
    });
  }

  /**
   * Phóng to / Thu nhỏ khung nhìn
   */
  function zoomBy(factor) {
    if (isDestroyed) return;
    const current = network.getScale() || 1;
    const next = Math.min(2.8, Math.max(0.25, current * factor));
    network.moveTo({
      scale: next,
      animation: !isMotionAllowed() ? false : {
        duration: 180,
        easingFunction: 'easeOutQuad'
      }
    });
  }

  function zoomIn() {
    zoomBy(1.25);
  }

  function zoomOut() {
    zoomBy(0.8);
  }

  /**
   * Nút "Sắp xếp lại lực": bật lại physics ngắn (~950ms, tối đa <= 1.8s) rồi tự tắt ngay
   */
  function relayout() {
    if (introState.active) {
      finishIntroImmediately();
    }
    startTemporaryPhysics(950, true, true);
  }

  /**
   * Cập nhật trạng thái/lượt mượn của các đỉnh tại chỗ mà không chạy lại mô phỏng lực
   */
  function updateNodesMeta(nodes = []) {
    if (isDestroyed || !Array.isArray(nodes) || nodes.length !== rawNodes.length) {
      return false;
    }
    for (const incoming of nodes) {
      const existing = nodeMap.get(String(incoming.id));
      if (!existing) return false;
    }
    for (const incoming of nodes) {
      const existing = nodeMap.get(String(incoming.id));
      existing.name = String(incoming.name || existing.name);
      existing.status = incoming.status || 'available';
      existing.timesBorrowed = Number(incoming.timesBorrowed) || 0;
    }
    maxTimesBorrowed = rawNodes.reduce((acc, n) => Math.max(acc, n.timesBorrowed), 1);
    refreshPulsingStatusFlag();
    syncVisualStyles();
    ensureAnimLoop();
    return true;
  }

  /**
   * Cập nhật bảng màu Sáng / Tối ngay lập tức
   */
  function setTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    palette = getThemePalette(currentTheme);
    syncVisualStyles();
    if (!isDestroyed) {
      network.redraw();
    }
  }

  /**
   * Giải phóng toàn bộ vòng lặp animation, listener và tài nguyên khi rời màn hình #/graph
   */
  function destroy() {
    if (isDestroyed) return;
    isDestroyed = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (physicsTimer) {
      clearTimeout(physicsTimer);
      physicsTimer = null;
    }
    unsubscribeFx();
    fadingOutEdges.clear();
    flashingEdges.clear();
    nodeDimStart.clear();
    nodeDimCurrent.clear();
    nodeDimTarget.clear();
    edgeDimStart.clear();
    edgeDimCurrent.clear();
    edgeDimTarget.clear();
    containerEl.removeEventListener('mouseleave', handleMouseLeave);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    network.destroy();
    containerEl.innerHTML = '';
  }

  return {
    setData,
    updateGraphData,
    updateNodesMeta,
    flashEdgesByKeys,
    setMinWeight,
    selectNode,
    clearSelection,
    focusNode,
    fitView,
    zoomIn,
    zoomOut,
    relayout,
    setTheme,
    destroy
  };
}
