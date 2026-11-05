/**
 * confetti.js - Hiệu ứng tung hạt giấy / tia sáng ngắn khi lập phiếu mượn thành công (Đợt D.3)
 * - Chỉ gắn <canvas> 2D tạm thời lúc nổ hạt (~50 hạt), tự gỡ canvas.remove() ngay sau 900ms.
 * - Giới hạn devicePixelRatio <= 1.5, pointer-events: none, nằm dưới #toast-container (không che Toast).
 * - Tự tắt hoàn toàn khi công tắc "Hiệu ứng 3D" tắt, khi prefers-reduced-motion: reduce hoặc tab ẩn.
 */

import { isMotionAllowed, isTabVisible, onFxChange } from './fx.js';

const MAX_DPR = 1.5;
const DURATION_MS = 900;
const PARTICLE_COUNT = 50;
const PALETTE = ['#3B82F6', '#10B981', '#60A5FA', '#F59E0B'];

const activeBursts = new Set();
let fxCleanupBound = false;

function cleanupAllBursts() {
  for (const cleanup of Array.from(activeBursts)) {
    cleanup();
  }
}

function ensureLifecycleCleanup() {
  if (fxCleanupBound) return;
  fxCleanupBound = true;
  onFxChange(() => {
    if (!isMotionAllowed() || !isTabVisible()) {
      cleanupAllBursts();
    }
  });
}

/**
 * Xác định tâm nổ hạt từ phần tử nút bấm (hoặc nút xác nhận của Modal đang mở)
 * @param {HTMLElement|null} [anchorEl]
 */
function resolveOrigin(anchorEl) {
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 720;

  const target =
    (anchorEl instanceof HTMLElement && anchorEl.isConnected ? anchorEl : null) ||
    document.querySelector('#modal-backdrop.active #modal-footer .btn-primary');

  if (target) {
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.35,
      };
    }
  }

  return {
    x: vw * 0.5,
    y: vh * 0.56,
  };
}

/**
 * Tung chùm ~50 hạt giấy/tia sáng chúc mừng ngắn gọn (900ms)
 * @param {HTMLElement|null} [anchorEl=null] - Nút xác nhận làm tâm phóng hạt
 */
export function launchSuccessConfetti(anchorEl = null) {
  ensureLifecycleCleanup();
  if (!isMotionAllowed() || !isTabVisible()) return;

  const origin = resolveOrigin(anchorEl);
  const vw = Math.max(window.innerWidth || 1, 1);
  const vh = Math.max(window.innerHeight || 1, 1);
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-burst-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  // Khởi tạo ~50 hạt bay toả hình quạt hướng lên rồi rơi nhẹ theo trọng lực
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const spreadRad = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.85;
    const speed = 260 + Math.random() * 340;
    const isSpark = i % 4 === 0;

    particles.push({
      x: origin.x + (Math.random() - 0.5) * 28,
      y: origin.y + (Math.random() - 0.5) * 10,
      vx: Math.cos(spreadRad) * speed,
      vy: Math.sin(spreadRad) * speed - 60,
      w: isSpark ? 5 + Math.random() * 3 : 7 + Math.random() * 4.5,
      h: isSpark ? 5 + Math.random() * 3 : 4 + Math.random() * 2.5,
      rot: Math.random() * Math.PI * 2,
      rotVel: (Math.random() - 0.5) * 11,
      tiltPhase: Math.random() * Math.PI * 2,
      tiltVel: 7 + Math.random() * 7,
      color: PALETTE[i % PALETTE.length],
      isSpark,
    });
  }

  let rafId = 0;
  let startMs = 0;
  let lastMs = 0;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    activeBursts.delete(dispose);
    if (canvas.parentNode) {
      canvas.remove();
    }
  };
  activeBursts.add(dispose);

  function frame(nowMs) {
    if (disposed || !isMotionAllowed() || !isTabVisible()) {
      dispose();
      return;
    }

    if (!startMs) {
      startMs = nowMs;
      lastMs = nowMs;
    }

    const elapsed = nowMs - startMs;
    if (elapsed >= DURATION_MS) {
      dispose();
      return;
    }

    const dt = Math.min((nowMs - lastMs) * 0.001, 0.04);
    lastMs = nowMs;

    const progress = elapsed / DURATION_MS;
    // Mờ dần mượt ở 35% thời lượng cuối
    const alpha = progress < 0.65 ? 1 : Math.max(0, 1 - (progress - 0.65) / 0.35);

    ctx.clearRect(0, 0, vw, vh);

    const drag = Math.pow(0.14, dt);
    const gravity = 860;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.vx *= drag;
      p.vy = p.vy * drag + gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotVel * dt;
      p.tiltPhase += p.tiltVel * dt;

      const scaleY = 0.25 + 0.75 * Math.abs(Math.cos(p.tiltPhase));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, scaleY);
      ctx.fillStyle = p.color;

      if (p.isSpark) {
        // Hạt thoi tia sáng nhỏ
        const r = p.w * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        // Mảnh giấy chữ nhật lật 3D
        ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
      }
      ctx.restore();
    }

    rafId = window.requestAnimationFrame(frame);
  }

  rafId = window.requestAnimationFrame(frame);
}
