/**
 * modal.js - Hộp thoại bật lên (Reusable Modal System)
 * Tự động kiểm tra và tái tạo cấu trúc nếu thiếu, tuyệt đối không crash.
 */

let modalBackdrop = null;
let lastFocusedEl = null; // Phần tử đang focus trước khi mở modal, để trả focus khi đóng

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Khoá nền: phần ứng dụng (#app) không nhận focus / đọc màn hình khi modal đang mở
 */
function setBackgroundInert(isInert) {
  const appEl = document.getElementById('app');
  if (!appEl) return;
  // Panel chi tiết thiết bị đang mở phía dưới modal thì nền vẫn phải bị khoá
  const sidePanelOpen = document.getElementById('side-panel')?.classList.contains('open');
  appEl.inert = isInert || Boolean(sidePanelOpen);
}

function ensureModal() {
  modalBackdrop = document.getElementById('modal-backdrop');
  if (!modalBackdrop) {
    modalBackdrop = document.createElement('div');
    modalBackdrop.id = 'modal-backdrop';
    document.body.appendChild(modalBackdrop);
  }

  // Đảm bảo cấu trúc bên trong modal luôn hiện diện đầy đủ
  if (!modalBackdrop.querySelector('#modal-title') || 
      !modalBackdrop.querySelector('#modal-body') || 
      !modalBackdrop.querySelector('#modal-footer')) {
    modalBackdrop.innerHTML = `
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Tiêu đề</h3>
          <button class="btn-icon" type="button" id="modal-btn-close" aria-label="Đóng" title="Đóng">&times;</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
        <div class="modal-footer" id="modal-footer"></div>
      </div>
    `;
  }

  // Gắn sự kiện đóng an toàn (chỉ gắn 1 lần)
  if (!modalBackdrop._hasListeners) {
    modalBackdrop._hasListeners = true;

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (!modalBackdrop.classList.contains('active')) return;

      if (e.key === 'Escape') {
        closeModal();
        return;
      }

      // Giữ Tab / Shift+Tab xoay vòng trong hộp thoại
      if (e.key === 'Tab') {
        const dialogEl = modalBackdrop.querySelector('.modal-dialog');
        if (!dialogEl) return;
        const items = getFocusable(dialogEl);
        if (items.length === 0) {
          e.preventDefault();
          dialogEl.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const current = document.activeElement;
        if (e.shiftKey && (current === first || !dialogEl.contains(current))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (current === last || !dialogEl.contains(current))) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    const closeBtn = modalBackdrop.querySelector('#modal-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
  }

  return modalBackdrop;
}

/**
 * Mở modal
 * @param {object} options
 * @param {string} options.title - Tiêu đề modal
 * @param {string|HTMLElement} options.content - Nội dung HTML hoặc phần tử DOM
 * @param {string} [options.confirmText] - Nhãn nút xác nhận (nếu có)
 * @param {string} [options.cancelText] - Nhãn nút hủy/đóng
 * @param {Function} [options.onConfirm] - Callback khi bấm xác nhận
 */
export function openModal({ title, content, confirmText = '', cancelText = 'Đóng', onConfirm = null }) {
  const backdrop = ensureModal();
  const titleEl = backdrop.querySelector('#modal-title');
  const bodyEl = backdrop.querySelector('#modal-body');
  const footerEl = backdrop.querySelector('#modal-footer');

  if (!titleEl || !bodyEl || !footerEl) {
    console.error('Không thể tìm thấy cấu trúc dialog trong #modal-backdrop.');
    alert(title ? `${title}\n\n${typeof content === 'string' ? content : ''}` : 'Thông báo');
    return;
  }

  titleEl.textContent = title || 'Thông báo';

  if (typeof content === 'string') {
    bodyEl.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    bodyEl.innerHTML = '';
    bodyEl.appendChild(content);
  }

  footerEl.innerHTML = '';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = cancelText;
  cancelBtn.addEventListener('click', closeModal);
  footerEl.appendChild(cancelBtn);

  if (confirmText && typeof onConfirm === 'function') {
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = confirmText;
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      try {
        await onConfirm();
        closeModal();
      } catch (err) {
        confirmBtn.disabled = false;
      }
    });
    footerEl.appendChild(confirmBtn);
  }

  // Nhớ phần tử đang focus (nếu modal đang mở sẵn thì giữ phần tử gốc), khoá nền, chuyển focus vào hộp
  if (!backdrop.classList.contains('active')) {
    lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
  setBackgroundInert(true);

  const dialogEl = backdrop.querySelector('.modal-dialog');
  if (dialogEl) {
    dialogEl.setAttribute('tabindex', '-1');
    // Ưu tiên ô nhập (autofocus) hoặc nút đầu tiên trong nội dung; không thì focus vào chính hộp thoại
    const preferred =
      bodyEl.querySelector('[autofocus]') ||
      getFocusable(bodyEl)[0] ||
      footerEl.querySelector('.btn-primary') ||
      dialogEl;
    window.requestAnimationFrame(() => preferred.focus());
  }
}

/**
 * Đóng modal
 */
export function closeModal() {
  if (modalBackdrop) {
    modalBackdrop.classList.remove('active');
    document.body.style.overflow = '';
    setBackgroundInert(false);
    // Trả focus về phần tử đã mở modal (nếu còn nằm trong tài liệu)
    if (lastFocusedEl && document.contains(lastFocusedEl)) {
      lastFocusedEl.focus();
    }
    lastFocusedEl = null;
  }
}
