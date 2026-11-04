/**
 * records.js - Màn hình 6: Quá hạn & Lịch sử (Shell Placeholder)
 */
export async function render(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="clipboard-list"></i> Quá Hạn & Lịch Sử
          </h1>
          <div class="page-desc">Theo dõi các phiếu mượn trễ hạn, tính tiền phạt và tra cứu lịch sử mượn trả toàn hệ thống.</div>
        </div>
        <div class="page-actions">
          <span class="shell-status-pill">Khung giao diện (Shell)</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="history"></i> Bảng phiếu mượn có phân trang</div>
        </div>
        <div class="card-body">
          <div class="shell-banner">
            <i data-lucide="info"></i>
            <div>
              Màn hình Quá hạn & Lịch sử hiển thị bảng danh sách các phiếu mượn phân loại theo tab (Tất cả, Quá hạn, Đang mở, Đã trả) kèm tiền phạt tạm tính hoặc đã chốt.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}
