/**
 * fx.js - Bộ điều khiển trung tâm cho "Hiệu ứng 3D" (Đợt A -> E)
 * Quản lý công tắc #btn-fx-toggle trên Topbar, lưu localStorage (bọc try/catch),
 * theo dõi prefers-reduced-motion, visibilitychange và nạp động Three.js cục bộ.
 */

const FX_STORAGE_KEY = 'lab_fx_3d';

let userFxSwitchOn = true;
let reducedMotionQuery = null;
let threeModulePromise = null;
const subscribers = new Set();

/**
 * Kiểm tra cài đặt giảm chuyển động của hệ điều hành
 */
export function prefersReducedMotion() {
  try {
    if (reducedMotionQuery) {
      return Boolean(reducedMotionQuery.matches);
    }
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch (_) {
    return false;
  }
}

/**
 * Đọc trạng thái công tắc Hiệu ứng 3D đã lưu (mặc định: bật)
 */
export function readSavedFxPreference() {
  try {
    const urlParam = new URLSearchParams(window.location.search).get('fx');
    if (urlParam === 'off' || urlParam === '0' || urlParam === 'flat') return false;
    if (urlParam === 'on' || urlParam === '1' || urlParam === '3d') return true;
  } catch (_) {
    // Bỏ qua nếu URLSearchParams lỗi
  }

  try {
    const saved = localStorage.getItem(FX_STORAGE_KEY);
    if (saved === 'off') return false;
    if (saved === 'on') return true;
  } catch (_) {
    // Bỏ qua nếu trình duyệt chặn localStorage
  }

  return true;
}

/**
 * Trạng thái công tắc "Hiệu ứng 3D" của người dùng (true = bật 3d, false = phẳng)
 */
export function isFxEnabled() {
  return userFxSwitchOn;
}

/**
 * Cho biết các hiệu ứng chuyển động / WebGL / theo chuột có được phép chạy hay không
 * (phải vừa bật công tắc 3D vừa không bật prefers-reduced-motion)
 */
export function isMotionAllowed() {
  return userFxSwitchOn && !prefersReducedMotion();
}

/**
 * Cho biết tab hiện tại có đang hiển thị hay bị ẩn
 */
export function isTabVisible() {
  return !document.hidden;
}

/**
 * Lấy giao diện hiện tại ('light' | 'dark')
 */
export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * Nạp động thư viện Three.js cục bộ (chỉ nạp 1 lần duy nhất khi thực sự cần)
 */
export function loadThreeModule() {
  if (!threeModulePromise) {
    threeModulePromise = import('../../vendor/three.module.min.js').catch((err) => {
      threeModulePromise = null;
      console.warn('[LabApp 3D] Không thể nạp three.module.min.js:', err);
      return null;
    });
  }
  return threeModulePromise;
}

/**
 * Đăng ký lắng nghe khi trạng thái 3D, reduced-motion, ẩn/hiện tab hoặc theme thay đổi
 * @param {(state: { fxEnabled: boolean, motionAllowed: boolean, tabVisible: boolean, theme: string }) => void} callback
 * @returns {() => void} Hàm huỷ đăng ký
 */
export function onFxChange(callback) {
  if (typeof callback !== 'function') return () => {};
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot() {
  return {
    fxEnabled: isFxEnabled(),
    motionAllowed: isMotionAllowed(),
    tabVisible: isTabVisible(),
    theme: getCurrentTheme(),
  };
}

function notifySubscribers() {
  const snapshot = getSnapshot();
  subscribers.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.warn('[LabApp 3D] Lỗi trong subscriber fx:', err);
    }
  });
}

function syncDomAttribute() {
  const mode = userFxSwitchOn ? '3d' : 'flat';
  document.documentElement.setAttribute('data-fx', mode);
  updateFxToggleButton();
}

function updateFxToggleButton() {
  const btn = document.getElementById('btn-fx-toggle');
  if (!btn) return;

  const isReduced = prefersReducedMotion();
  btn.setAttribute('aria-checked', userFxSwitchOn ? 'true' : 'false');
  btn.classList.toggle('is-active', userFxSwitchOn);
  btn.classList.toggle('is-reduced-motion', isReduced);

  if (!userFxSwitchOn) {
    btn.setAttribute('title', 'Hiệu ứng 3D đang TẮT (giao diện phẳng) — Nhấp để bật lại');
  } else if (isReduced) {
    btn.setAttribute(
      'title',
      'Hiệu ứng 3D đang BẬT (tự động dừng chuyển động theo cài đặt prefers-reduced-motion của hệ điều hành)'
    );
  } else {
    btn.setAttribute('title', 'Hiệu ứng 3D đang BẬT — Nhấp để tắt về giao diện phẳng');
  }
}

/**
 * Đặt trạng thái bật/tắt công tắc Hiệu ứng 3D và lưu localStorage
 */
export function setFxEnabled(enabled) {
  userFxSwitchOn = Boolean(enabled);

  try {
    localStorage.setItem(FX_STORAGE_KEY, userFxSwitchOn ? 'on' : 'off');
  } catch (_) {
    // Bỏ qua lỗi ghi localStorage (chế độ ẩn danh nghiêm ngặt / quota)
  }

  syncDomAttribute();
  notifySubscribers();
}

/**
 * Đảo trạng thái công tắc Hiệu ứng 3D
 */
export function toggleFx() {
  setFxEnabled(!userFxSwitchOn);
}

/**
 * Khởi tạo hệ thống điều khiển Hiệu ứng 3D trên toàn ứng dụng
 */
export function initFx() {
  try {
    if (window.matchMedia) {
      reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
  } catch (_) {
    reducedMotionQuery = null;
  }

  userFxSwitchOn = readSavedFxPreference();
  syncDomAttribute();
  document.documentElement.toggleAttribute('data-tab-hidden', Boolean(document.hidden));

  const btn = document.getElementById('btn-fx-toggle');
  if (btn) {
    btn.addEventListener('click', toggleFx);
  }

  // Theo dõi khi người dùng đổi cài đặt giảm chuyển động ngay trong lúc mở web
  if (reducedMotionQuery) {
    const handleMotionChange = () => {
      updateFxToggleButton();
      notifySubscribers();
    };
    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', handleMotionChange);
    } else if (typeof reducedMotionQuery.addListener === 'function') {
      reducedMotionQuery.addListener(handleMotionChange);
    }
  }

  // Tạm dừng / khôi phục hiệu ứng khi chuyển tab hoặc thu nhỏ cửa sổ
  document.addEventListener('visibilitychange', () => {
    document.documentElement.toggleAttribute('data-tab-hidden', Boolean(document.hidden));
    notifySubscribers();
  });

  // Đồng bộ màu sắc 3D tức thì khi đổi Theme Sáng / Tối trên <html>
  const themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-theme') {
        notifySubscribers();
        break;
      }
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}
