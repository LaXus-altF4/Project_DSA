/**
 * api.js - Điểm tập trung duy nhất cho mọi cuộc gọi HTTP đến backend.
 * Xử lý hợp nhất lỗi theo error.code, error.message và hỗ trợ ?mock=1.
 */

import { isMockEnabled, handleMockRequest } from './mock.js';
import { showToast } from './ui/toast.js';

export class ApiError extends Error {
  constructor(code, message, details = null, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

/**
 * Hàm gọi API gốc
 * @param {string} path - Đường dẫn bắt đầu từ /api/ (hoặc tương đối)
 * @param {object} options - Fetch options (method, headers, body...)
 * @returns {Promise<any>}
 */
export async function apiRequest(path, options = {}) {
  const fullPath = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : '/' + path}`;

  // Kiểm tra chế độ Mock giả lập
  if (isMockEnabled()) {
    try {
      const mockRes = await handleMockRequest(fullPath, options);
      if (mockRes.status >= 400) {
        const err = mockRes.body.error || {};
        throw new ApiError(err.code || 'MOCK_ERROR', err.message || 'Lỗi giả lập', err.details, mockRes.status);
      }
      return mockRes.body;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('MOCK_EXCEPTION', err.message || 'Lỗi không xác định trong mock', null, 500);
    }
  }

  // Gọi fetch thật tới C++ API Server
  const defaultHeaders = {
    'Accept': 'application/json'
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json; charset=utf-8';
    options.body = JSON.stringify(options.body);
  }

  const finalOptions = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {})
    }
  };

  let response;
  try {
    response = await fetch(fullPath, finalOptions);
  } catch (networkError) {
    const errorMsg = 'Không thể kết nối đến máy chủ API. Vui lòng kiểm tra xem LabApp.exe đã chạy chưa.';
    showToast(errorMsg, 'error');
    throw new ApiError('NETWORK_ERROR', errorMsg, null, 0);
  }

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (parseError) {
      const errorMsg = 'Phản hồi từ máy chủ không phải là JSON hợp lệ.';
      showToast(errorMsg, 'error');
      throw new ApiError('BAD_JSON', errorMsg, null, response.status);
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errObj = (data && data.error) ? data.error : {};
    const code = errObj.code || `HTTP_${response.status}`;
    const message = errObj.message || `Lỗi máy chủ (${response.status}): ${response.statusText}`;
    const details = errObj.details || null;

    // Ném lỗi cấu trúc để bên gọi bắt được
    const apiError = new ApiError(code, message, details, response.status);
    throw apiError;
  }

  return data;
}

// Các hàm tiện ích
export const api = {
  get: (path) => apiRequest(path, { method: 'GET' }),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  delete: (path) => apiRequest(path, { method: 'DELETE' })
};
