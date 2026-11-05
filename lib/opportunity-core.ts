// Logic thuần của phân hệ Cơ hội bán hàng: phân quyền theo phạm vi, kiểm tra dữ liệu, so sánh thay đổi, thống kê.
// KHÔNG phụ thuộc Firebase/trình duyệt để dùng chung ở server (API) và client (giao diện) và kiểm thử độc lập.
import { safeCell, toCsv } from './customer-io-core';

export type OppStatus = 'open' | 'won' | 'lost';
export const STATUS_LABEL: Record<OppStatus, string> = { open: 'Đang mở', won: 'Thành công', lost: 'Thất bại' };
export const LOST_REASONS = ['Giá cao', 'Chọn đối thủ', 'Không có ngân sách', 'Không còn nhu cầu', 'Không liên lạc được', 'Khác'];
export const OPP_SOURCES = ['Website', 'Google', 'Facebook', 'Zalo', 'Giới thiệu', 'Khách hàng cũ', 'Đối tác', 'Sự kiện', 'Nhập thủ công', 'Khác'];

// ---- GIẢ ĐỊNH PHÂN QUYỀN (chưa có đặc tả Sales) — chỉnh tại đây ----
export const WRITE_ROLES = ['super_admin', 'director', 'manager', 'sales'];
export const MANAGER_ROLES = ['super_admin', 'director', 'manager'];

export interface Actor { uid: string; role: string; departmentId: string | null }
export type Scope = { kind: 'company' } | { kind: 'department'; departmentId: string } | { kind: 'own'; uid: string } | { kind: 'none'; reason: string };
export function scopeOf(a: Actor): Scope {
  if (a.role === 'super_admin' || a.role === 'director') return { kind: 'company' };
  if (a.role === 'manager') return a.departmentId ? { kind: 'department', departmentId: a.departmentId } : { kind: 'none', reason: 'Tài khoản chưa được gán phòng ban. Vui lòng liên hệ quản trị viên.' };
  if (a.role === 'sales') return { kind: 'own', uid: a.uid };
  return { kind: 'none', reason: 'Vai trò của bạn chưa được cấp quyền xem cơ hội bán hàng.' };
}
export interface Owned { ownerUid: string; departmentId: string | null }
export function inScope(s: Scope, o: Owned): boolean {
  if (s.kind === 'company') return true;
  if (s.kind === 'department') return o.departmentId === s.departmentId;
  if (s.kind === 'own') return o.ownerUid === s.uid;
  return false;
}
type OwnedStatus = Owned & { status: OppStatus };
const ok = (a: Actor) => scopeOf(a).kind !== 'none';
export const can = {
  create: (a: Actor) => WRITE_ROLES.includes(a.role) && ok(a),
  edit: (a: Actor, o: OwnedStatus) => can.create(a) && inScope(scopeOf(a), o) && o.status === 'open',
  close: (a: Actor, o: OwnedStatus) => can.edit(a, o),
  assign: (a: Actor, o: OwnedStatus) => MANAGER_ROLES.includes(a.role) && inScope(scopeOf(a), o) && o.status === 'open',
  reopen: (a: Actor, o: OwnedStatus) => MANAGER_ROLES.includes(a.role) && inScope(scopeOf(a), o) && o.status !== 'open',
  remove: (a: Actor, o: OwnedStatus) => MANAGER_ROLES.includes(a.role) && inScope(scopeOf(a), o),
  export: (a: Actor) => MANAGER_ROLES.includes(a.role) && ok(a),
};
/** Người nhận phụ trách hợp lệ đối với người thực hiện phân công */
export function assignable(a: Actor, t: { role: string; status: string; departmentId: string | null }): boolean {
  if (t.status !== 'active' || !WRITE_ROLES.includes(t.role) || !MANAGER_ROLES.includes(a.role)) return false;
  // Người nhận phải có phạm vi xem hợp lệ, nếu không cơ hội sẽ "mồ côi" (chính người phụ trách cũng không thấy)
  if (scopeOf({ uid: '', role: t.role, departmentId: t.departmentId }).kind === 'none') return false;
  const s = scopeOf(a);
  return s.kind === 'company' || (s.kind === 'department' && t.departmentId === s.departmentId);
}

// ---- Dữ liệu & kiểm tra ----
export interface OppInput { title: string; customerId: string; description: string; value: number; probability: number; expectedCloseDate: string | null; source: string }
type R<T> = { ok: true; value: T } | { ok: false; error: string };
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime()) && new Date(s + 'T00:00:00Z').toISOString().startsWith(s);
export function parseInput(raw: unknown): R<OppInput> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const title = str(b.title), customerId = str(b.customerId), description = typeof b.description === 'string' ? b.description.trim() : '';
  if (!title) return { ok: false, error: 'Vui lòng nhập tên cơ hội.' };
  if (title.length > 200) return { ok: false, error: 'Tên cơ hội tối đa 200 ký tự.' };
  if (!customerId) return { ok: false, error: 'Vui lòng chọn khách hàng.' };
  if (description.length > 2000) return { ok: false, error: 'Mô tả tối đa 2000 ký tự.' };
  const value = typeof b.value === 'string' ? Number(b.value.replace(/[.,\s]/g, '')) : b.value === undefined ? 0 : (b.value as number);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 9_999_999_999_999) return { ok: false, error: 'Giá trị phải là số nguyên không âm (VND).' };
  const probability = b.probability === undefined ? 20 : (b.probability as number);
  if (typeof probability !== 'number' || !Number.isInteger(probability) || probability < 0 || probability > 100) return { ok: false, error: 'Xác suất phải từ 0 đến 100.' };
  const d = b.expectedCloseDate === null || b.expectedCloseDate === undefined || b.expectedCloseDate === '' ? null : str(b.expectedCloseDate);
  if (d !== null && !isDate(d)) return { ok: false, error: 'Ngày dự kiến chốt không hợp lệ.' };
  const source = str(b.source) || 'Nhập thủ công';
  if (source.length > 50) return { ok: false, error: 'Nguồn tối đa 50 ký tự.' };
  return { ok: true, value: { title, customerId, description, value, probability, expectedCloseDate: d, source } };
}
export interface CloseInput { result: 'won' | 'lost'; reason: string; note: string }
export function parseClose(raw: unknown): R<CloseInput> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const result = b.result, reason = typeof b.reason === 'string' ? b.reason.trim() : '', note = typeof b.note === 'string' ? b.note.trim() : '';
  if (result !== 'won' && result !== 'lost') return { ok: false, error: 'Kết quả không hợp lệ.' };
  if (result === 'lost' && !reason) return { ok: false, error: 'Vui lòng chọn lý do thất bại.' };
  if (reason.length > 200 || note.length > 500) return { ok: false, error: 'Lý do tối đa 200 ký tự, ghi chú tối đa 500 ký tự.' };
  return { ok: true, value: { result, reason: result === 'lost' ? reason : '', note } };
}

// ---- Định dạng & so sánh thay đổi ----
export const formatVnd = (n: number) => `${n.toLocaleString('vi-VN')} ₫`;
export function compactVnd(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace('.', ',').replace(/,0$/, '')} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '')} triệu`;
  return formatVnd(n);
}
export const formatDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
export interface Change { field: string; label: string; from: string; to: string }
const LABEL: Record<keyof OppInput, string> = { title: 'Tên cơ hội', customerId: 'Khách hàng', description: 'Mô tả', value: 'Giá trị', probability: 'Xác suất', expectedCloseDate: 'Ngày dự kiến chốt', source: 'Nguồn' };
export function diffInput(before: OppInput, after: OppInput, customerNames?: { from: string; to: string }): Change[] {
  const show = (k: keyof OppInput, v: OppInput[keyof OppInput], side: 'from' | 'to') =>
    k === 'value' ? formatVnd(v as number) : k === 'probability' ? `${v}%` : k === 'expectedCloseDate' ? formatDate(v as string | null) : k === 'customerId' ? (customerNames?.[side] ?? String(v)) : String(v || '—');
  return (Object.keys(LABEL) as (keyof OppInput)[]).filter(k => before[k] !== after[k]).map(k => ({ field: k, label: LABEL[k], from: show(k, before[k], 'from'), to: show(k, after[k], 'to') }));
}

// ---- Thống kê & xuất dữ liệu ----
export interface StatRow { status: OppStatus; value: number }
export function computeStats(rows: StatRow[]) {
  const open = rows.filter(r => r.status === 'open'), won = rows.filter(r => r.status === 'won'), lost = rows.filter(r => r.status === 'lost');
  const sum = (x: StatRow[]) => x.reduce((s, r) => s + r.value, 0);
  const closed = won.length + lost.length;
  return { total: rows.length, open: open.length, openValue: sum(open), won: won.length, wonValue: sum(won), lost: lost.length, winRate: closed ? Math.round((won.length * 100) / closed) : 0 };
}
export interface ExportRow { code: string; title: string; customerCode: string; customerName: string; value: number; probability: number; expectedCloseDate: string | null; source: string; status: OppStatus; lostReason: string; ownerName: string; createdAt: string }
export const opportunitiesCsv = (rows: ExportRow[]) => toCsv([
  ['Mã cơ hội', 'Tên cơ hội', 'Mã KH', 'Khách hàng', 'Giá trị (VND)', 'Xác suất (%)', 'Ngày dự kiến chốt', 'Nguồn', 'Trạng thái', 'Lý do thất bại', 'Phụ trách', 'Ngày tạo'],
  ...rows.map(r => [r.code, r.title, r.customerCode, r.customerName, String(r.value), String(r.probability), formatDate(r.expectedCloseDate), r.source, STATUS_LABEL[r.status], r.lostReason, r.ownerName, r.createdAt.slice(0, 10)].map(x => safeCell(String(x ?? '')))),
]);
