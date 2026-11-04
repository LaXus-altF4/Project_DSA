#include "Storage.h"

#include <cstdio>
#include <fstream>

namespace {

const int MAX_COLS = 9;

std::string joinPath(const std::string& dir, const std::string& name) {
    if (dir.empty()) return name;
    char last = dir[dir.size() - 1];
    if (last == '/' || last == '\\') return dir + name;
    return dir + "/" + name;
}

// Đọc số nguyên có dấu, chỉ chấp nhận [-]chữ số, tối đa 18 chữ số (không ném ngoại lệ). O(len)
bool parseInt64(const std::string& s, long long* out) {
    size_t i = 0;
    bool neg = false;
    if (i < s.size() && s[i] == '-') { neg = true; ++i; }
    if (i >= s.size() || s.size() - i > 18) return false;
    long long v = 0;
    for (; i < s.size(); ++i) {
        if (s[i] < '0' || s[i] > '9') return false;
        v = v * 10 + (s[i] - '0');
    }
    *out = neg ? -v : v;
    return true;
}

bool parseInt(const std::string& s, int* out) {
    long long v = 0;
    if (!parseInt64(s, &v) || v < -2147483647LL || v > 2147483647LL) return false;
    *out = static_cast<int>(v);
    return true;
}

// Tách dòng theo ',' vào out[0..maxCols-1]; trả về số cột thật (có thể > maxCols nếu dòng thừa cột). O(len)
int splitCsv(const std::string& line, std::string* out, int maxCols) {
    for (int i = 0; i < maxCols; ++i) out[i].clear();
    int n = 0;
    for (char c : line) {
        if (c == ',') {
            ++n;
        } else if (n < maxCols) {
            out[n] += c;
        }
    }
    return n + 1;
}

// Tách danh sách mã ngăn bằng '|' (bỏ phần rỗng). O(len)
DoublyLinkedList<std::string> splitIds(const std::string& s) {
    DoublyLinkedList<std::string> ids;
    std::string cur;
    for (char c : s) {
        if (c == '|') {
            if (!cur.empty()) ids.pushBack(cur);
            cur.clear();
        } else {
            cur += c;
        }
    }
    if (!cur.empty()) ids.pushBack(cur);
    return ids;
}

void warn(LoadReport& rep, const std::string& file, int lineNo, const std::string& reason) {
    rep.warnings.pushBack(file + ":" + std::to_string(lineNo) + " — " + reason);
    ++rep.skippedLines;
}

OpResult bad(const std::string& message) {
    OpResult r;
    r.code = ErrorCode::InvalidInput;
    r.message = message;
    return r;
}

// Đọc một file CSV: bỏ dòng tiêu đề, dòng trống; cắt '\r'; dòng sai số cột hoặc bị fn từ chối → cảnh báo, bỏ qua.
// fn(const std::string* fields) trả OpResult. Trả false nếu không mở được file. O(số dòng)
template <class Fn>
bool readCsv(const std::string& dir, const std::string& name, int expectedCols, LoadReport& rep, Fn fn) {
    std::ifstream in(joinPath(dir, name), std::ios::binary);
    if (!in) {
        rep.warnings.pushBack("Không tìm thấy " + name + ", coi như rỗng");
        ++rep.missingFiles;
        return false;
    }
    std::string line, fields[MAX_COLS];
    int lineNo = 0;
    while (std::getline(in, line)) {
        ++lineNo;
        if (!line.empty() && line[line.size() - 1] == '\r') line.erase(line.size() - 1);
        if (lineNo == 1) continue; // tiêu đề
        if (line.empty()) continue;
        int cols = splitCsv(line, fields, MAX_COLS);
        if (cols != expectedCols) {
            warn(rep, name, lineNo, "cần " + std::to_string(expectedCols) + " cột, có " + std::to_string(cols));
            continue;
        }
        OpResult r = fn(fields);
        if (!r.ok()) warn(rep, name, lineNo, r.message);
    }
    return true;
}

// Ghi ra "<path>.tmp" rồi đổi tên thành path (Windows: phải xoá file cũ trước khi rename).
template <class Writer>
OpResult writeAtomic(const std::string& path, Writer writer) {
    OpResult res;
    std::string tmp = path + ".tmp";
    {
        std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
        if (!out) {
            res.code = ErrorCode::InvalidInput;
            res.message = "Không ghi được " + tmp + " (thư mục có tồn tại không?)";
            return res;
        }
        writer(out);
        out.flush();
        if (!out) {
            res.code = ErrorCode::InvalidInput;
            res.message = "Lỗi khi ghi " + tmp;
            return res;
        }
    }
    std::remove(path.c_str());
    if (std::rename(tmp.c_str(), path.c_str()) != 0) {
        res.code = ErrorCode::InvalidInput;
        res.message = "Không đổi tên được " + tmp + " thành " + path;
    }
    return res;
}

} // namespace

LoadReport Storage::load(const std::string& dir, LabManager& lab) {
    LoadReport rep;

    // meta.csv: key,value — now, nextRecordNo.
    long long nowHour = 0;
    long long nextNo = 1;
    readCsv(dir, "meta.csv", 2, rep, [&](const std::string* f) -> OpResult {
        long long v = 0;
        if (!parseInt64(f[1], &v) || v < 0) return bad("giá trị không phải số không âm: " + f[1]);
        if (f[0] == "now") nowHour = v;
        else if (f[0] == "nextRecordNo") nextNo = v;
        else return bad("khoá không biết: " + f[0]);
        return OpResult();
    });
    lab.restoreMeta(nowHour, nextNo > 2000000000LL ? 1 : static_cast<int>(nextNo));

    // devices.csv: id,name,total,maintenance
    readCsv(dir, "devices.csv", 4, rep, [&](const std::string* f) -> OpResult {
        int total = 0, maint = 0;
        if (!parseInt(f[2], &total) || !parseInt(f[3], &maint)) return bad("số lượng không phải số");
        OpResult r = lab.restoreDevice(f[0], f[1], total, maint);
        if (r.ok()) ++rep.devices;
        return r;
    });

    // borrow_records.csv: recordId,studentId,studentName,deviceIds,borrowHour,dueHour,returnHour,lateDays,fine
    readCsv(dir, "borrow_records.csv", 9, rep, [&](const std::string* f) -> OpResult {
        BorrowRecord rec;
        rec.recordId = f[0];
        rec.studentId = f[1];
        rec.studentName = f[2];
        rec.deviceIds = splitIds(f[3]);
        if (!parseInt64(f[4], &rec.borrowHour) || !parseInt64(f[5], &rec.dueHour) ||
            !parseInt64(f[6], &rec.returnHour) || !parseInt(f[7], &rec.lateDays) || !parseInt64(f[8], &rec.fine))
            return bad("có cột số không hợp lệ");
        OpResult r = lab.restoreRecord(rec);
        if (r.ok()) ++rep.records;
        return r;
    });

    // reservations.csv: deviceId,studentId,studentName,enqueueHour,holdUntil,missCount (đúng thứ tự trong hàng)
    readCsv(dir, "reservations.csv", 6, rep, [&](const std::string* f) -> OpResult {
        Reservation r;
        r.studentId = f[1];
        r.studentName = f[2];
        if (!parseInt64(f[3], &r.enqueueHour) || !parseInt64(f[4], &r.holdUntil) || !parseInt(f[5], &r.missCount))
            return bad("có cột số không hợp lệ");
        OpResult res = lab.restoreReservation(f[0], r);
        if (res.ok()) ++rep.reservations;
        return res;
    });

    rep.invariantsOk = lab.finishRestore();
    if (!rep.invariantsOk) rep.warnings.pushBack("CẢNH BÁO: dữ liệu sau khi nạp vi phạm bất biến (checkInvariants)");
    return rep;
}

OpResult Storage::save(const std::string& dir, const LabManager& lab) {
    OpResult r = writeAtomic(joinPath(dir, "devices.csv"), [&](std::ostream& out) {
        out << "id,name,total,maintenance\n";
        lab.forEachDevice([&](const Device& d) { out << d.id << ',' << d.name << ',' << d.total << ',' << d.maintenance << '\n'; });
    });
    if (!r.ok()) return r;

    r = writeAtomic(joinPath(dir, "borrow_records.csv"), [&](std::ostream& out) {
        out << "recordId,studentId,studentName,deviceIds,borrowHour,dueHour,returnHour,lateDays,fine\n";
        lab.forEachRecord([&](const BorrowRecord& rec) {
            out << rec.recordId << ',' << rec.studentId << ',' << rec.studentName << ',';
            bool first = true;
            for (const std::string& id : rec.deviceIds) {
                if (!first) out << '|';
                out << id;
                first = false;
            }
            out << ',' << rec.borrowHour << ',' << rec.dueHour << ',' << rec.returnHour << ',' << rec.lateDays << ','
                << rec.fine << '\n';
        });
    });
    if (!r.ok()) return r;

    r = writeAtomic(joinPath(dir, "reservations.csv"), [&](std::ostream& out) {
        out << "deviceId,studentId,studentName,enqueueHour,holdUntil,missCount\n";
        lab.forEachDevice([&](const Device& d) {
            lab.forEachReservation(d.id, [&](const Reservation& q) {
                out << d.id << ',' << q.studentId << ',' << q.studentName << ',' << q.enqueueHour << ',' << q.holdUntil
                    << ',' << q.missCount << '\n';
            });
        });
    });
    if (!r.ok()) return r;

    return writeAtomic(joinPath(dir, "meta.csv"), [&](std::ostream& out) {
        out << "key,value\nnow," << lab.now() << "\nnextRecordNo," << lab.nextRecordNo() << '\n';
    });
}

bool Storage::hasAnyData(const std::string& dir) {
    static const char* names[4] = {"devices.csv", "borrow_records.csv", "reservations.csv", "meta.csv"};
    for (const char* n : names) {
        std::ifstream in(joinPath(dir, n), std::ios::binary);
        if (in) return true;
    }
    return false;
}
