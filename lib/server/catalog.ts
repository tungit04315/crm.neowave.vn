import { randomBytes } from 'node:crypto';
import { FieldPath, FieldValue, Timestamp, type DocumentData, type DocumentReference, type Query, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import type { CatalogHistoryDto, CatalogStats, CategoryDto, CatalogType, Change, ItemDetail, ItemDto, ItemFlags, ItemList, PriceHistoryDto, PriceMode, PriceRequestDto, TaxRateDto, UnitDto } from '@/types/catalog';
import { EXPORT_MAX } from '../catalog-io-core';
import {
  can, CATEGORY_PREFIX, diffItem, docId, formatCode, ITEM_PREFIX, isRequestId, isType, matchesTokens, parseCategory, parseItemCreate, parseItemInput, parsePriceChange, parseTax, parseUnit,
  planPriceChange, priceChangeLine, priceDelta, PRICE_APPROVE_ROLES, queryTokens, searchTokens, symbolKey, type Actor, type ItemInput, type RefKey,
} from '../catalog-core';

// Toàn bộ collection của phân hệ chỉ máy chủ (Admin SDK) được đọc/ghi; trình duyệt bị firestore.rules từ chối.
const db = () => adminDb();
const col = (n: string) => db().collection(n);
export const actorOf = (c: Ctx): Actor => ({ uid: c.uid, role: c.role });
export const body = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
export const iso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);
export const notFound = () => new HttpError(404, 'not-found', 'Không tìm thấy dữ liệu.');
export const forbid = (m: string) => new HttpError(403, 'forbidden', m);
const needView = (c: Ctx) => { if (!can.view(actorOf(c))) throw forbid('Vai trò của bạn chưa được cấp quyền xem danh mục sản phẩm & dịch vụ.'); };
const needEdit = (c: Ctx) => { needView(c); if (!can.edit(actorOf(c))) throw forbid('Bạn không có quyền chỉnh sửa danh mục sản phẩm & dịch vụ.'); };
const needTax = (c: Ctx) => { needView(c); if (!can.editTax(actorOf(c))) throw forbid('Bạn không có quyền quản lý thuế suất.'); };
export const hist = (c: Ctx, type: string, changes: Change[], note = '') => ({ type, changes, note, actorUid: c.uid, actorName: c.name, at: FieldValue.serverTimestamp() });
export const stamp = (c: Ctx) => ({ organizationId: c.orgId, version: 1, createdBy: c.uid, createdByName: c.name, updatedBy: c.uid, updatedByName: c.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), deletedAt: null });
export const touch = (c: Ctx) => ({ updatedBy: c.uid, updatedByName: c.name, updatedAt: FieldValue.serverTimestamp(), version: FieldValue.increment(1) });
const claimRef = (org: string, key: string) => col('catalogCodes').doc(`${org}__${key}`);
const unitKey = (symbol: string) => `unit-symbol__${symbolKey(symbol)}`;

// ---------------- Mẫu chung ----------------
interface CreateSpec {
  coll: string; counter: string; prefix: string; pad: number; requestId: unknown;
  build: (code: string) => DocumentData;
  precheck?: (tx: Transaction) => Promise<void>;                          // đọc/kiểm tra tham chiếu TRƯỚC khi ghi
  claim?: { key: string; message: string };                               // khóa duy nhất (vd: ký hiệu đơn vị)
  after?: (tx: Transaction, ref: DocumentReference, code: string) => void; // ghi thêm (lịch sử...)
}
/** Tạo tài liệu có mã tự sinh. `requestId` chống tạo trùng; ID tài liệu = tổ chức + mã nên mã không thể trùng. */
export async function createDoc(c: Ctx, s: CreateSpec) {
  if (!isRequestId(s.requestId)) throw new HttpError(400, 'invalid', 'Thiếu mã yêu cầu.');
  const reqRef = claimRef(c.orgId, `req__${s.requestId}`), counter = db().doc(`counters/${s.counter}`), cRef = s.claim ? claimRef(c.orgId, s.claim.key) : null;
  return db().runTransaction(async tx => {
    const [rq, cn, cl] = await Promise.all([tx.get(reqRef), tx.get(counter), cRef ? tx.get(cRef) : Promise.resolve(null)]);
    if (rq.exists) return { id: rq.data()!.refId as string, duplicate: true };
    if (cl?.exists) throw new HttpError(409, 'duplicate', s.claim!.message);
    await s.precheck?.(tx);
    const n = ((cn.data()?.value as number | undefined) ?? 0) + 1, code = formatCode(s.prefix, n, s.pad), id = docId(c.orgId, code), ref = col(s.coll).doc(id);
    tx.set(counter, { value: n });
    tx.create(ref, s.build(code));
    tx.create(reqRef, { refId: id, createdAt: FieldValue.serverTimestamp() });
    if (cRef) tx.create(cRef, { refId: id });
    s.after?.(tx, ref, code);
    return { id, duplicate: false };
  });
}

interface Plan { update: DocumentData | null; history?: ReturnType<typeof hist> | null; releaseClaim?: string; takeClaim?: { key: string; message: string } }
/** Đọc trong transaction → kiểm tra tổ chức / phiên bản → để `plan` quyết định → ghi thay đổi + lịch sử cùng lúc */
export async function mutate(c: Ctx, coll: string, id: string, version: number | undefined, plan: (d: DocumentData, tx: Transaction) => Promise<Plan>) {
  const ref = col(coll).doc(id);
  return db().runTransaction(async tx => {
    const s = await tx.get(ref), d = s.data();
    if (!d || d.organizationId !== c.orgId || d.deletedAt) throw notFound();
    if (version !== undefined && d.version !== version) throw new HttpError(409, 'conflict', 'Dữ liệu vừa được người khác cập nhật. Vui lòng tải lại trang.');
    const p = await plan(d, tx);
    if (!p.update) return { id, changed: false };
    const take = p.takeClaim ? claimRef(c.orgId, p.takeClaim.key) : null;
    if (take && (await tx.get(take)).exists) throw new HttpError(409, 'duplicate', p.takeClaim!.message);
    tx.update(ref, { ...p.update, ...touch(c) });
    if (p.history) tx.set(ref.collection('history').doc(), p.history);
    if (p.releaseClaim) tx.delete(claimRef(c.orgId, p.releaseClaim));
    if (take) tx.create(take, { refId: id });
    return { id, changed: true };
  });
}
async function checkRef(tx: Transaction, coll: string, org: string, id: string, label: string, type?: CatalogType) {
  const d = (await tx.get(col(coll).doc(id))).data();
  if (!d || d.organizationId !== org || d.deletedAt) throw new HttpError(400, 'bad-ref', `${label} không tồn tại.`);
  if (d.status !== 'active') throw new HttpError(400, 'bad-ref', `${label} đang ngừng sử dụng.`);
  if (type && d.type !== type) throw new HttpError(400, 'bad-ref', `${label} không thuộc loại ${type === 'product' ? 'sản phẩm' : 'dịch vụ'}.`);
}
const nameIn = async (tx: Transaction, coll: string, id: string | null) => (id ? ((await tx.get(col(coll).doc(id))).data()?.name as string | undefined) ?? id : '—');
export async function namesOf(org: string, coll: string, ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))], out = new Map<string, DocumentData>();
  for (let i = 0; i < uniq.length; i += 300) (await db().getAll(...uniq.slice(i, i + 300).map(id => col(coll).doc(id)))).forEach(s => { const d = s.data(); if (d && d.organizationId === org) out.set(s.id, d); });
  return out;
}
const countOf = (q: Query) => q.count().get().then(s => s.data().count);

// ---------------- Chuyển đổi dữ liệu trả về ----------------
type Refs = { cat: Map<string, DocumentData>; unit: Map<string, DocumentData>; tax: Map<string, DocumentData> };
export async function refsFor(org: string, docs: DocumentData[]): Promise<Refs> {
  const [cat, unit, tax] = await Promise.all([namesOf(org, 'catalogCategories', docs.map(d => d.categoryId)), namesOf(org, 'catalogUnits', docs.map(d => d.unitId)), namesOf(org, 'taxRates', docs.map(d => d.taxRateId))]);
  return { cat, unit, tax };
}
export const toItem = (id: string, d: DocumentData, r: Refs): ItemDto => ({
  id, code: d.code, type: d.type, name: d.name, shortDescription: d.shortDescription ?? '', description: d.description ?? '',
  categoryId: d.categoryId, categoryName: r.cat.get(d.categoryId)?.name ?? '(Nhóm không khả dụng)', unitId: d.unitId, unitName: r.unit.get(d.unitId)?.name ?? '', unitSymbol: r.unit.get(d.unitId)?.symbol ?? '',
  taxRateId: d.taxRateId ?? null, taxRateName: d.taxRateId ? r.tax.get(d.taxRateId)?.name ?? '' : '', taxRateBp: d.taxRateId ? (r.tax.get(d.taxRateId)?.rateBp ?? null) : null, priceIncludesTax: !!d.priceIncludesTax,
  defaultPrice: d.defaultPrice, status: d.status, note: d.note ?? '', pendingPriceRequestId: d.pendingPriceRequestId ?? null,
  version: d.version, createdByName: d.createdByName ?? '', updatedByName: d.updatedByName ?? '', createdAt: iso(d.createdAt) ?? '', updatedAt: iso(d.updatedAt) ?? '',
});
const toRequest = (id: string, d: DocumentData): PriceRequestDto => ({
  id, itemId: d.itemId, itemCode: d.itemCode, itemName: d.itemName, oldPrice: d.oldPrice, newPrice: d.newPrice, reason: d.reason, status: d.status,
  requestedBy: d.requestedBy, requestedByName: d.requestedByName, requestedAt: iso(d.requestedAt) ?? '', decidedByName: d.decidedByName ?? null, decidedAt: iso(d.decidedAt), decisionNote: d.decisionNote ?? '',
});
const flags = (c: Ctx): ItemFlags => ({ edit: can.edit(actorOf(c)), price: can.changePriceDirect(actorOf(c)) ? 'direct' : can.requestPrice(actorOf(c)) ? 'request' : 'none' });

// ---------------- Sản phẩm / dịch vụ ----------------
const PAGE_MAX = 100;
export async function listItems(c: Ctx, q: Record<string, string | undefined>): Promise<ItemList> {
  needView(c);
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), PAGE_MAX), want = queryTokens(q.q ?? '');
  const num = (s?: string) => (s === undefined || s === '' ? null : Number(s));
  const min = num(q.minPrice), max = num(q.maxPrice);
  if ([min, max].some(x => x !== null && !Number.isFinite(x))) throw new HttpError(400, 'invalid', 'Mức giá lọc không hợp lệ.');
  // Chỉ dùng điều kiện bằng nhau + array-contains và sắp theo mã (ID) nên không cần Composite Index. Lọc khoảng giá và các từ khóa còn lại được làm ở đây.
  let base: Query = col('catalogItems').where('organizationId', '==', c.orgId);
  if (isType(q.type)) base = base.where('type', '==', q.type);
  if (q.status === 'active' || q.status === 'inactive') base = base.where('status', '==', q.status);
  if (q.categoryId) base = base.where('categoryId', '==', q.categoryId);
  if (want.length) base = base.where('searchTokens', 'array-contains', want[0]);
  base = base.orderBy(FieldPath.documentId());
  const found: QueryDocumentSnapshot[] = []; let scanned: string | null = q.cursor || null, exhausted = false;
  for (let round = 0; round < 8 && found.length <= limit && !exhausted; round++) {
    const snap = await (scanned ? base.startAfter(scanned) : base).limit(PAGE_MAX).get();
    for (const s of snap.docs) {
      scanned = s.id; const d = s.data();
      if (d.deletedAt || (want.length > 1 && !matchesTokens(d.searchTokens ?? [], want)) || (min !== null && d.defaultPrice < min) || (max !== null && d.defaultPrice > max)) continue;
      found.push(s); if (found.length > limit) break;
    }
    if (snap.size < PAGE_MAX) exhausted = true;
  }
  const page = found.slice(0, limit), refs = await refsFor(c.orgId, page.map(s => s.data()));
  const nextCursor = found.length > limit ? page[page.length - 1].id : exhausted ? null : scanned; // chưa đọc hết mà dừng sớm → tiếp tục từ vị trí đã quét
  return { items: page.map(s => toItem(s.id, s.data(), refs)), nextCursor, can: { create: can.edit(actorOf(c)), export: can.export(actorOf(c)), editTax: can.editTax(actorOf(c)) } };
}
export async function catalogStats(c: Ctx): Promise<CatalogStats> {
  needView(c);
  const items = () => col('catalogItems').where('organizationId', '==', c.orgId), t = (x: CatalogType) => items().where('type', '==', x);
  const [products, productsActive, services, servicesActive, categories] = await Promise.all([
    countOf(t('product')), countOf(t('product').where('status', '==', 'active')), countOf(t('service')), countOf(t('service').where('status', '==', 'active')),
    countOf(col('catalogCategories').where('organizationId', '==', c.orgId).where('deletedAt', '==', null))]);
  return { products, productsActive, services, servicesActive, categories };
}
export async function getItem(c: Ctx, id: string): Promise<ItemDetail> {
  needView(c);
  const ref = col('catalogItems').doc(id), s = await ref.get(), d = s.data();
  if (!d || d.organizationId !== c.orgId) throw notFound();
  const [refs, h, ph, pend] = await Promise.all([refsFor(c.orgId, [d]), ref.collection('history').orderBy('at', 'desc').limit(100).get(), ref.collection('priceHistory').orderBy('at', 'desc').limit(50).get(),
    d.pendingPriceRequestId ? col('priceChangeRequests').doc(d.pendingPriceRequestId).get() : Promise.resolve(null)]);
  const history: CatalogHistoryDto[] = h.docs.map(x => { const v = x.data(); return { id: x.id, type: v.type, changes: v.changes ?? [], note: v.note ?? '', actorName: v.actorName, at: iso(v.at) ?? '' }; });
  const priceHistory: PriceHistoryDto[] = ph.docs.map(x => { const v = x.data(); return { id: x.id, oldPrice: v.oldPrice ?? null, newPrice: v.newPrice, diff: v.diff, pctBp: v.pctBp ?? null, reason: v.reason ?? '', changedByName: v.changedByName, approvedByName: v.approvedByName ?? null, mode: v.mode as PriceMode, at: iso(v.at) ?? '' }; });
  const pr = pend?.data(), pendingRequest = pr && pr.organizationId === c.orgId && pr.status === 'pending' ? toRequest(pend!.id, pr) : null;
  return { item: toItem(id, d, refs), history, priceHistory, pendingRequest, can: flags(c) };
}
const priceRow = (c: Ctx, itemId: string, d: { code: string; name: string }, from: number | null, to: number, reason: string, mode: PriceMode, extra: { approvedBy?: Ctx; changedBy?: { uid: string; name: string }; requestId?: string } = {}) => ({
  itemId, itemCode: d.code, itemName: d.name, oldPrice: from, newPrice: to, ...(from === null ? { diff: to, pctBp: null } : priceDelta(from, to)), reason, mode,
  changedBy: extra.changedBy?.uid ?? c.uid, changedByName: extra.changedBy?.name ?? c.name, approvedBy: extra.approvedBy?.uid ?? null, approvedByName: extra.approvedBy?.name ?? null, requestId: extra.requestId ?? null, at: FieldValue.serverTimestamp(),
});
/**
 * Nhật ký giá tập trung (mọi nguồn giá) phục vụ màn hình "Lịch sử giá". Khóa tài liệu sắp xếp được theo thời gian
 * (mili-giây có đệm 0 + hậu tố ngẫu nhiên) để phân trang bằng documentId mà không cần chỉ mục tổng hợp.
 * Chỉ ghi từ khi triển khai; không có dữ liệu cho các thay đổi trước đó.
 */
export type PriceLogEntry = { kind: 'default' | 'priceList' | 'groupPrice'; scopeId: string; scopeName: string; itemId: string; itemCode: string; itemName: string; oldPrice: number | null; newPrice: number; reason: string; mode: 'initial' | 'direct' | 'approved' | 'added' | 'changed'; changedBy?: { uid: string; name: string }; approvedBy?: Ctx };
export type Attrib = { changedBy: { uid: string; name: string }; approvedBy: Ctx };
/** Thay đổi giá được áp dụng sau khi duyệt: người đề xuất là người thực hiện, người duyệt ghi riêng. */
export const approved = (a?: Attrib) => (a ? { mode: 'approved' as const, changedBy: a.changedBy, approvedBy: a.approvedBy } : {});
export const priceLogKey = (now = Date.now()) => `${String(now).padStart(15, '0')}-${randomBytes(4).toString('hex')}`;
export function logPrice(tx: Transaction, c: Ctx, e: PriceLogEntry) {
  tx.set(col('priceLog').doc(priceLogKey()), { organizationId: c.orgId, kind: e.kind, scopeId: e.scopeId, scopeName: e.scopeName, itemId: e.itemId, itemCode: e.itemCode, itemName: e.itemName, oldPrice: e.oldPrice, newPrice: e.newPrice,
    ...(e.oldPrice === null ? { diff: e.newPrice, pctBp: null } : priceDelta(e.oldPrice, e.newPrice)), reason: e.reason, mode: e.mode, changedBy: e.changedBy?.uid ?? c.uid, changedByName: e.changedBy?.name ?? c.name, approvedBy: e.approvedBy?.uid ?? null, approvedByName: e.approvedBy?.name ?? null, at: FieldValue.serverTimestamp() });
}
export async function createItem(c: Ctx, raw: unknown) {
  needEdit(c);
  const p = parseItemCreate(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const v = p.value;
  return createDoc(c, {
    coll: 'catalogItems', counter: `${c.orgId}_${v.type}`, prefix: ITEM_PREFIX[v.type], pad: 5, requestId: body(raw).requestId,
    precheck: async tx => {
      await Promise.all([checkRef(tx, 'catalogCategories', c.orgId, v.categoryId, 'Nhóm', v.type), checkRef(tx, 'catalogUnits', c.orgId, v.unitId, 'Đơn vị tính'), v.taxRateId ? checkRef(tx, 'taxRates', c.orgId, v.taxRateId, 'Thuế') : Promise.resolve()]);
    },
    build: code => ({ ...stamp(c), type: v.type, code, name: v.name, categoryId: v.categoryId, unitId: v.unitId, shortDescription: v.shortDescription, description: v.description, taxRateId: v.taxRateId,
      priceIncludesTax: v.priceIncludesTax, defaultPrice: v.defaultPrice, status: v.status, note: v.note, pendingPriceRequestId: null, searchTokens: searchTokens(code, v.name) }),
    after: (tx, ref, code) => {
      tx.set(ref.collection('history').doc(), hist(c, 'created', []));
      tx.set(ref.collection('priceHistory').doc(), priceRow(c, ref.id, { code, name: v.name }, null, v.defaultPrice, 'Giá ban đầu', 'initial'));
      logPrice(tx, c, { kind: 'default', scopeId: '', scopeName: 'Giá bán mặc định', itemId: ref.id, itemCode: code, itemName: v.name, oldPrice: null, newPrice: v.defaultPrice, reason: 'Giá ban đầu', mode: 'initial' });
    },
  });
}
export async function updateItem(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const p = parseItemInput(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const version = body(raw).version; if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  const v = p.value;
  return mutate(c, 'catalogItems', id, version, async (d, tx) => {
    const t = d.type as CatalogType;
    if (v.categoryId !== d.categoryId) await checkRef(tx, 'catalogCategories', c.orgId, v.categoryId, 'Nhóm', t);
    if (v.unitId !== d.unitId) await checkRef(tx, 'catalogUnits', c.orgId, v.unitId, 'Đơn vị tính');
    if (v.taxRateId && v.taxRateId !== d.taxRateId) await checkRef(tx, 'taxRates', c.orgId, v.taxRateId, 'Thuế');
    const before: ItemInput = { name: d.name, categoryId: d.categoryId, unitId: d.unitId, shortDescription: d.shortDescription ?? '', description: d.description ?? '', taxRateId: d.taxRateId ?? null, priceIncludesTax: !!d.priceIncludesTax, status: d.status, note: d.note ?? '' };
    const ids: [RefKey, string | null][] = [['categoryId', before.categoryId], ['categoryId', v.categoryId], ['unitId', before.unitId], ['unitId', v.unitId], ['taxRateId', before.taxRateId], ['taxRateId', v.taxRateId]];
    const coll = { categoryId: 'catalogCategories', unitId: 'catalogUnits', taxRateId: 'taxRates' } as const, nm = new Map<string, string>();
    await Promise.all(ids.map(async ([k, x]) => { if (x) nm.set(`${k}:${x}`, await nameIn(tx, coll[k], x)); }));
    const changes = diffItem(before, v, (k, x) => (x ? nm.get(`${k}:${x}`) ?? x : '—'));
    return changes.length ? { update: { ...v, searchTokens: searchTokens(d.code, v.name) }, history: hist(c, 'updated', changes) } : { update: null };
  });
}

// ---------------- Đổi giá & phê duyệt ----------------
const reqCol = () => col('priceChangeRequests');
/** Mọi thay đổi giá đi qua đây. Người có quyền đổi trực tiếp: áp dụng ngay. Quản lý: tạo yêu cầu chờ duyệt. Luôn ghi lịch sử giá. */
export async function changePrice(c: Ctx, id: string, raw: unknown) {
  const a = actorOf(c);
  if (!can.changePriceDirect(a) && !can.requestPrice(a)) throw forbid('Bạn không có quyền thay đổi giá.');
  const p = parsePriceChange(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const { newPrice, expectedPrice, reason } = p.value, itemRef = col('catalogItems').doc(id);
  return db().runTransaction(async tx => {
    const s = await tx.get(itemRef), d = s.data();
    if (!d || d.organizationId !== c.orgId) throw notFound();
    const pendRef = d.pendingPriceRequestId ? reqCol().doc(d.pendingPriceRequestId) : null, pend = pendRef ? await tx.get(pendRef) : null, pending = pend?.exists && pend.data()?.status === 'pending';
    if (d.defaultPrice !== expectedPrice) throw new HttpError(409, 'conflict', 'Giá đã được thay đổi bởi người khác. Vui lòng tải lại trang.');
    const plan = planPriceChange(a, d.defaultPrice, newPrice);
    if (plan === 'none') throw new HttpError(400, 'same-price', 'Giá mới trùng với giá hiện tại.');
    if (plan === 'forbidden') throw forbid('Bạn không có quyền thay đổi giá.');
    const line = priceChangeLine(d.defaultPrice, newPrice);
    if (plan === 'direct') {
      tx.update(itemRef, { defaultPrice: newPrice, pendingPriceRequestId: null, ...touch(c) });
      tx.set(itemRef.collection('history').doc(), hist(c, 'price_changed', [line], reason));
      tx.set(itemRef.collection('priceHistory').doc(), priceRow(c, id, d as { code: string; name: string }, d.defaultPrice, newPrice, reason, 'direct'));
      logPrice(tx, c, { kind: 'default', scopeId: '', scopeName: 'Giá bán mặc định', itemId: id, itemCode: d.code, itemName: d.name, oldPrice: d.defaultPrice, newPrice, reason, mode: 'direct' });
      if (pending) tx.update(pendRef!, { status: 'cancelled', decidedBy: c.uid, decidedByName: c.name, decidedAt: FieldValue.serverTimestamp(), decisionNote: 'Giá đã được thay đổi trực tiếp.' });
      return { id, applied: true, requestId: null };
    }
    if (pending) throw new HttpError(409, 'pending-exists', 'Đã có một yêu cầu đổi giá đang chờ duyệt cho mặt hàng này.');
    const rRef = reqCol().doc();
    tx.set(rRef, { organizationId: c.orgId, itemId: id, itemCode: d.code, itemName: d.name, oldPrice: d.defaultPrice, newPrice, reason, status: 'pending',
      requestedBy: c.uid, requestedByName: c.name, requestedAt: FieldValue.serverTimestamp(), decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: '' });
    tx.update(itemRef, { pendingPriceRequestId: rRef.id }); // không tăng version: không làm hỏng khóa lạc quan của các chỉnh sửa khác
    tx.set(itemRef.collection('history').doc(), hist(c, 'price_requested', [line], reason));
    return { id, applied: false, requestId: rRef.id };
  });
}
export async function listPriceRequests(c: Ctx, status?: string) {
  const a = actorOf(c);
  if (!can.viewRequests(a)) throw forbid('Bạn không có quyền xem yêu cầu đổi giá.');
  let q: Query = reqCol().where('organizationId', '==', c.orgId);
  if (status === 'pending' || status === 'approved' || status === 'rejected' || status === 'cancelled') q = q.where('status', '==', status);
  if (!PRICE_APPROVE_ROLES.includes(c.role)) q = q.where('requestedBy', '==', c.uid); // người gửi chỉ thấy yêu cầu của mình
  const snap = await q.limit(200).get();
  return { items: snap.docs.map(d => toRequest(d.id, d.data())).sort((x, y) => y.requestedAt.localeCompare(x.requestedAt)), can: { approve: PRICE_APPROVE_ROLES.includes(c.role) } };
}
/** Duyệt / từ chối (người có quyền duyệt, không phải người gửi) hoặc hủy (chỉ người gửi) */
export async function decidePriceRequest(c: Ctx, rid: string, raw: unknown) {
  const b = body(raw), decision = b.decision, note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : '';
  if (decision !== 'approve' && decision !== 'reject' && decision !== 'cancel') throw new HttpError(400, 'invalid', 'Quyết định không hợp lệ.');
  const rRef = reqCol().doc(rid);
  return db().runTransaction(async tx => {
    const rs = await tx.get(rRef), r = rs.data();
    if (!r || r.organizationId !== c.orgId) throw notFound();
    if (!can.viewRequests(actorOf(c))) throw forbid('Bạn không có quyền xử lý yêu cầu đổi giá.');
    if (r.status !== 'pending') throw new HttpError(409, 'closed', 'Yêu cầu này đã được xử lý.');
    if (decision === 'cancel') { if (r.requestedBy !== c.uid) throw forbid('Chỉ người gửi mới được hủy yêu cầu.'); }
    else if (!can.approvePrice(actorOf(c), { requestedBy: r.requestedBy as string })) throw forbid(r.requestedBy === c.uid ? 'Bạn không thể tự duyệt yêu cầu của chính mình.' : 'Bạn không có quyền duyệt yêu cầu đổi giá.');
    const itemRef = col('catalogItems').doc(r.itemId), is = await tx.get(itemRef), item = is.data();
    const close = (status: string) => tx.update(rRef, { status, decidedBy: c.uid, decidedByName: c.name, decidedAt: FieldValue.serverTimestamp(), decisionNote: note });
    const clear = () => { if (item && item.pendingPriceRequestId === rid) tx.update(itemRef, { pendingPriceRequestId: null }); };
    if (decision !== 'approve') {
      close(decision === 'reject' ? 'rejected' : 'cancelled'); clear();
      if (item) tx.set(itemRef.collection('history').doc(), hist(c, decision === 'reject' ? 'price_rejected' : 'price_cancelled', [priceChangeLine(r.oldPrice, r.newPrice)], note));
      return { id: rid, status: decision === 'reject' ? 'rejected' : 'cancelled' };
    }
    if (!item || item.organizationId !== c.orgId) throw new HttpError(409, 'stale', 'Mặt hàng không còn tồn tại. Hãy từ chối yêu cầu này.');
    if (item.defaultPrice !== r.oldPrice) throw new HttpError(409, 'stale', 'Giá hiện tại của mặt hàng đã khác lúc gửi yêu cầu. Hãy từ chối và yêu cầu gửi lại.');
    tx.update(itemRef, { defaultPrice: r.newPrice, pendingPriceRequestId: null, ...touch(c) });
    tx.set(itemRef.collection('history').doc(), hist(c, 'price_changed', [priceChangeLine(r.oldPrice, r.newPrice)], r.reason));
    tx.set(itemRef.collection('priceHistory').doc(), priceRow(c, r.itemId, item as { code: string; name: string }, r.oldPrice, r.newPrice, r.reason, 'approved', { changedBy: { uid: r.requestedBy, name: r.requestedByName }, approvedBy: c, requestId: rid }));
    logPrice(tx, c, { kind: 'default', scopeId: '', scopeName: 'Giá bán mặc định', itemId: r.itemId, itemCode: item.code, itemName: item.name, oldPrice: r.oldPrice, newPrice: r.newPrice, reason: r.reason, mode: 'approved', changedBy: { uid: r.requestedBy, name: r.requestedByName }, approvedBy: c });
    close('approved');
    return { id: rid, status: 'approved' };
  });
}

// ---------------- Nhóm ----------------
const catDto = (id: string, d: DocumentData, n: number): CategoryDto => ({ id, code: d.code, type: d.type, name: d.name, description: d.description ?? '', color: d.color, status: d.status, itemCount: n, version: d.version, createdByName: d.createdByName ?? '', createdAt: iso(d.createdAt) ?? '', updatedAt: iso(d.updatedAt) ?? '' });
export async function listCategories(c: Ctx, type?: string) {
  needView(c);
  let q: Query = col('catalogCategories').where('organizationId', '==', c.orgId);
  if (isType(type)) q = q.where('type', '==', type);
  const docs = (await q.limit(500).get()).docs.filter(d => !d.data().deletedAt);
  const counts = await Promise.all(docs.map(d => countOf(col('catalogItems').where('organizationId', '==', c.orgId).where('categoryId', '==', d.id))));
  return { items: docs.map((d, i) => catDto(d.id, d.data(), counts[i])).sort((a, b) => a.name.localeCompare(b.name, 'vi')), can: { edit: can.edit(actorOf(c)) } };
}
export async function createCategory(c: Ctx, raw: unknown) {
  needEdit(c);
  const p = parseCategory(raw), t = body(raw).type; if (!p.ok) throw new HttpError(400, 'invalid', p.error); if (!isType(t)) throw new HttpError(400, 'invalid', 'Loại nhóm phải là Sản phẩm hoặc Dịch vụ.');
  return createDoc(c, { coll: 'catalogCategories', counter: `${c.orgId}_cat_${t}`, prefix: CATEGORY_PREFIX[t], pad: 3, requestId: body(raw).requestId,
    build: code => ({ ...stamp(c), type: t, code, ...p.value }), after: (tx, ref) => tx.set(ref.collection('history').doc(), hist(c, 'created', [])) });
}
export async function updateCategory(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const p = parseCategory(raw), version = body(raw).version; if (!p.ok) throw new HttpError(400, 'invalid', p.error); if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  return mutate(c, 'catalogCategories', id, version, async d => {
    const labels = { name: 'Tên nhóm', description: 'Mô tả', color: 'Màu nhận diện', status: 'Trạng thái' } as const;
    const changes = (Object.keys(labels) as (keyof typeof labels)[]).filter(k => d[k] !== p.value[k]).map(k => ({ field: k, label: labels[k], from: String(d[k] || '—'), to: String(p.value[k] || '—') }));
    return changes.length ? { update: { ...p.value }, history: hist(c, 'updated', changes) } : { update: null };
  });
}
/** Chỉ xóa mềm khi nhóm không còn mặt hàng. Muốn giữ dữ liệu cũ hãy chuyển sang "Ngừng sử dụng". */
export async function deleteCategory(c: Ctx, id: string) {
  needEdit(c);
  return mutate(c, 'catalogCategories', id, undefined, async (_d, tx) => {
    const used = await tx.get(col('catalogItems').where('organizationId', '==', c.orgId).where('categoryId', '==', id).limit(1));
    if (!used.empty) throw new HttpError(409, 'in-use', 'Nhóm còn sản phẩm/dịch vụ. Hãy chuyển các mục sang nhóm khác hoặc chuyển nhóm sang "Ngừng sử dụng".');
    return { update: { deletedAt: Timestamp.now() }, history: hist(c, 'deleted', []) };
  });
}

// ---------------- Đơn vị tính ----------------
const unitDto = (id: string, d: DocumentData, n: number): UnitDto => ({ id, code: d.code, name: d.name, symbol: d.symbol, description: d.description ?? '', status: d.status, itemCount: n, version: d.version, createdByName: d.createdByName ?? '', createdAt: iso(d.createdAt) ?? '', updatedAt: iso(d.updatedAt) ?? '' });
export async function listUnits(c: Ctx) {
  needView(c);
  const docs = (await col('catalogUnits').where('organizationId', '==', c.orgId).limit(500).get()).docs.filter(d => !d.data().deletedAt);
  const counts = await Promise.all(docs.map(d => countOf(col('catalogItems').where('organizationId', '==', c.orgId).where('unitId', '==', d.id))));
  return { items: docs.map((d, i) => unitDto(d.id, d.data(), counts[i])).sort((a, b) => a.name.localeCompare(b.name, 'vi')), can: { edit: can.edit(actorOf(c)) } };
}
export async function createUnit(c: Ctx, raw: unknown) {
  needEdit(c);
  const p = parseUnit(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  return createDoc(c, { coll: 'catalogUnits', counter: `${c.orgId}_unit`, prefix: 'DVT', pad: 3, requestId: body(raw).requestId,
    claim: { key: unitKey(p.value.symbol), message: 'Ký hiệu đơn vị đã tồn tại.' }, build: code => ({ ...stamp(c), code, ...p.value, symbolKey: symbolKey(p.value.symbol) }), after: (tx, ref) => tx.set(ref.collection('history').doc(), hist(c, 'created', [])) });
}
export async function updateUnit(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const p = parseUnit(raw), version = body(raw).version; if (!p.ok) throw new HttpError(400, 'invalid', p.error); if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  return mutate(c, 'catalogUnits', id, version, async d => {
    const labels = { name: 'Tên đơn vị', symbol: 'Ký hiệu', description: 'Mô tả', status: 'Trạng thái' } as const;
    const changes = (Object.keys(labels) as (keyof typeof labels)[]).filter(k => d[k] !== p.value[k]).map(k => ({ field: k, label: labels[k], from: String(d[k] || '—'), to: String(p.value[k] || '—') }));
    if (!changes.length) return { update: null };
    const moved = symbolKey(d.symbol) !== symbolKey(p.value.symbol);
    return { update: { ...p.value, symbolKey: symbolKey(p.value.symbol) }, history: hist(c, 'updated', changes), ...(moved ? { releaseClaim: unitKey(d.symbol), takeClaim: { key: unitKey(p.value.symbol), message: 'Ký hiệu đơn vị đã tồn tại.' } } : {}) };
  });
}
export async function deleteUnit(c: Ctx, id: string) {
  needEdit(c);
  return mutate(c, 'catalogUnits', id, undefined, async (d, tx) => {
    const used = await tx.get(col('catalogItems').where('organizationId', '==', c.orgId).where('unitId', '==', id).limit(1));
    if (!used.empty) throw new HttpError(409, 'in-use', 'Đơn vị đang được sử dụng. Hãy chuyển sang "Ngừng sử dụng".');
    return { update: { deletedAt: Timestamp.now() }, history: hist(c, 'deleted', []), releaseClaim: unitKey(d.symbol) };
  });
}

// ---------------- Thuế suất (không có mức thuế mặc định) ----------------
const taxDto = (id: string, d: DocumentData): TaxRateDto => ({ id, code: d.code, name: d.name, rateBp: d.rateBp, status: d.status, version: d.version, createdByName: d.createdByName ?? '', createdAt: iso(d.createdAt) ?? '', updatedAt: iso(d.updatedAt) ?? '' });
export async function listTaxRates(c: Ctx) {
  needView(c);
  const docs = (await col('taxRates').where('organizationId', '==', c.orgId).limit(200).get()).docs.filter(d => !d.data().deletedAt);
  return { items: docs.map(d => taxDto(d.id, d.data())).sort((a, b) => a.rateBp - b.rateBp || a.name.localeCompare(b.name, 'vi')), can: { edit: can.editTax(actorOf(c)) } };
}
export async function createTaxRate(c: Ctx, raw: unknown) {
  needTax(c);
  const p = parseTax(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  return createDoc(c, { coll: 'taxRates', counter: `${c.orgId}_taxrate`, prefix: 'TX', pad: 3, requestId: body(raw).requestId, build: code => ({ ...stamp(c), code, ...p.value }), after: (tx, ref) => tx.set(ref.collection('history').doc(), hist(c, 'created', [])) });
}
export async function updateTaxRate(c: Ctx, id: string, raw: unknown) {
  needTax(c);
  const p = parseTax(raw), version = body(raw).version; if (!p.ok) throw new HttpError(400, 'invalid', p.error); if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  return mutate(c, 'taxRates', id, version, async d => {
    const labels = { name: 'Tên thuế', rateBp: 'Thuế suất (điểm cơ bản)', status: 'Trạng thái' } as const;
    const changes = (Object.keys(labels) as (keyof typeof labels)[]).filter(k => d[k] !== p.value[k]).map(k => ({ field: k, label: labels[k], from: String(d[k] ?? '—'), to: String(p.value[k] ?? '—') }));
    return changes.length ? { update: { ...p.value }, history: hist(c, 'updated', changes) } : { update: null };
  });
}

// ---------------- Nhập / xuất ----------------
const IMPORT_BATCH = 50;
/** Xuất theo bộ lọc hiện tại. Quyền xuất được kiểm tra ở máy chủ (không chỉ ẩn nút). */
export async function exportItems(c: Ctx, q: Record<string, string | undefined>) {
  needView(c);
  if (!can.export(actorOf(c))) throw forbid('Bạn không có quyền xuất danh mục sản phẩm & dịch vụ.');
  const items: ItemDto[] = []; let cursor: string | null = null;
  do {
    const r: ItemList = await listItems(c, { ...q, limit: String(PAGE_MAX), cursor: cursor ?? undefined });
    items.push(...r.items); cursor = r.nextCursor;
  } while (cursor && items.length < EXPORT_MAX);
  return { items: items.slice(0, EXPORT_MAX), truncated: !!cursor || items.length > EXPORT_MAX };
}
/** Nhập tối đa 50 dòng mỗi lần gọi; mỗi dòng đi qua đúng đường tạo mới (kiểm tra quyền, mã tự sinh, lịch sử). `requestId` từng dòng làm nhập lại không tạo bản sao. */
export async function importItems(c: Ctx, raw: unknown) {
  needEdit(c);
  const rows = body(raw).rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > IMPORT_BATCH) throw new HttpError(400, 'invalid', `Mỗi lần nhập từ 1 đến ${IMPORT_BATCH} dòng.`);
  const out: { index: number; ok: boolean; code?: string; duplicate?: boolean; error?: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    try { const r = await createItem(c, rows[i]); out.push({ index: i, ok: true, code: r.id.slice(c.orgId.length + 1), duplicate: r.duplicate }); }
    catch (e) { if (e instanceof HttpError && e.status >= 500) throw e; out.push({ index: i, ok: false, error: e instanceof HttpError ? e.message : 'Không lưu được dòng này.' }); }
  }
  return { results: out };
}
