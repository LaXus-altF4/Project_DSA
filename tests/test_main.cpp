// Unit test cho lõi: giai đoạn 1 (DoublyLinkedList, LinkedQueue, Graph), 2 (mượn/trả), 3 (Reservation Queue), 4 (gợi ý mượn kèm).
// Không dùng framework: macro CHECK ghi lại lỗi và chạy tiếp; cuối chương trình trả mã thoát != 0 nếu có lỗi.
// File test được dùng iostream (lõi thì không).
#include <filesystem>
#include <fstream>
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
#include "SampleData.h"
#include "Storage.h"

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

// ============================ Gợi ý mượn kèm (giai đoạn 4) ============================

// "CTL:5,LAP:2" — thêm hậu tố "!" nếu hết hàng, "#" nếu đang bảo trì.
static std::string joinCompanions(const DoublyLinkedList<Companion>& list) {
    std::string s;
    for (const Companion& c : list) {
        if (!s.empty()) s += ",";
        s += c.deviceId + ":" + std::to_string(c.weight);
        if (c.status == DeviceStatus::Maintenance) s += "#";
        else if (c.outOfStock()) s += "!";
    }
    return s;
}

static void testGraphFilteredNeighbors() {
    std::cout << "Graph: topNeighbors có bộ lọc, sortedNeighbors\n";
    Graph g;
    for (const char* v : {"VR", "CTL", "CAM", "MIC", "LAP"}) g.addVertex(v);
    for (int i = 0; i < 5; ++i) g.addCoBorrow(ids({"VR", "CTL"}));
    for (int i = 0; i < 3; ++i) g.addCoBorrow(ids({"VR", "LAP"}));
    g.addCoBorrow(ids({"VR", "MIC"}));
    g.addCoBorrow(ids({"VR", "CAM"}));

    auto notLap = [](const std::string& id) { return id != "LAP"; };
    CHECK(joinNeighbors(g.topNeighbors("VR", 3, notLap)) == "CTL:5,CAM:1,MIC:1"); // LAP bị bỏ, lấp bằng CAM
    CHECK(joinNeighbors(g.topNeighbors("VR", 3, nullptr)) == "CTL:5,LAP:3,CAM:1"); // không lọc
    CHECK(joinNeighbors(g.topNeighbors("VR", 10, notLap)) == "CTL:5,CAM:1,MIC:1");
    CHECK(g.topNeighbors("VR", 3, [](const std::string&) { return false; }).empty());
    CHECK(joinNeighbors(g.sortedNeighbors("VR")) == "CTL:5,LAP:3,CAM:1,MIC:1");
    CHECK(g.sortedNeighbors("NONE").empty() && g.sortedNeighbors("CTL").size() == 1);
}

static void testCompanionSuggestions() {
    std::cout << "Gợi ý: cập nhật đồ thị theo phiếu, top 3, bỏ bảo trì, đánh dấu hết hàng\n";
    LabManager lab;
    CHECK(lab.addDevice("VR", "Kinh VR", 10).ok());
    CHECK(lab.addDevice("CTL", "Tay cam", 5).ok());
    CHECK(lab.addDevice("LAP", "Laptop", 2).ok());
    CHECK(lab.addDevice("CAM", "Camera", 1).ok());
    CHECK(lab.addDevice("MIC", "Micro", 2).ok());
    CHECK(lab.addDevice("TRI", "Chan may", 1).ok());
    CHECK(lab.graph().vertexCount() == 6 && lab.graph().edgeCount() == 0);
    CHECK(lab.suggestCompanions("VR").empty()); // chưa có lịch sử

    // PM0001–PM0008.
    for (int i = 0; i < 3; ++i) CHECK(lab.borrowDevices("S1", "An", ids({"VR", "CTL"}), 7).ok());
    for (int i = 0; i < 2; ++i) CHECK(lab.borrowDevices("S1", "An", ids({"VR", "CTL", "LAP"}), 7).ok()); // k=3 → 3 cặp
    CHECK(lab.borrowDevices("S2", "Binh", ids({"VR", "CAM"}), 7).ok());
    CHECK(lab.borrowDevices("S2", "Binh", ids({"VR", "MIC"}), 7).ok());
    CHECK(lab.borrowDevices("S2", "Binh", ids({"VR", "MIC", "TRI"}), 7).ok());

    CHECK(lab.coBorrowCount("VR", "CTL") == 5 && lab.coBorrowCount("CTL", "VR") == 5);
    CHECK(lab.coBorrowCount("VR", "LAP") == 2 && lab.coBorrowCount("CTL", "LAP") == 2);
    CHECK(lab.coBorrowCount("VR", "MIC") == 2 && lab.coBorrowCount("VR", "CAM") == 1);
    CHECK(lab.coBorrowCount("VR", "TRI") == 1 && lab.coBorrowCount("MIC", "TRI") == 1);
    CHECK(lab.coBorrowCount("CAM", "TRI") == 0 && lab.coBorrowCount("VR", "NONE") == 0);
    CHECK(lab.graph().edgeCount() == 7);

    // Phiếu thất bại (CAM hết hàng) không đổi đồ thị (M6).
    CHECK(lab.borrowDevices("S3", "Chi", ids({"VR", "CAM"}), 7).code == ErrorCode::OutOfStock);
    CHECK(lab.coBorrowCount("VR", "CAM") == 1 && lab.graph().edgeCount() == 7);

    // Top 3: hoà 2-2 thì LAP < MIC theo mã. TRI (1) bị loại.
    CHECK(joinCompanions(lab.suggestCompanions("VR")) == "CTL:5!,LAP:2!,MIC:2!"); // cả ba đang mượn hết nên đều hết hàng
    CHECK(joinCompanions(lab.suggestCompanions("VR", 10)) == "CTL:5!,LAP:2!,MIC:2!,CAM:1!,TRI:1!");
    CHECK(joinCompanions(lab.suggestCompanions("CAM")) == "VR:1");
    CHECK(lab.suggestCompanions("NONE").empty());
    DoublyLinkedList<Companion> top = lab.suggestCompanions("VR"); // giữ danh sách sống lâu hơn tham chiếu
    const Companion& first = *top.begin();
    CHECK(first.deviceId == "CTL" && first.name == "Tay cam" && first.status == DeviceStatus::Borrowed);

    // Trả phiếu không đổi trọng số (lịch sử đã tính).
    CHECK(lab.returnRecord("PM0004").ok() && lab.returnRecord("PM0005").ok());
    CHECK(lab.coBorrowCount("VR", "CTL") == 5);

    // LAP về hết bảo trì → bị bỏ khỏi top 3, CAM (hết hàng) lấp chỗ; "xem tất cả" vẫn có LAP kèm cờ bảo trì.
    CHECK(lab.sendToMaintenance("LAP", 2).ok() && lab.findDevice("LAP")->status() == DeviceStatus::Maintenance);
    CHECK(joinCompanions(lab.suggestCompanions("VR")) == "CTL:5,MIC:2!,CAM:1!"); // CTL còn 2 cái sau khi trả
    CHECK(joinCompanions(lab.allCompanions("VR")) == "CTL:5,LAP:2#,MIC:2!,CAM:1!,TRI:1!");
    CHECK(joinCompanions(lab.allCompanions("CTL")) == "VR:5,LAP:2#");
    CHECK(lab.allCompanions("NONE").empty());

    // Phiếu 1 món (mượn thẳng) không cộng cạnh; hết hàng CTL thì CTL vẫn đứng đầu, kèm cờ hết hàng.
    CHECK(lab.borrowDevices("S4", "Dung", ids({"CTL"}), 7).ok() && lab.borrowDevices("S4", "Dung", ids({"CTL"}), 7).ok());
    CHECK(lab.findDevice("CTL")->available == 0 && lab.graph().edgeCount() == 7);
    CHECK(joinCompanions(lab.suggestCompanions("VR")) == "CTL:5!,MIC:2!,CAM:1!");

    // Nhận hàng đặt trước tạo phiếu 1 món: không cộng cạnh (M13).
    CHECK(lab.reserveDevice("S5", "Em", "CTL").ok());
    CHECK(lab.returnRecord("PM0001").ok()); // trả 1 CTL (cùng VR) → S5 được giữ
    CHECK(lab.claimReservation("S5", "CTL", 7).ok());
    CHECK(lab.coBorrowCount("VR", "CTL") == 5 && lab.graph().edgeCount() == 7);

    // Kiểm chéo: đếm lại từ lịch sử phiếu, mọi cặp thiết bị phải khớp đồ thị.
    bool allMatch = true;
    lab.forEachDevice([&](const Device& a) {
        lab.forEachDevice([&](const Device& b) {
            if (!(a.id < b.id)) return;
            int count = 0;
            lab.forEachRecord([&](const BorrowRecord& r) {
                bool hasA = false, hasB = false;
                for (const std::string& id : r.deviceIds) {
                    if (id == a.id) hasA = true;
                    if (id == b.id) hasB = true;
                }
                if (hasA && hasB) ++count;
            });
            if (count != lab.coBorrowCount(a.id, b.id)) allMatch = false;
        });
    });
    CHECK(allMatch);
    CHECK(lab.checkInvariants());
}

static void testBasketSuggestions() {
    std::cout << "Gợi ý theo giỏ: loại món đã chọn, cộng điểm, không đổi đồ thị\n";
    LabManager lab;
    CHECK(lab.addDevice("A", "Arduino", 20).ok() && lab.addDevice("B", "Breadboard", 20).ok());
    CHECK(lab.addDevice("C", "Cap", 10).ok() && lab.addDevice("D", "Den", 10).ok());
    CHECK(lab.addDevice("E", "Sach hiem", 1).ok() && lab.addDevice("M", "May han", 1).ok());
    for (int i = 0; i < 3; ++i) CHECK(lab.borrowDevices("S1", "An", ids({"A", "B"}), 7).ok());
    for (int i = 0; i < 2; ++i) CHECK(lab.borrowDevices("S1", "An", ids({"A", "B", "C"}), 7).ok());
    for (int i = 0; i < 4; ++i) CHECK(lab.borrowDevices("S2", "Binh", ids({"B", "D"}), 7).ok());
    CHECK(lab.borrowDevices("S2", "Binh", ids({"C", "D"}), 7).ok());
    CHECK(lab.borrowDevices("S3", "Chi", ids({"A", "E"}), 7).ok()); // E hết hàng (chỉ có 1)
    BorrowResult withM = lab.borrowDevices("S3", "Chi", ids({"A", "M"}), 7);
    CHECK(withM.ok());
    // Trọng số: A–B 5, A–C 2, B–C 2, B–D 4, C–D 1, A–E 1, A–M 1.
    int edgesBefore = lab.graph().edgeCount();
    CHECK(edgesBefore == 7 && lab.coBorrowCount("A", "B") == 5);

    // Một món: giống suggestCompanions nhưng qua giỏ.
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A"}))) == "B:5,C:2,E:1!");
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A"}))) == joinCompanions(lab.suggestCompanions("A")));
    // Hai món: C = 2 (từ A) + 2 (từ B) = 4, D = 4 (từ B) → hoà 4–4 thì mã tăng; A, B không được gợi ý lại.
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A", "B"}))) == "C:4,D:4,E:1!");
    // Ba món: D = 4 (B) + 1 (C) = 5; E, M còn 1 (M hết hàng nên có cờ).
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A", "B", "C"}))) == "D:5,E:1!,M:1!");
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A", "B"}), 1)) == "C:4");
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A", "B"}), 10)) == "C:4,D:4,E:1!,M:1!");
    CHECK(lab.suggestForBasket(ids({"A", "B"}), 0).empty());

    // Giỏ lạ / rỗng / trùng mã.
    CHECK(lab.suggestForBasket(ids({})).empty() && lab.suggestForBasket(ids({"NONE"})).empty());
    CHECK(joinCompanions(lab.suggestForBasket(ids({"NONE", "A", "A"}))) == "B:5,C:2,E:1!"); // trùng chỉ tính một lần
    // Chọn đủ mọi láng giềng thì không còn gì để gợi ý.
    CHECK(lab.suggestForBasket(ids({"A", "B", "C", "D", "E", "M"})).empty());
    // Món đã có trong giỏ không bao giờ xuất hiện trong gợi ý.
    DoublyLinkedList<Companion> sug = lab.suggestForBasket(ids({"A", "C"}), 10);
    bool leaked = false;
    for (const Companion& c : sug)
        if (c.deviceId == "A" || c.deviceId == "C") leaked = true;
    CHECK(!leaked && !sug.empty());

    // Không đổi đồ thị (phiếu chưa được tạo).
    CHECK(lab.graph().edgeCount() == edgesBefore && lab.coBorrowCount("A", "B") == 5 && lab.coBorrowCount("A", "C") == 2);

    // Thiết bị bảo trì bị bỏ qua (lấy món kế tiếp), thiết bị hết hàng thì vẫn hiện.
    CHECK(lab.returnRecord(withM.recordId).ok());
    CHECK(lab.sendToMaintenance("M", 1).ok() && lab.findDevice("M")->status() == DeviceStatus::Maintenance);
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A", "B", "C"}))) == "D:5,E:1!");
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A"}), 10)) == "B:5,C:2,E:1!");

    // Sau khi tạo phiếu thật, điểm mới mới được cộng vào đồ thị và ảnh hưởng gợi ý.
    CHECK(lab.borrowDevices("S4", "Dung", ids({"A", "C"}), 7).ok());
    CHECK(lab.coBorrowCount("A", "C") == 3);
    CHECK(joinCompanions(lab.suggestForBasket(ids({"A"}))) == "B:5,C:3,E:1!");
    CHECK(lab.checkInvariants());
}

// ============================ Giai đoạn 5: xoá thiết bị, tự lưu, khôi phục, Storage, dữ liệu mẫu ============================

static std::string tmpDir(const std::string& name) {
    std::string dir = "build/test_tmp/" + name;
    std::error_code ec;
    std::filesystem::remove_all(dir, ec);
    std::filesystem::create_directories(dir, ec);
    return dir;
}

static void writeFile(const std::string& path, const std::string& content) {
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    out << content;
}

static void testRemoveDevice() {
    std::cout << "LabManager: xoá thiết bị (M4)\n";
    LabManager lab;
    CHECK(lab.addDevice("A", "Kinh", 2).ok() && lab.addDevice("B", "Tay cam", 2).ok() && lab.addDevice("C", "Camera", 1).ok());
    CHECK(lab.borrowDevices("S1", "An", ids({"A", "B"}), 7).ok());   // PM0001
    CHECK(lab.borrowDevices("S2", "Binh", ids({"A", "C"}), 7).ok()); // PM0002
    CHECK(lab.graph().edgeCount() == 2);

    CHECK(lab.removeDevice("Z").code == ErrorCode::DeviceNotFound);
    CHECK(lab.removeDevice("A").code == ErrorCode::DeviceInUse);     // còn phiếu mở
    CHECK(lab.removeDevice("B").code == ErrorCode::DeviceInUse);
    CHECK(lab.deviceCount() == 3 && lab.graph().hasVertex("A") && lab.checkInvariants());

    // Hàng đợi chặn xoá.
    CHECK(lab.reserveDevice("S9", "Hoa", "C").ok());
    CHECK(lab.returnRecord("PM0002").ok()); // C được giữ cho S9
    CHECK(lab.removeDevice("C").code == ErrorCode::DeviceInUse);
    CHECK(lab.cancelReservation("S9", "C").ok());

    // B hết phiếu mở → xoá được; đỉnh và cạnh biến mất, phiếu lịch sử giữ nguyên mã.
    CHECK(lab.returnRecord("PM0001").ok());
    CHECK(lab.removeDevice("B").ok());
    CHECK(lab.findDevice("B") == nullptr && !lab.graph().hasVertex("B") && lab.deviceCount() == 2);
    CHECK(lab.coBorrowCount("A", "B") == 0 && lab.graph().edgeCount() == 1); // còn cạnh A–C
    CHECK(joinCompanions(lab.suggestCompanions("A")) == "C:1");
    const BorrowRecord* rec = lab.findRecord("PM0001");
    CHECK(rec != nullptr && rec->deviceIds.size() == 2 && *rec->deviceIds.begin() == "A");
    CHECK(lab.checkInvariants());
    CHECK(lab.removeDevice("C").ok() && lab.removeDevice("A").ok() && lab.deviceCount() == 0);
    CHECK(lab.graph().vertexCount() == 0 && lab.checkInvariants());
}

static void testChangeListener() {
    std::cout << "LabManager: change listener (tự lưu)\n";
    LabManager lab;
    int calls = 0;
    lab.setChangeListener([&calls]() { ++calls; });
    CHECK(lab.addDevice("A", "Kinh", 1).ok() && calls == 1);
    CHECK(!lab.addDevice("A", "Kinh", 1).ok() && calls == 1);          // thất bại: không gọi
    CHECK(lab.borrowDevices("S1", "An", ids({"A"}), 3).ok() && calls == 2);
    CHECK(!lab.borrowDevices("S2", "Binh", ids({"A"}), 3).ok() && calls == 2);
    CHECK(lab.reserveDevice("S2", "Binh", "A").ok() && calls == 3);
    CHECK(lab.advanceTime(5) && calls == 4);
    CHECK(!lab.advanceTime(0) && calls == 4);
    CHECK(lab.returnRecord("PM0001").ok() && calls == 5);
    CHECK(lab.claimReservation("S2", "A", 2).ok() && calls == 6);
    CHECK(lab.sendToMaintenance("A", 1).code == ErrorCode::OutOfStock && calls == 6);
    CHECK(lab.returnRecord("PM0002").ok() && calls == 7);
    CHECK(lab.sendToMaintenance("A", 1).ok() && lab.finishMaintenance("A", 1).ok() && calls == 9);
    CHECK(lab.updateDevice("A", "Kinh 2", 2).ok() && calls == 10);
    CHECK(lab.removeDevice("A").ok() && calls == 11);
    // restore* không gọi listener.
    LabManager other;
    int calls2 = 0;
    other.setChangeListener([&calls2]() { ++calls2; });
    CHECK(other.restoreDevice("A", "Kinh", 2, 0).ok() && other.finishRestore() && calls2 == 0);
}

static BorrowRecord makeRec(const char* id, const char* sid, std::initializer_list<const char*> devs, long long borrow,
                            long long due, long long ret = -1, int late = 0, long long fine = 0) {
    BorrowRecord r;
    r.recordId = id;
    r.studentId = sid;
    r.studentName = "SV";
    for (const char* d : devs) r.deviceIds.pushBack(d);
    r.borrowHour = borrow;
    r.dueHour = due;
    r.returnHour = ret;
    r.lateDays = late;
    r.fine = fine;
    return r;
}

static Reservation makeRes(const char* sid, long long enqueue, long long hold, int miss = 0) {
    Reservation r;
    r.studentId = sid;
    r.studentName = "SV";
    r.enqueueHour = enqueue;
    r.holdUntil = hold;
    r.missCount = miss;
    return r;
}

static void testRestoreApi() {
    std::cout << "LabManager: restore* kiểm tra dữ liệu, dựng lại số liệu suy ra\n";
    LabManager lab;
    lab.restoreMeta(50, 3);
    CHECK(lab.now() == 50 && lab.nextRecordNo() == 3);
    CHECK(lab.restoreDevice("A", "Kinh VR", 2, 0).ok() && lab.restoreDevice("B", "Tay cam", 1, 0).ok());
    CHECK(lab.restoreDevice("C", "Camera", 1, 0).ok());
    CHECK(lab.restoreDevice("A", "Trung", 1, 0).code == ErrorCode::DuplicateDevice);
    CHECK(lab.restoreDevice("", "X", 1, 0).code == ErrorCode::InvalidInput);
    CHECK(lab.restoreDevice("D", "a,b", 1, 0).code == ErrorCode::InvalidInput);
    CHECK(lab.restoreDevice("D", "X", 1, 2).code == ErrorCode::InvalidInput);  // bảo trì > tổng
    CHECK(lab.restoreDevice("D", "X", 0, 0).code == ErrorCode::InvalidInput);
    CHECK(lab.deviceCount() == 3);

    CHECK(lab.restoreRecord(makeRec("PM0001", "S1", {"A", "B"}, 0, 72)).ok());
    CHECK(lab.restoreRecord(makeRec("PM0002", "S2", {"A"}, 10, 100)).ok());
    CHECK(lab.findDevice("A")->available == 0 && lab.findDevice("A")->borrowed == 2 && lab.findDevice("A")->timesBorrowed == 2);
    CHECK(lab.coBorrowCount("A", "B") == 1);
    CHECK(lab.restoreRecord(makeRec("PM0003", "S3", {"A"}, 20, 100)).code == ErrorCode::OutOfStock); // vượt tồn kho
    CHECK(lab.restoreRecord(makeRec("PM0001", "S3", {"C"}, 0, 72)).code == ErrorCode::InvalidInput);  // trùng mã phiếu
    CHECK(lab.restoreRecord(makeRec("PM0009", "S3", {"C", "C"}, 0, 72)).code == ErrorCode::DuplicateDevice);
    CHECK(lab.restoreRecord(makeRec("PM0009", "S3", {"C"}, 72, 72)).code == ErrorCode::InvalidInput); // hạn <= giờ mượn
    CHECK(lab.restoreRecord(makeRec("PM0009", "S3", {}, 0, 72)).code == ErrorCode::InvalidInput);     // không có thiết bị
    CHECK(lab.restoreRecord(makeRec("PM0009", "S3", {"C"}, 0, 72, 5, -1, 0)).code == ErrorCode::InvalidInput);
    CHECK(lab.recordCount() == 2 && lab.findDevice("C")->borrowed == 0); // phiếu lỗi không để lại dấu vết

    // Phiếu đã đóng, có cả thiết bị đã xoá (Z): chỉ cộng cho thiết bị còn tồn tại, không đổi tồn kho.
    CHECK(lab.restoreRecord(makeRec("PM0007", "S4", {"C", "Z"}, 0, 48, 60, 1, 36000)).ok());
    CHECK(lab.findDevice("C")->available == 1 && lab.findDevice("C")->timesBorrowed == 1);
    CHECK(lab.nextRecordNo() == 8); // luôn lớn hơn mã phiếu lớn nhất (PM0007)

    // Hàng đợi: A đang hết hàng.
    CHECK(lab.restoreReservation("A", makeRes("S5", 20, -1)).ok());
    CHECK(lab.restoreReservation("A", makeRes("S6", 21, -1)).ok());
    CHECK(lab.restoreReservation("A", makeRes("S5", 22, -1)).code == ErrorCode::AlreadyQueued);
    CHECK(lab.restoreReservation("A", makeRes("S7", 22, 90)).code == ErrorCode::InvalidInput); // giữ sau người chờ
    CHECK(lab.restoreReservation("A", makeRes("S7", 22, -1, 2)).code == ErrorCode::InvalidInput); // missCount = 2
    CHECK(lab.restoreReservation("Q", makeRes("S7", 22, -1)).code == ErrorCode::DeviceNotFound);
    CHECK(lab.restoreReservation("A", makeRes("S7", -5, -1)).code == ErrorCode::InvalidInput);
    CHECK(lab.restoreReservation("B", makeRes("S8", 20, 60)).code == ErrorCode::OutOfStock); // không còn đơn vị để giữ
    // C còn 1 đơn vị: giữ cho S8, rồi người chờ; người giữ thứ hai phải đứng đầu hàng.
    CHECK(lab.restoreReservation("C", makeRes("S8", 20, 60)).ok());
    CHECK(lab.findDevice("C")->onHold == 1 && lab.findDevice("C")->available == 0);
    CHECK(lab.restoreReservation("C", makeRes("S9", 21, -1)).ok());
    CHECK(lab.finishRestore() && lab.checkInvariants());
    CHECK(lab.now() == 50 && lab.findDevice("A")->queue.size() == 2);
}

static void testRestoreServesAndExpires() {
    std::cout << "LabManager: finishRestore phục vụ hàng đợi và xử lý hết hạn\n";
    // Còn đơn vị rảnh mà có người chờ → giữ hộ (hạn = now + 24).
    LabManager a;
    a.restoreMeta(100, 1);
    CHECK(a.restoreDevice("D", "Dev", 1, 0).ok());
    CHECK(a.restoreReservation("D", makeRes("S1", 5, -1)).ok());
    CHECK(a.finishRestore());
    CHECK(a.findDevice("D")->onHold == 1 && a.findDevice("D")->available == 0);
    CHECK(a.findDevice("D")->queue.front()->holdUntil == 124);

    // Lượt giữ đã hết hạn lúc nạp: lỡ 2 lần thì bị loại, đơn vị về available.
    LabManager b;
    b.restoreMeta(100, 1);
    CHECK(b.restoreDevice("D", "Dev", 1, 0).ok());
    CHECK(b.restoreReservation("D", makeRes("S1", 5, 10)).ok());
    CHECK(b.finishRestore());
    CHECK(b.findDevice("D")->queue.empty() && b.findDevice("D")->available == 1 && b.findDevice("D")->onHold == 0);
    CHECK(b.notificationCount() > 0);
}

// Ghép trạng thái đủ để so sánh hai LabManager (thiết bị, hàng đợi, phiếu theo thứ tự).
static std::string stateText(const LabManager& lab) {
    std::string s = "now=" + std::to_string(lab.now()) + " next=" + std::to_string(lab.nextRecordNo()) + "\n";
    lab.forEachDevice([&](const Device& d) {
        s += d.id + "|" + d.name + "|" + std::to_string(d.total) + "|" + std::to_string(d.available) + "|" +
             std::to_string(d.borrowed) + "|" + std::to_string(d.onHold) + "|" + std::to_string(d.maintenance) + "|" +
             std::to_string(d.timesBorrowed) + "|Q:";
        lab.forEachReservation(d.id, [&](const Reservation& r) {
            s += r.studentId + "/" + r.studentName + "/" + std::to_string(r.enqueueHour) + "/" +
                 std::to_string(r.holdUntil) + "/" + std::to_string(r.missCount) + ";";
        });
        s += "\n";
    });
    lab.forEachRecord([&](const BorrowRecord& r) {
        s += r.recordId + "|" + r.studentId + "|" + r.studentName + "|";
        for (const std::string& id : r.deviceIds) s += id + ",";
        s += "|" + std::to_string(r.borrowHour) + "|" + std::to_string(r.dueHour) + "|" + std::to_string(r.returnHour) +
             "|" + std::to_string(r.lateDays) + "|" + std::to_string(r.fine) + "\n";
    });
    return s;
}

static bool sameGraph(const LabManager& a, const LabManager& b) {
    if (a.graph().edgeCount() != b.graph().edgeCount() || a.graph().vertexCount() != b.graph().vertexCount()) return false;
    bool same = true;
    a.graph().forEachEdge([&](const std::string& x, const std::string& y, int w) {
        if (b.coBorrowCount(x, y) != w) same = false;
    });
    return same;
}

static void testSampleData() {
    std::cout << "SampleData: ≥15 thiết bị, ≥30 phiếu, cặp nổi bật, hàng đợi để demo\n";
    LabManager lab;
    SampleData::build(lab);
    CHECK(lab.checkInvariants());
    CHECK(lab.deviceCount() >= 15 && lab.recordCount() >= 30);
    CHECK(lab.coBorrowCount("VR01", "TC01") >= 9);
    CHECK(lab.coBorrowCount("ARD01", "BRD01") >= 7 && lab.coBorrowCount("BRD01", "JMP01") >= 7 &&
          lab.coBorrowCount("ARD01", "JMP01") >= 7);
    DoublyLinkedList<Companion> vr = lab.suggestCompanions("VR01", 3);
    CHECK(!vr.empty() && vr.begin()->deviceId == "TC01");
    DoublyLinkedList<Companion> ard = lab.suggestCompanions("ARD01", 2);
    CHECK(joinCompanions(ard).find("BRD01") != std::string::npos && joinCompanions(ard).find("JMP01") != std::string::npos);

    // Trạng thái demo: hàng đợi Kính VR (1 người đang giữ, 1 người chờ), bảo trì, phiếu quá hạn.
    const Device* vrDev = lab.findDevice("VR01");
    CHECK(vrDev != nullptr && vrDev->queue.size() == 2 && vrDev->onHold == 1 && vrDev->available == 0);
    CHECK(lab.findDevice("SLD01")->status() == DeviceStatus::Maintenance);
    CHECK(lab.findDevice("OSC01")->maintenance == 1);
    int overdue = 0, open = 0, lateReturned = 0;
    lab.forEachRecord([&](const BorrowRecord& r) {
        if (r.isOpen()) {
            ++open;
            if (lab.previewOverdue(r).lateDays > 0) ++overdue;
        } else if (r.lateDays > 0) {
            ++lateReturned;
        }
    });
    CHECK(overdue == 2 && open >= 5 && lateReturned == 5); // đúng 5 phiếu cố ý trả trễ: PM0011, PM0019, PM0027, PM0034, PM0051 (trả đúng hạn thì không phạt)
}

static void testStorageRoundTrip() {
    std::cout << "Storage: lưu rồi nạp lại giữ nguyên dữ liệu (dữ liệu mẫu)\n";
    std::string dir = tmpDir("roundtrip");
    LabManager a;
    SampleData::build(a);
    CHECK(Storage::save(dir, a).ok());
    CHECK(std::filesystem::exists(dir + "/devices.csv") && std::filesystem::exists(dir + "/borrow_records.csv") &&
          std::filesystem::exists(dir + "/reservations.csv") && std::filesystem::exists(dir + "/meta.csv"));
    CHECK(!std::filesystem::exists(dir + "/devices.csv.tmp") && !std::filesystem::exists(dir + "/meta.csv.tmp"));

    LabManager b;
    LoadReport rep = Storage::load(dir, b);
    CHECK(rep.warnings.empty() && rep.skippedLines == 0 && rep.missingFiles == 0 && rep.invariantsOk);
    CHECK(rep.devices == a.deviceCount() && rep.records == a.recordCount() && rep.reservations == 2);
    CHECK(stateText(a) == stateText(b));
    CHECK(sameGraph(a, b) && sameGraph(b, a));
    CHECK(b.checkInvariants());

    // Chạy tiếp sau khi nạp: tua 30 giờ ở cả hai bản phải cho cùng kết quả (lượt giữ hết hạn → đẩy xuống cuối).
    CHECK(a.advanceTime(30) && b.advanceTime(30));
    CHECK(stateText(a) == stateText(b));

    // Lưu lần nữa (ghi đè file có sẵn) vẫn đúng.
    CHECK(Storage::save(dir, b).ok());
    LabManager c;
    CHECK(Storage::load(dir, c).warnings.empty() && stateText(c) == stateText(b));

    // Thiết bị đã xoá: phiếu lịch sử vẫn nạp được, đồ thị không có đỉnh của nó.
    CHECK(c.removeDevice("BK01").ok()); // sách hiếm: chưa có phiếu mở, không có hàng đợi
    CHECK(Storage::save(dir, c).ok());
    LabManager d;
    LoadReport rep2 = Storage::load(dir, d);
    CHECK(rep2.warnings.empty() && d.findDevice("BK01") == nullptr && !d.graph().hasVertex("BK01"));
    CHECK(d.recordCount() == c.recordCount() && stateText(c) == stateText(d) && d.checkInvariants());
}

static void testStorageBadInput() {
    std::cout << "Storage: file thiếu, dòng lỗi, CRLF, chữ thay số — báo và bỏ qua, không crash\n";
    // Thư mục rỗng: cả 4 file thiếu.
    std::string empty = tmpDir("empty");
    LabManager e;
    LoadReport r0 = Storage::load(empty, e);
    CHECK(r0.missingFiles == 4 && r0.warnings.size() == 4 && e.deviceCount() == 0 && r0.invariantsOk);
    CHECK(!Storage::hasAnyData(empty));

    std::string dir = tmpDir("bad");
    writeFile(dir + "/devices.csv",
              "id,name,total,maintenance\r\n"
              "A,Kinh VR,3,0\r\n"
              "B,Tay cam,abc,0\r\n"        // chữ thay số
              "C,Camera,2\r\n"             // thiếu cột
              "\r\n"                       // dòng trống: bỏ qua, không cảnh báo
              "D,Dev,2,0\r\n"
              "D,Dev trung,2,0\r\n"        // trùng mã
              "E,Thua cot,2,0,9\r\n"       // thừa cột
              "F,,2,0\r\n"                 // tên rỗng
              "G,Qua lon,99999999999,0\r\n"); // số quá lớn
    writeFile(dir + "/borrow_records.csv",
              "recordId,studentId,studentName,deviceIds,borrowHour,dueHour,returnHour,lateDays,fine\n"
              "PM0001,S1,An,A|D,0,72,-1,0,0\n"
              "PM0003,S3,Chi,A,x,72,-1,0,0\n"      // giờ mượn là chữ
              "PM0004,S4,Dung,A|A,0,72,-1,0,0\n"   // trùng mã trong phiếu
              "PM0005,S5,Em,D,0,72,-1,0,0\n"
              "PM0006,S6,Phi,D,0,72,-1,0,0\n");    // D chỉ có 2: phiếu mở thứ ba vượt tồn kho
    writeFile(dir + "/reservations.csv",
              "deviceId,studentId,studentName,enqueueHour,holdUntil,missCount\n"
              "A,S8,Hoa,5,-1,0\n"
              "Q,S9,X,5,-1,0\n"                    // thiết bị không tồn tại
              "A,S10\n");                          // thiếu cột
    writeFile(dir + "/meta.csv", "key,value\nnow,100\nnextRecordNo,abc\nfoo,1\n");

    LabManager lab;
    LoadReport rep = Storage::load(dir, lab); // không được crash/treo
    CHECK(rep.missingFiles == 0 && rep.devices == 2 && rep.records == 2 && rep.reservations == 1);
        // devices: B, C, D trung, E, F, G = 6; phieu: PM0003, PM0004, PM0006 = 3; hang doi: Q, dong thieu cot = 2; meta: 2.
    CHECK(rep.skippedLines == 6 + 3 + 2 + 2);
    CHECK(rep.invariantsOk && lab.now() == 100 && lab.checkInvariants());
    CHECK(lab.findDevice("A") != nullptr && lab.findDevice("B") == nullptr && lab.findDevice("D") != nullptr);
    CHECK(lab.findDevice("A")->borrowed == 1 && lab.findDevice("D")->borrowed == 2 && lab.findDevice("D")->available == 0);
    // S8 đứng chờ A còn đơn vị rảnh → được giữ hộ lúc nạp.
    CHECK(lab.findDevice("A")->onHold == 1 && lab.findDevice("A")->queue.size() == 1);
    int shown = 0;
    for (const std::string& w : rep.warnings) {
        (void)w;
        ++shown;
    }
    CHECK(shown == rep.skippedLines);

    // Ghi vào thư mục không tồn tại: báo lỗi, không crash.
    CHECK(!Storage::save("build/test_tmp/khong_ton_tai/xyz", lab).ok());
}

// ============================ Giai đoạn 6: thống kê, giữ hàng, quá hạn ============================

static void testStatsAndHolds() {
    std::cout << "LabManager: getStats, topBorrowedDevices, expiringHolds, isOverdue, unavailableIds\n";
    LabManager lab;
    CHECK(lab.addDevice("A", "Thiết bị A", 1).ok());
    CHECK(lab.addDevice("B", "Thiết bị B", 2).ok());
    CHECK(lab.addDevice("C", "Thiết bị C", 1).ok());
    CHECK(lab.topBorrowedDevices(3).empty()); // chưa ai mượn

    BorrowResult r1 = lab.borrowDevices("S1", "SV Một", ids({"A", "B"}), 1); // hạn giờ 24
    BorrowResult r2 = lab.borrowDevices("S2", "SV Hai", ids({"B"}), 2);      // hạn giờ 48
    CHECK(r1.ok() && r2.ok());

    // Xếp hạng: B (2 lần), A (1 lần); C chưa mượn bị bỏ. k nhỏ hơn số thiết bị thì cắt bớt.
    DoublyLinkedList<DeviceRank> top = lab.topBorrowedDevices(5);
    CHECK(top.size() == 2);
    CHECK(top.front()->deviceId == "B" && top.front()->timesBorrowed == 2);
    CHECK(top.back()->deviceId == "A" && top.back()->timesBorrowed == 1);
    CHECK(lab.topBorrowedDevices(1).size() == 1 && lab.topBorrowedDevices(0).empty());

    // Phiếu có món hết hàng: trả kèm danh sách mã hết hàng, không có C (còn hàng).
    BorrowResult bad = lab.borrowDevices("S9", "SV Chín", ids({"C", "A"}), 3);
    CHECK(bad.code == ErrorCode::OutOfStock);
    CHECK(bad.unavailableIds.size() == 1 && *bad.unavailableIds.front() == "A");
    CHECK(r1.unavailableIds.empty());

    CHECK(lab.reserveDevice("S3", "SV Ba", "A").ok());
    CHECK(lab.reserveDevice("S4", "SV Bốn", "A").ok());

    LabStats s = lab.getStats();
    CHECK(s.deviceCount == 3 && s.totalUnits == 4);
    CHECK(s.available == 1 && s.borrowed == 3 && s.onHold == 0 && s.maintenance == 0);
    CHECK(s.openRecords == 2 && s.overdueRecords == 0 && s.pendingFines == 0);
    CHECK(s.waitingPeople == 2 && s.holdingPeople == 0);

    // Tua tới giờ 24 = đúng hạn phiếu 1: chưa quá hạn. Giờ 25: quá hạn 1 ngày, 2 thiết bị.
    CHECK(lab.advanceTime(24));
    CHECK(!lab.isOverdue(*lab.findRecord(r1.recordId)));
    CHECK(lab.advanceTime(1));
    CHECK(lab.isOverdue(*lab.findRecord(r1.recordId)));
    CHECK(!lab.isOverdue(*lab.findRecord(r2.recordId)));
    s = lab.getStats();
    CHECK(s.overdueRecords == 1 && s.pendingFines == 2 * FINE_PER_DAY);

    // Chưa được giữ → -1. Trả phiếu 1 → S3 được giữ 24 giờ.
    const Reservation* head = nullptr;
    lab.forEachReservation("A", [&head](const Reservation& r) { if (head == nullptr) head = &r; });
    CHECK(head != nullptr && lab.holdHoursLeft(*head) == -1);
    CHECK(lab.returnRecord(r1.recordId).ok());
    CHECK(!lab.isOverdue(*lab.findRecord(r1.recordId))); // đã trả thì không còn "đang quá hạn"
    head = nullptr;
    lab.forEachReservation("A", [&head](const Reservation& r) { if (head == nullptr) head = &r; });
    CHECK(head != nullptr && head->studentId == "S3" && lab.holdHoursLeft(*head) == 24);

    CHECK(lab.expiringHolds(6).empty());
    DoublyLinkedList<HoldInfo> soon = lab.expiringHolds(25);
    CHECK(soon.size() == 1 && soon.front()->studentId == "S3" && soon.front()->hoursLeft == 24);

    CHECK(lab.advanceTime(20)); // còn 4 giờ
    soon = lab.expiringHolds(6);
    CHECK(soon.size() == 1 && soon.front()->hoursLeft == 4 && soon.front()->deviceId == "A");
    s = lab.getStats();
    CHECK(s.holdingPeople == 1 && s.onHold == 1 && s.waitingPeople == 2);

    // Sắp xếp theo thời gian còn lại: thêm một lượt giữ ở C (24 giờ) → đứng sau A (4 giờ).
    BorrowResult rc = lab.borrowDevices("S5", "SV Năm", ids({"C"}), 1);
    CHECK(rc.ok());
    CHECK(lab.reserveDevice("S6", "SV Sáu", "C").ok());
    CHECK(lab.returnRecord(rc.recordId).ok());
    soon = lab.expiringHolds(100);
    CHECK(soon.size() == 2 && soon.front()->deviceId == "A" && soon.back()->deviceId == "C");
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

    testGraphFilteredNeighbors();
    testCompanionSuggestions();

    testBasketSuggestions();
    testRemoveDevice();
    testChangeListener();
    testRestoreApi();
    testRestoreServesAndExpires();
    testSampleData();
    testStorageRoundTrip();
    testStorageBadInput();

    testStatsAndHolds();

    std::cout << "\n" << (g_checks - g_failures) << "/" << g_checks << " kiểm tra đạt";
    if (g_failures == 0) {
        std::cout << " — TẤT CẢ ĐẠT\n";
        return 0;
    }
    std::cout << " — " << g_failures << " LỖI\n";
    return 1;
}
