#ifndef LINKED_QUEUE_H
#define LINKED_QUEUE_H

#include <utility> // std::swap

// Hàng đợi FIFO tự cài đặt bằng danh sách liên kết đơn có con trỏ đầu (head_) và cuối (tail_).
// Hàng đợi chỉ cần đi một chiều (từ đầu về cuối) nên dùng liên kết đơn, tiết kiệm một con trỏ mỗi nút.
// Dùng cho Reservation Queue của từng thiết bị và hàng thông báo (Notification).
template <typename T>
class LinkedQueue {
private:
    struct Node {
        T data;
        Node* next;
        explicit Node(const T& value) : data(value), next(nullptr) {}
    };

    Node* head_; // đầu hàng (người được phục vụ trước)
    Node* tail_; // cuối hàng
    int size_;

    // Nối nút n (đã tách rời) vào cuối hàng. O(1)
    void linkBack(Node* n) {
        n->next = nullptr;
        if (tail_) tail_->next = n; else head_ = n;
        tail_ = n;
    }

public:
    LinkedQueue() : head_(nullptr), tail_(nullptr), size_(0) {} // O(1)

    // Sao chép sâu, giữ nguyên thứ tự. O(n)
    LinkedQueue(const LinkedQueue& other) : head_(nullptr), tail_(nullptr), size_(0) {
        for (const Node* p = other.head_; p != nullptr; p = p->next) enqueue(p->data);
    }

    // Di chuyển: lấy chuỗi nút của other, other thành rỗng. O(1)
    LinkedQueue(LinkedQueue&& other) noexcept
        : head_(other.head_), tail_(other.tail_), size_(other.size_) {
        other.head_ = other.tail_ = nullptr;
        other.size_ = 0;
    }

    // Gán (copy-and-swap, an toàn khi tự gán). Sao chép O(n), di chuyển O(1) + huỷ dữ liệu cũ O(n)
    LinkedQueue& operator=(LinkedQueue other) noexcept {
        swap(other);
        return *this;
    }

    ~LinkedQueue() { clear(); } // O(n)

    void swap(LinkedQueue& other) noexcept { // O(1)
        std::swap(head_, other.head_);
        std::swap(tail_, other.tail_);
        std::swap(size_, other.size_);
    }

    // Thêm vào cuối hàng. O(1)
    void enqueue(const T& value) {
        linkBack(new Node(value));
        ++size_;
    }

    // Lấy phần tử đầu hàng ra (chép vào *out nếu out != nullptr). false nếu hàng rỗng. O(1)
    bool dequeue(T* out = nullptr) {
        if (head_ == nullptr) return false;
        Node* n = head_;
        if (out) *out = n->data;
        head_ = n->next;
        if (head_ == nullptr) tail_ = nullptr;
        delete n;
        --size_;
        return true;
    }

    // Phần tử đầu hàng, nullptr nếu rỗng. O(1)
    T* front() { return head_ ? &head_->data : nullptr; }
    const T* front() const { return head_ ? &head_->data : nullptr; }

    // "Đẩy xuống cuối hàng": chuyển nút đầu ra cuối bằng cách nối lại con trỏ,
    // không cấp phát/giải phóng. Hàng có <= 1 phần tử thì không đổi. O(1)
    void moveFrontToBack() {
        if (head_ == nullptr || head_ == tail_) return;
        Node* n = head_;
        head_ = n->next;
        linkBack(n);
    }

    // Phần tử đầu tiên (tính từ đầu hàng) thoả pred, nullptr nếu không có. O(n)
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

    // Gỡ phần tử đầu tiên thoả pred ở bất kỳ vị trí nào (người đang giữ nhận/huỷ khi không đứng đầu).
    // Giữ con trỏ nút trước để nối lại; cập nhật tail_ nếu gỡ nút cuối. O(n)
    template <class Pred>
    bool removeFirst(Pred pred) {
        Node* prev = nullptr;
        for (Node* p = head_; p != nullptr; prev = p, p = p->next) {
            if (pred(p->data)) {
                if (prev) prev->next = p->next; else head_ = p->next;
                if (p == tail_) tail_ = prev;
                delete p;
                --size_;
                return true;
            }
        }
        return false;
    }

    // Gọi fn(phần tử) theo thứ tự từ đầu đến cuối hàng. O(n)
    template <class Fn>
    void forEach(Fn fn) const {
        for (const Node* p = head_; p != nullptr; p = p->next) fn(p->data);
    }

    template <class Fn>
    void forEach(Fn fn) {
        for (Node* p = head_; p != nullptr; p = p->next) fn(p->data);
    }

    int size() const { return size_; }        // O(1)
    bool empty() const { return size_ == 0; } // O(1)

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

    // Kiểm tra cấu trúc: số nút == size_, tail_ đúng là nút cuối. O(n)
    bool checkIntegrity() const {
        if (head_ == nullptr || tail_ == nullptr)
            return head_ == nullptr && tail_ == nullptr && size_ == 0;
        if (tail_->next != nullptr) return false;
        int count = 0;
        const Node* last = nullptr;
        for (const Node* p = head_; p != nullptr; p = p->next) {
            last = p;
            if (++count > size_) return false; // chặn vòng lặp vô hạn
        }
        return last == tail_ && count == size_;
    }
};

#endif // LINKED_QUEUE_H
