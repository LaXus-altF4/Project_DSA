#ifndef DOUBLY_LINKED_LIST_H
#define DOUBLY_LINKED_LIST_H

#include <utility> // std::swap, std::move

// Danh sách liên kết kép tự cài đặt (dùng cho danh mục thiết bị, phiếu mượn, danh sách kề của Graph).
// Mỗi nút giữ con trỏ prev/next; danh sách giữ head_, tail_ và size_.
// Con trỏ/iterator tới một phần tử còn hợp lệ cho đến khi chính nút đó bị xoá.
template <typename T>
class DoublyLinkedList {
private:
    struct Node {
        T data;
        Node* prev;
        Node* next;
        explicit Node(const T& value) : data(value), prev(nullptr), next(nullptr) {}
    };

    Node* head_;
    Node* tail_;
    int size_;

    // Gỡ nút n khỏi chuỗi và giải phóng. O(1)
    void unlinkNode(Node* n) {
        if (n->prev) n->prev->next = n->next; else head_ = n->next;
        if (n->next) n->next->prev = n->prev; else tail_ = n->prev;
        delete n;
        --size_;
    }

    // Chèn nút mới chứa value vào trước nút pos (pos == nullptr: chèn cuối). O(1)
    void linkBefore(Node* pos, const T& value) {
        Node* n = new Node(value);
        if (pos == nullptr) {
            n->prev = tail_;
            if (tail_) tail_->next = n; else head_ = n;
            tail_ = n;
        } else {
            n->next = pos;
            n->prev = pos->prev;
            if (pos->prev) pos->prev->next = n; else head_ = n;
            pos->prev = n;
        }
        ++size_;
    }

public:
    // ---------------- Iterator (duyệt xuôi, dùng được với range-for) ----------------
    class Iterator {
        friend class DoublyLinkedList;
        Node* node_;
    public:
        explicit Iterator(Node* n = nullptr) : node_(n) {}
        T& operator*() const { return node_->data; }               // O(1)
        T* operator->() const { return &node_->data; }             // O(1)
        Iterator& operator++() { node_ = node_->next; return *this; } // O(1)
        bool operator==(const Iterator& o) const { return node_ == o.node_; }
        bool operator!=(const Iterator& o) const { return node_ != o.node_; }
    };

    class ConstIterator {
        const Node* node_;
    public:
        explicit ConstIterator(const Node* n = nullptr) : node_(n) {}
        const T& operator*() const { return node_->data; }
        const T* operator->() const { return &node_->data; }
        ConstIterator& operator++() { node_ = node_->next; return *this; }
        bool operator==(const ConstIterator& o) const { return node_ == o.node_; }
        bool operator!=(const ConstIterator& o) const { return node_ != o.node_; }
    };

    // ---------------- Khởi tạo / huỷ ----------------
    DoublyLinkedList() : head_(nullptr), tail_(nullptr), size_(0) {} // O(1)

    // Sao chép sâu. O(n)
    DoublyLinkedList(const DoublyLinkedList& other) : head_(nullptr), tail_(nullptr), size_(0) {
        for (const Node* p = other.head_; p != nullptr; p = p->next) pushBack(p->data);
    }

    // Di chuyển: lấy luôn chuỗi nút của other, other thành rỗng. O(1)
    DoublyLinkedList(DoublyLinkedList&& other) noexcept
        : head_(other.head_), tail_(other.tail_), size_(other.size_) {
        other.head_ = other.tail_ = nullptr;
        other.size_ = 0;
    }

    // Gán (copy-and-swap, an toàn khi tự gán). Sao chép O(n), di chuyển O(1) + huỷ dữ liệu cũ O(n)
    DoublyLinkedList& operator=(DoublyLinkedList other) noexcept {
        swap(other);
        return *this;
    }

    ~DoublyLinkedList() { clear(); } // O(n)

    void swap(DoublyLinkedList& other) noexcept { // O(1)
        std::swap(head_, other.head_);
        std::swap(tail_, other.tail_);
        std::swap(size_, other.size_);
    }

    // ---------------- Thêm / xoá ở hai đầu ----------------
    void pushFront(const T& value) { linkBefore(head_, value); } // O(1)
    void pushBack(const T& value) { linkBefore(nullptr, value); } // O(1)

    // Trả về false nếu danh sách rỗng. O(1)
    bool popFront() {
        if (head_ == nullptr) return false;
        unlinkNode(head_);
        return true;
    }

    bool popBack() { // O(1)
        if (tail_ == nullptr) return false;
        unlinkNode(tail_);
        return true;
    }

    // nullptr nếu rỗng. O(1)
    T* front() { return head_ ? &head_->data : nullptr; }
    const T* front() const { return head_ ? &head_->data : nullptr; }
    T* back() { return tail_ ? &tail_->data : nullptr; }
    const T* back() const { return tail_ ? &tail_->data : nullptr; }

    // ---------------- Tìm / xoá theo điều kiện ----------------
    // Phần tử đầu tiên thoả pred, nullptr nếu không có. O(n)
    template <class Pred>
    T* findFirst(Pred pred) {
        for (Node* p = head_; p != nullptr; p = p->next)
            if (pred(p->data)) return &p->data;
        return nullptr;
    }

    template <class Pred>
    const T* findFirst(Pred pred) const {
        for (const Node* p = head_; p != nullptr; p = p->next)
            if (pred(p->data)) return &p->data;
        return nullptr;
    }

    // Xoá phần tử đầu tiên thoả pred. Tìm O(n) + gỡ O(1)
    template <class Pred>
    bool removeFirst(Pred pred) {
        for (Node* p = head_; p != nullptr; p = p->next) {
            if (pred(p->data)) {
                unlinkNode(p);
                return true;
            }
        }
        return false;
    }

    // Xoá mọi phần tử thoả pred, trả về số phần tử đã xoá. O(n)
    template <class Pred>
    int removeIf(Pred pred) {
        int removed = 0;
        Node* p = head_;
        while (p != nullptr) {
            Node* next = p->next;
            if (pred(p->data)) {
                unlinkNode(p);
                ++removed;
            }
            p = next;
        }
        return removed;
    }

    // Xoá phần tử tại it, trả về iterator tới phần tử kế tiếp. O(1)
    Iterator erase(Iterator it) {
        Node* n = it.node_;
        if (n == nullptr) return end();
        Node* next = n->next;
        unlinkNode(n);
        return Iterator(next);
    }

    // Chèn giữ thứ tự tăng dần theo less: chèn trước phần tử đầu tiên lớn hơn value
    // (phần tử bằng nhau giữ thứ tự chèn — ổn định). O(n)
    template <class Less>
    void insertSorted(const T& value, Less less) {
        Node* p = head_;
        while (p != nullptr && !less(value, p->data)) p = p->next;
        linkBefore(p, value);
    }

    // Gọi fn(phần tử) theo thứ tự từ đầu đến cuối. O(n)
    template <class Fn>
    void forEach(Fn fn) const {
        for (const Node* p = head_; p != nullptr; p = p->next) fn(p->data);
    }

    template <class Fn>
    void forEach(Fn fn) {
        for (Node* p = head_; p != nullptr; p = p->next) fn(p->data);
    }

    // ---------------- Duyệt ----------------
    Iterator begin() { return Iterator(head_); }                 // O(1)
    Iterator end() { return Iterator(nullptr); }                 // O(1)
    ConstIterator begin() const { return ConstIterator(head_); } // O(1)
    ConstIterator end() const { return ConstIterator(nullptr); } // O(1)

    // ---------------- Thông tin ----------------
    int size() const { return size_; }           // O(1)
    bool empty() const { return size_ == 0; }    // O(1)

    void clear() { // O(n)
        Node* p = head_;
        while (p != nullptr) {
            Node* next = p->next;
            delete p;
            p = next;
        }
        head_ = tail_ = nullptr;
        size_ = 0;
    }

    // Kiểm tra cấu trúc: liên kết prev/next khớp nhau, hai đầu đúng, số nút == size_. O(n)
    bool checkIntegrity() const {
        if (head_ == nullptr || tail_ == nullptr)
            return head_ == nullptr && tail_ == nullptr && size_ == 0;
        if (head_->prev != nullptr || tail_->next != nullptr) return false;
        int count = 0;
        const Node* last = nullptr;
        for (const Node* p = head_; p != nullptr; p = p->next) {
            if (p->prev != last) return false;
            last = p;
            if (++count > size_) return false; // chặn vòng lặp vô hạn nếu chuỗi bị vòng
        }
        if (last != tail_ || count != size_) return false;
        count = 0;
        for (const Node* p = tail_; p != nullptr; p = p->prev)
            if (++count > size_) return false;
        return count == size_;
    }
};

#endif // DOUBLY_LINKED_LIST_H
