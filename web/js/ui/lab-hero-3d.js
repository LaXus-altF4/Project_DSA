/**
 * lab-hero-3d.js - Mô hình 3D Board phát triển STM32 "Blue Pill" (STM32F103C8T6) ở Tổng quan (Đợt B.1)
 * - Dựng thủ tục 100% bằng Three.js từ hình khối cơ bản (< 4.000 tam giác << giới hạn 20k).
 * - KHÔNG tải file mô hình ngoài; KHÔNG dùng logo ST/thương hiệu; chỉ ghi "STM32F103" trên chip.
 * - Dùng THREE.InstancedMesh cho 48 chân LQFP48, 50 chân header vàng và 44 vòng hàn xuyên lỗ.
 * - Hiệu ứng: xoay chậm, nghiêng parallax theo chuột, LED nguồn đỏ sáng liên tục, LED PC13 xanh
 *   nhấp nháy ~1 Hz, xung tín hiệu sáng chạy dọc đường mạch từ chip ra header, hover phát sáng viền board.
 * - Dừng render ngay khi: tắt "Hiệu ứng 3D" (chuyển sang ảnh tĩnh SVG), ẩn tab, thu gọn thẻ,
 *   cuộn thẻ ra khỏi màn hình (IntersectionObserver), rời trang #/dashboard hoặc prefers-reduced-motion.
 */

import {
  getCurrentTheme,
  isFxEnabled,
  isMotionAllowed,
  isTabVisible,
  loadThreeModule,
  onFxChange,
  prefersReducedMotion,
} from './fx.js';

const HERO_COLLAPSE_KEY = 'lab_hero_collapsed';
const MAX_DPR = 1.5;

// Kích thước chuẩn tỉ lệ thực (~53mm x 22.8mm) của board Blue Pill
const PCB_LEN = 4.40;
const PCB_WID = 1.92;
const PCB_RAD = 0.14;
const PCB_TOP_Y = 0.056;

// 8 đường mạch (polyline [x, z]) dẫn từ chân chip LQFP48 ra hai hàng chân header dài
const SIGNAL_TRACE_PATHS = [
  [[-0.36, -0.26], [-0.62, -0.52], [-1.30, -0.52], [-1.30, -0.80]],
  [[-0.22, -0.34], [-0.38, -0.58], [-0.70, -0.58], [-0.70, -0.80]],
  [[-0.08, -0.38], [-0.08, -0.80]],
  [[0.08, -0.32], [0.30, -0.54], [0.50, -0.54], [0.50, -0.80]],
  [[0.22, -0.24], [0.52, -0.50], [1.30, -0.50], [1.30, -0.80]],
  [[-0.34, 0.28], [-0.60, 0.54], [-1.10, 0.54], [-1.10, 0.80]],
  [[-0.10, 0.38], [-0.10, 0.80]],
  [[0.18, 0.28], [0.46, 0.56], [1.10, 0.56], [1.10, 0.80]],
];

const PULSE_PER_TRACE = 2; // 1 đầu xung sáng + 1 đuôi mờ tạo vệt chạy mượt
const TOTAL_PULSE_POINTS = SIGNAL_TRACE_PATHS.length * PULSE_PER_TRACE;

let THREE = null;
let heroCanvas = null;
let renderer = null;
let scene = null;
let camera = null;

let boardGroup = null;
let ambientLight = null;
let keyLight = null;
let rimLight = null;

let pcbBodyMat = null;
let rimGlowMat = null;
let rimHaloMat = null;
let pwrLedMat = null;
let pwrHaloSprite = null;
let pc13LedMat = null;
let pc13HaloSprite = null;
let pulsePoints = null;
let pulseMaterial = null;
let traceSegmentsMeta = null;

let currentStageEl = null;
let currentHeroEl = null;
let viewportObserver = null;
let isHeroIntersecting = true;

let rafId = 0;
let lastFrameMs = 0;
let elapsedSec = 0;
let isCreating = false;
let webglFailed = false;
let globalListenersBound = false;

let targetTiltX = 0;
let targetTiltY = 0;
let smoothTiltX = 0;
let smoothTiltY = 0;
let isPointerHovering = false;
let smoothHoverGlow = 0;

/**
 * Đọc trạng thái thu gọn đã lưu trong localStorage (mặc định: mở)
 */
export function isHeroCollapsed() {
  try {
    return localStorage.getItem(HERO_COLLAPSE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

/**
 * Lưu trạng thái thu gọn vào localStorage (bọc try/catch)
 */
export function setHeroCollapsed(collapsed) {
  try {
    localStorage.setItem(HERO_COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch (_) {
    // Bỏ qua lỗi ghi localStorage
  }
}

/**
 * Tạo hình chữ nhật bo góc 2D cho phôi mạch in PCB
 */
function createRoundedRectShape(threeNs, width, height, radius) {
  const s = new threeNs.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

/**
 * Tạo sprite tròn toả sáng mềm cho quầng LED & hạt xung tín hiệu
 */
function createGlowSpriteTexture(threeNs) {
  const size = 64;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  if (!ctx) return null;

  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.28, 'rgba(255, 255, 255, 0.78)');
  g.addColorStop(0.62, 'rgba(255, 255, 255, 0.22)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new threeNs.CanvasTexture(cvs);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Vẽ mặt trên của chip LQFP48: nền đen mờ, chấm chân số 1, CHỈ khắc chữ "STM32F103" (không logo thương hiệu)
 */
function createChipTopTexture(threeNs) {
  const size = 256;
  const cvs = document.createElement('canvas');
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  if (!ctx) return null;

  // Nền nhựa epoxy đen mờ
  ctx.fillStyle = '#171B24';
  ctx.fillRect(0, 0, size, size);

  // Khung vát cạnh mảnh trên lưng chip
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.26)';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, size - 28, size - 28);

  // Chấm lõm đánh dấu chân số 1 (Pin 1 indicator)
  ctx.beginPath();
  ctx.arc(44, 44, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#0F131A';
  ctx.fill();
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Chữ khắc laser trắng bạc rõ nét: chỉ ghi đúng "STM32F103" trên mặt chip (không logo thương hiệu)
  ctx.fillStyle = '#F1F5F9';
  ctx.font = '700 36px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STM32F103', size / 2, size / 2 + 4);

  const tex = new threeNs.CanvasTexture(cvs);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Vẽ hoạ tiết phủ mạch in mặt trên PCB Blue Pill (solder mask xanh dương mờ, trace đồng mảnh & silkscreen trắng)
 */
function createPcbSilkscreenTexture(threeNs) {
  const w = 1024;
  const h = 448;
  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext('2d');
  if (!ctx) return null;

  // Nền phủ xanh dương mờ đặc trưng Blue Pill
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#1860BE');
  bgGrad.addColorStop(0.55, '#1350A2');
  bgGrad.addColorStop(1, '#0F4187');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Hàm đổi toạ độ thế giới (x ∈ [-2.12..2.12], z ∈ [-0.90..0.90]) sang pixel canvas
  const toPxX = (wx) => ((wx + 2.12) / 4.24) * w;
  const toPxY = (wz) => ((wz + 0.90) / 1.80) * h;

  // Mạng đường mạch đồng chìm dưới lớp phủ xanh (mảnh, tinh tế)
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.36)';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  SIGNAL_TRACE_PATHS.forEach((poly) => {
    ctx.beginPath();
    poly.forEach(([wx, wz], idx) => {
      const px = toPxX(wx);
      const py = toPxY(wz);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // Thêm các đường mạch phụ nối thạch anh, nút Reset, USB và BOOT jumpers
  const auxTraces = [
    [[-0.42, -0.06], [-0.92, -0.26]],
    [[-0.42, 0.12], [-1.38, 0.36]],
    [[-0.46, 0.0], [-1.52, 0.0], [-1.95, 0.0]],
    [[0.26, -0.12], [0.86, -0.22]],
    [[0.26, 0.12], [0.86, 0.22]],
    [[0.30, -0.04], [1.52, -0.28]],
    [[-0.38, -0.18], [-1.42, -0.36]],
  ];
  ctx.lineWidth = 2.4;
  auxTraces.forEach((poly) => {
    ctx.beginPath();
    poly.forEach(([wx, wz], idx) => {
      const px = toPxX(wx);
      const py = toPxY(wz);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // Viền chỉ trắng Silkscreen quanh mép board
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.42)';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  // Vòng silkscreen quanh chân chip trung tâm xoay 45 độ
  ctx.save();
  ctx.translate(toPxX(-0.10), toPxY(0));
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.50)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-98, -98, 196, 196);
  ctx.restore();

  // Chữ ký hiệu linh kiện nhỏ kiểu silkscreen kỹ thuật (không chứa logo thương hiệu)
  ctx.fillStyle = 'rgba(241, 245, 249, 0.78)';
  ctx.font = '700 15px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('RST', toPxX(-1.38), toPxY(0.60));
  ctx.fillText('PC13', toPxX(-1.42), toPxY(-0.54));
  ctx.fillText('8MHz', toPxX(-0.92), toPxY(-0.48));
  ctx.fillText('BOOT0', toPxX(0.86), toPxY(-0.40));
  ctx.fillText('BOOT1', toPxX(0.86), toPxY(0.46));
  ctx.fillText('PWR', toPxX(1.52), toPxY(-0.48));
  ctx.fillText('SWD', toPxX(1.84), toPxY(0.03));

  const tex = new threeNs.CanvasTexture(cvs);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Chuẩn bị bảng độ dài đoạn thẳng cho 8 đường mạch để nội suy vị trí xung tín hiệu O(1)
 */
function precomputeTraceSegments() {
  return SIGNAL_TRACE_PATHS.map((pts, idx) => {
    const segs = [];
    let totalLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i];
      const [x2, z2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      segs.push({ x1, z1, x2, z2, startDist: totalLen, len });
      totalLen += len;
    }
    return {
      segs,
      totalLen: Math.max(totalLen, 0.001),
      phaseOffset: idx * 0.135,
      speed: 0.48 + (idx % 3) * 0.08,
    };
  });
}

function samplePointAlongTrace(meta, progress01) {
  const targetDist = progress01 * meta.totalLen;
  const segs = meta.segs;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (targetDist <= s.startDist + s.len || i === segs.length - 1) {
      const localT = s.len > 0 ? Math.max(0, Math.min(1, (targetDist - s.startDist) / s.len)) : 0;
      return {
        x: s.x1 + (s.x2 - s.x1) * localT,
        z: s.z1 + (s.z2 - s.z1) * localT,
      };
    }
  }
  return { x: 0, z: 0 };
}

/**
 * Đồng bộ ánh sáng & vật liệu theo Theme Sáng / Tối để board luôn nổi khối và hợp nền thẻ
 */
function applyHeroThemeLighting() {
  if (!THREE || !ambientLight || !keyLight || !rimLight || !pcbBodyMat) return;
  const isDark = getCurrentTheme() === 'dark';

  ambientLight.intensity = isDark ? 1.15 : 1.35;
  keyLight.intensity = isDark ? 1.75 : 1.95;
  rimLight.intensity = isDark ? 1.10 : 0.85;
  rimLight.color.setHex(isDark ? 0x60a5fa : 0x3b82f6);

  pcbBodyMat.color.setHex(isDark ? 0x134e9b : 0x1659b2);
  if (rimGlowMat) {
    rimGlowMat.color.setHex(isDark ? 0x60a5fa : 0x2563eb);
  }
  if (rimHaloMat) {
    rimHaloMat.color.setHex(isDark ? 0x3b82f6 : 0x60a5fa);
  }
}

function resizeHeroRenderer() {
  if (!renderer || !camera || !currentStageEl) return;
  const rect = currentStageEl.getBoundingClientRect();
  const width = Math.max(Math.round(rect.width) || 300, 140);
  const height = Math.max(Math.round(rect.height) || 132, 84);
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
}

/**
 * Khởi tạo một lần duy nhất toàn bộ cảnh 3D Board STM32F103 Blue Pill
 */
async function ensureHeroScene() {
  if (renderer || webglFailed || isCreating) return Boolean(renderer);

  isCreating = true;
  const mod = await loadThreeModule();
  isCreating = false;

  if (!mod) {
    webglFailed = true;
    return false;
  }
  THREE = mod;

  heroCanvas = document.createElement('canvas');
  heroCanvas.className = 'lab-hero-canvas';
  heroCanvas.setAttribute('aria-hidden', 'true');

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: heroCanvas,
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
  } catch (err) {
    webglFailed = true;
    heroCanvas = null;
    console.info('[LabApp 3D] Thiết bị không hỗ trợ WebGL, hiển thị SVG STM32 tĩnh:', err);
    return false;
  }

  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 300 / 132, 0.4, 30);
  camera.position.set(0, 3.05, 3.95);
  camera.lookAt(0, 0.02, 0);

  // Hệ thống chiếu sáng 3 điểm nhẹ (không bật shadowMap)
  ambientLight = new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 1.25);
  keyLight = new THREE.DirectionalLight(0xffffff, 1.85);
  keyLight.position.set(3.8, 6.2, 4.2);
  rimLight = new THREE.DirectionalLight(0x60a5fa, 0.95);
  rimLight.position.set(-4.5, 2.8, -3.5);
  scene.add(ambientLight, keyLight, rimLight);

  boardGroup = new THREE.Group();
  boardGroup.rotation.x = 0.24;
  scene.add(boardGroup);

  // -------------------------------------------------------------------------
  // 1. Phôi mạch PCB xanh dương mờ bo góc + mặt lụa đường mạch
  // -------------------------------------------------------------------------
  const pcbShape = createRoundedRectShape(THREE, PCB_LEN - 0.028, PCB_WID - 0.028, PCB_RAD);
  const pcbGeo = new THREE.ExtrudeGeometry(pcbShape, {
    depth: 0.082,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelSegments: 2,
    curveSegments: 6,
  });
  pcbGeo.center();
  pcbGeo.rotateX(-Math.PI / 2);

  pcbBodyMat = new THREE.MeshStandardMaterial({
    color: 0x1557b0,
    roughness: 0.62,
    metalness: 0.08,
  });
  const pcbMesh = new THREE.Mesh(pcbGeo, pcbBodyMat);
  boardGroup.add(pcbMesh);

  const pcbTopTex = createPcbSilkscreenTexture(THREE);
  const pcbTopMat = new THREE.MeshStandardMaterial({
    map: pcbTopTex,
    roughness: 0.58,
    metalness: 0.06,
  });
  const pcbTopDecal = new THREE.Mesh(new THREE.PlaneGeometry(4.24, 1.80), pcbTopMat);
  pcbTopDecal.rotation.x = -Math.PI / 2;
  pcbTopDecal.position.y = PCB_TOP_Y;
  boardGroup.add(pcbTopDecal);

  // Viền phát sáng quanh chu vi board khi hover chuột
  const rimPts2D = pcbShape.getPoints(10);
  const rimPosArr = new Float32Array(rimPts2D.length * 3);
  for (let i = 0; i < rimPts2D.length; i++) {
    rimPosArr[i * 3] = rimPts2D[i].x * 1.012;
    rimPosArr[i * 3 + 1] = PCB_TOP_Y + 0.004;
    rimPosArr[i * 3 + 2] = -rimPts2D[i].y * 1.012;
  }
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.BufferAttribute(rimPosArr, 3));
  rimGlowMat = new THREE.LineBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.16,
  });
  const rimLoop = new THREE.LineLoop(rimGeo, rimGlowMat);
  boardGroup.add(rimLoop);

  const glowDotTex = createGlowSpriteTexture(THREE);
  rimHaloMat = new THREE.MeshBasicMaterial({
    color: 0x3b82f6,
    map: glowDotTex,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const rimUnderHalo = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 2.7), rimHaloMat);
  rimUnderHalo.rotation.x = -Math.PI / 2;
  rimUnderHalo.position.y = -0.10;
  boardGroup.add(rimUnderHalo);

  // Vật liệu dùng chung
  const darkPlasticMat = new THREE.MeshStandardMaterial({
    color: 0x161b24,
    roughness: 0.52,
    metalness: 0.12,
  });
  const brushedSteelMat = new THREE.MeshStandardMaterial({
    color: 0xdbe4ef,
    roughness: 0.26,
    metalness: 0.82,
  });
  const goldPinMat = new THREE.MeshStandardMaterial({
    color: 0xf4c430,
    roughness: 0.24,
    metalness: 0.86,
  });
  const yellowJumperMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.38,
    metalness: 0.08,
  });

  // -------------------------------------------------------------------------
  // 2. Chip trung tâm LQFP48 đen xoay 45 độ + 48 chân kim loại (InstancedMesh #1)
  // -------------------------------------------------------------------------
  const chipGroup = new THREE.Group();
  chipGroup.position.set(-0.10, PCB_TOP_Y, 0);
  chipGroup.rotation.y = Math.PI / 4;
  boardGroup.add(chipGroup);

  const chipBody = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.09, 0.74), darkPlasticMat);
  chipBody.position.y = 0.048;
  chipGroup.add(chipBody);

  const chipTopTex = createChipTopTexture(THREE);
  const chipLabelMat = new THREE.MeshStandardMaterial({
    map: chipTopTex,
    roughness: 0.46,
    metalness: 0.10,
  });
  const chipLabelPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.70, 0.70), chipLabelMat);
  chipLabelPlane.rotation.x = -Math.PI / 2;
  chipLabelPlane.position.y = 0.094;
  chipGroup.add(chipLabelPlane);

  // 48 chân kim loại gull-wing ở 4 cạnh LQFP48 bằng đúng 1 InstancedMesh
  const lqfpLeadGeo = new THREE.BoxGeometry(0.022, 0.032, 0.115);
  const lqfpLeadsInstanced = new THREE.InstancedMesh(lqfpLeadGeo, brushedSteelMat, 48);
  const dummy = new THREE.Object3D();
  let leadIdx = 0;

  for (let side = 0; side < 4; side++) {
    const sideAngle = side * (Math.PI / 2);
    for (let p = 0; p < 12; p++) {
      const along = -0.275 + p * 0.05;
      const outDist = 0.405;
      const sinA = Math.sin(sideAngle);
      const cosA = Math.cos(sideAngle);

      const lx = along * cosA + outDist * sinA;
      const lz = -along * sinA + outDist * cosA;

      dummy.position.set(lx, 0.020, lz);
      dummy.rotation.set(0.14 * cosA, sideAngle, -0.14 * sinA);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lqfpLeadsInstanced.setMatrixAt(leadIdx++, dummy.matrix);
    }
  }
  lqfpLeadsInstanced.instanceMatrix.needsUpdate = true;
  chipGroup.add(lqfpLeadsInstanced);

  // -------------------------------------------------------------------------
  // 3. Hai hàng Header vàng dọc 2 cạnh dài + SWD + BOOT0/BOOT1 (InstancedMesh #2 & #3)
  // -------------------------------------------------------------------------
  // Đế nhựa đen dọc 2 cạnh dài (2 x 20 chân) + đế SWD 4 chân + 2 đế BOOT 3 chân
  const headerStripGeo = new THREE.BoxGeometry(3.96, 0.10, 0.14);
  const northStrip = new THREE.Mesh(headerStripGeo, darkPlasticMat);
  northStrip.position.set(0, PCB_TOP_Y + 0.05, -0.80);
  const southStrip = new THREE.Mesh(headerStripGeo, darkPlasticMat);
  southStrip.position.set(0, PCB_TOP_Y + 0.05, 0.80);

  const swdStrip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.74), darkPlasticMat);
  swdStrip.position.set(2.04, PCB_TOP_Y + 0.05, 0);

  const bootStripGeo = new THREE.BoxGeometry(0.46, 0.09, 0.13);
  const boot0Strip = new THREE.Mesh(bootStripGeo, darkPlasticMat);
  boot0Strip.position.set(0.86, PCB_TOP_Y + 0.045, -0.22);
  const boot1Strip = new THREE.Mesh(bootStripGeo, darkPlasticMat);
  boot1Strip.position.set(0.86, PCB_TOP_Y + 0.045, 0.22);

  boardGroup.add(northStrip, southStrip, swdStrip, boot0Strip, boot1Strip);

  // Thu thập toàn bộ toạ độ chân vàng (40 chân cạnh dài + 4 chân SWD + 6 chân BOOT = 50 chân)
  const goldPinCoords = [];
  const throughHoleCoords = [];

  for (let i = 0; i < 20; i++) {
    const px = -1.90 + i * 0.20;
    goldPinCoords.push({ x: px, y: 0.11, z: -0.80, sy: 1.0 });
    goldPinCoords.push({ x: px, y: 0.11, z: 0.80, sy: 1.0 });
    throughHoleCoords.push({ x: px, z: -0.80 });
    throughHoleCoords.push({ x: px, z: 0.80 });
  }
  for (let i = 0; i < 4; i++) {
    const pz = -0.30 + i * 0.20;
    goldPinCoords.push({ x: 2.04, y: 0.13, z: pz, sy: 0.95 });
    throughHoleCoords.push({ x: 2.04, z: pz });
  }
  for (let p = -1; p <= 1; p++) {
    const bx = 0.86 + p * 0.14;
    goldPinCoords.push({ x: bx, y: 0.14, z: -0.22, sy: 0.78 });
    goldPinCoords.push({ x: bx, y: 0.14, z: 0.22, sy: 0.78 });
  }

  const goldPinGeo = new THREE.BoxGeometry(0.038, 0.44, 0.038);
  const goldPinsInstanced = new THREE.InstancedMesh(
    goldPinGeo,
    goldPinMat,
    goldPinCoords.length
  );
  goldPinCoords.forEach((pt, idx) => {
    dummy.position.set(pt.x, pt.y, pt.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, pt.sy, 1);
    dummy.updateMatrix();
    goldPinsInstanced.setMatrixAt(idx, dummy.matrix);
  });
  goldPinsInstanced.instanceMatrix.needsUpdate = true;
  boardGroup.add(goldPinsInstanced);

  const padRingGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.116, 8);
  const padRingsInstanced = new THREE.InstancedMesh(
    padRingGeo,
    goldPinMat,
    throughHoleCoords.length
  );
  throughHoleCoords.forEach((pt, idx) => {
    dummy.position.set(pt.x, 0, pt.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    padRingsInstanced.setMatrixAt(idx, dummy.matrix);
  });
  padRingsInstanced.instanceMatrix.needsUpdate = true;
  boardGroup.add(padRingsInstanced);

  // 2 cầu nối (shunt cap) màu vàng đặc trưng trên BOOT0 & BOOT1
  const jumperCapGeo = new THREE.BoxGeometry(0.28, 0.19, 0.14);
  const boot0Cap = new THREE.Mesh(jumperCapGeo, yellowJumperMat);
  boot0Cap.position.set(0.79, PCB_TOP_Y + 0.16, -0.22);
  const boot1Cap = new THREE.Mesh(jumperCapGeo, yellowJumperMat);
  boot1Cap.position.set(0.79, PCB_TOP_Y + 0.16, 0.22);
  boardGroup.add(boot0Cap, boot1Cap);

  // -------------------------------------------------------------------------
  // 4. Cổng Micro-USB ở đầu trái + IC nguồn LDO
  // -------------------------------------------------------------------------
  const usbGroup = new THREE.Group();
  usbGroup.position.set(-2.05, PCB_TOP_Y, 0);
  const usbShell = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.54), brushedSteelMat);
  usbShell.position.y = 0.09;
  const usbMouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.44), darkPlasticMat);
  usbMouth.position.set(-0.20, 0.09, 0);
  const usbTongue = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.025, 0.28), goldPinMat);
  usbTongue.position.set(-0.19, 0.09, 0);
  usbGroup.add(usbShell, usbMouth, usbTongue);
  boardGroup.add(usbGroup);

  // IC ổn áp 3.3V nhỏ cạnh cổng USB
  const ldoBody = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.07, 0.30), darkPlasticMat);
  ldoBody.position.set(-1.52, PCB_TOP_Y + 0.035, 0);
  const ldoTab = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.16), brushedSteelMat);
  ldoTab.position.set(-1.40, PCB_TOP_Y + 0.015, 0);
  boardGroup.add(ldoBody, ldoTab);

  // -------------------------------------------------------------------------
  // 5. Tinh thể thạch anh 8MHz (vỏ kim loại HC-49S bầu dục) + nút nhấn Reset
  // -------------------------------------------------------------------------
  const crystalGroup = new THREE.Group();
  crystalGroup.position.set(-0.92, PCB_TOP_Y, -0.26);
  const xtalFlange = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.022, 0.22), brushedSteelMat);
  xtalFlange.position.y = 0.011;
  const xtalMid = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.18), brushedSteelMat);
  xtalMid.position.y = 0.075;
  const xtalCapGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.13, 12);
  const xtalCapL = new THREE.Mesh(xtalCapGeo, brushedSteelMat);
  xtalCapL.position.set(-0.13, 0.075, 0);
  const xtalCapR = new THREE.Mesh(xtalCapGeo, brushedSteelMat);
  xtalCapR.position.set(0.13, 0.075, 0);
  crystalGroup.add(xtalFlange, xtalMid, xtalCapL, xtalCapR);
  boardGroup.add(crystalGroup);

  // Nút nhấn Reset kim loại tròn ở mặt trên
  const resetGroup = new THREE.Group();
  resetGroup.position.set(-1.38, PCB_TOP_Y, 0.36);
  const resetHousing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.28), brushedSteelMat);
  resetHousing.position.y = 0.035;
  const resetPlungerMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.35,
    metalness: 0.05,
  });
  const resetPlunger = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.055, 12),
    resetPlungerMat
  );
  resetPlunger.position.y = 0.082;
  resetGroup.add(resetHousing, resetPlunger);
  boardGroup.add(resetGroup);

  // -------------------------------------------------------------------------
  // 6. Hai đèn LED SMD: Nguồn đỏ (sáng liên tục) & PC13 xanh (nhấp nháy ~1 Hz)
  // -------------------------------------------------------------------------
  const smdBaseMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
  const smdBaseGeo = new THREE.BoxGeometry(0.13, 0.035, 0.08);
  const smdLensGeo = new THREE.BoxGeometry(0.07, 0.045, 0.065);

  // LED Nguồn đỏ (PWR - sáng liên tục)
  const pwrBase = new THREE.Mesh(smdBaseGeo, smdBaseMat);
  pwrBase.position.set(1.52, PCB_TOP_Y + 0.018, -0.28);
  pwrLedMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.5,
    roughness: 0.25,
  });
  const pwrLens = new THREE.Mesh(smdLensGeo, pwrLedMat);
  pwrLens.position.set(1.52, PCB_TOP_Y + 0.042, -0.28);

  const pwrSpriteMat = new THREE.SpriteMaterial({
    map: glowDotTex,
    color: 0xf87171,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  pwrHaloSprite = new THREE.Sprite(pwrSpriteMat);
  pwrHaloSprite.position.set(1.52, PCB_TOP_Y + 0.09, -0.28);
  pwrHaloSprite.scale.set(0.38, 0.38, 1);
  boardGroup.add(pwrBase, pwrLens, pwrHaloSprite);

  // LED PC13 xanh lá (nhấp nháy chu kỳ ~1 Hz)
  const pc13Base = new THREE.Mesh(smdBaseGeo, smdBaseMat);
  pc13Base.position.set(-1.42, PCB_TOP_Y + 0.018, -0.36);
  pc13LedMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x22c55e,
    emissiveIntensity: 1.4,
    roughness: 0.25,
  });
  const pc13Lens = new THREE.Mesh(smdLensGeo, pc13LedMat);
  pc13Lens.position.set(-1.42, PCB_TOP_Y + 0.042, -0.36);

  const pc13SpriteMat = new THREE.SpriteMaterial({
    map: glowDotTex,
    color: 0x34d399,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  pc13HaloSprite = new THREE.Sprite(pc13SpriteMat);
  pc13HaloSprite.position.set(-1.42, PCB_TOP_Y + 0.09, -0.36);
  pc13HaloSprite.scale.set(0.40, 0.40, 1);
  boardGroup.add(pc13Base, pc13Lens, pc13HaloSprite);

  // -------------------------------------------------------------------------
  // 7. Các đường mạch nổi mảnh & hạt "xung tín hiệu" sáng chạy từ chip ra header
  // -------------------------------------------------------------------------
  traceSegmentsMeta = precomputeTraceSegments();

  const traceLinePositions = [];
  SIGNAL_TRACE_PATHS.forEach((poly) => {
    for (let i = 0; i < poly.length - 1; i++) {
      traceLinePositions.push(poly[i][0], PCB_TOP_Y + 0.003, poly[i][1]);
      traceLinePositions.push(poly[i + 1][0], PCB_TOP_Y + 0.003, poly[i + 1][1]);
    }
  });
  const traceLineGeo = new THREE.BufferGeometry();
  traceLineGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(traceLinePositions, 3)
  );
  const traceLineMat = new THREE.LineBasicMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.45,
  });
  boardGroup.add(new THREE.LineSegments(traceLineGeo, traceLineMat));

  // Các hạt xung ánh sáng chạy dọc đường mạch
  const pulseGeo = new THREE.BufferGeometry();
  const pulsePos = new Float32Array(TOTAL_PULSE_POINTS * 3);
  const pulseColors = new Float32Array(TOTAL_PULSE_POINTS * 3);
  for (let i = 0; i < SIGNAL_TRACE_PATHS.length; i++) {
    // Đầu xung trắng xanh rực + đuôi xung lam dịu
    const headIdx = i * PULSE_PER_TRACE;
    const tailIdx = headIdx + 1;
    pulseColors[headIdx * 3] = 0.68;
    pulseColors[headIdx * 3 + 1] = 0.95;
    pulseColors[headIdx * 3 + 2] = 1.0;

    pulseColors[tailIdx * 3] = 0.25;
    pulseColors[tailIdx * 3 + 1] = 0.68;
    pulseColors[tailIdx * 3 + 2] = 0.98;
  }
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
  pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseColors, 3));

  pulseMaterial = new THREE.PointsMaterial({
    size: 0.16,
    map: glowDotTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  pulsePoints = new THREE.Points(pulseGeo, pulseMaterial);
  boardGroup.add(pulsePoints);

  // Xử lý mất/khôi phục ngữ cảnh WebGL an toàn
  heroCanvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      stopHeroLoop();
    },
    false
  );
  heroCanvas.addEventListener(
    'webglcontextrestored',
    () => {
      applyHeroThemeLighting();
      resizeHeroRenderer();
      syncHeroLifecycle();
    },
    false
  );

  applyHeroThemeLighting();
  updatePulsePositions(0.35);
  return true;
}

function updatePulsePositions(timeSec) {
  if (!pulsePoints || !traceSegmentsMeta) return;
  const posAttr = pulsePoints.geometry.getAttribute('position');
  const y = PCB_TOP_Y + 0.012;

  for (let i = 0; i < traceSegmentsMeta.length; i++) {
    const meta = traceSegmentsMeta[i];
    const headP = (timeSec * meta.speed + meta.phaseOffset) % 1;
    const tailP = Math.max(0, headP - 0.075);

    const headPt = samplePointAlongTrace(meta, headP);
    const tailPt = samplePointAlongTrace(meta, tailP);

    const baseIdx = i * PULSE_PER_TRACE;
    posAttr.setXYZ(baseIdx, headPt.x, y, headPt.z);
    posAttr.setXYZ(baseIdx + 1, tailPt.x, y, tailPt.z);
  }
  posAttr.needsUpdate = true;
}

function shouldAnimateHero() {
  return (
    Boolean(heroCanvas && heroCanvas.isConnected) &&
    Boolean(currentHeroEl && !currentHeroEl.classList.contains('is-collapsed')) &&
    isHeroIntersecting &&
    isMotionAllowed() &&
    isTabVisible()
  );
}

function renderStaticFrameOnce() {
  if (!renderer || !scene || !camera || !heroCanvas || !heroCanvas.isConnected) return;
  if (boardGroup) {
    boardGroup.rotation.set(0.30, -0.34, 0.03);
  }
  updatePulsePositions(0.42);
  resizeHeroRenderer();
  renderer.render(scene, camera);
}

function animateHeroFrame(nowMs) {
  if (!shouldAnimateHero() || !renderer || !scene || !camera) {
    rafId = 0;
    lastFrameMs = 0;
    return;
  }

  rafId = window.requestAnimationFrame(animateHeroFrame);

  const dt = lastFrameMs > 0 ? Math.min((nowMs - lastFrameMs) * 0.001, 0.05) : 0.016;
  lastFrameMs = nowMs;
  elapsedSec += dt;

  // 1. Board tự xoay chậm quanh trục đứng (~30 giây/vòng, không nhấp nhô),
  //    kết hợp nghiêng nhẹ theo con trỏ chuột (parallax) và phát sáng viền khi hover.
  smoothTiltX += (targetTiltX - smoothTiltX) * 0.08;
  smoothTiltY += (targetTiltY - smoothTiltY) * 0.08;
  const targetHover = isPointerHovering ? 1 : 0;
  smoothHoverGlow += (targetHover - smoothHoverGlow) * 0.09;

  if (boardGroup) {
    const radPerSec = (Math.PI * 2) / 30;
    boardGroup.rotation.y = -0.34 + elapsedSec * radPerSec + smoothTiltY;
    boardGroup.rotation.x = 0.28 + smoothTiltX;
    boardGroup.rotation.z = 0;
    boardGroup.position.y = 0;
  }

  // 2. Viền board phát sáng nhẹ khi hover
  if (rimGlowMat) {
    rimGlowMat.opacity = 0.16 + smoothHoverGlow * 0.68;
  }
  if (rimHaloMat) {
    rimHaloMat.opacity = smoothHoverGlow * 0.32;
  }

  // 3. LED PC13 xanh nhấp nháy nhẹ ~1 Hz, LED nguồn đỏ sáng liên tục
  if (pc13LedMat && pc13HaloSprite) {
    const wave1Hz = Math.sin(elapsedSec * Math.PI * 2.0);
    const blink01 = 0.5 + 0.5 * Math.tanh(wave1Hz * 2.6);
    pc13LedMat.emissiveIntensity = 0.14 + blink01 * 1.45;
    pc13HaloSprite.material.opacity = 0.06 + blink01 * 0.68;
  }
  if (pwrLedMat && pwrHaloSprite) {
    pwrLedMat.emissiveIntensity = 1.45 + smoothHoverGlow * 0.25;
    pwrHaloSprite.material.opacity = 0.68 + smoothHoverGlow * 0.14;
  }

  // 4. Xung tín hiệu nhẹ chạy dọc đường mạch từ chip STM32F103 ra header vàng
  const pulseTime = elapsedSec * (0.68 + smoothHoverGlow * 0.25);
  updatePulsePositions(pulseTime);
  if (pulseMaterial) {
    pulseMaterial.size = 0.145 + smoothHoverGlow * 0.03;
    pulseMaterial.opacity = 0.72 + smoothHoverGlow * 0.18;
  }

  renderer.render(scene, camera);
}

function startHeroLoop() {
  if (rafId) return;
  lastFrameMs = 0;
  rafId = window.requestAnimationFrame(animateHeroFrame);
}

function stopHeroLoop() {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
  lastFrameMs = 0;
}

function observeHeroViewport(heroEl) {
  if (viewportObserver) {
    viewportObserver.disconnect();
    viewportObserver = null;
  }
  isHeroIntersecting = true;

  if (typeof window.IntersectionObserver !== 'function' || !heroEl) return;

  viewportObserver = new window.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === heroEl) {
          isHeroIntersecting = entry.isIntersecting;
          if (!isHeroIntersecting) {
            stopHeroLoop();
          } else {
            syncHeroLifecycle();
          }
        }
      }
    },
    { threshold: 0.02 }
  );
  viewportObserver.observe(heroEl);
}

async function syncHeroLifecycle() {
  // Khi tắt "Hiệu ứng 3D": dừng ngay WebGL để CSS hiển thị ảnh tĩnh SVG thay thế
  if (
    !isFxEnabled() ||
    !currentStageEl ||
    !document.body.contains(currentStageEl) ||
    !currentHeroEl ||
    currentHeroEl.classList.contains('is-collapsed')
  ) {
    stopHeroLoop();
    return;
  }

  const ok = await ensureHeroScene();
  if (!ok || !currentStageEl || !document.body.contains(currentStageEl)) {
    stopHeroLoop();
    if (currentStageEl && webglFailed) {
      currentStageEl.classList.add('is-webgl-fallback');
    }
    return;
  }

  currentStageEl.classList.remove('is-webgl-fallback');
  if (heroCanvas && heroCanvas.parentElement !== currentStageEl) {
    // Giữ nguyên thẻ <img> SVG tĩnh bên trong stage, chỉ gắn thêm <canvas> 3D
    currentStageEl.appendChild(heroCanvas);
  }

  applyHeroThemeLighting();
  resizeHeroRenderer();

  // Tôn trọng prefers-reduced-motion: vẽ 1 khung hình 3D tĩnh, không quay liên tục
  if (prefersReducedMotion()) {
    stopHeroLoop();
    renderStaticFrameOnce();
    return;
  }

  if (isTabVisible() && isHeroIntersecting) {
    startHeroLoop();
  } else {
    stopHeroLoop();
  }
}

function bindGlobalLifecycleOnce() {
  if (globalListenersBound) return;
  globalListenersBound = true;

  onFxChange(() => {
    syncHeroLifecycle();
  });

  window.addEventListener(
    'hashchange',
    () => {
      if (!currentStageEl || !document.body.contains(currentStageEl)) {
        stopHeroLoop();
      }
    },
    { passive: true }
  );

  window.addEventListener(
    'resize',
    () => {
      if (heroCanvas && heroCanvas.isConnected && isFxEnabled()) {
        resizeHeroRenderer();
        if (prefersReducedMotion()) {
          renderStaticFrameOnce();
        }
      }
    },
    { passive: true }
  );
}

/**
 * Gắn sự kiện tương tác & khởi chạy mô hình 3D STM32F103 Blue Pill ở đầu #/dashboard
 * @param {HTMLElement} pageContainer - Vùng chứa trang Dashboard
 */
export function mountLabHero3D(pageContainer) {
  bindGlobalLifecycleOnce();

  if (!pageContainer) return;
  const heroEl = pageContainer.querySelector('#dashboard-hero-3d');
  const stageEl = pageContainer.querySelector('#lab-hero-stage');
  const toggleBtn = pageContainer.querySelector('#btn-toggle-hero-3d');

  if (!heroEl || !stageEl) {
    stopHeroLoop();
    return;
  }

  currentHeroEl = heroEl;
  currentStageEl = stageEl;
  isPointerHovering = false;
  observeHeroViewport(heroEl);

  // Nghiêng nhẹ theo chuột (parallax) & kích hoạt phát sáng viền board khi hover
  heroEl.addEventListener(
    'pointerenter',
    () => {
      isPointerHovering = true;
    },
    { passive: true }
  );

  heroEl.addEventListener(
    'pointermove',
    (e) => {
      if (!isMotionAllowed() || heroEl.classList.contains('is-collapsed')) return;
      isPointerHovering = true;
      const rect = heroEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      // Parallax chỉ xoay nhẹ mô hình 3D bên trong khung (tối đa ±6° = 0.1047 rad), tuyệt đối không kéo thẻ
      const MAX_HERO_TILT_RAD = (6 * Math.PI) / 180;
      targetTiltY = Math.max(-MAX_HERO_TILT_RAD, Math.min(MAX_HERO_TILT_RAD, nx * MAX_HERO_TILT_RAD));
      targetTiltX = Math.max(-MAX_HERO_TILT_RAD, Math.min(MAX_HERO_TILT_RAD, ny * (MAX_HERO_TILT_RAD * 0.7)));
    },
    { passive: true }
  );

  heroEl.addEventListener(
    'pointerleave',
    () => {
      isPointerHovering = false;
      targetTiltX = 0;
      targetTiltY = 0;
    },
    { passive: true }
  );

  // Nút Thu gọn / Mở rộng thẻ giới thiệu (lưu localStorage bọc try/catch)
  if (toggleBtn) {
    let expandResizeTimer = 0;
    toggleBtn.addEventListener('click', () => {
      const nextCollapsed = !heroEl.classList.contains('is-collapsed');
      heroEl.classList.toggle('is-collapsed', nextCollapsed);
      const bentoGrid = heroEl.closest('.bento-grid');
      if (bentoGrid) {
        bentoGrid.classList.toggle('is-hero-collapsed', nextCollapsed);
      }

      const collapsibleEl = heroEl.querySelector('.dashboard-hero-collapsible');
      if (collapsibleEl) {
        collapsibleEl.setAttribute('aria-hidden', nextCollapsed ? 'true' : 'false');
      }

      setHeroCollapsed(nextCollapsed);
      toggleBtn.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');

      const labelSpan = toggleBtn.querySelector('.hero-collapse-label');
      if (labelSpan) {
        labelSpan.textContent = nextCollapsed ? 'Mở giới thiệu' : 'Thu gọn';
      }

      if (expandResizeTimer) {
        window.clearTimeout(expandResizeTimer);
        expandResizeTimer = 0;
      }

      if (nextCollapsed) {
        isPointerHovering = false;
        targetTiltX = 0;
        targetTiltY = 0;
        stopHeroLoop();
      } else {
        syncHeroLifecycle();
        // Cập nhật lại kích thước canvas WebGL sau khi animation mở rộng hoàn tất
        expandResizeTimer = window.setTimeout(() => {
          expandResizeTimer = 0;
          if (
            currentHeroEl === heroEl &&
            heroEl.isConnected &&
            !heroEl.classList.contains('is-collapsed') &&
            isFxEnabled()
          ) {
            resizeHeroRenderer();
            if (prefersReducedMotion()) {
              renderStaticFrameOnce();
            }
          }
        }, 280);
      }
    });
  }

  syncHeroLifecycle();
}
