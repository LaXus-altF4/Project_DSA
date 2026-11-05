/**
 * Mock API Adapter - Dữ liệu giả lập đúng 100% đặc tả docs/api.md
 * Kích hoạt khi URL có ?mock=1 hoặc được cấu hình bật.
 */

export const isMockEnabled = () => {
  return window.location.search.includes('mock=1') || localStorage.getItem('lab_use_mock') === 'true';
};

// Trạng thái dữ liệu giả lập trong bộ nhớ
const mockState = {
  clock: { hour: 1528, text: "03/03/2026 16:00" },
  notifications: [
    {
      type: "hold_granted",
      studentId: "25120103",
      studentName: "Phạm Gia Huy",
      deviceId: "VR01",
      deviceName: "Kính thực tế ảo",
      hour: 1520,
      hourText: "03/03/2026 08:00",
      holdUntil: 1544,
      holdUntilText: "04/03/2026 08:00",
      message: "Phạm Gia Huy (25120103) được quyền nhận VR01 (hạn đến 04/03/2026 08:00)"
    }
  ],
  devices: [
    { id: "VR01", name: "Kính thực tế ảo", total: 2, available: 0, borrowed: 1, onHold: 1, maintenance: 0, status: "borrowed", timesBorrowed: 13, queueLength: 2 },
    { id: "TC01", name: "Tay cầm điều khiển VR", total: 5, available: 3, borrowed: 2, onHold: 0, maintenance: 0, status: "available", timesBorrowed: 10, queueLength: 0 },
    { id: "PSU01", name: "Nguồn DC điều chỉnh", total: 6, available: 4, borrowed: 2, onHold: 0, maintenance: 0, status: "available", timesBorrowed: 8, queueLength: 0 },
    { id: "DMM01", name: "Đồng hồ vạn năng số", total: 10, available: 6, borrowed: 4, onHold: 0, maintenance: 0, status: "available", timesBorrowed: 6, queueLength: 0 },
    { id: "OSC01", name: "Máy hiện sóng số 100MHz", total: 4, available: 1, borrowed: 2, onHold: 0, maintenance: 1, status: "available", timesBorrowed: 5, queueLength: 0 },
    { id: "RPI01", name: "Raspberry Pi 4 Model B", total: 8, available: 0, borrowed: 8, onHold: 0, maintenance: 0, status: "borrowed", timesBorrowed: 12, queueLength: 1 },
    { id: "ARD01", name: "Arduino Uno R3", total: 15, available: 12, borrowed: 3, onHold: 0, maintenance: 0, status: "available", timesBorrowed: 9, queueLength: 0 },
    { id: "CAB01", name: "Cáp USB Type-C sang C", total: 20, available: 18, borrowed: 2, onHold: 0, maintenance: 0, status: "available", timesBorrowed: 11, queueLength: 0 },
    { id: "ROB01", name: "Kit cánh tay robot 4 bậc", total: 3, available: 0, borrowed: 0, onHold: 0, maintenance: 3, status: "maintenance", timesBorrowed: 4, queueLength: 0 },
    { id: "SEN01", name: "Module cảm biến LiDAR 360", total: 4, available: 3, borrowed: 1, onHold: 0, maintenance: 0, status: "available", timesBorrowed: 3, queueLength: 0 }
  ],
  reservations: {
    "VR01": [
      {
        position: 1,
        studentId: "25120103",
        studentName: "Phạm Gia Huy",
        enqueueHour: 1452,
        enqueueText: "01/03/2026 12:00",
        holding: true,
        holdUntil: 1544,
        holdUntilText: "04/03/2026 08:00",
        hoursLeft: 16,
        missCount: 0
      },
      {
        position: 2,
        studentId: "25120150",
        studentName: "Lê Minh Châu",
        enqueueHour: 1500,
        enqueueText: "02/03/2026 12:00",
        holding: false,
        holdUntil: null,
        holdUntilText: null,
        hoursLeft: null,
        missCount: 0
      }
    ],
    "RPI01": [
      {
        position: 1,
        studentId: "25120199",
        studentName: "Trần Văn An",
        enqueueHour: 1520,
        enqueueText: "03/03/2026 08:00",
        holding: false,
        holdUntil: null,
        holdUntilText: null,
        hoursLeft: null,
        missCount: 0
      }
    ]
  },
  records: [
    {
      recordId: "PM0055",
      studentId: "25120104",
      studentName: "Nguyễn Thị Lan",
      devices: [
        { id: "PSU01", name: "Nguồn DC điều chỉnh", deleted: false },
        { id: "DMM01", name: "Đồng hồ vạn năng số", deleted: false }
      ],
      borrowHour: 1236,
      borrowText: "21/02/2026 12:00",
      dueHour: 1332,
      dueText: "25/02/2026 12:00",
      returnHour: null,
      returnText: null,
      open: true,
      overdue: true,
      lateDays: 9,
      fine: 648000,
      fineFinal: false
    },
    {
      recordId: "PM0042",
      studentId: "25120120",
      studentName: "Trần Minh Đức",
      devices: [
        { id: "VR01", name: "Kính thực tế ảo", deleted: false }
      ],
      borrowHour: 1450,
      borrowText: "26/02/2026 10:00",
      dueHour: 1498,
      dueText: "28/02/2026 10:00",
      returnHour: null,
      returnText: null,
      open: true,
      overdue: true,
      lateDays: 2,
      fine: 72000,
      fineFinal: false
    },
    {
      recordId: "PM0030",
      studentId: "25120111",
      studentName: "Lê Văn Cường",
      devices: [
        { id: "TC01", name: "Tay cầm điều khiển VR", deleted: false }
      ],
      borrowHour: 1510,
      borrowText: "02/03/2026 22:00",
      dueHour: 1678,
      dueText: "09/03/2026 22:00",
      returnHour: null,
      returnText: null,
      open: true,
      overdue: false,
      lateDays: 0,
      fine: 0,
      fineFinal: false
    }
  ],
  graph: {
    nodes: [
      { id: "VR01", name: "Kính thực tế ảo", status: "borrowed", timesBorrowed: 13 },
      { id: "TC01", name: "Tay cầm điều khiển VR", status: "available", timesBorrowed: 10 },
      { id: "CAB01", name: "Cáp USB Type-C", status: "available", timesBorrowed: 11 },
      { id: "PSU01", name: "Nguồn DC điều chỉnh", status: "available", timesBorrowed: 8 },
      { id: "DMM01", name: "Đồng hồ vạn năng", status: "available", timesBorrowed: 6 },
      { id: "RPI01", name: "Raspberry Pi 4", status: "borrowed", timesBorrowed: 12 }
    ],
    edges: [
      { from: "TC01", to: "VR01", weight: 10 },
      { from: "CAB01", to: "VR01", weight: 5 },
      { from: "CAB01", to: "TC01", weight: 3 },
      { from: "DMM01", to: "PSU01", weight: 6 },
      { from: "CAB01", to: "RPI01", weight: 4 }
    ]
  }
};

/**
 * Xử lý request giả lập
 */
export async function handleMockRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(endpoint, 'http://localhost');
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  // Giả lập trễ mạng nhẹ (60ms) để giống gọi API thật
  await new Promise(r => setTimeout(r, 60));

  // 1. GET /api/clock
  if (pathname === '/api/clock' && method === 'GET') {
    return { status: 200, body: mockState.clock };
  }

  // 2. POST /api/clock/advance
  if (pathname === '/api/clock/advance' && method === 'POST') {
    const data = JSON.parse(options.body || '{}');
    const hours = Number(data.hours || 1);
    mockState.clock.hour += hours;
    
    // Cập nhật text ngày giờ đơn giản
    const d = new Date(2026, 0, 1, 0, 0, 0);
    d.setHours(d.getHours() + mockState.clock.hour);
    const pad = n => String(n).padStart(2, '0');
    mockState.clock.text = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:00`;

    // Cập nhật hoursLeft cho người đang giữ
    let pending = 0;
    for (const devId in mockState.reservations) {
      const q = mockState.reservations[devId];
      if (q && q.length > 0 && q[0].holding) {
        q[0].hoursLeft = Math.max(0, q[0].hoursLeft - hours);
        if (q[0].hoursLeft === 0) {
          // Bị lỡ hạn
          const missedPerson = q.shift();
          missedPerson.missCount += 1;
          if (missedPerson.missCount < 2) {
            missedPerson.holding = false;
            missedPerson.hoursLeft = null;
            q.push(missedPerson);
            mockState.notifications.push({
              type: "missed",
              studentId: missedPerson.studentId,
              studentName: missedPerson.studentName,
              deviceId: devId,
              deviceName: "Thiết bị " + devId,
              hour: mockState.clock.hour,
              hourText: mockState.clock.text,
              holdUntil: null,
              holdUntilText: null,
              message: `${missedPerson.studentName} (${missedPerson.studentId}) lỡ hạn nhận ${devId}, bị đẩy xuống cuối hàng`
            });
            pending++;
          } else {
            mockState.notifications.push({
              type: "removed",
              studentId: missedPerson.studentId,
              studentName: missedPerson.studentName,
              deviceId: devId,
              deviceName: "Thiết bị " + devId,
              hour: mockState.clock.hour,
              hourText: mockState.clock.text,
              holdUntil: null,
              holdUntilText: null,
              message: `${missedPerson.studentName} (${missedPerson.studentId}) lỡ hạn lần 2 đối với ${devId}, bị loại khỏi hàng`
            });
            pending++;
          }
        }
      }
    }

    return {
      status: 200,
      body: {
        clock: mockState.clock,
        pendingNotifications: mockState.notifications.length
      }
    };
  }

  // 3. GET /api/notifications
  if (pathname === '/api/notifications' && method === 'GET') {
    const list = [...mockState.notifications];
    mockState.notifications = []; // Lấy và xoá
    return { status: 200, body: { notifications: list } };
  }

  // 4. GET /api/stats
  if (pathname === '/api/stats' && method === 'GET') {
    return {
      status: 200,
      body: {
        clock: mockState.clock,
        deviceCount: mockState.devices.length,
        totalUnits: mockState.devices.reduce((acc, d) => acc + d.total, 0),
        available: mockState.devices.reduce((acc, d) => acc + d.available, 0),
        borrowed: mockState.devices.reduce((acc, d) => acc + d.borrowed, 0),
        onHold: mockState.devices.reduce((acc, d) => acc + d.onHold, 0),
        maintenance: mockState.devices.reduce((acc, d) => acc + d.maintenance, 0),
        maintenanceDevices: mockState.devices.filter(d => d.status === 'maintenance').length,
        openRecords: mockState.records.filter(r => r.open).length,
        overdueRecords: mockState.records.filter(r => r.overdue).length,
        pendingFines: mockState.records.reduce((acc, r) => acc + r.fine, 0),
        waitingPeople: 2,
        holdingPeople: 1,
        topBorrowed: mockState.devices.slice(0, 5).map(d => ({ id: d.id, name: d.name, timesBorrowed: d.timesBorrowed })),
        expiringHolds: [
          {
            deviceId: "VR01",
            deviceName: "Kính thực tế ảo",
            studentId: "25120103",
            studentName: "Phạm Gia Huy",
            holdUntil: 1544,
            holdUntilText: "04/03/2026 08:00",
            hoursLeft: 16,
            missCount: 0
          }
        ]
      }
    };
  }

  // 5. GET /api/devices
  if (pathname === '/api/devices' && method === 'GET') {
    const q = searchParams.get('query') || '';
    const st = searchParams.get('status') || '';
    let filtered = mockState.devices;
    if (q) {
      filtered = filtered.filter(d => d.id.toLowerCase().includes(q.toLowerCase()) || d.name.toLowerCase().includes(q.toLowerCase()));
    }
    if (st) {
      filtered = filtered.filter(d => d.status === st);
    }
    return { status: 200, body: { count: filtered.length, devices: filtered } };
  }

  // 6. GET /api/devices/{id}
  const deviceDetailMatch = pathname.match(/^\/api\/devices\/([^/]+)$/);
  if (deviceDetailMatch && method === 'GET') {
    const devId = deviceDetailMatch[1];
    const dev = mockState.devices.find(d => d.id === devId);
    if (!dev) {
      return { status: 404, body: { error: { code: "DEVICE_NOT_FOUND", message: `Không tìm thấy thiết bị: ${devId}` } } };
    }
    return {
      status: 200,
      body: {
        device: dev,
        queue: mockState.reservations[devId] || [],
        nextQueuePosition: (mockState.reservations[devId] || []).length + 1,
        suggestions: [
          { id: "TC01", name: "Tay cầm điều khiển VR", weight: 10, status: "available", available: 3, outOfStock: false }
        ]
      }
    };
  }

  // 7. GET /api/records
  if (pathname === '/api/records' && method === 'GET') {
    const status = searchParams.get('status') || 'all';
    const query = (searchParams.get('query') || '').toLowerCase();
    let list = [...mockState.records];

    if (status === 'open') {
      list = list.filter(r => r.open);
    } else if (status === 'overdue') {
      list = list.filter(r => r.open && r.overdue);
    } else if (status === 'returned') {
      list = list.filter(r => !r.open);
    }

    if (query) {
      list = list.filter(r =>
        (r.recordId && r.recordId.toLowerCase().includes(query)) ||
        (r.studentId && r.studentId.toLowerCase().includes(query)) ||
        (r.studentName && r.studentName.toLowerCase().includes(query))
      );
    }

    return {
      status: 200,
      body: {
        page: 1,
        pageSize: 50,
        total: list.length,
        totalPages: 1,
        records: list
      }
    };
  }

  // 7.1 GET /api/records/{id}
  const recordDetailMatch = pathname.match(/^\/api\/records\/([^/]+)$/);
  if (recordDetailMatch && method === 'GET') {
    const recId = recordDetailMatch[1];
    const rec = mockState.records.find(r => r.recordId.toLowerCase() === recId.toLowerCase());
    if (!rec) {
      return { status: 404, body: { error: { code: "RECORD_NOT_FOUND", message: `Không tìm thấy phiếu mượn: ${recId}` } } };
    }
    return { status: 200, body: { record: rec } };
  }

  // 7.2 POST /api/return
  if (pathname === '/api/return' && method === 'POST') {
    const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : {};
    const recId = body.recordId;
    const rec = mockState.records.find(r => r.recordId === recId);
    if (!rec) {
      return { status: 404, body: { error: { code: "RECORD_NOT_FOUND", message: `Không tìm thấy phiếu mượn: ${recId}` } } };
    }
    if (!rec.open) {
      return { status: 409, body: { error: { code: "ALREADY_RETURNED", message: `Phiếu mượn ${recId} đã được trả trước đó` } } };
    }

    rec.open = false;
    rec.returnHour = mockState.clock.hour;
    rec.returnText = mockState.clock.text;
    rec.fineFinal = true;

    // Phục vụ hàng đợi cho các món trong phiếu vừa trả
    for (const d of rec.devices) {
      const dev = mockState.devices.find(x => x.id === d.id);
      if (dev) {
        dev.borrowed = Math.max(0, dev.borrowed - 1);
        const q = mockState.reservations[d.id];
        if (q && q.length > 0) {
          const firstUnheld = q.find(p => !p.holding);
          if (firstUnheld) {
            firstUnheld.holding = true;
            firstUnheld.holdUntil = mockState.clock.hour + 24;
            firstUnheld.holdUntilText = "Sau 24 giờ";
            firstUnheld.hoursLeft = 24;
            dev.onHold = (dev.onHold || 0) + 1;
            mockState.notifications.push({
              type: "hold_granted",
              studentId: firstUnheld.studentId,
              studentName: firstUnheld.studentName,
              deviceId: d.id,
              deviceName: dev.name,
              hour: mockState.clock.hour,
              hourText: mockState.clock.text,
              holdUntil: firstUnheld.holdUntil,
              holdUntilText: firstUnheld.holdUntilText,
              message: `${firstUnheld.studentName} (${firstUnheld.studentId}) được quyền nhận ${dev.name} (${d.id}) trong 24 giờ`
            });
          } else {
            dev.available += 1;
          }
        } else {
          dev.available += 1;
        }
      }
    }

    return { status: 200, body: { record: rec } };
  }

  // 8. GET /api/reservations/{deviceId}
  const reservationsMatch = pathname.match(/^\/api\/reservations\/([^/]+)$/);
  if (reservationsMatch && method === 'GET') {
    const devId = reservationsMatch[1];
    const dev = mockState.devices.find(d => d.id === devId);
    return {
      status: 200,
      body: {
        device: dev || { id: devId, name: devId, total: 1, available: 0, borrowed: 1, onHold: 0, maintenance: 0, status: "borrowed" },
        queue: mockState.reservations[devId] || []
      }
    };
  }

  // 9. GET /api/graph
  if (pathname === '/api/graph' && method === 'GET') {
    return { status: 200, body: mockState.graph };
  }

  // Endpoint mặc định không khớp
  return {
    status: 404,
    body: { error: { code: "NOT_FOUND", message: `Không tìm thấy endpoint giả lập: ${pathname}` } }
  };
}
