#include "Graph.h"

namespace {

// Thứ tự ưu tiên khi gợi ý: trọng số lớn hơn đứng trước; hoà thì mã nhỏ hơn đứng trước.
// Vì mã láng giềng của một đỉnh không trùng nhau nên đây là thứ tự toàn phần chặt.
bool ranksBefore(const Edge& x, const Edge& y) {
    if (x.weight != y.weight) return x.weight > y.weight;
    return x.to < y.to;
}

} // namespace

Graph::Graph() : edgeCount_(0) {}

Graph::Vertex* Graph::findVertex(const std::string& id) {
    return vertices_.findFirst([&id](const Vertex& v) { return v.id == id; });
}

const Graph::Vertex* Graph::findVertex(const std::string& id) const {
    return vertices_.findFirst([&id](const Vertex& v) { return v.id == id; });
}

bool Graph::addVertex(const std::string& id) {
    if (id.empty() || findVertex(id) != nullptr) return false;
    Vertex v;
    v.id = id;
    vertices_.pushBack(v);
    return true;
}

bool Graph::removeVertex(const std::string& id) {
    Vertex* v = findVertex(id);
    if (v == nullptr) return false;
    // Gỡ cạnh ngược (láng giềng → id) ở từng láng giềng.
    for (const Edge& e : v->adj) {
        Vertex* u = findVertex(e.to);
        if (u != nullptr) u->adj.removeFirst([&id](const Edge& x) { return x.to == id; });
        --edgeCount_;
    }
    vertices_.removeFirst([&id](const Vertex& x) { return x.id == id; });
    return true;
}

bool Graph::hasVertex(const std::string& id) const {
    return findVertex(id) != nullptr;
}

bool Graph::addEdgeWeight(const std::string& a, const std::string& b, int delta) {
    if (a == b || delta <= 0) return false;
    Vertex* va = findVertex(a);
    Vertex* vb = findVertex(b);
    if (va == nullptr || vb == nullptr) return false;

    Edge* ab = va->adj.findFirst([&b](const Edge& e) { return e.to == b; });
    if (ab != nullptr) {
        // Cạnh đã có: tăng trọng số ở cả hai chiều.
        Edge* ba = vb->adj.findFirst([&a](const Edge& e) { return e.to == a; });
        ab->weight += delta;
        if (ba != nullptr) ba->weight += delta;
    } else {
        va->adj.pushBack(Edge{b, delta});
        vb->adj.pushBack(Edge{a, delta});
        ++edgeCount_;
    }
    return true;
}

int Graph::weight(const std::string& a, const std::string& b) const {
    const Vertex* va = findVertex(a);
    if (va == nullptr) return 0;
    const Edge* e = va->adj.findFirst([&b](const Edge& x) { return x.to == b; });
    return e ? e->weight : 0;
}

void Graph::addCoBorrow(const DoublyLinkedList<std::string>& ids) {
    for (auto i = ids.begin(); i != ids.end(); ++i) {
        auto j = i;
        for (++j; j != ids.end(); ++j) {
            addEdgeWeight(*i, *j, 1); // tự bỏ qua mã trùng hoặc mã không phải đỉnh
        }
    }
}

DoublyLinkedList<Neighbor> Graph::topNeighbors(const std::string& id, int k) const {
    DoublyLinkedList<Neighbor> result;
    const Vertex* v = findVertex(id);
    if (v == nullptr || k <= 0) return result;

    const Edge* last = nullptr; // cạnh đã chọn ở lần trước
    for (int round = 0; round < k; ++round) {
        const Edge* best = nullptr;
        for (const Edge& e : v->adj) {
            // Chỉ xét cạnh đứng sau cạnh đã chọn (tức là chưa được chọn).
            if (last != nullptr && !ranksBefore(*last, e)) continue;
            if (best == nullptr || ranksBefore(e, *best)) best = &e;
        }
        if (best == nullptr) break; // hết láng giềng (ít hơn k)
        result.pushBack(Neighbor{best->to, best->weight});
        last = best;
    }
    return result;
}

void Graph::clear() {
    vertices_.clear();
    edgeCount_ = 0;
}

bool Graph::checkIntegrity() const {
    if (!vertices_.checkIntegrity()) return false;
    int degreeSum = 0;
    for (const Vertex& v : vertices_) {
        if (v.id.empty()) return false;
        // Mã đỉnh không trùng.
        int sameId = 0;
        for (const Vertex& u : vertices_)
            if (u.id == v.id) ++sameId;
        if (sameId != 1) return false;

        if (!v.adj.checkIntegrity()) return false;
        for (const Edge& e : v.adj) {
            if (e.to == v.id || e.weight <= 0) return false;
            // Không có hai cạnh cùng đích trong một danh sách kề.
            int sameTarget = 0;
            for (const Edge& x : v.adj)
                if (x.to == e.to) ++sameTarget;
            if (sameTarget != 1) return false;
            // Cạnh ngược tồn tại với cùng trọng số.
            if (weight(e.to, v.id) != e.weight) return false;
        }
        degreeSum += v.adj.size();
    }
    return degreeSum == 2 * edgeCount_;
}
