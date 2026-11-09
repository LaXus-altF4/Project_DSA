/**
 * device-images.js - Icon thiết bị & minh hoạ trạng thái trống (SVG vẽ tay, Đợt 7)
 *
 * Nhúng bằng <svg><use href="...svg#i"/></svg> (không dùng <img>) để icon thừa hưởng
 * currentColor và biến CSS --di-* của theme Sáng/Tối. File phục vụ từ web/assets/ (offline).
 * Chỉ trình bày: không chứa logic nghiệp vụ.
 */

const DEVICE_DIR = 'assets/devices/';
const ILLUS_DIR = 'assets/illustrations/';

// 18 mã có icon riêng (data/devices.csv). Mã khác dùng generic.svg.
const KNOWN_DEVICE_IDS = new Set([
  'ARD01', 'BK01', 'BRD01', 'CAM01', 'DMM01', 'ESP01', 'JMP01', 'LAP01', 'OSC01',
  'PRB01', 'PRJ01', 'PSU01', 'RPI01', 'SDC01', 'SEN01', 'SLD01', 'TC01', 'VR01'
]);

const ILLUSTRATIONS = new Set([
  'empty-basket', 'empty-queue', 'no-overdue', 'no-results', 'connection-error'
]);

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Đường dẫn file icon theo mã thiết bị; thiếu/mã lạ trả generic.svg. */
export function getDeviceIconUrl(deviceId) {
  const id = String(deviceId == null ? '' : deviceId).trim().toUpperCase();
  return DEVICE_DIR + (KNOWN_DEVICE_IDS.has(id) ? id : 'generic') + '.svg';
}

function a11yAttrs(label) {
  return label ? `role="img" aria-label="${escapeAttr(label)}"` : 'aria-hidden="true" focusable="false"';
}

/** Chuỗi HTML <svg> icon thiết bị, kích thước cố định size×size (không giật bố cục). */
export function deviceIconHtml(deviceId, { size = 40, label = '' } = {}) {
  const px = Math.max(8, Math.round(Number(size) || 40));
  return `<svg class="device-icon" width="${px}" height="${px}" viewBox="0 0 64 64" style="width:${px}px;height:${px}px" ${a11yAttrs(label)}>` +
    `<use href="${getDeviceIconUrl(deviceId)}#i"></use></svg>`;
}

/** Chuỗi HTML <svg> minh hoạ trạng thái trống (240×160). Tên lạ trả chuỗi rỗng. */
export function illustrationHtml(name, { alt = '' } = {}) {
  if (!ILLUSTRATIONS.has(name)) return '';
  return `<svg class="empty-illus" width="240" height="160" viewBox="0 0 240 160" ${a11yAttrs(alt)}>` +
    `<use href="${ILLUS_DIR}${name}.svg#i"></use></svg>`;
}
