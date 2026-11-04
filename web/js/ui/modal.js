/**
 * modal.js - Hộp thoại bật lên (Reusable Modal System)
 * Tự động kiểm tra và tái tạo cấu trúc nếu thiếu, tuyệt đối không crash.
 */

let modalBackdrop = null;

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
      <div class="modal-dialog" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Tiêu đề</h3>
          <button class="btn-icon" id="modal-btn-close" aria-label="Đóng">&times;</button>
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
      if (e.key === 'Escape' && modalBackdrop.classList.contains('active')) {
        closeModal();
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

  backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Đóng modal
 */
export function closeModal() {
  if (modalBackdrop) {
    modalBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
}
