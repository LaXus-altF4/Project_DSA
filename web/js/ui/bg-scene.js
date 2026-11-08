/**
 * bg-scene.js - Lớp lưới sóng phối cảnh & hạt ánh sáng 3D mờ Dark-tech Cyan
 * Sử dụng Three.js cục bộ (nạp động), giới hạn devicePixelRatio <= 1.5, chỉ 2 draw calls,
 * chuyển động chậm, tự dừng khi ẩn tab, tắt "Hiệu ứng 3D" hoặc prefers-reduced-motion.
 */

import {
  getCurrentTheme,
  isMotionAllowed,
  isTabVisible,
  loadThreeModule,
  onFxChange,
} from './fx.js';

const MAX_DPR = 1.5;
const GRID_SEG_X = 26;
const GRID_SEG_Y = 16;
const PARTICLE_COUNT = 70;

let THREE = null;
let canvasEl = null;
let renderer = null;
let scene = null;
let camera = null;

let gridMesh = null;
let gridBaseXY = null;
let gridMaterial = null;

let particlesPoints = null;
let particleMaterial = null;
let particleSeeds = null;

let rafId = 0;
let elapsedSec = 0;
let lastFrameMs = 0;
let isInitializing = false;
let webglUnavailable = false;
let resizeAttached = false;
let resizeRafId = 0;
let appliedTheme = '';

/**
 * Tạo sprite tròn mờ (32x32) trong bộ nhớ cho hạt ánh sáng mềm mại
 */
function createSoftDotTexture(threeNs) {
  const size = 32;
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return null;

  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.38, 'rgba(255, 255, 255, 0.65)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new threeNs.CanvasTexture(offscreen);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Đồng bộ bảng màu lưới 3D & hạt theo Dark-tech Cyan Theme Sáng / Tối
 */
function applySceneTheme(theme) {
  if (!THREE || !gridMaterial || !particleMaterial) return;
  if (appliedTheme === theme) return;
  appliedTheme = theme;

  const isDark = theme === 'dark';

  // Lưới dây phối cảnh: mờ dịu không tranh chấp với chữ và bảng số liệu
  gridMaterial.color.setHex(isDark ? 0x3b82f6 : 0x3b82f6);
  gridMaterial.opacity = isDark ? 0.14 : 0.09;
  gridMaterial.needsUpdate = true;

  // Hạt bụi ánh sáng lơ lửng
  particleMaterial.opacity = isDark ? 0.52 : 0.36;
  particleMaterial.size = isDark ? 0.40 : 0.34;
  particleMaterial.needsUpdate = true;

  // Cập nhật sắc độ hạt khớp 3 quầng màu: xanh dương, ngọc cyan, chàm indigo
  if (particlesPoints && particlesPoints.geometry) {
    const colorAttr = particlesPoints.geometry.getAttribute('color');
    if (colorAttr) {
      const primaryColor = new THREE.Color(isDark ? 0x3b82f6 : 0x2563eb);
      const cyanColor = new THREE.Color(isDark ? 0x22d3ee : 0x0891b2);
      const indigoColor = new THREE.Color(isDark ? 0x818cf8 : 0x6366f1);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const mod = i % 3;
        const c = mod === 0 ? primaryColor : mod === 1 ? cyanColor : indigoColor;
        colorAttr.setXYZ(i, c.r, c.g, c.b);
      }
      colorAttr.needsUpdate = true;
    }
  }
}

function updateRendererSize() {
  if (!renderer || !camera) return;
  const width = Math.max(window.innerWidth || 1, 1);
  const height = Math.max(window.innerHeight || 1, 1);
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
}

function handleWindowResize() {
  if (resizeRafId) return;
  resizeRafId = window.requestAnimationFrame(() => {
    resizeRafId = 0;
    updateRendererSize();
  });
}

async function ensureSceneCreated() {
  if (renderer || webglUnavailable || isInitializing) return Boolean(renderer);
  canvasEl = document.getElementById('bg-3d-canvas');
  if (!canvasEl) return false;

  isInitializing = true;
  const mod = await loadThreeModule();
  isInitializing = false;

  if (!mod) {
    webglUnavailable = true;
    return false;
  }
  THREE = mod;

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
  } catch (err) {
    webglUnavailable = true;
    canvasEl.style.display = 'none';
    console.info('[LabApp 3D] Thiết bị không hỗ trợ WebGL, tự động dùng nền CSS tĩnh:', err);
    return false;
  }

  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    48,
    (window.innerWidth || 1366) / (window.innerHeight || 768),
    0.5,
    80
  );
  camera.position.set(0, 3.6, 13.5);
  camera.lookAt(0, -1.1, 0);

  // 1. Mặt lưới sóng phối cảnh low-poly ở nửa dưới khung nhìn (Draw Call #1)
  const planeGeo = new THREE.PlaneGeometry(38, 22, GRID_SEG_X, GRID_SEG_Y);
  const posAttr = planeGeo.getAttribute('position');
  gridBaseXY = new Float32Array(posAttr.count * 2);
  for (let i = 0; i < posAttr.count; i++) {
    gridBaseXY[i * 2] = posAttr.getX(i);
    gridBaseXY[i * 2 + 1] = posAttr.getY(i);
  }

  gridMaterial = new THREE.MeshBasicMaterial({
    color: 0x3b82f6,
    wireframe: true,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });

  gridMesh = new THREE.Mesh(planeGeo, gridMaterial);
  gridMesh.rotation.x = -Math.PI * 0.44;
  gridMesh.position.set(0, -3.25, -3.5);
  scene.add(gridMesh);

  // 2. Các hạt ánh sáng lơ lửng trong không gian (Draw Call #2)
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  particleSeeds = new Float32Array(PARTICLE_COUNT * 4);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const s1 = Math.sin(i * 12.9898 + 1.23) * 43758.5453;
    const s2 = Math.sin(i * 78.233 + 4.56) * 24634.6345;
    const s3 = Math.sin(i * 39.425 + 7.89) * 19543.2198;
    const rx = s1 - Math.floor(s1);
    const ry = s2 - Math.floor(s2);
    const rz = s3 - Math.floor(s3);

    const bx = (rx - 0.5) * 34;
    const by = (ry - 0.35) * 13;
    const bz = (rz - 0.65) * 16;

    positions[i * 3] = bx;
    positions[i * 3 + 1] = by;
    positions[i * 3 + 2] = bz;

    particleSeeds[i * 4] = bx;
    particleSeeds[i * 4 + 1] = by;
    particleSeeds[i * 4 + 2] = bz;
    particleSeeds[i * 4 + 3] = 0.25 + rx * 0.45;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const dotTexture = createSoftDotTexture(THREE);
  particleMaterial = new THREE.PointsMaterial({
    size: 0.36,
    map: dotTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.40,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true,
  });

  particlesPoints = new THREE.Points(particleGeo, particleMaterial);
  scene.add(particlesPoints);

  canvasEl.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      stopRenderLoop();
    },
    false
  );
  canvasEl.addEventListener(
    'webglcontextrestored',
    () => {
      appliedTheme = '';
      applySceneTheme(getCurrentTheme());
      updateRendererSize();
      syncSceneRunState();
    },
    false
  );

  applySceneTheme(getCurrentTheme());
  updateRendererSize();
  return true;
}

function renderFrame(nowMs) {
  if (!isMotionAllowed() || !isTabVisible() || !renderer || !scene || !camera) {
    rafId = 0;
    lastFrameMs = 0;
    return;
  }

  rafId = window.requestAnimationFrame(renderFrame);

  const deltaSec = lastFrameMs > 0 ? Math.min((nowMs - lastFrameMs) * 0.001, 0.05) : 0.016;
  lastFrameMs = nowMs;
  elapsedSec += deltaSec;

  if (gridMesh && gridBaseXY) {
    const posAttr = gridMesh.geometry.getAttribute('position');
    const count = posAttr.count;
    const t = elapsedSec;

    for (let i = 0; i < count; i++) {
      const x = gridBaseXY[i * 2];
      const y = gridBaseXY[i * 2 + 1];
      const z =
        Math.sin(x * 0.26 + t * 0.52) * 0.42 +
        Math.cos(y * 0.32 + t * 0.38) * 0.30;
      posAttr.setZ(i, z);
    }
    posAttr.needsUpdate = true;
  }

  if (particlesPoints && particleSeeds) {
    const pAttr = particlesPoints.geometry.getAttribute('position');
    const t = elapsedSec;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const bx = particleSeeds[i * 4];
      const by = particleSeeds[i * 4 + 1];
      const bz = particleSeeds[i * 4 + 2];
      const speed = particleSeeds[i * 4 + 3];

      const nx = bx + Math.sin(t * speed + i) * 0.65;
      const ny = by + Math.cos(t * speed * 0.85 + i * 0.7) * 0.55;
      pAttr.setXYZ(i, nx, ny, bz);
    }
    pAttr.needsUpdate = true;
  }

  camera.position.x = Math.sin(elapsedSec * 0.16) * 0.28;
  camera.position.y = 3.6 + Math.cos(elapsedSec * 0.12) * 0.12;
  camera.lookAt(0, -1.1, 0);

  renderer.render(scene, camera);
}

function startRenderLoop() {
  if (rafId) return;
  lastFrameMs = 0;

  if (!resizeAttached) {
    resizeAttached = true;
    window.addEventListener('resize', handleWindowResize, { passive: true });
  }

  rafId = window.requestAnimationFrame(renderFrame);
}

function stopRenderLoop() {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
  lastFrameMs = 0;

  if (resizeAttached) {
    resizeAttached = false;
    window.removeEventListener('resize', handleWindowResize);
  }
  if (resizeRafId) {
    window.cancelAnimationFrame(resizeRafId);
    resizeRafId = 0;
  }
}

async function syncSceneRunState() {
  const currentTheme = getCurrentTheme();
  if (renderer) {
    applySceneTheme(currentTheme);
  }

  if (isMotionAllowed() && isTabVisible()) {
    const ok = await ensureSceneCreated();
    if (ok && isMotionAllowed() && isTabVisible()) {
      updateRendererSize();
      startRenderLoop();
    }
  } else {
    stopRenderLoop();
  }
}

/**
 * Khởi tạo nền hạt & lưới sóng 3D mờ phía sau nội dung
 */
export function initBgScene() {
  syncSceneRunState();
  onFxChange(() => {
    syncSceneRunState();
  });
}
