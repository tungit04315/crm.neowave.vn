import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import { actorOf, body, createDoc, hist, iso, mutate, namesOf, notFound, stamp } from './catalog';
import { formatVnd } from '../catalog-core';
import { stateOf, todayVn } from '../price-list-core';
import { createHash } from 'node:crypto';
import { discountBp, discountLimitBp, evaluateDiscounts, exceedsLimit, LINE_TOTAL_MAX, lineTax, parseEvaluate, parsePolicy, pricingCan, sumTotals, type PolicyInput, type PolicyLite } from '../pricing-core';
import type { Change } from '@/types/catalog';
import type { DiscountHistoryDto, DiscountPolicyDto, EvaluateLineOut, EvaluateOut, PriceSnapshot } from '@/types/pricing';
import { groupIdsFor, needEdit, needView, resolveMany } from './pricing';

const db = () => adminDb();
const col = (n: string) => db().collection(n);

const toDto = (id: string, d: DocumentData, n: { g: Map<string, DocumentData>; i: Map<string, DocumentData>; c: Map<string, DocumentData> }, today: string): DiscountPolicyDto => ({
  id, code: d.code, name: d.name, description: d.description ?? '', kind: d.kind, value: d.value, stackable: !!d.stackable,
  customerGroupIds: d.customerGroupIds ?? [], customerGroupNames: (d.customerGroupIds ?? []).map((x: string) => n.g.get(x)?.name ?? '(Nhóm không khả dụng)'),
  itemIds: d.itemIds ?? [], itemNames: (d.itemIds ?? []).map((x: string) => (n.i.get(x) ? `${n.i.get(x)!.code} – ${n.i.get(x)!.name}` : x)),
  categoryIds: d.categoryIds ?? [], categoryNames: (d.categoryIds ?? []).map((x: string) => n.c.get(x)?.name ?? '(Nhóm hàng không khả dụng)'),
  minOrderValue: d.minOrderValue ?? null, startDate: d.startDate ?? null, endDate: d.endDate ?? null, status: d.status,
  state: stateOf({ status: d.status, startDate: d.startDate ?? null, endDate: d.endDate ?? null }, today), version: d.version, createdByName: d.createdByName ?? '', createdAt: iso(d.createdAt) ?? '', updatedAt: iso(d.updatedAt) ?? '',
});
async function namesFor(org: string, docs: DocumentData[]) {
  const [g, i, c] = await Promise.all([namesOf(org, 'customerGroups', docs.flatMap(d => d.customerGroupIds ?? [])), namesOf(org, 'catalogItems', docs.flatMap(d => d.itemIds ?? [])), namesOf(org, 'catalogCategories', docs.flatMap(d => d.categoryIds ?? []))]);
  return { g, i, c };
}
async function loadPolicy(c: Ctx, id: string) {
  const d = (await col('discountPolicies').doc(id).get()).data(); if (!d || d.organizationId !== c.orgId) throw notFound(); return d;
}
export async function listPolicies(c: Ctx, q: Record<string, string | undefined>) {
  needView(c);
  const docs = (await col('discountPolicies').where('organizationId', '==', c.orgId).limit(500).get()).docs, n = await namesFor(c.orgId, docs.map(s => s.data())), today = todayVn();
  let items = docs.map(s => toDto(s.id, s.data(), n, today));
  if (q.state) items = items.filter(p => p.state === q.state);
  if (q.status === 'active' || q.status === 'inactive') items = items.filter(p => p.status === q.status);
  items.sort((a, b) => (a.code < b.code ? 1 : -1));
  return { items, can: { edit: pricingCan.edit(actorOf(c)) } };
}
export async function getPolicy(c: Ctx, id: string) {
  needView(c);
  const d = await loadPolicy(c, id);
  return { policy: toDto(id, d, await namesFor(c.orgId, [d]), todayVn()), can: { edit: pricingCan.edit(actorOf(c)) } };
}
async function checkRefs(tx: Transaction, org: string, v: PolicyInput) {
  const chk = async (coll: string, ids: string[], label: string) => (await Promise.all(ids.map(i => tx.get(col(coll).doc(i))))).forEach((s, k) => { const d = s.data(); if (!d || d.organizationId !== org || d.deletedAt) throw new HttpError(400, 'bad-ref', `${label} không tồn tại (${ids[k]}).`); });
  await Promise.all([chk('customerGroups', v.customerGroupIds, 'Nhóm khách hàng'), chk('catalogItems', v.itemIds, 'Sản phẩm / dịch vụ'), chk('catalogCategories', v.categoryIds, 'Nhóm hàng')]);
}
const fields = (v: PolicyInput) => ({ name: v.name, description: v.description, kind: v.kind, value: v.value, stackable: v.stackable, customerGroupIds: v.customerGroupIds, itemIds: v.itemIds, categoryIds: v.categoryIds, minOrderValue: v.minOrderValue, startDate: v.startDate, endDate: v.endDate, status: v.status });
export async function createPolicy(c: Ctx, raw: unknown) {
  needEdit(c);
  const p = parsePolicy(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const v = p.value;
  return createDoc(c, {
    coll: 'discountPolicies', counter: `${c.orgId}_discount`, prefix: 'CK', pad: 3, requestId: body(raw).requestId,
    precheck: tx => checkRefs(tx, c.orgId, v), build: code => ({ ...stamp(c), code, ...fields(v) }),
    after: (tx, ref) => { tx.set(ref.collection('history').doc(), hist(c, 'created', [])); },
  });
}
const shown = (k: string, x: unknown): string => {
  if (k === 'kind') return x === 'percent' ? 'Phần trăm' : 'Số tiền';
  if (k === 'value') return String(x);
  if (k === 'stackable') return x ? 'Có' : 'Không';
  if (k === 'status') return x === 'active' ? 'Đang áp dụng' : 'Ngừng áp dụng';
  if (k === 'minOrderValue') return x === null || x === undefined ? '—' : formatVnd(x as number);
  if (Array.isArray(x)) return `${x.length} mục`;
  return x === null || x === undefined || x === '' ? '—' : String(x);
};
const LABEL: [keyof PolicyInput, string][] = [['name', 'Tên'], ['description', 'Mô tả'], ['kind', 'Loại'], ['value', 'Giá trị'], ['stackable', 'Cho phép cộng dồn'], ['customerGroupIds', 'Nhóm khách hàng'], ['itemIds', 'Sản phẩm / dịch vụ'], ['categoryIds', 'Nhóm hàng'], ['minOrderValue', 'Đơn tối thiểu'], ['startDate', 'Ngày bắt đầu'], ['endDate', 'Ngày kết thúc'], ['status', 'Trạng thái']];
export async function updatePolicy(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const p = parsePolicy(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const version = body(raw).version; if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  const v = p.value;
  return mutate(c, 'discountPolicies', id, version, async (d, tx) => {
    const same = (k: keyof PolicyInput) => (Array.isArray(v[k]) ? JSON.stringify([...(d[k] ?? [])].sort()) === JSON.stringify([...(v[k] as string[])].sort()) : (d[k] ?? null) === (v[k] ?? null) || ((d[k] ?? '') === '' && (v[k] ?? '') === ''));
    const changes: Change[] = LABEL.filter(([k]) => !same(k)).map(([k, label]) => ({ field: k, label, from: shown(k, d[k]), to: shown(k, v[k]) }));
    if (!changes.length) return { update: null };
    await checkRefs(tx, c.orgId, v);
    return { update: fields(v), history: hist(c, 'updated', changes) };
  });
}
export async function setPolicyStatus(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const b = body(raw);
  if (b.status !== 'active' && b.status !== 'inactive') throw new HttpError(400, 'invalid', 'Trạng thái không hợp lệ.');
  if (typeof b.version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  return mutate(c, 'discountPolicies', id, b.version, async d => (d.status === b.status ? { update: null }
    : { update: { status: b.status }, history: hist(c, 'status_changed', [{ field: 'status', label: 'Trạng thái', from: shown('status', d.status), to: shown('status', b.status) }]) }));
}
export async function listPolicyHistory(c: Ctx, id: string): Promise<{ items: DiscountHistoryDto[] }> {
  needView(c); await loadPolicy(c, id);
  const snap = await col('discountPolicies').doc(id).collection('history').orderBy('at', 'desc').limit(200).get();
  return { items: snap.docs.map(s => { const h = s.data(); return { id: s.id, type: h.type, changes: h.changes ?? [], actorName: h.actorName ?? '', at: iso(h.at) ?? '' }; }) };
}

/**
 * Tính thử giá + chiết khấu cho một giỏ hàng (không lưu gì). Đây là điểm tích hợp cho báo giá ở Phase 04.
 * Dòng không có `unitPrice` được lấy theo quy tắc xác định giá; dòng có `unitPrice` được giữ nguyên (tính thử).
 */
export async function evaluate(c: Ctx, raw: unknown): Promise<EvaluateOut> {
  needView(c);
  const p = parseEvaluate(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const today = p.value.date ?? todayVn(), groupIds = await groupIdsFor(c, p.value.customerId, p.value.groupIds);
  const need = p.value.lines.filter(l => l.unitPrice === null).map(l => l.itemId), resolved = await resolveMany(c, need, groupIds, today), items = await namesOf(c.orgId, 'catalogItems', p.value.lines.map(l => l.itemId));
  const [units, taxes] = await Promise.all([namesOf(c.orgId, 'catalogUnits', [...items.values()].map(i => i.unitId)), namesOf(c.orgId, 'taxRates', [...items.values()].map(i => i.taxRateId))]);
  const out: EvaluateLineOut[] = [], valid: { outIndex: number; categoryId: string }[] = [];
  p.value.lines.forEach((l, index) => {
    const it = items.get(l.itemId), tx = it?.taxRateId ? taxes.get(it.taxRateId) : undefined;
    const base: EvaluateLineOut = { index, itemId: l.itemId, code: it?.code ?? '', name: it?.name ?? '', unitName: it ? units.get(it.unitId)?.name ?? '' : '', quantity: l.quantity, unitPrice: null, priceSource: null, priceSourceName: '', warning: null, error: null, lineTotal: 0, discount: 0,
      taxRateId: it?.taxRateId ?? null, taxRateName: tx?.name ?? '', taxRateBp: tx && !tx.deletedAt ? tx.rateBp ?? null : null, priceIncludesTax: !!it?.priceIncludesTax, amountBeforeTax: 0, tax: 0, total: 0 };
    if (!it || it.deletedAt) { out.push({ ...base, error: 'Không tìm thấy sản phẩm / dịch vụ.' }); return; }
    let unitPrice: number, extra: Partial<EvaluateLineOut>;
    if (l.unitPrice !== null) { unitPrice = l.unitPrice; extra = { priceSourceName: 'Nhập tay' }; }
    else {
      const r = resolved.get(l.itemId)?.result;
      if (!r || !r.found) { out.push({ ...base, error: r?.warning ?? 'Không tìm thấy giá phù hợp. Hãy kiểm tra hoặc xin phê duyệt.' }); return; }
      unitPrice = r.price!; extra = { priceSource: r.source, priceSourceName: r.sourceName, warning: r.warning };
    }
    if (l.quantity * unitPrice > LINE_TOTAL_MAX) { out.push({ ...base, error: 'Thành tiền của dòng quá lớn.' }); return; }
    out.push({ ...base, ...extra, unitPrice, lineTotal: l.quantity * unitPrice }); valid.push({ outIndex: index, categoryId: it.categoryId });
  });
  const pol = (await col('discountPolicies').where('organizationId', '==', c.orgId).where('status', '==', 'active').limit(300).get()).docs.map(s => { const d = s.data(); return { id: s.id, code: d.code, name: d.name, kind: d.kind, value: d.value, stackable: !!d.stackable, customerGroupIds: d.customerGroupIds ?? [], itemIds: d.itemIds ?? [], categoryIds: d.categoryIds ?? [], minOrderValue: d.minOrderValue ?? null, startDate: d.startDate ?? null, endDate: d.endDate ?? null, status: d.status } as PolicyLite; });
  const discount = evaluateDiscounts(valid.map(v => ({ itemId: out[v.outIndex].itemId, categoryId: v.categoryId, quantity: out[v.outIndex].quantity, unitPrice: out[v.outIndex].unitPrice! })), { today, customerGroupIds: groupIds }, pol);
  valid.forEach((v, k) => { const l = out[v.outIndex]; l.discount = discount.lineDiscounts[k]; Object.assign(l, lineTax(l.lineTotal - l.discount, l.taxRateBp, l.priceIncludesTax)); });
  // chỉ số dòng trong kết quả chính sách tính theo dòng hợp lệ → đổi về chỉ số dòng gốc cho người dùng
  const remap = <T extends { lineIndexes: number[] }>(e: T): T => ({ ...e, lineIndexes: e.lineIndexes.map(i => valid[i].outIndex) });
  const res = { ...discount, policies: discount.policies.map(remap), applied: discount.applied.map(remap), lineDiscounts: out.map(l => l.discount) };
  return { lines: out, discount: res, totals: sumTotals(out), limitBp: discountLimitBp(c.role), discountBp: discountBp(res.totalDiscount, res.subtotal), needsApproval: exceedsLimit(c.role, res.totalDiscount, res.subtotal), groupIds };
}

/** Ảnh chụp giá bất biến cho báo giá / đơn hàng: cùng phép tính như `evaluate`, kèm thời điểm, người tính và dấu vân tay nội dung (SHA-256). Không ghi dữ liệu. */
export async function snapshotPrice(c: Ctx, raw: unknown): Promise<PriceSnapshot> {
  const e = await evaluate(c, raw), p = parseEvaluate(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  if (e.lines.some(l => l.error)) throw new HttpError(422, 'unpriced', `Không thể chụp giá: ${e.lines.filter(l => l.error).map(l => `dòng ${l.index + 1} (${l.error})`).join('; ')}`);
  const core = { schema: 1 as const, computedAt: new Date().toISOString(), priceDate: p.value.date ?? todayVn(), currency: 'VND' as const, customerId: p.value.customerId, groupIds: e.groupIds, actor: { uid: c.uid, name: c.name, role: c.role },
    lines: e.lines, appliedPolicies: e.discount.applied.map(a => ({ policyId: a.policyId, code: a.code, name: a.name, discount: a.discount, lineIndexes: a.lineIndexes })), totals: e.totals, discountBp: e.discountBp, limitBp: e.limitBp, needsApproval: e.needsApproval };
  return { ...core, fingerprint: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
}
