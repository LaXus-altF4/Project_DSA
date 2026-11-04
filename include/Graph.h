#ifndef GRAPH_H
#define GRAPH_H

#include <string>
#include "DoublyLinkedList.h"

// Một cạnh trong danh sách kề: đỉnh đích và trọng số (số lần hai thiết bị được mượn cùng phiếu).
struct Edge {
    std::string to;
    int weight;
};

// Một kết quả gợi ý: thiết bị láng giềng và số lần mượn kèm.
struct Neighbor {
    std::string deviceId;
    int weight;
};

// Đồ thị vô hướng có trọng số, cài bằng danh sách kề (DSLK kép tự cài).
// Đỉnh = mã thiết bị. Mỗi cạnh vô hướng {a, b} được lưu ở cả hai đầu: a.adj chứa (b, w), b.adj chứa (a, w).
// Ký hiệu Big-O: V = số đỉnh, E = số cạnh, d = bậc của đỉnh đang xét, k = số phần tử cần lấy.
class Graph {
private:
    struct Vertex {
        std::string id;
        DoublyLinkedList<Edge> adj;
    };

    DoublyLinkedList<Vertex> vertices_;
    int edgeCount_;

    Vertex* findVertex(const std::string& id);             // O(V)
    const Vertex* findVertex(const std::string& id) const; // O(V)

public:
    Graph();

    // Thêm đỉnh; false nếu mã rỗng hoặc đã tồn tại. O(V)
    bool addVertex(const std::string& id);

    // Xoá đỉnh và mọi cạnh nối với nó (gỡ cả cạnh ngược ở danh sách kề của láng giềng).
    // O(V + d·(V + d_max)) ⊆ O(V·d + E)
    bool removeVertex(const std::string& id);

    bool hasVertex(const std::string& id) const; // O(V)

    // Cộng delta (> 0) vào trọng số cạnh {a, b}; tạo cạnh nếu chưa có. Cập nhật cả hai chiều.
    // false nếu a == b (không cho khuyên), delta <= 0, hoặc một trong hai đỉnh không tồn tại. O(V + d)
    bool addEdgeWeight(const std::string& a, const std::string& b, int delta = 1);

    // Trọng số cạnh {a, b}; 0 nếu không có cạnh. O(V + d)
    int weight(const std::string& a, const std::string& b) const;

    // Cập nhật theo một phiếu mượn: +1 cho mọi cặp (i < j) trong ids.
    // Bỏ qua mã không phải đỉnh và cặp trùng mã. O(k²·(V + d)), k = số thiết bị trong phiếu
    void addCoBorrow(const DoublyLinkedList<std::string>& ids);

    // k láng giềng có trọng số lớn nhất của id, sắp theo trọng số giảm dần, hoà thì mã tăng dần.
    // Chọn k lần: lần thứ i lấy cạnh tốt nhất trong số các cạnh đứng sau cạnh đã chọn ở lần i-1.
    // Đỉnh không tồn tại hoặc k <= 0 → danh sách rỗng. O(V + k·d), bộ nhớ phụ O(1) ngoài kết quả
    DoublyLinkedList<Neighbor> topNeighbors(const std::string& id, int k = 3) const;

    // Gọi fn(id) cho từng đỉnh. O(V)
    template <class Fn>
    void forEachVertex(Fn fn) const {
        for (const Vertex& v : vertices_) fn(v.id);
    }

    // Gọi fn(a, b, weight) cho mỗi cạnh đúng một lần (chỉ khi a < b). O(V + E)
    template <class Fn>
    void forEachEdge(Fn fn) const {
        for (const Vertex& v : vertices_)
            for (const Edge& e : v.adj)
                if (v.id < e.to) fn(v.id, e.to, e.weight);
    }

    // Gọi fn(neighborId, weight) cho mọi láng giềng của id. O(V + d)
    template <class Fn>
    void forEachNeighbor(const std::string& id, Fn fn) const {
        const Vertex* v = findVertex(id);
        if (v == nullptr) return;
        for (const Edge& e : v->adj) fn(e.to, e.weight);
    }

    int vertexCount() const { return vertices_.size(); } // O(1)
    int edgeCount() const { return edgeCount_; }         // O(1)

    void clear(); // O(V + E)

    // Kiểm tra: mã đỉnh không trùng, không khuyên, mọi cạnh a→b có b→a cùng trọng số (> 0),
    // không có cạnh lặp, tổng bậc == 2·edgeCount_. O(V² + E·(V + d)) — chỉ dùng trong test/debug
    bool checkIntegrity() const;
};

#endif // GRAPH_H
