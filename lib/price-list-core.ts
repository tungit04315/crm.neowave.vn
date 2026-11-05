// Logic thuần cho bảng giá: phân quyền (giả định), kiểm tra dữ liệu, trạng thái hiệu lực theo ngày. Dùng chung server / client / test.
import type { ActiveStatus } from '@/types/catalog';
import type { ListState, PriceListRowDto, PriceListType } from '@/types/price-list';
import { norm } from './text-core';
import { safeCell } from './customer-io-core';
import { EXPORT_ROLES, parsePrice, VIEW_ROLES, type Actor } from './catalog-core';

type R<T> = { ok: true; value: T } | { ok: false; error: string };
const obj = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const LIST_TYPE_LABEL: Record<PriceListType, string> = { standard: 'Tiêu chuẩn', customer_group: 'Theo nhóm khách hàng', partner: 'Đối tác', promotion: 'Khuyến mại', region: 'Theo khu vực', other: 'Khác' };
export const LIST_STATE_LABEL: Record<ListState, string> = { upcoming: 'Sắp áp dụng', current: 'Đang áp dụng', expired: 'Hết hiệu lực', inactive: 'Ngừng hoạt động' };
export const LIST_PREFIX = 'BG';
export const LIST_BATCH_MAX = 100;
export const DUPLICATE_MAX_ITEMS = 400;

// ---- GIẢ ĐỊNH PHÂN QUYỀN: manager chỉ xem bảng giá (luồng gửi yêu cầu cho giá trong bảng giá để Phase 04) ----
export const LIST_EDIT_ROLES = ['super_admin', 'director'];
export const listCan = {
  view: (a: Actor) => VIEW_ROLES.includes(a.role),
  edit: (a: Actor) => LIST_EDIT_ROLES.includes(a.role),
  export: (a: Actor) => EXPORT_ROLES.includes(a.role),
};

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (so sánh chuỗi được vì cùng định dạng) */
export const todayVn = (now: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export function stateOf(l: { status: ActiveStatus; startDate: string | null; endDate: string | null }, today: string): ListState {
  if (l.status !== 'active') return 'inactive';
  if (l.endDate && l.endDate < today) return 'expired';
  if (l.startDate && l.startDate > today) return 'upcoming';
  return 'current';
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export interface PriceListInput { name: string; description: string; type: PriceListType; scopeNote: string; startDate: string | null; endDate: string | null; customerGroupIds: string[]; status: ActiveStatus }
export function parsePriceList(raw: unknown): R<PriceListInput> {
  const b = obj(raw), name = str(b.name), description = str(b.description), scopeNote = str(b.scopeNote), status = b.status === undefined ? 'active' : b.status;
  if (!name) return fail('Vui lòng nhập tên bảng giá.');
  if (name.length > 150) return fail('Tên bảng giá tối đa 150 ký tự.');
  if (description.length > 500) return fail('Mô tả tối đa 500 ký tự.');
  if (scopeNote.length > 200) return fail('Phạm vi áp dụng tối đa 200 ký tự.');
  if (!(b.type as string in LIST_TYPE_LABEL)) return fail('Loại bảng giá không hợp lệ.');
  if (status !== 'active' && status !== 'inactive') return fail('Trạng thái không hợp lệ.');
  const sd = str(b.startDate), ed = str(b.endDate);
  if ((sd && !isDate(sd)) || (ed && !isDate(ed))) return fail('Ngày không hợp lệ (định dạng YYYY-MM-DD).');
  if (sd && ed && ed < sd) return fail('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  const g = b.customerGroupIds === undefined ? [] : b.customerGroupIds;
  if (!Array.isArray(g) || g.length > 50 || g.some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) return fail('Danh sách nhóm khách hàng không hợp lệ.');
  return { ok: true, value: { name, description, type: b.type as PriceListType, scopeNote, startDate: sd || null, endDate: ed || null, customerGroupIds: [...new Set(g as string[])], status } };
}

export interface UpsertRow { itemId: string | null; code: string | null; price: number; expectedPrice: number | null }
/** Dòng thêm / cập nhật giá hàng loạt: nhận itemId hoặc mã; `expectedPrice` (nếu có) để phát hiện giá đã bị người khác đổi */
export function parseUpsert(raw: unknown): R<{ rows: UpsertRow[]; reason: string; mode: 'add' | 'set' }> {
  const b = obj(raw), rows = b.rows, reason = str(b.reason);
  if (b.mode !== undefined && b.mode !== 'add' && b.mode !== 'set') return fail('Chế độ không hợp lệ.');
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > LIST_BATCH_MAX) return fail(`Mỗi lần gửi từ 1 đến ${LIST_BATCH_MAX} mặt hàng.`);
  if (reason.length > 500) return fail('Lý do tối đa 500 ký tự.');
  const out: UpsertRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = obj(rows[i]), itemId = str(r.itemId) || null, code = str(r.code) || null, p = parsePrice(r.price);
    if (!itemId && !code) return fail(`Dòng ${i + 1}: thiếu mặt hàng.`);
    if (!p.ok) return fail(`Dòng ${i + 1}: giá phải là số nguyên không âm (VND).`);
    let expectedPrice: number | null = null;
    if (r.expectedPrice !== undefined && r.expectedPrice !== null) { const e = parsePrice(r.expectedPrice); if (!e.ok) return fail(`Dòng ${i + 1}: giá hiện tại không hợp lệ.`); expectedPrice = e.value; }
    out.push({ itemId, code, price: p.value, expectedPrice });
  }
  return { ok: true, value: { rows: out, reason, mode: b.mode === 'add' ? 'add' : 'set' } };
}
export function parseRemove(raw: unknown): R<string[]> {
  const ids = obj(raw).itemIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > LIST_BATCH_MAX || ids.some(x => typeof x !== 'string' || !x)) return fail(`Chọn từ 1 đến ${LIST_BATCH_MAX} mặt hàng để xóa.`);
  return { ok: true, value: [...new Set(ids as string[])] };
}
export function parseStatus(raw: unknown): R<{ status: ActiveStatus; version: number }> {
  const b = obj(raw);
  if (b.status !== 'active' && b.status !== 'inactive') return fail('Trạng thái không hợp lệ.');
  if (typeof b.version !== 'number') return fail('Thiếu số phiên bản.');
  return { ok: true, value: { status: b.status, version: b.version } };
}
/** Điều chỉnh giá theo phần trăm (điểm cơ bản, 100 = 1%), làm tròn đến bội gần nhất của `step` VND (mặc định 1) */
export function adjustPrice(price: number, pctBp: number, step = 1): number {
  const raw = Math.round((price * (10000 + pctBp)) / 10000); return Math.max(0, step > 1 ? Math.round(raw / step) * step : raw);
}

// ---- Nhập giá từ Excel / CSV (cột: Mã, Giá) và xuất bảng giá ----
const nm = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
export interface PriceImportRow { line: number; code: string; price: number | null; error: string | null }
export function parsePriceMatrix(matrix: unknown[][]): { rows: PriceImportRow[]; error?: string } {
  if (matrix.length < 2) return { rows: [], error: 'Tệp không có dòng dữ liệu nào.' };
  if (matrix.length - 1 > 2000) return { rows: [], error: 'Tệp có quá 2000 dòng. Hãy chia nhỏ rồi nhập lại.' };
  const head = matrix[0].map(h => norm(nm(h))), ci = head.findIndex(h => ['ma', 'ma san pham', 'ma dich vu', 'ma sp', 'ma hang'].includes(h));
  const pi = head.findIndex(h => ['gia', 'gia ban', 'gia ban vnd', 'gia trong bang gia', 'gia moi'].includes(h));
  if (ci < 0 || pi < 0) return { rows: [], error: 'Thiếu cột bắt buộc: Mã và Giá.' };
  const seen = new Set<string>(), rows: PriceImportRow[] = [];
  matrix.slice(1).forEach((r, i) => {
    if (r.every(x => nm(x) === '')) return;
    const code = nm(r[ci]).toUpperCase(), p = parsePrice(r[pi]); let error: string | null = null;
    if (!code) error = 'Thiếu mã.'; else if (!p.ok) error = 'Giá phải là số nguyên không âm (VND).'; else if (seen.has(code)) error = 'Mã bị lặp trong tệp.';
    seen.add(code); rows.push({ line: i + 2, code, price: p.ok && !error ? p.value : null, error });
  });
  return rows.length ? { rows } : { rows, error: 'Tệp không có dòng dữ liệu nào.' };
}
export const PRICE_IMPORT_TEMPLATE: string[][] = [['Mã', 'Giá'], ['SP00001', '1500000']];
export const exportPriceListMatrix = (rows: PriceListRowDto[]): string[][] => [['Mã', 'Tên', 'Loại', 'Nhóm', 'Đơn vị tính', 'Giá mặc định', 'Giá trong bảng giá', 'Thuế', 'Trạng thái mặt hàng'],
  ...rows.map(r => [r.code, r.name, r.type === 'product' ? 'Sản phẩm' : 'Dịch vụ', r.categoryName, r.unitName, String(r.defaultPrice), String(r.price), r.taxText, r.itemStatus === 'active' ? 'Đang kinh doanh' : 'Ngừng kinh doanh'].map(x => safeCell(String(x ?? ''))))];
