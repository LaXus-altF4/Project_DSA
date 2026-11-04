/**
 * dashboard.js - Màn hình 1: Tổng quan (Shell Placeholder)
 */
export async function render(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="layout-dashboard"></i> Tổng quan phòng Lab
          </h1>
          <div class="page-desc">Thống kê hoạt động, thiết bị sẵn sàng, người chờ nhận và phiếu quá hạn.</div>
        </div>
        <div class="page-actions">
          <span class="shell-status-pill">Khung giao diện (Shell)</span>
        </div>
      </div>

      <div class="grid-cols-4">
        <div class="metric-card">
          <div class="metric-info">
            <span class="metric-label">Tổng thiết bị</span>
            <span class="metric-value">--</span>
            <span class="metric-sub">Đang chờ nạp dữ liệu</span>
          </div>
          <div class="metric-icon-box metric-icon-primary">
            <i data-lucide="cpu"></i>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <span class="metric-label">Đang mượn</span>
            <span class="metric-value">--</span>
            <span class="metric-sub">Tỷ lệ kho</span>
          </div>
          <div class="metric-icon-box metric-icon-warning">
            <i data-lucide="package-open"></i>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <span class="metric-label">Phiếu quá hạn</span>
            <span class="metric-value">--</span>
            <span class="metric-sub">Cần thu hồi</span>
          </div>
          <div class="metric-icon-box metric-icon-danger">
            <i data-lucide="alert-triangle"></i>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <span class="metric-label">Hàng đợi đặt trước</span>
            <span class="metric-value">--</span>
            <span class="metric-sub">Sinh viên đang chờ</span>
          </div>
          <div class="metric-icon-box metric-icon-success">
            <i data-lucide="clock"></i>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="info"></i> Trạng thái mô-đun</div>
        </div>
        <div class="card-body">
          <div class="shell-banner">
            <i data-lucide="check-circle-2"></i>
            <div>
              <strong>Khung ứng dụng (Scaffolding) đã sẵn sàng.</strong>
              Hệ thống Hash Router, thanh tua đồng hồ giả lập, Dark/Light mode và cơ chế API tập trung đã hoạt động ổn định. Nội dung chi tiết sẽ được hoàn thiện ở các bước tiếp theo.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}
