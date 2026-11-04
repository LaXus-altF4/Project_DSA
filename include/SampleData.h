#ifndef SAMPLE_DATA_H
#define SAMPLE_DATA_H

#include "LabManager.h"

// Sinh dữ liệu mẫu cho demo: 18 thiết bị phòng Lab, 52 phiếu mượn trải trên ~63 ngày giả lập
// (từ 01/09/2026), có các cặp mượn kèm nổi bật, phiếu trễ hạn, phiếu quá hạn đang mở,
// thiết bị bảo trì và một hàng đợi đặt trước (Kính VR) để demo.
// Chỉ gọi API nghiệp vụ công khai của LabManager nên dữ liệu sinh ra luôn thoả bất biến.
class SampleData {
public:
    // Điền vào lab (nên là LabManager mới, còn trống). O(số phiếu · n)
    static void build(LabManager& lab);
};

#endif // SAMPLE_DATA_H
