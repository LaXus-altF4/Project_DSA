/**
 * graph.js - Màn hình 7: Đồ thị mượn kèm (Shell Placeholder)
 */
export async function render(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="network"></i> Đồ Thị Mượn Kèm
          </h1>
          <div class="page-desc">Mạng lưới trực quan hóa mối quan hệ mượn kèm giữa các thiết bị với thuật toán lực kéo đẩy (vis-network).</div>
        </div>
        <div class="page-actions">
          <span class="shell-status-pill">Khung giao diện (Shell)</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="share-2"></i> Không gian biểu diễn đồ thị</div>
        </div>
        <div class="card-body">
          <div class="shell-banner">
            <i data-lucide="info"></i>
            <div>
              Màn hình Đồ thị sử dụng thư viện cục bộ vis-network.min.js để vẽ đỉnh, cạnh với độ dày tỷ lệ thuận với số lần mượn cùng, hỗ trợ tương tác phóng to/thu nhỏ và chọn đỉnh xem top 3 láng giềng.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}
