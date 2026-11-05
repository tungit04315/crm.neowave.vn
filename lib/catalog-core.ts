// Logic thuần của phân hệ Sản phẩm & Dịch vụ: phân quyền, kiểm tra dữ liệu, so sánh thay đổi, quy tắc đổi giá, từ khóa tìm kiếm.
// KHÔNG phụ thuộc Firebase/trình duyệt để dùng chung ở server (API) và client (giao diện) và kiểm thử độc lập.
import type { ActiveStatus, CatalogType, Change } from '@/types/catalog';
import { norm } from './text-core';

export const TYPE_LABEL: Record<CatalogType, string> = { product: 'Sản phẩm', service: 'Dịch vụ' };
export const ITEM_STATUS_LABEL: Record<ActiveStatus, string> = { active: 'Đang kinh doanh', inactive: 'Ngừng kinh doanh' };
export const USE_STATUS_LABEL: Record<ActiveStatus, string> = { active: 'Đang sử dụng', inactive: 'Ngừng sử dụng' };
export const ITEM_PREFIX: Record<CatalogType, string> = { product: 'SP', service: 'DV' };
export const CATEGORY_PREFIX: Record<CatalogType, string> = { product: 'NSP', service: 'NDV' };
export const PRICE_MAX = 9_999_999_999_999;

// ---- GIẢ ĐỊNH PHÂN QUYỀN (chưa có đặc tả chi tiết cột "Theo quyền") — chỉnh tại đây ----
export const VIEW_ROLES = ['super_admin', 'director', 'manager', 'sales'];
export const EDIT_ROLES = ['super_admin', 'director', 'manager'];        // sản phẩm/dịch vụ, nhóm, đơn vị tính
export const TAX_ROLES = ['super_admin', 'director'];                     // thuế suất
export const PRICE_DIRECT_ROLES = ['super_admin', 'director'];            // đổi giá trực tiếp
export const PRICE_REQUEST_ROLES = ['manager'];                           // chỉ được gửi yêu cầu đổi giá
export const PRICE_APPROVE_ROLES = ['super_admin', 'director'];           // duyệt / từ chối
export const EXPORT_ROLES = ['super_admin', 'director', 'manager'];

export interface Actor { uid: string; role: string }
export const can = {
  view: (a: Actor) => VIEW_ROLES.includes(a.role),
  edit: (a: Actor) => EDIT_ROLES.includes(a.role),
  editTax: (a: Actor) => TAX_ROLES.includes(a.role),
  export: (a: Actor) => EXPORT_ROLES.includes(a.role),
  changePriceDirect: (a: Actor) => PRICE_DIRECT_ROLES.includes(a.role),
  requestPrice: (a: Actor) => PRICE_REQUEST_ROLES.includes(a.role),
  viewRequests: (a: Actor) => PRICE_APPROVE_ROLES.includes(a.role) || PRICE_REQUEST_ROLES.includes(a.role),
  /** Người duyệt không được tự duyệt yêu cầu của chính mình */
  approvePrice: (a: Actor, req: { requestedBy: string }) => PRICE_APPROVE_ROLES.includes(a.role) && req.requestedBy !== a.uid,
};
export type PricePlan = 'none' | 'direct' | 'request' | 'forbidden';
/** Quyết định cách xử lý một thay đổi giá: áp dụng ngay, tạo yêu cầu chờ duyệt, hay từ chối */
export function planPriceChange(a: Actor, current: number, next: number): PricePlan {
  if (current === next) return 'none';
  if (can.changePriceDirect(a)) return 'direct';
  if (can.requestPrice(a)) return 'request';
  return 'forbidden';
}

// ---- Kiểm tra dữ liệu ----
type R<T> = { ok: true; value: T } | { ok: false; error: string };
const obj = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
export const isRequestId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(s);
export const isStatus = (v: unknown): v is ActiveStatus => v === 'active' || v === 'inactive';
export const isType = (v: unknown): v is CatalogType => v === 'product' || v === 'service';

/** Giá VND: số nguyên không âm. Chuỗi được phép có dấu phân cách nghìn (1.000.000). */
// Chuỗi chỉ nhận số thuần hoặc phân nhóm nghìn đúng 3 chữ số ("1.5" / "1,5" bị từ chối thay vì bị hiểu thành 15)
export function parsePrice(v: unknown): R<number> {
  const n = typeof v === 'string' ? (/^\s*(\d+|\d{1,3}([.,\s]\d{3})+)\s*$/.test(v) ? Number(v.replace(/[.,\s]/g, '')) : NaN) : v;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > PRICE_MAX) return fail('Giá phải là số nguyên không âm (VND).');
  return { ok: true, value: n };
}

export interface ItemInput { name: string; categoryId: string; unitId: string; shortDescription: string; description: string; taxRateId: string | null; priceIncludesTax: boolean; status: ActiveStatus; note: string }
export interface ItemCreate extends ItemInput { type: CatalogType; defaultPrice: number }
/** Trường được phép sửa sau khi tạo. KHÔNG gồm loại và giá: đổi giá phải đi qua quy trình đổi giá. */
export function parseItemInput(raw: unknown): R<ItemInput> {
  const b = obj(raw), name = str(b.name), categoryId = str(b.categoryId), unitId = str(b.unitId);
  const shortDescription = str(b.shortDescription), description = str(b.description), note = str(b.note);
  if (!name) return fail('Vui lòng nhập tên.');
  if (name.length > 200) return fail('Tên tối đa 200 ký tự.');
  if (!categoryId) return fail('Vui lòng chọn nhóm.');
  if (!unitId) return fail('Vui lòng chọn đơn vị tính.');
  if (shortDescription.length > 300) return fail('Mô tả ngắn tối đa 300 ký tự.');
  if (description.length > 5000) return fail('Mô tả chi tiết tối đa 5000 ký tự.');
  if (note.length > 1000) return fail('Ghi chú tối đa 1000 ký tự.');
  const taxRateId = b.taxRateId === undefined || b.taxRateId === null || b.taxRateId === '' ? null : str(b.taxRateId) || null;
  if (b.priceIncludesTax !== undefined && typeof b.priceIncludesTax !== 'boolean') return fail('Chế độ giá đã/chưa gồm thuế không hợp lệ.');
  if (b.status !== undefined && !isStatus(b.status)) return fail('Trạng thái không hợp lệ.');
  return { ok: true, value: { name, categoryId, unitId, shortDescription, description, taxRateId, priceIncludesTax: b.priceIncludesTax === true, status: (b.status as ActiveStatus) ?? 'active', note } };
}
export function parseItemCreate(raw: unknown): R<ItemCreate> {
  const b = obj(raw), base = parseItemInput(raw);
  if (!base.ok) return base;
  if (!isType(b.type)) return fail('Loại phải là Sản phẩm hoặc Dịch vụ.');
  const price = b.defaultPrice === undefined ? ({ ok: true, value: 0 } as const) : parsePrice(b.defaultPrice);
  if (!price.ok) return price;
  return { ok: true, value: { ...base.value, type: b.type, defaultPrice: price.value } };
}

export interface PriceChangeInput { newPrice: number; expectedPrice: number; reason: string }
// Chuỗi chỉ nhận số thuần hoặc phân nhóm nghìn đúng 3 chữ số ("1.5" / "1,5" bị từ chối thay vì bị hiểu thành 15)
export function parsePriceChange(raw: unknown): R<PriceChangeInput> {
  const b = obj(raw), np = parsePrice(b.newPrice), ep = parsePrice(b.expectedPrice), reason = str(b.reason);
  if (!np.ok) return np;
  if (!ep.ok) return fail('Thiếu giá hiện tại để đối chiếu.');
  if (!reason) return fail('Vui lòng nhập lý do thay đổi giá.');
  if (reason.length > 500) return fail('Lý do tối đa 500 ký tự.');
  return { ok: true, value: { newPrice: np.value, expectedPrice: ep.value, reason } };
}

export interface CategoryInput { name: string; description: string; color: string; status: ActiveStatus }
export function parseCategory(raw: unknown): R<CategoryInput> {
  const b = obj(raw), name = str(b.name), description = str(b.description), color = str(b.color) || '#2563eb';
  if (!name) return fail('Vui lòng nhập tên nhóm.');
  if (name.length > 100) return fail('Tên nhóm tối đa 100 ký tự.');
  if (description.length > 500) return fail('Mô tả tối đa 500 ký tự.');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return fail('Màu nhận diện không hợp lệ.');
  if (b.status !== undefined && !isStatus(b.status)) return fail('Trạng thái không hợp lệ.');
  return { ok: true, value: { name, description, color: color.toLowerCase(), status: (b.status as ActiveStatus) ?? 'active' } };
}

export interface UnitInput { name: string; symbol: string; description: string; status: ActiveStatus }
/** Khóa duy nhất của ký hiệu đơn vị (không phân biệt hoa thường, dấu) */
export const symbolKey = (symbol: string) => norm(symbol).replace(/\s+/g, '-');
export function parseUnit(raw: unknown): R<UnitInput> {
  const b = obj(raw), name = str(b.name), symbol = str(b.symbol), description = str(b.description);
  if (!name) return fail('Vui lòng nhập tên đơn vị.');
  if (name.length > 50) return fail('Tên đơn vị tối đa 50 ký tự.');
  if (!symbol) return fail('Vui lòng nhập ký hiệu.');
  if (symbol.length > 12) return fail('Ký hiệu tối đa 12 ký tự.');
  if (!symbolKey(symbol)) return fail('Ký hiệu phải chứa chữ hoặc số.');
  if (description.length > 200) return fail('Mô tả tối đa 200 ký tự.');
  if (b.status !== undefined && !isStatus(b.status)) return fail('Trạng thái không hợp lệ.');
  return { ok: true, value: { name, symbol, description, status: (b.status as ActiveStatus) ?? 'active' } };
}

export interface TaxInput { name: string; rateBp: number; status: ActiveStatus }
/** Nhận `ratePercent` (tối đa 2 chữ số thập phân) hoặc `rateBp` (điểm cơ bản). Hệ thống KHÔNG có mức thuế mặc định. */
export function parseTax(raw: unknown): R<TaxInput> {
  const b = obj(raw), name = str(b.name);
  if (!name) return fail('Vui lòng nhập tên thuế.');
  if (name.length > 100) return fail('Tên thuế tối đa 100 ký tự.');
  let bp: unknown = b.rateBp;
  if (bp === undefined && typeof b.ratePercent === 'number') {
    const x = b.ratePercent * 100;
    bp = Math.abs(x - Math.round(x)) < 1e-6 ? Math.round(x) : NaN;
  }
  if (typeof bp !== 'number' || !Number.isInteger(bp) || bp < 0 || bp > 10000) return fail('Thuế suất phải từ 0% đến 100% (tối đa 2 chữ số thập phân).');
  if (b.status !== undefined && !isStatus(b.status)) return fail('Trạng thái không hợp lệ.');
  return { ok: true, value: { name, rateBp: bp, status: (b.status as ActiveStatus) ?? 'active' } };
}
export const formatPercentBp = (bp: number) => `${(bp / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;

// ---- Mã và định danh ----
export const formatCode = (prefix: string, n: number, pad: number) => `${prefix}${String(n).padStart(pad, '0')}`;
/** ID tài liệu = tổ chức + mã: vừa duy nhất theo tổ chức, vừa sắp theo mã khi phân trang */
export const docId = (org: string, code: string) => `${org}_${code}`;

// ---- Định dạng & so sánh thay đổi ----
export const formatVnd = (n: number) => `${n.toLocaleString('vi-VN')} ₫`;
const LABEL: Record<keyof ItemInput, string> = { name: 'Tên', categoryId: 'Nhóm', unitId: 'Đơn vị tính', shortDescription: 'Mô tả ngắn', description: 'Mô tả chi tiết', taxRateId: 'Thuế', priceIncludesTax: 'Giá đã gồm thuế', status: 'Trạng thái', note: 'Ghi chú' };
export type RefKey = 'categoryId' | 'unitId' | 'taxRateId';
export function diffItem(before: ItemInput, after: ItemInput, nameOf: (k: RefKey, id: string | null) => string): Change[] {
  const show = (k: keyof ItemInput, v: ItemInput[keyof ItemInput]) =>
    k === 'categoryId' || k === 'unitId' || k === 'taxRateId' ? nameOf(k, v as string | null) : k === 'priceIncludesTax' ? (v ? 'Có' : 'Không') : k === 'status' ? ITEM_STATUS_LABEL[v as ActiveStatus] : String(v || '—');
  return (Object.keys(LABEL) as (keyof ItemInput)[]).filter(k => before[k] !== after[k]).map(k => ({ field: k, label: LABEL[k], from: show(k, before[k]), to: show(k, after[k]) }));
}
/** Chênh lệch giá; pctBp là tỷ lệ thay đổi theo điểm cơ bản (null khi giá cũ bằng 0) */
export function priceDelta(from: number, to: number) {
  return { diff: to - from, pctBp: from > 0 ? Math.round(((to - from) * 10000) / from) : null };
}
export const priceChangeLine = (from: number, to: number): Change => ({ field: 'defaultPrice', label: 'Giá bán mặc định', from: formatVnd(from), to: formatVnd(to) });

// ---- Tìm kiếm ----
// Firestore không tìm được chuỗi con. Mỗi tài liệu lưu mọi TIỀN TỐ (tối đa 12 ký tự) của từng từ trong mã và tên;
// truy vấn dùng `array-contains` cho từ đầu tiên, các từ còn lại được lọc tiếp ở server.
const TOKEN_MAX = 12;
export function searchTokens(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const w of norm(texts.join(' ')).split(' ')) for (let i = 1; i <= Math.min(w.length, TOKEN_MAX); i++) out.add(w.slice(0, i));
  return [...out].slice(0, 300);
}
export const queryTokens = (q: string): string[] => [...new Set(norm(q).split(' ').filter(Boolean).map(w => w.slice(0, TOKEN_MAX)))];
export const matchesTokens = (have: string[], want: string[]) => want.every(t => have.includes(t));
