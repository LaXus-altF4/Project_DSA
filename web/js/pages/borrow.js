/**
 * borrow.js - Màn hình 3: Lập phiếu mượn (Shell Placeholder)
 */
export async function render(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i data-lucide="file-plus-2"></i> Lập Phiếu Mượn
          </h1>
          <div class="page-desc">Tạo phiếu mượn thiết bị nguyên tử cho sinh viên, tự động gợi ý đồ dùng thực hành đi kèm theo giỏ.</div>
        </div>
        <div class="page-actions">
          <span class="shell-status-pill">Khung giao diện (Shell)</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="shopping-cart"></i> Giỏ thiết bị và gợi ý mượn kèm</div>
        </div>
        <div class="card-body">
          <div class="shell-banner">
            <i data-lucide="info"></i>
            <div>
              Màn hình Lập Phiếu Mượn hỗ trợ chọn nhiều món vào giỏ, gợi ý liên tục theo giỏ mượn từ API (suggestForBasket) và xử lý món hết hàng.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();
}
