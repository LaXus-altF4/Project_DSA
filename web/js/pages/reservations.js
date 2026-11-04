/**
 * reservations.js - Màn hình 5: Hàng đợi đặt trước (Shell Placeholder)
 */
export async function render(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="clock-4"></i> Hàng Đợi Đặt Trước
          </h1>
          <div class="page-desc">Hàng đợi FIFO có thời hạn 24 giờ nhận thiết bị, tự động đẩy xuống cuối khi lỡ hẹn.</div>
        </div>
        <div class="page-actions">
          <span class="shell-status-pill">Khung giao diện (Shell)</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="users"></i> Danh sách người chờ & Đếm ngược 24h</div>
        </div>
        <div class="card-body">
          <div class="shell-banner">
            <i data-lucide="info"></i>
            <div>
              Màn hình Hàng Đợi Đặt Trước hiển thị dãy thẻ SV chờ, vòng đếm ngược 24h bằng SVG, nút nhận thiết bị và animation trượt thẻ xuống cuối khi lỡ hạn.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}
