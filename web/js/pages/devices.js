/**
 * devices.js - Màn hình 2: Danh mục Thiết bị (Shell Placeholder)
 */
export async function render(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="layers"></i> Danh mục Thiết bị
          </h1>
          <div class="page-desc">Quản lý kho thiết bị, trạng thái sẵn sàng, bảo trì và xem chi tiết gợi ý mượn kèm.</div>
        </div>
        <div class="page-actions">
          <span class="shell-status-pill">Khung giao diện (Shell)</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="list"></i> Danh sách thiết bị Lab</div>
        </div>
        <div class="card-body">
          <div class="shell-banner">
            <i data-lucide="info"></i>
            <div>
              Màn hình Danh mục Thiết bị sẽ hiển thị bảng danh sách, thanh tỷ lệ kho 4 màu, tính năng tìm kiếm, bộ lọc trạng thái và Panel chi tiết trượt bên phải (gợi ý top 3 mượn kèm).
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}
