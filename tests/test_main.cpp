// Unit test cho CTDL lõi (giai đoạn 1): DoublyLinkedList, LinkedQueue, Graph.
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

    std::cout << "\n" << (g_checks - g_failures) << "/" << g_checks << " kiểm tra đạt";
    if (g_failures == 0) {
        std::cout << " — TẤT CẢ ĐẠT\n";
        return 0;
    }
    std::cout << " — " << g_failures << " LỖI\n";
    return 1;
}
