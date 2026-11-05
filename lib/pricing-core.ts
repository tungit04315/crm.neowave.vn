// Logic thuần cho giá theo nhóm khách hàng, xác định giá (resolvePrice) và chiết khấu. Dùng chung server / client / test.
import type { ActiveStatus } from '@/types/catalog';
import type { DiscountKind, DiscountResult, PolicyEval, PriceSource, ResolveResult } from '@/types/pricing';
import { EXPORT_ROLES, PRICE_MAX, parsePrice, VIEW_ROLES, type Actor } from './catalog-core';
import { stateOf } from './price-list-core';

type R<T> = { ok: true; value: T } | { ok: false; error: string };
const obj = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const num = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n);

// ---- GIẢ ĐỊNH PHÂN QUYỀN (chỉnh tại đây) ----
export const PRICING_EDIT_ROLES = ['super_admin', 'director'];      // giá theo nhóm, chính sách chiết khấu
export const PRIORITY_ROLES = ['super_admin'];                       // số ưu tiên của nhóm khách hàng ("Admin")
export const pricingCan = {
  view: (a: Actor) => VIEW_ROLES.includes(a.role),
  edit: (a: Actor) => PRICING_EDIT_ROLES.includes(a.role),
  export: (a: Actor) => EXPORT_ROLES.includes(a.role),
  editPriority: (a: Actor) => PRIORITY_ROLES.includes(a.role),
};
/** Mức chiết khấu tối đa (điểm cơ bản trên tổng tiền hàng) mỗi vai trò được tự áp dụng; vượt mức phải xin phê duyệt (Phase 04). */
export const DISCOUNT_LIMIT_BP: Record<string, number> = { super_admin: 10000, director: 10000, manager: 2000, sales: 500 };
export const discountLimitBp = (role: string) => DISCOUNT_LIMIT_BP[role] ?? 0;
export const BATCH_MAX = 100;
export const EVAL_LINES_MAX = 50;
export const PRIORITY_MAX = 1000;
export const GROUP_PRICE_PREFIX_SEP = '__';
export const groupPriceId = (itemId: string, groupId: string) => `${itemId}${GROUP_PRICE_PREFIX_SEP}${groupId}`;

// ---------------- Giá theo nhóm ----------------
export interface GroupPriceRowIn { itemId: string | null; code: string | null; price: number }
export interface GroupPriceBatch { groupId: string; rows: GroupPriceRowIn[]; reason: string; mode: 'add' | 'set'; startDate: string | null; endDate: string | null }
export function parseDates(b: Record<string, unknown>): R<{ startDate: string | null; endDate: string | null }> {
  const sd = str(b.startDate), ed = str(b.endDate);
  if ((sd && !isDate(sd)) || (ed && !isDate(ed))) return fail('Ngày không hợp lệ (định dạng YYYY-MM-DD).');
  if (sd && ed && ed < sd) return fail('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  return { ok: true, value: { startDate: sd || null, endDate: ed || null } };
}
export function parseGroupPriceBatch(raw: unknown): R<GroupPriceBatch> {
  const b = obj(raw), groupId = str(b.groupId), reason = str(b.reason), rows = b.rows;
  if (!groupId) return fail('Vui lòng chọn nhóm khách hàng.');
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > BATCH_MAX) return fail(`Mỗi lần gửi từ 1 đến ${BATCH_MAX} mặt hàng.`);
  if (reason.length > 500) return fail('Lý do tối đa 500 ký tự.');
  if (b.mode !== undefined && b.mode !== 'add' && b.mode !== 'set') return fail('Chế độ không hợp lệ.');
  const d = parseDates(b); if (!d.ok) return d;
  const out: GroupPriceRowIn[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = obj(rows[i]), itemId = str(r.itemId) || null, code = str(r.code) || null, p = parsePrice(r.price);
    if (!itemId && !code) return fail(`Dòng ${i + 1}: thiếu mặt hàng.`);
    if (!p.ok) return fail(`Dòng ${i + 1}: giá phải là số nguyên không âm (VND).`);
    out.push({ itemId, code, price: p.value });
  }
  return { ok: true, value: { groupId, rows: out, reason, mode: b.mode === 'add' ? 'add' : 'set', ...d.value } };
}
export interface GroupPriceUpdate { price: number; startDate: string | null; endDate: string | null; status: ActiveStatus; version: number; reason: string }
export function parseGroupPriceUpdate(raw: unknown): R<GroupPriceUpdate> {
  const b = obj(raw), p = parsePrice(b.price), reason = str(b.reason), d = parseDates(b);
  if (!p.ok) return fail('Giá phải là số nguyên không âm (VND).');
  if (!d.ok) return d;
  if (b.status !== 'active' && b.status !== 'inactive') return fail('Trạng thái không hợp lệ.');
  if (!num(b.version)) return fail('Thiếu số phiên bản.');
  if (reason.length > 500) return fail('Lý do tối đa 500 ký tự.');
  return { ok: true, value: { price: p.value, ...d.value, status: b.status, version: b.version as number, reason } };
}
export function parsePriority(raw: unknown): R<{ groupId: string; priority: number }> {
  const b = obj(raw), groupId = str(b.groupId);
  if (!groupId) return fail('Thiếu nhóm khách hàng.');
  if (!num(b.priority) || (b.priority as number) < 0 || (b.priority as number) > PRIORITY_MAX) return fail(`Số ưu tiên phải là số nguyên từ 0 đến ${PRIORITY_MAX}.`);
  return { ok: true, value: { groupId, priority: b.priority as number } };
}

// ---------------- Xác định giá ----------------
export interface ResolveInput {
  item: { id: string; code: string; status: ActiveStatus; defaultPrice: number }; today: string; customerGroupIds: string[];
  groupPrices: { id: string; groupId: string; groupName: string; price: number; status: ActiveStatus; startDate: string | null; endDate: string | null }[];
  priorities: Record<string, number>;
  lists: { id: string; code: string; name: string; customerGroupIds: string[]; status: ActiveStatus; startDate: string | null; endDate: string | null; price: number | null }[];
}
const found = (price: number, source: PriceSource, sourceId: string | null, sourceName: string, groupId: string | null, trace: string[], warning: string | null = null): ResolveResult => ({ found: true, price, source, sourceId, sourceName, groupId, warning, trace });
/**
 * Thứ tự: (1) giá riêng của nhóm khách — khách thuộc nhiều nhóm: số ưu tiên cao hơn thắng, hòa thì giá thấp hơn, hòa nữa thì theo mã nhóm;
 * (2) bảng giá đang hiệu lực — bảng giá gắn đúng nhóm của khách xét trước, rồi bảng giá chung; cùng tầng thì giá thấp nhất, hòa thì theo mã bảng giá;
 * (3) giá bán mặc định. Không có giá phù hợp → found:false (không tự tạo giá).
 */
export function resolvePriceCore(i: ResolveInput): ResolveResult {
  const trace: string[] = [], none = (why: string): ResolveResult => ({ found: false, price: null, source: null, sourceId: null, sourceName: '', groupId: null, warning: why, trace: [...trace, why] });
  if (i.item.status !== 'active') return none('Mặt hàng đang ngừng kinh doanh, không thể lấy giá.');
  const mine = new Set(i.customerGroupIds);
  const gp = i.groupPrices.filter(g => mine.has(g.groupId) && stateOf(g, i.today) === 'current');
  if (gp.length) {
    gp.sort((a, b) => (i.priorities[b.groupId] ?? 0) - (i.priorities[a.groupId] ?? 0) || a.price - b.price || (a.groupId < b.groupId ? -1 : 1));
    const w = gp[0]; trace.push(`Giá riêng nhóm "${w.groupName}": ${w.price} (ưu tiên ${i.priorities[w.groupId] ?? 0})${gp.length > 1 ? ` — thắng ${gp.length - 1} nhóm khác` : ''}.`);
    return found(w.price, 'group', w.id, w.groupName, w.groupId, trace);
  }
  trace.push('Không có giá riêng theo nhóm đang hiệu lực.');
  const cand = i.lists.filter(l => l.price !== null && stateOf(l, i.today) === 'current' && (l.customerGroupIds.length === 0 || l.customerGroupIds.some(g => mine.has(g))));
  const scoped = cand.filter(l => l.customerGroupIds.length > 0), tier = scoped.length ? scoped : cand;
  if (tier.length) {
    tier.sort((a, b) => a.price! - b.price! || (a.code < b.code ? -1 : 1));
    const w = tier[0]; trace.push(`Bảng giá ${w.code} (${scoped.length ? 'gắn nhóm khách' : 'chung'}): ${w.price}${tier.length > 1 ? ` — thấp nhất trong ${tier.length} bảng giá cùng loại` : ''}.`);
    return found(w.price!, 'priceList', w.id, `${w.code} – ${w.name}`, null, trace);
  }
  trace.push('Không có bảng giá đang hiệu lực chứa mặt hàng này.');
  trace.push(`Dùng giá bán mặc định: ${i.item.defaultPrice}.`);
  return found(i.item.defaultPrice, 'default', i.item.id, 'Giá bán mặc định', null, trace, i.item.defaultPrice === 0 ? 'Giá bán mặc định đang bằng 0; hãy kiểm tra trước khi báo giá.' : null);
}

// ---------------- Chính sách chiết khấu ----------------
export interface PolicyInput { name: string; description: string; kind: DiscountKind; value: number; stackable: boolean; customerGroupIds: string[]; itemIds: string[]; categoryIds: string[]; minOrderValue: number | null; startDate: string | null; endDate: string | null; status: ActiveStatus }
const ids = (v: unknown, label: string): R<string[]> => {
  if (v === undefined) return { ok: true, value: [] };
  if (!Array.isArray(v) || v.length > 100 || v.some(x => typeof x !== 'string' || !x.trim() || x.length > 120)) return fail(`${label} không hợp lệ (tối đa 100).`);
  return { ok: true, value: [...new Set(v as string[])] };
};
export function parsePolicy(raw: unknown): R<PolicyInput> {
  const b = obj(raw), name = str(b.name), description = str(b.description), status = b.status === undefined ? 'active' : b.status;
  if (!name) return fail('Vui lòng nhập tên chính sách.'); if (name.length > 150) return fail('Tên chính sách tối đa 150 ký tự.');
  if (description.length > 500) return fail('Mô tả tối đa 500 ký tự.');
  if (b.kind !== 'percent' && b.kind !== 'amount') return fail('Loại chiết khấu phải là phần trăm hoặc số tiền.');
  if (!num(b.value) || (b.value as number) <= 0) return fail('Giá trị chiết khấu phải là số nguyên dương.');
  if (b.kind === 'percent' && (b.value as number) > 10000) return fail('Chiết khấu phần trăm tối đa 100%.');
  if (b.kind === 'amount' && (b.value as number) > PRICE_MAX) return fail('Số tiền chiết khấu quá lớn.');
  if (b.stackable !== undefined && typeof b.stackable !== 'boolean') return fail('Cờ cộng dồn không hợp lệ.');
  if (status !== 'active' && status !== 'inactive') return fail('Trạng thái không hợp lệ.');
  let min: number | null = null;
  if (b.minOrderValue !== undefined && b.minOrderValue !== null && b.minOrderValue !== '') { const m = parsePrice(b.minOrderValue); if (!m.ok) return fail('Giá trị đơn hàng tối thiểu không hợp lệ.'); min = m.value; }
  const g = ids(b.customerGroupIds, 'Nhóm khách hàng'), it = ids(b.itemIds, 'Danh sách sản phẩm / dịch vụ'), c = ids(b.categoryIds, 'Danh sách nhóm hàng'), d = parseDates(b);
  if (!g.ok) return g; if (!it.ok) return it; if (!c.ok) return c; if (!d.ok) return d;
  return { ok: true, value: { name, description, kind: b.kind, value: b.value as number, stackable: b.stackable === true, customerGroupIds: g.value, itemIds: it.value, categoryIds: c.value, minOrderValue: min, ...d.value, status } };
}
export interface PolicyLite { id: string; code: string; name: string; kind: DiscountKind; value: number; stackable: boolean; customerGroupIds: string[]; itemIds: string[]; categoryIds: string[]; minOrderValue: number | null; startDate: string | null; endDate: string | null; status: ActiveStatus }
export interface LineIn { itemId: string; categoryId: string; quantity: number; unitPrice: number }
const allocate = (total: number, weights: number[]) => { // chia nguyên theo tỷ lệ, phần dư dồn vào dòng cuối
  const sum = weights.reduce((a, b) => a + b, 0), out = weights.map(w => (sum ? Math.floor((total * w) / sum) : 0)); out[out.length - 1] += total - out.reduce((a, b) => a + b, 0); return out;
};
/**
 * Chọn chính sách: một chính sách KHÔNG cộng dồn có mức giảm lớn nhất (hòa → mã nhỏ hơn) cùng mọi chính sách được đánh dấu "cộng dồn" đang đủ điều kiện.
 * Mức giảm của mỗi chính sách chia theo tỷ lệ cho các dòng phù hợp; mỗi dòng không giảm quá thành tiền của chính nó.
 */
export function evaluateDiscounts(lines: LineIn[], ctx: { today: string; customerGroupIds: string[] }, policies: PolicyLite[]): DiscountResult {
  const totals = lines.map(l => l.quantity * l.unitPrice), subtotal = totals.reduce((a, b) => a + b, 0), mine = new Set(ctx.customerGroupIds);
  const evals: (PolicyEval & { stackable: boolean })[] = policies.map(p => {
    const base = { policyId: p.id, code: p.code, name: p.name, stackable: p.stackable, discount: 0, lineIndexes: [] as number[] }, no = (reason: string) => ({ ...base, applicable: false, reason });
    const st = stateOf(p, ctx.today);
    if (st === 'inactive') return no('Chính sách đã ngừng áp dụng.'); if (st === 'expired') return no('Chính sách đã hết hiệu lực.'); if (st === 'upcoming') return no('Chính sách chưa đến ngày áp dụng.');
    if (p.customerGroupIds.length && !p.customerGroupIds.some(g => mine.has(g))) return no('Khách hàng không thuộc nhóm được áp dụng.');
    const all = !p.itemIds.length && !p.categoryIds.length, idx = lines.flatMap((l, i) => (all || p.itemIds.includes(l.itemId) || p.categoryIds.includes(l.categoryId) ? [i] : []));
    if (!idx.length) return no('Không có dòng hàng nào thuộc phạm vi áp dụng.');
    if (p.minOrderValue !== null && subtotal < p.minOrderValue) return no('Giá trị đơn hàng chưa đạt mức tối thiểu.');
    const matched = idx.reduce((a, i) => a + totals[i], 0), d = p.kind === 'percent' ? Math.round((matched * p.value) / 10000) : Math.min(p.value, matched);
    if (d <= 0) return no('Mức giảm bằng 0.');
    return { ...base, applicable: true, reason: 'Đủ điều kiện áp dụng.', discount: d, lineIndexes: idx };
  });
  const ok = evals.filter(e => e.applicable), best = ok.filter(e => !e.stackable).sort((a, b) => b.discount - a.discount || (a.code < b.code ? -1 : 1))[0];
  const applied = [...(best ? [best] : []), ...ok.filter(e => e.stackable)];
  const per = lines.map(() => 0);
  for (const e of applied) { const parts = allocate(e.discount, e.lineIndexes.map(i => totals[i])); e.lineIndexes.forEach((li, k) => { per[li] += parts[k]; }); }
  const lineDiscounts = per.map((d, i) => Math.min(d, totals[i])), totalDiscount = lineDiscounts.reduce((a, b) => a + b, 0);
  const strip = ({ stackable: _s, ...e }: PolicyEval & { stackable: boolean }): PolicyEval => (void _s, e);
  return { subtotal, policies: evals.map(strip), applied: applied.map(strip), lineDiscounts, totalDiscount, netTotal: subtotal - totalDiscount };
}
/** Tỷ lệ chiết khấu thực tế (điểm cơ bản, làm tròn lên) và việc có vượt hạn mức của vai trò hay không */
export const discountBp = (discount: number, subtotal: number) => (subtotal > 0 ? Math.ceil((discount * 10000) / subtotal) : 0);
export const exceedsLimit = (role: string, discount: number, subtotal: number) => discountBp(discount, subtotal) > discountLimitBp(role);

// ---------------- Tra cứu / tính thử ----------------
export interface EvaluateIn { customerId: string | null; groupIds: string[]; date: string | null; lines: { itemId: string; quantity: number; unitPrice: number | null }[] }
export function parseEvaluate(raw: unknown): R<EvaluateIn> {
  const b = obj(raw), lines = b.lines, date = str(b.date), customerId = str(b.customerId) || null;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > EVAL_LINES_MAX) return fail(`Cần từ 1 đến ${EVAL_LINES_MAX} dòng hàng.`);
  if (date && !isDate(date)) return fail('Ngày không hợp lệ (định dạng YYYY-MM-DD).');
  const g = ids(b.groupIds, 'Nhóm khách hàng'); if (!g.ok) return g;
  const out: EvaluateIn['lines'] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = obj(lines[i]), itemId = str(l.itemId);
    if (!itemId) return fail(`Dòng ${i + 1}: thiếu mặt hàng.`);
    if (!num(l.quantity) || (l.quantity as number) < 1 || (l.quantity as number) > 1_000_000) return fail(`Dòng ${i + 1}: số lượng phải là số nguyên từ 1 đến 1.000.000.`);
    let unitPrice: number | null = null;
    if (l.unitPrice !== undefined && l.unitPrice !== null) { const p = parsePrice(l.unitPrice); if (!p.ok) return fail(`Dòng ${i + 1}: đơn giá không hợp lệ.`); unitPrice = p.value; }
    out.push({ itemId, quantity: l.quantity as number, unitPrice });
  }
  return { ok: true, value: { customerId, groupIds: g.value, date: date || null, lines: out } };
}

// ---------------- Thuế & tổng hợp ----------------
/** Giá trị một dòng tối đa (VND): đủ lớn cho nghiệp vụ, đủ nhỏ để cộng 50 dòng vẫn là số nguyên an toàn. */
export const LINE_TOTAL_MAX = 99_999_999_999_999;
/** Làm tròn nửa lên cho số nguyên không âm a/b, dùng BigInt để không mất chính xác. */
const B2 = BigInt(2), B10000 = BigInt(10000);
const divRound = (a: bigint, b: bigint) => (a * B2 + b) / (b * B2);
/**
 * Thuế của một dòng sau chiết khấu. `afterDiscount` là số tiền dòng sau chiết khấu (≥ 0).
 * - Giá đã gồm thuế: thuế = afterDiscount × r / (1 + r), chưa thuế = phần còn lại, phải trả = afterDiscount.
 * - Giá chưa gồm thuế: thuế = afterDiscount × r, phải trả = afterDiscount + thuế.
 * Thuế suất tính theo điểm cơ bản (1000 = 10%); null / 0 = không thuế.
 */
export function lineTax(afterDiscount: number, rateBp: number | null, includes: boolean): { amountBeforeTax: number; tax: number; total: number } {
  if (!rateBp || rateBp <= 0) return { amountBeforeTax: afterDiscount, tax: 0, total: afterDiscount };
  const a = BigInt(afterDiscount), r = BigInt(rateBp);
  if (includes) { const tax = Number(divRound(a * r, B10000 + r)); return { amountBeforeTax: afterDiscount - tax, tax, total: afterDiscount }; }
  const tax = Number(divRound(a * r, B10000)); return { amountBeforeTax: afterDiscount, tax, total: afterDiscount + tax };
}
export const sumTotals = (lines: { error: string | null; lineTotal: number; discount: number; amountBeforeTax: number; tax: number; total: number }[]) =>
  lines.filter(l => !l.error).reduce((t, l) => ({ subtotal: t.subtotal + l.lineTotal, discount: t.discount + l.discount, amountBeforeTax: t.amountBeforeTax + l.amountBeforeTax, tax: t.tax + l.tax, total: t.total + l.total }), { subtotal: 0, discount: 0, amountBeforeTax: 0, tax: 0, total: 0 });
