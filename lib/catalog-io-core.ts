// Logic thuần: đọc/kiểm tra tệp nhập và dựng bảng xuất cho sản phẩm & dịch vụ (dùng chung cho trình duyệt và máy chủ).
import { ITEM_STATUS_LABEL, TYPE_LABEL, parseItemCreate, parsePrice } from './catalog-core';
import { norm } from './text-core';
import { safeCell } from './customer-io-core';
import type { ItemDto } from '../types/catalog';

export const MAX_IMPORT_ROWS = 2000;
export const EXPORT_MAX = 5000;
export const IMPORT_HEADERS = ['Loại', 'Tên', 'Nhóm', 'Đơn vị tính', 'Giá bán (VND)', 'Thuế', 'Giá đã gồm thuế', 'Trạng thái', 'Mô tả ngắn', 'Mô tả chi tiết', 'Ghi chú'];
export const importTemplate = (): string[][] => [IMPORT_HEADERS, ['Sản phẩm', 'Máy in A4', '(tên nhóm đã tạo)', '(tên đơn vị đã tạo)', '1500000', '(tên thuế, bỏ trống nếu không áp dụng)', 'Không', 'Đang kinh doanh', '', '', '']];

export interface ImportRefs { categories: { id: string; name: string; type: 'product' | 'service' }[]; units: { id: string; name: string }[]; taxRates: { id: string; name: string }[] }
export type RowStatus = 'valid' | 'error' | 'dup';
export interface ImportRow { line: number; data: Record<string, unknown> | null; label: string; status: RowStatus; messages: string[] }

const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const KEYS = ['type', 'name', 'category', 'unit', 'price', 'tax', 'incl', 'status', 'short', 'desc', 'note'] as const;
const ALIAS: Record<(typeof KEYS)[number], string[]> = { type: ['loai'], name: ['ten', 'ten san pham', 'ten dich vu'], category: ['nhom', 'nhom san pham', 'nhom dich vu'], unit: ['don vi tinh', 'don vi'],
  price: ['gia ban vnd', 'gia ban', 'gia'], tax: ['thue', 'thue suat'], incl: ['gia da gom thue', 'gia da bao gom thue'], status: ['trang thai'], short: ['mo ta ngan'], desc: ['mo ta chi tiet'], note: ['ghi chu'] };

/** Đọc ma trận (dòng đầu là tiêu đề, nhận diện cột theo tên, không phân biệt dấu/hoa thường). Không tạo mới nhóm / đơn vị / thuế: phải khớp danh mục đã có. */
export function parseImportRows(matrix: unknown[][], refs: ImportRefs): { rows: ImportRow[]; error?: string } {
  if (matrix.length < 2) return { rows: [], error: 'Tệp không có dòng dữ liệu nào.' };
  if (matrix.length - 1 > MAX_IMPORT_ROWS) return { rows: [], error: `Tệp có quá ${MAX_IMPORT_ROWS} dòng. Hãy chia nhỏ rồi nhập lại.` };
  const head = matrix[0].map(h => norm(cell(h))), col = {} as Record<(typeof KEYS)[number], number>;
  for (const k of KEYS) col[k] = head.findIndex(h => ALIAS[k].includes(h));
  const missing = (['type', 'name', 'category', 'unit'] as const).filter(k => col[k] < 0);
  if (missing.length) return { rows: [], error: 'Thiếu cột bắt buộc: ' + missing.map(k => ({ type: 'Loại', name: 'Tên', category: 'Nhóm', unit: 'Đơn vị tính' })[k]).join(', ') + '.' };
  const by = <T extends { name: string }>(l: T[]) => { const m = new Map<string, T[]>(); for (const x of l) m.set(norm(x.name), [...(m.get(norm(x.name)) ?? []), x]); return m; };
  const units = by(refs.units), taxes = by(refs.taxRates), cats = by(refs.categories), seen = new Set<string>(), rows: ImportRow[] = [];
  matrix.slice(1).forEach((r, i) => {
    const g = (k: (typeof KEYS)[number]) => (col[k] < 0 ? '' : cell(r[col[k]])), line = i + 2;
    if (r.every(x => cell(x) === '')) return;
    const msgs: string[] = [], t = norm(g('type')), type = t === 'san pham' ? 'product' : t === 'dich vu' ? 'service' : null, name = g('name');
    if (!type) msgs.push('Loại phải là "Sản phẩm" hoặc "Dịch vụ".');
    const one = <T,>(m: Map<string, T[]>, v: string, what: string, filter: (x: T) => boolean = () => true): T | null => {
      const f = (m.get(norm(v)) ?? []).filter(filter); if (f.length === 1) return f[0]; msgs.push(f.length ? `${what} "${v}" bị trùng tên.` : `Không có ${what.toLowerCase()} "${v}".`); return null;
    };
    const category = type && g('category') ? one(cats, g('category'), 'Nhóm', x => x.type === type) : (msgs.push('Thiếu nhóm.'), null);
    const unit = g('unit') ? one(units, g('unit'), 'Đơn vị tính') : (msgs.push('Thiếu đơn vị tính.'), null);
    const tax = g('tax') ? one(taxes, g('tax'), 'Thuế') : null;
    const p = g('price') === '' ? { ok: true as const, value: 0 } : parsePrice(r[col.price]); if (!p.ok) msgs.push('Giá bán không hợp lệ (số nguyên VND, không âm).');
    const inc = norm(g('incl')); if (inc && !['co', 'khong'].includes(inc)) msgs.push('"Giá đã gồm thuế" phải là Có hoặc Không.');
    const st = norm(g('status')), status = !st || st === norm(ITEM_STATUS_LABEL.active) ? 'active' : st === norm(ITEM_STATUS_LABEL.inactive) ? 'inactive' : null; if (!status) msgs.push('Trạng thái không hợp lệ.');
    const data = { type, name, categoryId: category?.id, unitId: unit?.id, taxRateId: tax?.id ?? null, priceIncludesTax: inc === 'co', defaultPrice: p.ok ? p.value : 0, status, shortDescription: g('short'), description: g('desc'), note: g('note') };
    if (!msgs.length) { const v = parseItemCreate(data); if (!v.ok) msgs.push(v.error); }
    let st2: RowStatus = msgs.length ? 'error' : 'valid';
    if (st2 === 'valid') { const key = `${type}|${norm(name)}|${unit?.id}`; if (seen.has(key)) { st2 = 'dup'; msgs.push('Trùng tên + đơn vị với một dòng trước trong tệp.'); } else seen.add(key); }
    rows.push({ line, data: st2 === 'valid' ? data : null, label: name, status: st2, messages: msgs });
  });
  return rows.length ? { rows } : { rows, error: 'Tệp không có dòng dữ liệu nào.' };
}

export const EXPORT_HEADERS = ['Mã', 'Loại', 'Tên', 'Nhóm', 'Đơn vị tính', 'Giá bán (VND)', 'Thuế', 'Giá đã gồm thuế', 'Trạng thái', 'Mô tả ngắn', 'Ghi chú', 'Cập nhật'];
export const exportMatrix = (items: ItemDto[]): string[][] => [EXPORT_HEADERS, ...items.map(i => [i.code, TYPE_LABEL[i.type], i.name, i.categoryName, i.unitName, String(i.defaultPrice),
  i.taxRateName, i.priceIncludesTax ? 'Có' : 'Không', ITEM_STATUS_LABEL[i.status], i.shortDescription, i.note, i.updatedAt ? new Date(i.updatedAt).toLocaleDateString('vi-VN') : ''].map(x => safeCell(String(x ?? ''))))];
