// Unit test cho lõi: giai đoạn 1 (DoublyLinkedList, LinkedQueue, Graph), 2 (mượn/trả), 3 (Reservation Queue).
// Không dùng framework: macro CHECK ghi lại lỗi và chạy tiếp; cuối chương trình trả mã thoát != 0 nếu có lỗi.
// File test được dùng iostream (lõi thì không).
#include <initializer_list>
#include <iostream>
#include <string>
#include <utility>

#ifdef _WIN32
#include <windows.h>
#endif

#include "DoublyLinkedList.h"
#include "Graph.h"
#include "LabManager.h"
#include "LinkedQueue.h"

static int g_checks = 0;
static int g_failures = 0;

#define CHECK(cond)                                                                  \
    do {                                                                             \
        ++g_checks;                                                                  \
        if (!(cond)) {                                                               \
            ++g_failures;                                                            \
            std::cout << "  [FAIL] " << __FILE__ << ":" << __LINE__ << "  " #cond "\n"; \
        }                                                                            \
    } while (0)

// Kiểu dữ liệu đếm số đối tượng còn sống — thay cho AddressSanitizer (MinGW không hỗ trợ)
// để phát hiện rò rỉ bộ nhớ hoặc huỷ hai lần.
struct Tracked {
    static int alive;
    int value;
    Tracked(int v = 0) : value(v) { ++alive; }
    Tracked(const Tracked& o) : value(o.value) { ++alive; }
    Tracked& operator=(const Tracked& o) { value = o.value; return *this; }
    ~Tracked() { --alive; }
};
int Tracked::alive = 0;

// Chuyển danh sách int thành chuỗi "1,2,3" để so sánh gọn.
template <class Container>
static std::string join(const Container& c) {
    std::string s;
    c.forEach([&s](const int& x) {
        if (!s.empty()) s += ",";
        s += std::to_string(x);
    });
    return s;
}

static std::string joinNeighbors(const DoublyLinkedList<Neighbor>& list) {
    std::string s;
    for (const Neighbor& n : list) {
        if (!s.empty()) s += ",";
        s += n.deviceId + ":" + std::to_string(n.weight);
    }
    return s;
}

static DoublyLinkedList<std::string> ids(std::initializer_list<const char*> items) {
    DoublyLinkedList<std::string> list;
    for (const char* s : items) list.pushBack(s);
    return list;
}

// ============================ DoublyLinkedList ============================

static void testListBasics() {
    std::cout << "DoublyLinkedList: thao tác hai đầu\n";
    DoublyLinkedList<int> list;
    CHECK(list.empty() && list.size() == 0);
    CHECK(!list.popFront() && !list.popBack());
    CHECK(list.front() == nullptr && list.back() == nullptr);
    CHECK(list.checkIntegrity());

    list.pushBack(2);
    CHECK(list.size() == 1 && *list.front() == 2 && *list.back() == 2);
    CHECK(list.checkIntegrity());
    CHECK(list.popBack());
    CHECK(list.empty() && list.checkIntegrity());

    list.pushBack(2);
    list.pushBack(3);
    list.pushFront(1);
    CHECK(join(list) == "1,2,3");
    CHECK(list.checkIntegrity());
    CHECK(list.popFront() && join(list) == "2,3");
    CHECK(list.popBack() && join(list) == "2");
    CHECK(list.popFront() && list.empty());
    CHECK(list.checkIntegrity());
}

static void testListRemove() {
    std::cout << "DoublyLinkedList: tìm và xoá\n";
    DoublyLinkedList<int> list;
    for (int i = 1; i <= 6; ++i) list.pushBack(i);

    int* found = list.findFirst([](int x) { return x > 3; });
    CHECK(found != nullptr && *found == 4);
    CHECK(list.findFirst([](int x) { return x > 100; }) == nullptr);

    CHECK(list.removeFirst([](int x) { return x == 1; }));   // đầu
    CHECK(list.removeFirst([](int x) { return x == 4; }));   // giữa
    CHECK(list.removeFirst([](int x) { return x == 6; }));   // cuối
    CHECK(!list.removeFirst([](int x) { return x == 99; })); // không có
    CHECK(join(list) == "2,3,5");
    CHECK(*list.front() == 2 && *list.back() == 5);
    CHECK(list.checkIntegrity());

    for (int i = 6; i <= 9; ++i) list.pushBack(i); // 2,3,5,6,7,8,9
    CHECK(list.removeIf([](int x) { return x % 2 == 1; }) == 4);
    CHECK(join(list) == "2,6,8");
    CHECK(list.checkIntegrity());
    CHECK(list.removeIf([](int) { return true; }) == 3);
    CHECK(list.empty() && list.checkIntegrity());
}

static void testListEraseAndIterator() {
    std::cout << "DoublyLinkedList: iterator và erase\n";
    DoublyLinkedList<int> list;
    for (int i = 1; i <= 5; ++i) list.pushBack(i);

    int sum = 0;
    for (int x : list) sum += x;
    CHECK(sum == 15);

    for (int& x : list) x *= 10; // sửa qua iterator
    CHECK(join(list) == "10,20,30,40,50");

    // Xoá các phần tử 20 và 40 trong khi duyệt.
    for (auto it = list.begin(); it != list.end();) {
        if (*it == 20 || *it == 40) it = list.erase(it);
        else ++it;
    }
    CHECK(join(list) == "10,30,50");
    CHECK(list.checkIntegrity());

    auto it = list.erase(list.begin()); // xoá đầu
    CHECK(it != list.end() && *it == 30);
    ++it;
    it = list.erase(it); // xoá cuối
    CHECK(it == list.end());
    CHECK(join(list) == "30" && *list.front() == 30 && *list.back() == 30);
    CHECK(list.erase(list.end()) == list.end()); // xoá end() không làm gì
    CHECK(list.checkIntegrity());
}

static void testListInsertSorted() {
    std::cout << "DoublyLinkedList: insertSorted\n";
    struct Item { int key; int order; };
    DoublyLinkedList<Item> list;
    auto less = [](const Item& a, const Item& b) { return a.key < b.key; };
    list.insertSorted({5, 0}, less);
    list.insertSorted({1, 1}, less); // vào đầu
    list.insertSorted({9, 2}, less); // vào cuối
    list.insertSorted({5, 3}, less); // bằng nhau: đứng sau phần tử 5 cũ (ổn định)
    list.insertSorted({3, 4}, less); // vào giữa

    std::string keys, orders;
    for (const Item& it : list) {
        keys += std::to_string(it.key);
        orders += std::to_string(it.order);
    }
    CHECK(keys == "13559");
    CHECK(orders == "14032");
    CHECK(list.checkIntegrity());
}

static void testListCopyMove() {
    std::cout << "DoublyLinkedList: sao chép và di chuyển\n";
    DoublyLinkedList<int> a;
    for (int i = 1; i <= 3; ++i) a.pushBack(i);

    DoublyLinkedList<int> b(a); // copy ctor
    b.pushBack(4);
    *b.front() = 100;
    CHECK(join(a) == "1,2,3"); // bản gốc không bị ảnh hưởng (sao chép sâu)
    CHECK(join(b) == "100,2,3,4");

    DoublyLinkedList<int> c;
    c.pushBack(7);
    c = a; // copy assign
    CHECK(join(c) == "1,2,3");
    c = c; // tự gán
    CHECK(join(c) == "1,2,3" && c.checkIntegrity());

    DoublyLinkedList<int> d(std::move(b)); // move ctor
    CHECK(join(d) == "100,2,3,4");
    CHECK(b.empty() && b.checkIntegrity());

    DoublyLinkedList<int> e;
    e = std::move(d); // move assign
    CHECK(join(e) == "100,2,3,4" && d.empty());
    CHECK(a.checkIntegrity() && c.checkIntegrity() && e.checkIntegrity());
}

static void testListNoLeak() {
    std::cout << "DoublyLinkedList: không rò rỉ bộ nhớ\n";
    {
        DoublyLinkedList<Tracked> list;
        for (int i = 0; i < 10; ++i) list.pushBack(Tracked(i));
        CHECK(Tracked::alive == 10);
        list.popFront();
        list.popBack();
        list.removeIf([](const Tracked& t) { return t.value % 2 == 0; });
        CHECK(Tracked::alive == list.size());

        DoublyLinkedList<Tracked> copy(list);
        DoublyLinkedList<Tracked> moved(std::move(copy));
        DoublyLinkedList<Tracked> assigned;
        assigned.pushBack(Tracked(42));
        assigned = list;
        CHECK(Tracked::alive == 3 * list.size());
        list.clear();
        CHECK(Tracked::alive == 2 * moved.size());
    }
    CHECK(Tracked::alive == 0);
}

// ============================ LinkedQueue ============================

static void testQueueFifo() {
    std::cout << "LinkedQueue: FIFO\n";
    LinkedQueue<int> q;
    CHECK(q.empty() && q.front() == nullptr && !q.dequeue());
    CHECK(q.checkIntegrity());

    for (int i = 1; i <= 4; ++i) q.enqueue(i);
    CHECK(q.size() == 4 && *q.front() == 1);
    int out = 0;
    CHECK(q.dequeue(&out) && out == 1);
    CHECK(q.dequeue(&out) && out == 2);
    CHECK(join(q) == "3,4");
    CHECK(q.dequeue() && q.dequeue() && q.empty());
    CHECK(q.checkIntegrity());

    // Làm rỗng rồi thêm lại: tail_ phải được đặt lại đúng.
    q.enqueue(5);
    q.enqueue(6);
    CHECK(join(q) == "5,6" && q.checkIntegrity());
}

static void testQueueMoveFrontToBack() {
    std::cout << "LinkedQueue: moveFrontToBack (đẩy xuống cuối hàng)\n";
    LinkedQueue<int> q;
    q.moveFrontToBack(); // rỗng: không làm gì
    CHECK(q.empty() && q.checkIntegrity());

    q.enqueue(1);
    q.moveFrontToBack(); // 1 phần tử: không đổi
    CHECK(join(q) == "1" && q.checkIntegrity());

    q.enqueue(2);
    q.moveFrontToBack();
    CHECK(join(q) == "2,1" && q.checkIntegrity());

    q.enqueue(3);
    q.enqueue(4); // 2,1,3,4
    q.moveFrontToBack();
    CHECK(join(q) == "1,3,4,2");
    q.enqueue(5); // thêm sau khi đẩy: phải nằm sau phần tử vừa đẩy
    CHECK(join(q) == "1,3,4,2,5");
    CHECK(q.size() == 5 && q.checkIntegrity());
}

static void testQueueRemoveFirst() {
    std::cout << "LinkedQueue: removeFirst / findFirst\n";
    LinkedQueue<int> q;
    for (int i = 1; i <= 5; ++i) q.enqueue(i);

    int* found = q.findFirst([](int x) { return x == 3; });
    CHECK(found != nullptr && *found == 3);
    CHECK(q.findFirst([](int x) { return x == 9; }) == nullptr);

    CHECK(q.removeFirst([](int x) { return x == 3; })); // giữa
    CHECK(q.removeFirst([](int x) { return x == 1; })); // đầu
    CHECK(q.removeFirst([](int x) { return x == 5; })); // cuối → tail_ phải lùi về 4
    CHECK(!q.removeFirst([](int x) { return x == 9; }));
    CHECK(join(q) == "2,4" && q.checkIntegrity());

    q.enqueue(6); // kiểm tra tail_ sau khi xoá nút cuối
    CHECK(join(q) == "2,4,6" && q.checkIntegrity());

    CHECK(q.removeFirst([](int) { return true; }));
    CHECK(q.removeFirst([](int) { return true; }));
    CHECK(q.removeFirst([](int) { return true; }));
    CHECK(q.empty() && q.checkIntegrity());
    q.enqueue(7);
    CHECK(join(q) == "7" && q.checkIntegrity());
}

static void testQueueCopyMoveAndLeak() {
    std::cout << "LinkedQueue: sao chép, di chuyển, không rò rỉ\n";
    {
        LinkedQueue<int> a;
        for (int i = 1; i <= 3; ++i) a.enqueue(i);
        LinkedQueue<int> b(a);
        b.enqueue(4);
        CHECK(join(a) == "1,2,3" && join(b) == "1,2,3,4");
        a = a;
        CHECK(join(a) == "1,2,3" && a.checkIntegrity());
        LinkedQueue<int> c(std::move(b));
        CHECK(b.empty() && b.checkIntegrity() && join(c) == "1,2,3,4");
        c = a;
        CHECK(join(c) == "1,2,3" && c.checkIntegrity());
    }
    {
        LinkedQueue<Tracked> q;
        for (int i = 0; i < 5; ++i) q.enqueue(Tracked(i));
        q.moveFrontToBack();
        Tracked t;
        q.dequeue(&t);
        CHECK(t.value == 1);
        q.removeFirst([](const Tracked& x) { return x.value == 3; });
        LinkedQueue<Tracked> copy(q);
        CHECK(Tracked::alive == 1 + 2 * q.size());
    }
    CHECK(Tracked::alive == 0);
}

// ============================ Graph ============================

static void testGraphVertices() {
    std::cout << "Graph: đỉnh\n";
    Graph g;
    CHECK(g.addVertex("A"));
    CHECK(!g.addVertex("A")); // trùng
    CHECK(!g.addVertex(""));  // rỗng
    CHECK(g.addVertex("B"));
    CHECK(g.hasVertex("A") && !g.hasVertex("Z"));
    CHECK(g.vertexCount() == 2 && g.edgeCount() == 0);
    CHECK(g.checkIntegrity());
}

static void testGraphEdges() {
    std::cout << "Graph: cạnh và addCoBorrow\n";
    Graph g;
    for (const char* v : {"A", "B", "C", "D"}) g.addVertex(v);

    CHECK(!g.addEdgeWeight("A", "A"));    // không cho khuyên
    CHECK(!g.addEdgeWeight("A", "Z"));    // đỉnh không tồn tại
    CHECK(!g.addEdgeWeight("A", "B", 0)); // delta phải > 0
    CHECK(g.edgeCount() == 0);

    g.addCoBorrow(ids({"A", "B", "C"})); // 3 cặp: AB, AC, BC
    CHECK(g.edgeCount() == 3);
    CHECK(g.weight("A", "B") == 1 && g.weight("B", "A") == 1);
    CHECK(g.weight("A", "C") == 1 && g.weight("B", "C") == 1);
    CHECK(g.weight("A", "D") == 0);

    g.addCoBorrow(ids({"A", "B", "C"}));
    CHECK(g.weight("A", "B") == 2 && g.weight("C", "B") == 2 && g.edgeCount() == 3);

    g.addCoBorrow(ids({"D"}));               // phiếu 1 món: không có cạnh
    g.addCoBorrow(ids({}));                  // phiếu rỗng
    g.addCoBorrow(ids({"A", "X", "D"}));     // X đã xoá/không tồn tại: chỉ cộng AD
    g.addCoBorrow(ids({"B", "B"}));          // trùng mã: bỏ qua
    CHECK(g.edgeCount() == 4 && g.weight("A", "D") == 1 && g.weight("B", "B") == 0);
    CHECK(g.checkIntegrity());

    int edges = 0, total = 0;
    bool ordered = true;
    g.forEachEdge([&](const std::string& a, const std::string& b, int w) {
        ++edges;
        total += w;
        if (!(a < b)) ordered = false;
    });
    CHECK(edges == 4 && total == 2 + 2 + 2 + 1 && ordered); // mỗi cạnh đúng 1 lần

    int vertices = 0;
    g.forEachVertex([&](const std::string&) { ++vertices; });
    CHECK(vertices == 4);

    int degreeA = 0;
    g.forEachNeighbor("A", [&](const std::string&, int) { ++degreeA; });
    CHECK(degreeA == 3);
}

static void testGraphTopNeighbors() {
    std::cout << "Graph: topNeighbors (gợi ý top 3)\n";
    Graph g;
    for (const char* v : {"VR", "CTL", "CAM", "MIC", "TRI", "LAP", "ISO"}) g.addVertex(v);

    // Kịch bản đề bài: Kính VR thường mượn kèm Tay cầm (CTL).
    for (int i = 0; i < 5; ++i) g.addCoBorrow(ids({"VR", "CTL"}));
    for (int i = 0; i < 3; ++i) g.addCoBorrow(ids({"VR", "LAP"}));
    for (int i = 0; i < 2; ++i) g.addCoBorrow(ids({"VR", "MIC"}));
    for (int i = 0; i < 2; ++i) g.addCoBorrow(ids({"VR", "CAM"})); // hoà với MIC
    g.addCoBorrow(ids({"VR", "TRI"}));

    // 5 láng giềng → lấy đúng 3; hoà 2-2 thì CAM < MIC theo mã, nên MIC bị loại.
    CHECK(joinNeighbors(g.topNeighbors("VR", 3)) == "CTL:5,LAP:3,CAM:2");
    CHECK(joinNeighbors(g.topNeighbors("VR")) == "CTL:5,LAP:3,CAM:2"); // k mặc định = 3
    CHECK(joinNeighbors(g.topNeighbors("VR", 10)) == "CTL:5,LAP:3,CAM:2,MIC:2,TRI:1");
    CHECK(joinNeighbors(g.topNeighbors("CTL", 3)) == "VR:5");  // ít hơn 3 láng giềng
    CHECK(g.topNeighbors("ISO", 3).empty());                  // đỉnh cô lập
    CHECK(g.topNeighbors("NONE", 3).empty());                 // đỉnh không tồn tại
    CHECK(g.topNeighbors("VR", 0).empty());

    // Tất cả bằng nhau: sắp theo mã tăng dần.
    Graph h;
    for (const char* v : {"X", "D", "B", "C", "A"}) h.addVertex(v);
    h.addCoBorrow(ids({"X", "D", "B", "C", "A"}));
    CHECK(joinNeighbors(h.topNeighbors("X", 3)) == "A:1,B:1,C:1");
    CHECK(g.checkIntegrity() && h.checkIntegrity());
}

static void testGraphRemoveVertex() {
    std::cout << "Graph: removeVertex\n";
    Graph g;
    for (const char* v : {"A", "B", "C", "D"}) g.addVertex(v);
    g.addCoBorrow(ids({"A", "B", "C"}));
    g.addCoBorrow(ids({"A", "D"}));
    g.addCoBorrow(ids({"C", "D"}));
    CHECK(g.edgeCount() == 5);

    CHECK(g.removeVertex("A"));
    CHECK(!g.removeVertex("A"));
    CHECK(!g.hasVertex("A") && g.vertexCount() == 3);
    CHECK(g.edgeCount() == 2); // còn BC, CD
    CHECK(g.weight("B", "A") == 0 && g.weight("D", "A") == 0); // cạnh ngược đã bị gỡ
    CHECK(joinNeighbors(g.topNeighbors("C", 3)) == "B:1,D:1");
    CHECK(g.checkIntegrity());

    g.addCoBorrow(ids({"A", "B"})); // A đã xoá: bỏ qua (quy ước M4)
    CHECK(g.edgeCount() == 2);

    Graph copy(g); // sao chép đồ thị (sao chép sâu các DSLK)
    copy.addCoBorrow(ids({"B", "D"}));
    CHECK(g.weight("B", "D") == 0 && copy.weight("B", "D") == 1);

    g.clear();
    CHECK(g.vertexCount() == 0 && g.edgeCount() == 0 && g.checkIntegrity());
}

// ============================ LabManager (giai đoạn 2) ============================

// Tạo LabManager có sẵn: A (3 cái), B (1 cái), C (2 cái).
static LabManager makeLab() {
    LabManager lab;
    lab.addDevice("A", "Kinh VR", 3);
    lab.addDevice("B", "Tay cam", 1);
    lab.addDevice("C", "Camera", 2);
    return lab;
}

static void testClock() {
    std::cout << "Clock: tua và định dạng\n";
    Clock c;
    CHECK(c.now() == 0);
    CHECK(!c.advance(0) && !c.advance(-5) && c.now() == 0);
    CHECK(c.advance(25) && c.now() == 25);
    CHECK(!c.setNow(-1) && c.setNow(100) && c.now() == 100);
    CHECK(Clock::formatHour(0) == "01/01/2026 00:00");
    CHECK(Clock::formatHour(25) == "02/01/2026 01:00");
    CHECK(Clock::formatHour(31 * 24) == "01/02/2026 00:00");
    CHECK(Clock::formatHour(365 * 24) == "01/01/2027 00:00");
    CHECK(Clock::formatHour((365 + 31 + 28) * 24) == "01/03/2027 00:00");
    CHECK(Clock::formatHour((365 + 365 + 31 + 28) * 24) == "29/02/2028 00:00");
}

static void testDeviceCatalog() {
    std::cout << "LabManager: danh mục thiết bị\n";
    LabManager lab;
    CHECK(lab.addDevice("B", "Tay cam", 2).ok());
    CHECK(lab.addDevice("A", "Kinh VR", 1).ok());
    CHECK(lab.addDevice("C", "Camera", 5).ok());
    CHECK(lab.addDevice("A", "Trung", 1).code == ErrorCode::DuplicateDevice);
    CHECK(lab.addDevice("", "x", 1).code == ErrorCode::InvalidInput);
    CHECK(lab.addDevice("D", "", 1).code == ErrorCode::InvalidInput);
    CHECK(lab.addDevice("D,1", "x", 1).code == ErrorCode::InvalidInput); // M5
    CHECK(lab.addDevice("D", "a|b", 1).code == ErrorCode::InvalidInput);
    CHECK(lab.addDevice("D", "a\nb", 1).code == ErrorCode::InvalidInput);
    CHECK(lab.addDevice("D", "x", 0).code == ErrorCode::InvalidInput);
    CHECK(lab.deviceCount() == 3);

    std::string order;
    lab.forEachDevice([&order](const Device& d) { order += d.id; });
    CHECK(order == "ABC"); // luôn theo mã tăng dần

    const Device* a = lab.findDevice("A");
    CHECK(a != nullptr && a->available == 1 && a->status() == DeviceStatus::Available);
    CHECK(lab.findDevice("Z") == nullptr);
    CHECK(lab.checkInvariants());
}

static void testMaintenance() {
    std::cout << "LabManager: bảo trì theo số đơn vị (M1, M2)\n";
    LabManager lab = makeLab();
    CHECK(lab.sendToMaintenance("Z", 1).code == ErrorCode::DeviceNotFound);
    CHECK(lab.sendToMaintenance("A", 0).code == ErrorCode::InvalidInput);
    CHECK(lab.sendToMaintenance("A", 4).code == ErrorCode::OutOfStock); // chỉ lấy từ available
    CHECK(lab.sendToMaintenance("A", 2).ok());
    CHECK(lab.findDevice("A")->available == 1 && lab.findDevice("A")->maintenance == 2);
    CHECK(lab.findDevice("A")->status() == DeviceStatus::Available);
    CHECK(lab.sendToMaintenance("A", 1).ok());
    CHECK(lab.findDevice("A")->status() == DeviceStatus::Maintenance); // maintenance == total

    DoublyLinkedList<std::string> want = ids({"A"});
    BorrowResult r = lab.borrowDevices("25300003", "Khai", want, 7);
    CHECK(r.code == ErrorCode::OutOfStock && r.message.find("bảo trì") != std::string::npos);

    CHECK(lab.finishMaintenance("A", 5).code == ErrorCode::InvalidInput);
    CHECK(lab.finishMaintenance("A", 3).ok());
    CHECK(lab.findDevice("A")->available == 3);
    CHECK(lab.checkInvariants());
}

static void testBorrowOutOfStock() {
    std::cout << "LabManager: mượn hết hàng\n";
    LabManager lab = makeLab();

    // B chỉ có 1 cái.
    BorrowResult first = lab.borrowDevices("S1", "An", ids({"B"}), 7);
    CHECK(first.ok() && first.recordId == "PM0001");
    CHECK(lab.findDevice("B")->available == 0 && lab.findDevice("B")->borrowed == 1);
    CHECK(lab.findDevice("B")->status() == DeviceStatus::Borrowed);

    BorrowResult second = lab.borrowDevices("S2", "Binh", ids({"B"}), 7);
    CHECK(second.code == ErrorCode::OutOfStock && !second.ok());
    CHECK(second.message.find("B") != std::string::npos);
    CHECK(lab.recordCount() == 1);
    CHECK(lab.findDevice("B")->borrowed == 1);

    // Phiếu 2 món, B hết: thất bại cả phiếu, A không bị trừ (M6).
    BorrowResult atomic = lab.borrowDevices("S2", "Binh", ids({"A", "B"}), 7);
    CHECK(atomic.code == ErrorCode::OutOfStock);
    CHECK(atomic.message.find("B") != std::string::npos && atomic.message.find("A") == std::string::npos);
    CHECK(lab.findDevice("A")->available == 3 && lab.findDevice("A")->borrowed == 0);
    CHECK(lab.findDevice("A")->timesBorrowed == 0);
    CHECK(lab.recordCount() == 1);

    // Nhiều món hết: thông điệp liệt kê đủ.
    lab.borrowDevices("S3", "Chi", ids({"C"}), 3);
    lab.borrowDevices("S4", "Dung", ids({"C"}), 3);
    BorrowResult many = lab.borrowDevices("S5", "Em", ids({"A", "B", "C"}), 3);
    CHECK(many.code == ErrorCode::OutOfStock);
    CHECK(many.message.find("B") != std::string::npos && many.message.find("C") != std::string::npos);
    CHECK(lab.checkInvariants());
}

static void testBorrowValidation() {
    std::cout << "LabManager: kiểm tra đầu vào khi mượn\n";
    LabManager lab = makeLab();
    CHECK(lab.borrowDevices("S1", "An", ids({"Z"}), 7).code == ErrorCode::DeviceNotFound);
    CHECK(lab.borrowDevices("S1", "An", ids({"A", "A"}), 7).code == ErrorCode::DuplicateDevice); // M7
    CHECK(lab.borrowDevices("S1", "An", ids({}), 7).code == ErrorCode::InvalidInput);
    CHECK(lab.borrowDevices("S1", "An", ids({"A"}), 0).code == ErrorCode::InvalidInput); // M9
    CHECK(lab.borrowDevices("S1", "An", ids({"A"}), 31).code == ErrorCode::InvalidInput);
    CHECK(lab.borrowDevices("", "An", ids({"A"}), 7).code == ErrorCode::InvalidInput);
    CHECK(lab.borrowDevices("S1", "A,n", ids({"A"}), 7).code == ErrorCode::InvalidInput);
    CHECK(lab.recordCount() == 0 && lab.findDevice("A")->available == 3);

    CHECK(lab.borrowDevices("S1", "An", ids({"A"}), 1).ok());   // biên 1 ngày
    CHECK(lab.borrowDevices("S1", "An", ids({"A"}), 30).ok());  // biên 30 ngày; cùng SV mượn nhiều phiếu (M9)
    CHECK(lab.recordCount() == 2);
    const BorrowRecord* r = lab.findRecord("PM0002");
    CHECK(r != nullptr && r->dueHour == 30 * 24 && r->isOpen());
    CHECK(lab.checkInvariants());
}

static void testReturnBasics() {
    std::cout << "LabManager: trả đúng hạn, trả sai mã, trả 2 lần\n";
    LabManager lab = makeLab();
    BorrowResult b = lab.borrowDevices("S1", "An", ids({"A", "C"}), 7);
    CHECK(b.ok());

    // Trả sai mã.
    ReturnResult wrong = lab.returnRecord("PM9999");
    CHECK(wrong.code == ErrorCode::RecordNotFound);
    CHECK(lab.findDevice("A")->borrowed == 1 && lab.findDevice("C")->borrowed == 1);
    CHECK(lab.findRecord(b.recordId)->isOpen());

    // Trả đúng hạn: không phạt.
    lab.advanceTime(3 * 24);
    ReturnResult ok = lab.returnRecord(b.recordId);
    CHECK(ok.ok() && ok.lateDays == 0 && ok.fine == 0);
    CHECK(lab.findDevice("A")->available == 3 && lab.findDevice("A")->borrowed == 0);
    CHECK(lab.findDevice("C")->available == 2);
    const BorrowRecord* rec = lab.findRecord(b.recordId);
    CHECK(rec != nullptr && !rec->isOpen() && rec->returnHour == 3 * 24);

    // Trả lần 2: lỗi, số liệu không đổi.
    lab.advanceTime(24 * 30);
    ReturnResult again = lab.returnRecord(b.recordId);
    CHECK(again.code == ErrorCode::AlreadyReturned);
    CHECK(lab.findDevice("A")->available == 3 && lab.findDevice("A")->borrowed == 0);
    CHECK(lab.findRecord(b.recordId)->returnHour == 3 * 24 && lab.findRecord(b.recordId)->fine == 0);
    CHECK(lab.findDevice("A")->timesBorrowed == 1);
    CHECK(lab.checkInvariants());
}

static void testOverdue() {
    std::cout << "LabManager: quá hạn đúng số ngày và tiền phạt\n";
    // Hàm thuần: due = 100h.
    CHECK(LabManager::overdueDays(100, 50) == 0);
    CHECK(LabManager::overdueDays(100, 100) == 0);
    CHECK(LabManager::overdueDays(100, 101) == 1);       // trễ 1 giờ → 1 ngày
    CHECK(LabManager::overdueDays(100, 124) == 1);       // đúng 24h → 1 ngày
    CHECK(LabManager::overdueDays(100, 125) == 2);       // 25h → 2 ngày
    CHECK(LabManager::overdueDays(100, 172) == 3);       // 72h → 3 ngày
    CHECK(LabManager::calcFine(3, 2) == 216000LL);
    CHECK(LabManager::calcFine(0, 5) == 0);
    CHECK(LabManager::calcFine(1, 1) == 36000LL);

    // Kịch bản đề: phiếu 2 thiết bị, mượn 7 ngày, trả khi trễ 2 ngày 1 giờ → 3 ngày × 2 × 36.000.
    LabManager lab = makeLab();
    BorrowResult b = lab.borrowDevices("S1", "An", ids({"A", "C"}), 7);
    CHECK(b.ok() && b.dueHour == 7 * 24);

    lab.advanceTime(7 * 24);
    OverdueInfo p0 = lab.previewOverdue(*lab.findRecord(b.recordId));
    CHECK(p0.lateDays == 0 && p0.fine == 0); // đúng hạn chót chưa phạt

    lab.advanceTime(2 * 24 + 1);
    OverdueInfo preview = lab.previewOverdue(*lab.findRecord(b.recordId)); // M19
    CHECK(preview.lateDays == 3 && preview.fine == 216000LL);

    ReturnResult r = lab.returnRecord(b.recordId);
    CHECK(r.ok() && r.lateDays == 3 && r.fine == 216000LL);
    CHECK(lab.findRecord(b.recordId)->lateDays == 3 && lab.findRecord(b.recordId)->fine == 216000LL);

    // Phiếu đã trả: preview giữ giá trị chốt, không đổi theo đồng hồ.
    lab.advanceTime(24 * 10);
    OverdueInfo frozen = lab.previewOverdue(*lab.findRecord(b.recordId));
    CHECK(frozen.lateDays == 3 && frozen.fine == 216000LL);

    // Phiếu 1 thiết bị trễ đúng 24h → 1 ngày × 36.000.
    BorrowResult b2 = lab.borrowDevices("S2", "Binh", ids({"B"}), 1);
    lab.advanceTime(24 + 24);
    ReturnResult r2 = lab.returnRecord(b2.recordId);
    CHECK(r2.lateDays == 1 && r2.fine == 36000LL);

    CHECK(!lab.advanceTime(0) && !lab.advanceTime(-3));
    CHECK(lab.checkInvariants());
}

// ============================ Reservation Queue (giai đoạn 3) ============================

// Thứ tự hàng đợi của thiết bị, VD "S2,S3,S1".
static std::string queueOrder(const LabManager& lab, const std::string& deviceId) {
    std::string s;
    lab.forEachReservation(deviceId, [&s](const Reservation& r) {
        if (!s.empty()) s += ",";
        s += r.studentId;
    });
    return s;
}

// Lấy hết thông báo ra, VD "H:S2,M:S2,R:S2" (H = được giữ, M = lỡ hạn bị đẩy cuối, R = bị loại).
static std::string drainNotifications(LabManager& lab) {
    std::string s;
    Notification n;
    while (lab.popNotification(&n)) {
        if (!s.empty()) s += ",";
        s += (n.type == NotificationType::HoldGranted ? "H:" : n.type == NotificationType::Missed ? "M:" : "R:");
        s += n.studentId;
    }
    return s;
}

static const Reservation* findReservation(const LabManager& lab, const std::string& deviceId, const std::string& sid) {
    static Reservation copy; // forEachReservation chỉ đọc; chép ra để trả con trỏ ổn định
    bool found = false;
    lab.forEachReservation(deviceId, [&](const Reservation& r) {
        if (r.studentId == sid) { copy = r; found = true; }
    });
    return found ? &copy : nullptr;
}

// Thiết bị B (1 cái) do S1 mượn lúc 0h, hàng đợi lần lượt S2, S3, S4 (nếu waiters > 0).
static LabManager makeBusyLab(int waiters) {
    LabManager lab;
    lab.addDevice("B", "Tay cam", 1);
    lab.borrowDevices("S1", "An", ids({"B"}), 7);
    const char* sids[] = {"S2", "S3", "S4"};
    for (int i = 0; i < waiters; ++i) lab.reserveDevice(sids[i], std::string("SV") + sids[i], "B");
    return lab;
}

static void testReservationScenario() {
    std::cout << "Reservation: 3 người chờ, trả, tua 25h\n";
    LabManager lab = makeBusyLab(3);
    CHECK(queueOrder(lab, "B") == "S2,S3,S4");
    CHECK(lab.findDevice("B")->available == 0 && lab.findDevice("B")->onHold == 0);
    CHECK(lab.checkInvariants());

    CHECK(lab.returnRecord("PM0001").ok());
    const Device* b = lab.findDevice("B");
    CHECK(b->available == 0 && b->onHold == 1 && b->borrowed == 0);
    CHECK(b->available + b->borrowed + b->onHold + b->maintenance == b->total);
    const Reservation* y = findReservation(lab, "B", "S2");
    CHECK(y != nullptr && y->isHolding() && y->holdUntil == 24);
    CHECK(drainNotifications(lab) == "H:S2");
    CHECK(queueOrder(lab, "B") == "S2,S3,S4");
    CHECK(b->status() == DeviceStatus::Borrowed); // onHold không phải trạng thái (M1)

    CHECK(lab.advanceTime(25));
    CHECK(queueOrder(lab, "B") == "S3,S4,S2");
    CHECK(findReservation(lab, "B", "S2")->missCount == 1 && !findReservation(lab, "B", "S2")->isHolding());
    const Reservation* z = findReservation(lab, "B", "S3");
    CHECK(z->isHolding() && z->holdUntil == 24 + 24); // tính từ hạn cũ của S2 (M15)
    CHECK(!findReservation(lab, "B", "S4")->isHolding());
    CHECK(drainNotifications(lab) == "M:S2,H:S3");
    CHECK(b->onHold == 1 && b->available == 0);
    CHECK(b->available + b->borrowed + b->onHold + b->maintenance == b->total);
    CHECK(lab.checkInvariants());
}

static void testReservationSingleWaiter() {
    std::cout << "Reservation: hàng chỉ còn một người, lỡ hạn 2 lần bị loại (M14)\n";
    LabManager lab = makeBusyLab(1);
    lab.returnRecord("PM0001");
    drainNotifications(lab);
    CHECK(lab.advanceTime(25)); // lỡ lần 1: vẫn được giữ lại 24h mới
    const Reservation* r = findReservation(lab, "B", "S2");
    CHECK(r != nullptr && r->missCount == 1 && r->isHolding() && r->holdUntil == 48);
    CHECK(drainNotifications(lab) == "M:S2,H:S2");
    CHECK(lab.findDevice("B")->onHold == 1 && lab.findDevice("B")->available == 0);
    CHECK(lab.checkInvariants());

    CHECK(lab.advanceTime(24)); // now = 49: lỡ lần 2 → loại, đơn vị về available
    CHECK(queueOrder(lab, "B").empty());
    CHECK(drainNotifications(lab) == "R:S2");
    CHECK(lab.findDevice("B")->onHold == 0 && lab.findDevice("B")->available == 1);
    CHECK(lab.findDevice("B")->status() == DeviceStatus::Available);
    CHECK(lab.checkInvariants());
}

static void testReservationChainExpiry() {
    std::cout << "Reservation: hết hạn dây chuyền khi tua 100h (M15)\n";
    LabManager lab = makeBusyLab(3);
    lab.returnRecord("PM0001");
    CHECK(lab.advanceTime(100));
    // S2 (24) → S3 (48) → S4 (72) → S2 lần 2 (96, bị loại) → S3 giữ đến 120.
    CHECK(drainNotifications(lab) == "H:S2,M:S2,H:S3,M:S3,H:S4,M:S4,H:S2,R:S2,H:S3");
    CHECK(queueOrder(lab, "B") == "S3,S4");
    const Reservation* s3 = findReservation(lab, "B", "S3");
    CHECK(s3->isHolding() && s3->holdUntil == 120 && s3->missCount == 1);
    CHECK(!findReservation(lab, "B", "S4")->isHolding());
    CHECK(lab.findDevice("B")->onHold == 1 && lab.findDevice("B")->available == 0);
    CHECK(lab.checkInvariants());
}

static void testClaimAndCancel() {
    std::cout << "Reservation: nhận thiết bị và huỷ đăng ký (M13, M16)\n";
    LabManager lab = makeBusyLab(2);
    lab.returnRecord("PM0001"); // S2 đang giữ, S3 chờ

    CHECK(lab.claimReservation("S3", "B", 7).code == ErrorCode::NotHolding);
    CHECK(lab.claimReservation("S9", "B", 7).code == ErrorCode::NotInQueue);
    CHECK(lab.claimReservation("S2", "Z", 7).code == ErrorCode::DeviceNotFound);
    CHECK(lab.claimReservation("S2", "B", 0).code == ErrorCode::InvalidInput);
    CHECK(lab.claimReservation("S2", "B", 31).code == ErrorCode::InvalidInput);
    CHECK(lab.findDevice("B")->onHold == 1 && queueOrder(lab, "B") == "S2,S3");

    BorrowResult c = lab.claimReservation("S2", "B", 5);
    CHECK(c.ok() && c.recordId == "PM0002" && c.dueHour == 5 * 24);
    const BorrowRecord* rec = lab.findRecord("PM0002");
    CHECK(rec != nullptr && rec->isOpen() && rec->studentId == "S2" && rec->deviceIds.size() == 1);
    CHECK(lab.findDevice("B")->borrowed == 1 && lab.findDevice("B")->onHold == 0);
    CHECK(lab.findDevice("B")->timesBorrowed == 2);
    CHECK(queueOrder(lab, "B") == "S3");
    CHECK(lab.checkInvariants());

    // S2 trả: S3 được giữ; S3 huỷ khi đang giữ thì đơn vị về available.
    CHECK(lab.returnRecord("PM0002").ok());
    CHECK(findReservation(lab, "B", "S3")->isHolding());
    CHECK(lab.cancelReservation("S3", "B").ok());
    CHECK(queueOrder(lab, "B").empty());
    CHECK(lab.findDevice("B")->available == 1 && lab.findDevice("B")->onHold == 0);
    CHECK(lab.cancelReservation("S3", "B").code == ErrorCode::NotInQueue);
    CHECK(lab.cancelReservation("S3", "Z").code == ErrorCode::DeviceNotFound);
    CHECK(lab.checkInvariants());

    // Huỷ người đang giữ thì chuyển quyền cho người kế.
    LabManager lab2 = makeBusyLab(3);
    lab2.returnRecord("PM0001");
    CHECK(lab2.cancelReservation("S2", "B").ok());
    CHECK(queueOrder(lab2, "B") == "S3,S4" && findReservation(lab2, "B", "S3")->isHolding());
    CHECK(!findReservation(lab2, "B", "S4")->isHolding());
    // Huỷ người đang chờ (không giữ) thì không ảnh hưởng số lượng.
    CHECK(lab2.cancelReservation("S4", "B").ok());
    CHECK(lab2.findDevice("B")->onHold == 1 && queueOrder(lab2, "B") == "S3");
    CHECK(lab2.checkInvariants());
}

static void testReserveValidation() {
    std::cout << "Reservation: kiểm tra đầu vào đặt trước (M12)\n";
    LabManager lab = makeLab();
    CHECK(lab.reserveDevice("S1", "An", "A").code == ErrorCode::CanBorrowDirectly); // còn hàng
    CHECK(lab.reserveDevice("S1", "An", "Z").code == ErrorCode::DeviceNotFound);
    CHECK(lab.reserveDevice("", "An", "B").code == ErrorCode::InvalidInput);
    CHECK(lab.reserveDevice("S1", "A|n", "B").code == ErrorCode::InvalidInput);

    lab.borrowDevices("S9", "Zed", ids({"B"}), 7); // B hết hàng
    CHECK(lab.reserveDevice("S1", "An", "B").ok());
    CHECK(lab.reserveDevice("S1", "An", "B").code == ErrorCode::AlreadyQueued);
    CHECK(lab.reserveDevice("S2", "Binh", "B").ok());
    CHECK(queueOrder(lab, "B") == "S1,S2");
    CHECK(lab.checkInvariants());
}

static void testMultiHold() {
    std::cout << "Reservation: nhiều đơn vị rảnh thì nhiều người cùng giữ (M11)\n";
    LabManager lab;
    lab.addDevice("A", "Kinh VR", 3);
    for (int i = 0; i < 3; ++i) lab.borrowDevices("S1", "An", ids({"A"}), 7); // PM0001..PM0003
    for (const char* s : {"S4", "S5", "S6", "S7"}) lab.reserveDevice(s, s, "A");

    lab.returnRecord("PM0001");
    lab.returnRecord("PM0002");
    CHECK(lab.findDevice("A")->onHold == 2 && lab.findDevice("A")->borrowed == 1);
    CHECK(findReservation(lab, "A", "S4")->isHolding() && findReservation(lab, "A", "S5")->isHolding());
    CHECK(!findReservation(lab, "A", "S6")->isHolding());
    lab.returnRecord("PM0003");
    CHECK(lab.findDevice("A")->onHold == 3 && !findReservation(lab, "A", "S7")->isHolding());
    CHECK(drainNotifications(lab) == "H:S4,H:S5,H:S6");
    CHECK(lab.checkInvariants());

    // Người giữ không đứng đầu (S5) nhận thiết bị: gỡ giữa hàng, onHold giảm.
    CHECK(lab.claimReservation("S5", "A", 3).ok());
    CHECK(queueOrder(lab, "A") == "S4,S6,S7" && lab.findDevice("A")->onHold == 2);
    CHECK(lab.checkInvariants());
}

static void testFinishMaintenanceServesQueue() {
    std::cout << "Reservation: hết bảo trì thì phục vụ hàng đợi\n";
    LabManager lab;
    lab.addDevice("B", "Tay cam", 2);
    CHECK(lab.sendToMaintenance("B", 2).ok());
    CHECK(lab.reserveDevice("S1", "An", "B").ok()); // available == 0 nên được đặt trước
    CHECK(lab.reserveDevice("S2", "Binh", "B").ok());
    CHECK(lab.reserveDevice("S3", "Chi", "B").ok());
    CHECK(lab.finishMaintenance("B", 1).ok());
    CHECK(lab.findDevice("B")->onHold == 1 && lab.findDevice("B")->available == 0);
    CHECK(findReservation(lab, "B", "S1")->isHolding() && !findReservation(lab, "B", "S2")->isHolding());
    CHECK(drainNotifications(lab) == "H:S1");
    CHECK(lab.finishMaintenance("B", 1).ok());
    CHECK(lab.findDevice("B")->onHold == 2 && findReservation(lab, "B", "S2")->isHolding());
    CHECK(lab.findDevice("B")->maintenance == 0);
    CHECK(lab.checkInvariants());
}

static void testUpdateDevice() {
    std::cout << "LabManager: sửa tổng số thiết bị (M3)\n";
    LabManager lab = makeBusyLab(1); // B: total 1, S1 đang mượn, S2 chờ
    CHECK(lab.updateDevice("Z", "x", 2).code == ErrorCode::DeviceNotFound);
    CHECK(lab.updateDevice("B", "", 2).code == ErrorCode::InvalidInput);
    CHECK(lab.updateDevice("B", "a,b", 2).code == ErrorCode::InvalidInput);
    CHECK(lab.updateDevice("B", "Tay cam", 0).code == ErrorCode::InvalidInput);
    CHECK(lab.findDevice("B")->total == 1);

    CHECK(lab.updateDevice("B", "Tay cam moi", 3).ok()); // tăng → S2 được giữ
    const Device* b = lab.findDevice("B");
    CHECK(b->name == "Tay cam moi" && b->total == 3 && b->available == 1 && b->onHold == 1 && b->borrowed == 1);
    CHECK(findReservation(lab, "B", "S2")->isHolding());
    CHECK(drainNotifications(lab) == "H:S2");
    CHECK(lab.checkInvariants());

    CHECK(lab.updateDevice("B", "Tay cam moi", 1).code == ErrorCode::InvalidInput); // < borrowed + onHold
    CHECK(lab.updateDevice("B", "Tay cam moi", 2).ok());                            // đúng mức tối thiểu
    CHECK(b->total == 2 && b->available == 0);
    CHECK(lab.checkInvariants());

    CHECK(lab.sendToMaintenance("B", 0).code == ErrorCode::InvalidInput);
    CHECK(lab.updateDevice("B", "Tay cam moi", 3).ok()); // available = 1, không còn ai chờ
    CHECK(b->available == 1 && lab.sendToMaintenance("B", 1).ok());
    CHECK(lab.updateDevice("B", "Tay cam moi", 2).code == ErrorCode::InvalidInput); // bảo trì tính vào mức tối thiểu
    CHECK(lab.checkInvariants());
}

int main() {
#ifdef _WIN32
    SetConsoleOutputCP(65001);
#endif
    testListBasics();
    testListRemove();
    testListEraseAndIterator();
    testListInsertSorted();
    testListCopyMove();
    testListNoLeak();

    testQueueFifo();
    testQueueMoveFrontToBack();
    testQueueRemoveFirst();
    testQueueCopyMoveAndLeak();

    testGraphVertices();
    testGraphEdges();
    testGraphTopNeighbors();
    testGraphRemoveVertex();

    testClock();
    testDeviceCatalog();
    testMaintenance();
    testBorrowOutOfStock();
    testBorrowValidation();
    testReturnBasics();
    testOverdue();

    testReservationScenario();
    testReservationSingleWaiter();
    testReservationChainExpiry();
    testClaimAndCancel();
    testReserveValidation();
    testMultiHold();
    testFinishMaintenanceServesQueue();
    testUpdateDevice();

    std::cout << "\n" << (g_checks - g_failures) << "/" << g_checks << " kiểm tra đạt";
    if (g_failures == 0) {
        std::cout << " — TẤT CẢ ĐẠT\n";
        return 0;
    }
    std::cout << " — " << g_failures << " LỖI\n";
    return 1;
}
