/**
 * return.js - Màn hình 4: Trả phiếu mượn (Shell Placeholder)
 */
export async function render(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="rotate-ccw"></i> Trả Phiếu Mượn
          </h1>
          <div class="page-desc">Thu hồi thiết bị mượn, kiểm tra ngày quá hạn và hiển thị tiền phạt tạm tính trước khi xác nhận.</div>
        </div>
        <div class="page-actions">
          <span class="shell-status-pill">Khung giao diện (Shell)</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="search"></i> Tra cứu và thu hồi phiếu</div>
        </div>
        <div class="card-body">
          <div class="shell-banner">
            <i data-lucide="info"></i>
            <div>
              Màn hình Trả Phiếu sẽ hỗ trợ tìm kiếm nhanh theo mã phiếu/MSSV, xem trước số ngày trễ và tiền phạt từ API, đồng thời tự động cập nhật chuyển quyền cho hàng đợi.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}
