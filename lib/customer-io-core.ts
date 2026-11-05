// Logic thuần (không phụ thuộc trình duyệt/Firebase) để đọc, kiểm tra và xuất dữ liệu khách hàng.
import { type Customer, type CustomerInput, emptyCustomer, POTENTIAL_LABEL, SIZES, SOURCES, STATUS_LABEL, TYPE_LABEL } from '../types/customer';

export const MAX_ROWS = 2000;
export const IMPORT_COLS: { key: keyof CustomerInput; header: string }[] = [
  { key: 'type', header: 'Loại KH' }, { key: 'name', header: 'Tên khách hàng *' }, { key: 'companyName', header: 'Tên công ty' },
  { key: 'taxCode', header: 'Mã số thuế' }, { key: 'website', header: 'Website' }, { key: 'phone', header: 'Số điện thoại' },
  { key: 'email', header: 'Email' }, { key: 'address', header: 'Địa chỉ' }, { key: 'province', header: 'Tỉnh/Thành phố' },
  { key: 'district', header: 'Quận/Huyện' }, { key: 'representative', header: 'Người đại diện' }, { key: 'industry', header: 'Ngành nghề' },
  { key: 'size', header: 'Quy mô' }, { key: 'source', header: 'Nguồn' }, { key: 'status', header: 'Trạng thái' },
  { key: 'potential', header: 'Mức độ tiềm năng' }, { key: 'isVip', header: 'VIP' }, { key: 'note', header: 'Ghi chú' },
];

import { norm } from './text-core';
export { norm }; // giữ nguyên đường dẫn import cũ
const digits = (s: string) => s.replace(/\D/g, '');

/** Đọc CSV: hỗ trợ BOM, dấu phân cách , ; hoặc tab, ô có dấu ngoặc kép và xuống dòng */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map(d => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export type RowStatus = 'valid' | 'error' | 'dup';
export interface ParsedRow { line: number; data: CustomerInput | null; status: RowStatus; messages: string[] }

const cellStr = (v: unknown, key: string) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') { const s = String(v); // Excel làm mất số 0 đầu của SĐT / MST dạng số
    if (key === 'phone' && s.length === 9) return '0' + s;
    if (key === 'taxCode' && s.length === 9) return '0' + s;
    return s; }
  if (v instanceof Date) return v.toLocaleDateString('vi-VN');
  return String(v).trim();
};
const pick = (v: string, map: [string[], string][], dflt: string): string | null => {
  const n = norm(v); if (!n) return dflt;
  for (const [keys, out] of map) if (keys.includes(n)) return out;
  return null;
};

export function parseRows(matrix: unknown[][], existing: Pick<Customer, 'code' | 'taxCode' | 'phone' | 'email' | 'deletedAt'>[]): { rows: ParsedRow[]; error?: string } {
  if (!matrix.length) return { rows: [], error: 'File không có dữ liệu.' };
  const colOf: Partial<Record<keyof CustomerInput, number>> = {};
  (matrix[0] ?? []).forEach((h, i) => { const n = norm(h); const c = IMPORT_COLS.find(x => norm(x.header) === n); if (c && colOf[c.key] === undefined) colOf[c.key] = i; });
  if (colOf.name === undefined) return { rows: [], error: 'Không tìm thấy cột “Tên khách hàng”. Hãy dùng file mẫu.' };
  const body = matrix.slice(1).map((r, i) => ({ r, line: i + 2 })).filter(x => x.r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
  if (body.length > MAX_ROWS) return { rows: [], error: `File vượt quá ${MAX_ROWS} dòng. Vui lòng chia nhỏ file.` };

  const seen = { taxCode: new Map<string, number>(), phone: new Map<string, number>(), email: new Map<string, number>() };
  const db = { taxCode: new Map<string, string>(), phone: new Map<string, string>(), email: new Map<string, string>() };
  existing.filter(c => !c.deletedAt).forEach(c => {
    if (c.taxCode) db.taxCode.set(digits(c.taxCode), c.code); if (c.phone) db.phone.set(digits(c.phone), c.code); if (c.email) db.email.set(c.email.toLowerCase(), c.code);
  });
  const rows: ParsedRow[] = body.map(({ r, line }) => {
    const get = (k: keyof CustomerInput) => colOf[k] === undefined ? '' : cellStr(r[colOf[k]!], k);
    const errs: string[] = []; const v: CustomerInput = { ...emptyCustomer };
    (['name', 'companyName', 'taxCode', 'website', 'phone', 'email', 'address', 'province', 'district', 'representative', 'industry', 'note'] as const).forEach(k => { v[k] = get(k).slice(0, k === 'note' ? 1000 : 200); });
    const type = pick(get('type'), [[['doanh nghiep', 'cong ty', 'company'], 'company'], [['ca nhan', 'individual'], 'individual']], 'company');
    if (type === null) errs.push('Loại KH phải là “Doanh nghiệp” hoặc “Cá nhân”'); else v.type = type as CustomerInput['type'];
    const status = pick(get('status'), [[['dang hoat dong', 'hoat dong', 'active'], 'active'], [['tam ngung', 'paused'], 'paused']], 'active');
    if (status === null) errs.push('Trạng thái phải là “Đang hoạt động” hoặc “Tạm ngưng”'); else v.status = status as CustomerInput['status'];
    const pot = pick(get('potential'), [[['thap', 'low'], 'low'], [['trung binh', 'medium'], 'medium'], [['cao', 'high'], 'high']], 'medium');
    if (pot === null) errs.push('Mức độ tiềm năng phải là Thấp / Trung bình / Cao'); else v.potential = pot as CustomerInput['potential'];
    v.isVip = ['co', 'yes', 'x', '1', 'true', 'vip'].includes(norm(get('isVip')));
    v.source = SOURCES.find(s => norm(s) === norm(get('source'))) ?? (get('source') ? 'Khác' : 'Nhập thủ công');
    v.size = SIZES.find(s => norm(s) === norm(get('size'))) ?? '';

    if (!v.name) errs.push('Thiếu tên khách hàng');
    if (!v.phone && !v.email) errs.push('Cần có số điện thoại hoặc email');
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) errs.push('Email không hợp lệ');
    if (v.phone && !/^[0-9+\s.-]{8,15}$/.test(v.phone)) errs.push('Số điện thoại không hợp lệ');
    if (v.taxCode && !/^\d{10,13}$/.test(v.taxCode.replace(/[\s-]/g, ''))) errs.push('Mã số thuế phải gồm từ 10 đến 13 chữ số');
    if (errs.length) return { line, data: null, status: 'error' as const, messages: errs };

    const keys: [keyof typeof seen, string][] = [['taxCode', digits(v.taxCode)], ['phone', digits(v.phone)], ['email', v.email.toLowerCase()]];
    const dups: string[] = [];
    for (const [f, val] of keys) { if (!val) continue;
      if (db[f].has(val)) dups.push(`Trùng ${f === 'taxCode' ? 'MST' : f === 'phone' ? 'SĐT' : 'email'} với khách hàng ${db[f].get(val)}`);
      else if (seen[f].has(val)) dups.push(`Trùng ${f === 'taxCode' ? 'MST' : f === 'phone' ? 'SĐT' : 'email'} với dòng ${seen[f].get(val)} trong file`); }
    if (dups.length) return { line, data: null, status: 'dup' as const, messages: dups };
    keys.forEach(([f, val]) => { if (val) seen[f].set(val, line); });
    return { line, data: v, status: 'valid' as const, messages: [] };
  });
  return { rows };
}

// ---- Xuất dữ liệu ----
// Chống “CSV/Formula injection”: ô bắt đầu bằng = @ hoặc +/- theo sau ký tự không phải số sẽ được thêm dấu nháy
export const safeCell = (s: string) => /^[=@\t\r]/.test(s) || /^[+-][^0-9\s.()]/.test(s) ? `'${s}` : s;
const date = (t?: { toDate: () => Date } | null) => (t ? t.toDate().toLocaleDateString('vi-VN') : '');
export const EXPORT_HEADERS = ['Mã KH', 'Loại KH', 'Tên khách hàng', 'Tên công ty', 'Mã số thuế', 'Website', 'Số điện thoại', 'Email', 'Địa chỉ', 'Tỉnh/Thành phố', 'Quận/Huyện',
  'Người đại diện', 'Ngành nghề', 'Quy mô', 'Nhóm KH', 'Nguồn', 'Trạng thái', 'Mức độ tiềm năng', 'VIP', 'Phụ trách', 'Ghi chú', 'Ngày tạo', 'Cập nhật'];
export function exportMatrix(list: Customer[], groupNames: (id: string) => string): string[][] {
  return [EXPORT_HEADERS, ...list.map(c => [c.code, TYPE_LABEL[c.type], c.name, c.companyName, c.taxCode, c.website, c.phone, c.email, c.address, c.province, c.district,
    c.representative, c.industry, c.size, groupNames(c.id), c.source, STATUS_LABEL[c.status], POTENTIAL_LABEL[c.potential], c.isVip ? 'Có' : 'Không', c.ownerName, c.note,
    date(c.createdAt), date(c.updatedAt)].map(x => safeCell(String(x ?? ''))))];
}
export const toCsv = (m: string[][]) => '\uFEFF' + m.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
