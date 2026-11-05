import { FieldPath, FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import { actorOf, approved, type Attrib, body, createDoc, forbid, hist, iso, logPrice, mutate, namesOf, notFound, refsFor, stamp, toItem, touch } from './catalog';
import { docId } from '../catalog-core';
import { DUPLICATE_MAX_ITEMS, LIST_PREFIX, listCan, parsePriceList, parseRemove, parseStatus, parseUpsert, stateOf, todayVn, LIST_TYPE_LABEL, type PriceListInput } from '../price-list-core';
import { EXPORT_MAX } from '../catalog-io-core';
import { formatVnd } from '../catalog-core';
import type { Change } from '@/types/catalog';
import type { PriceListDetail, PriceListDto, PriceListHistoryDto, PriceListRowDto, PriceListRows, UpsertResult } from '@/types/price-list';

const db = () => adminDb();
const col = (n: string) => db().collection(n);
const needView = (c: Ctx) => { if (!listCan.view(actorOf(c))) throw forbid('Vai trò của bạn chưa được cấp quyền xem bảng giá.'); };
const needEdit = (c: Ctx) => { needView(c); if (!listCan.edit(actorOf(c))) throw forbid('Bạn không có quyền chỉnh sửa bảng giá.'); };
const PAGE = 50, PAGE_MAX = 100;

const toList = (id: string, d: DocumentData, groups: Map<string, DocumentData>, today: string): PriceListDto => ({
  id, code: d.code, name: d.name, description: d.description ?? '', type: d.type, scopeNote: d.scopeNote ?? '', startDate: d.startDate ?? null, endDate: d.endDate ?? null, currency: 'VND',
  customerGroupIds: d.customerGroupIds ?? [], customerGroupNames: (d.customerGroupIds ?? []).map((g: string) => groups.get(g)?.name ?? '(Nhóm không khả dụng)'),
  status: d.status, state: stateOf({ status: d.status, startDate: d.startDate ?? null, endDate: d.endDate ?? null }, today), itemCount: d.itemCount ?? 0, version: d.version, createdByName: d.createdByName ?? '', createdAt: iso(d.createdAt) ?? '', updatedAt: iso(d.updatedAt) ?? '',
});
async function loadList(c: Ctx, id: string) {
  const s = await col('priceLists').doc(id).get(), d = s.data();
  if (!d || d.organizationId !== c.orgId || d.deletedAt) throw notFound();
  return d;
}
const groupsOf = (org: string, ids: string[]) => namesOf(org, 'customerGroups', ids);

export async function listPriceLists(c: Ctx, q: Record<string, string | undefined>) {
  needView(c);
  const snap = await col('priceLists').where('organizationId', '==', c.orgId).limit(500).get(), today = todayVn();
  const docs = snap.docs.filter(s => !s.data().deletedAt), groups = await groupsOf(c.orgId, docs.flatMap(s => s.data().customerGroupIds ?? []));
  let items = docs.map(s => toList(s.id, s.data(), groups, today));
  if (q.status === 'active' || q.status === 'inactive') items = items.filter(l => l.status === q.status);
  if (q.state) items = items.filter(l => l.state === q.state);
  items.sort((a, b) => (a.code < b.code ? 1 : -1));
  return { items, can: { edit: listCan.edit(actorOf(c)), export: listCan.export(actorOf(c)) } };
}
export async function getPriceList(c: Ctx, id: string): Promise<PriceListDetail> {
  needView(c);
  const d = await loadList(c, id);
  return { list: toList(id, d, await groupsOf(c.orgId, d.customerGroupIds ?? []), todayVn()), can: { edit: listCan.edit(actorOf(c)), export: listCan.export(actorOf(c)) } };
}

async function checkGroups(tx: import('firebase-admin/firestore').Transaction, org: string, ids: string[]) {
  const snaps = await Promise.all(ids.map(id => tx.get(col('customerGroups').doc(id))));
  snaps.forEach((s, i) => { const d = s.data(); if (!d || d.organizationId !== org) throw new HttpError(400, 'bad-ref', `Nhóm khách hàng không tồn tại (${ids[i]}).`); });
}
const fields = (v: PriceListInput) => ({ name: v.name, description: v.description, type: v.type, scopeNote: v.scopeNote, startDate: v.startDate, endDate: v.endDate, customerGroupIds: v.customerGroupIds, status: v.status });

export async function createPriceList(c: Ctx, raw: unknown) {
  needEdit(c);
  const p = parsePriceList(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const v = p.value;
  return createDoc(c, {
    coll: 'priceLists', counter: `${c.orgId}_pricelist`, prefix: LIST_PREFIX, pad: 3, requestId: body(raw).requestId,
    precheck: tx => checkGroups(tx, c.orgId, v.customerGroupIds),
    build: code => ({ ...stamp(c), code, ...fields(v), itemCount: 0 }),
    after: (tx, ref) => { tx.set(ref.collection('history').doc(), hist(c, 'created', [])); },
  });
}
const DIFF: [keyof PriceListInput, string][] = [['name', 'Tên bảng giá'], ['description', 'Mô tả'], ['type', 'Loại'], ['scopeNote', 'Phạm vi'], ['startDate', 'Ngày bắt đầu'], ['endDate', 'Ngày kết thúc'], ['customerGroupIds', 'Nhóm khách hàng'], ['status', 'Trạng thái']];
export async function updatePriceList(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const p = parsePriceList(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const version = body(raw).version; if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  const v = p.value;
  return mutate(c, 'priceLists', id, version, async (d, tx) => {
    const old = d.customerGroupIds ?? [];
    if (JSON.stringify([...old].sort()) !== JSON.stringify([...v.customerGroupIds].sort())) await checkGroups(tx, c.orgId, v.customerGroupIds);
    const show = (k: keyof PriceListInput, x: unknown) => (k === 'type' ? LIST_TYPE_LABEL[x as keyof typeof LIST_TYPE_LABEL] : k === 'customerGroupIds' ? `${(x as string[]).length} nhóm` : k === 'status' ? (x === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động') : x === null || x === '' || x === undefined ? '—' : String(x));
    const same = (k: keyof PriceListInput) => (k === 'customerGroupIds' ? JSON.stringify([...old].sort()) === JSON.stringify([...v.customerGroupIds].sort()) : (d[k] ?? null) === (v[k] ?? null) || ((d[k] ?? '') === '' && (v[k] ?? '') === ''));
    const changes: Change[] = DIFF.filter(([k]) => !same(k)).map(([k, label]) => ({ field: k, label, from: show(k, d[k]), to: show(k, v[k]) }));
    if (!changes.length) return { update: null };
    return { update: fields(v), history: hist(c, 'updated', changes) };
  });
}
export async function setPriceListStatus(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const p = parseStatus(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  return mutate(c, 'priceLists', id, p.value.version, async d => {
    if (d.status === p.value.status) return { update: null };
    return { update: { status: p.value.status }, history: hist(c, 'status_changed', [{ field: 'status', label: 'Trạng thái', from: d.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động', to: p.value.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động' } as Change]) };
  });
}
/** Xóa mềm: chỉ khi bảng giá đã ngừng hoạt động (Phase 04 sẽ bổ sung điều kiện "chưa được báo giá nào sử dụng") */
export async function deletePriceList(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const version = body(raw).version; if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  return mutate(c, 'priceLists', id, version, async d => {
    if (d.status === 'active') throw new HttpError(409, 'not-deletable', 'Hãy ngừng hoạt động bảng giá trước khi xóa.');
    return { update: { deletedAt: FieldValue.serverTimestamp() }, history: hist(c, 'deleted', []) };
  });
}
/** Nhân bản (kèm toàn bộ giá). Bản sao luôn ở trạng thái ngừng hoạt động để người dùng rà soát trước khi kích hoạt. */
export async function duplicatePriceList(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const b = body(raw), name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length > 150) throw new HttpError(400, 'invalid', 'Tên bảng giá tối đa 150 ký tự.');
  let src: DocumentData | null = null, rows: { id: string; d: DocumentData }[] = [];
  return createDoc(c, {
    coll: 'priceLists', counter: `${c.orgId}_pricelist`, prefix: LIST_PREFIX, pad: 3, requestId: b.requestId,
    precheck: async tx => {
      const ref = col('priceLists').doc(id), s = (await tx.get(ref)).data();
      if (!s || s.organizationId !== c.orgId || s.deletedAt) throw notFound();
      const snap = await tx.get(ref.collection('items').limit(DUPLICATE_MAX_ITEMS + 1));
      if (snap.size > DUPLICATE_MAX_ITEMS) throw new HttpError(400, 'too-large', `Bảng giá có hơn ${DUPLICATE_MAX_ITEMS} mặt hàng, chưa thể nhân bản trực tiếp.`);
      src = s; rows = snap.docs.map(x => ({ id: x.id, d: x.data() }));
    },
    build: code => ({ ...stamp(c), code, name: name || `${src!.name} (bản sao)`.slice(0, 150), description: src!.description ?? '', type: src!.type, scopeNote: src!.scopeNote ?? '', startDate: src!.startDate ?? null, endDate: src!.endDate ?? null,
      customerGroupIds: src!.customerGroupIds ?? [], status: 'inactive', itemCount: rows.length }),
    after: (tx, ref, code) => {
      tx.set(ref.collection('history').doc(), { ...hist(c, 'duplicated', [], `Nhân bản từ ${src!.code} (${rows.length} mặt hàng)`) });
      for (const r of rows) tx.set(ref.collection('items').doc(r.id), { organizationId: c.orgId, itemId: r.d.itemId, itemCode: r.d.itemCode, price: r.d.price, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid, updatedByName: c.name });
      void code;
    },
  });
}

// ---------------- Mặt hàng trong bảng giá ----------------
const rowDto = (itemId: string, row: DocumentData, it: DocumentData, refs: Awaited<ReturnType<typeof refsFor>>): PriceListRowDto => {
  const x = toItem(itemId, it, refs);
  return { itemId, code: x.code, name: x.name, type: x.type, categoryName: x.categoryName, unitName: x.unitName, taxText: x.taxRateName ? `${x.taxRateName}${x.priceIncludesTax ? ' (đã gồm thuế)' : ''}` : '', itemStatus: x.status,
    defaultPrice: x.defaultPrice, price: row.price, updatedAt: iso(row.updatedAt) ?? '', updatedByName: row.updatedByName ?? '' };
};
export async function listPriceListRows(c: Ctx, id: string, q: Record<string, string | undefined>): Promise<PriceListRows> {
  needView(c); await loadList(c, id);
  const limit = Math.min(Math.max(Number(q.limit) || PAGE, 1), PAGE_MAX);
  let query = col('priceLists').doc(id).collection('items').orderBy(FieldPath.documentId());
  if (q.cursor) query = query.startAfter(q.cursor);
  const snap = await query.limit(limit + 1).get(), page = snap.docs.slice(0, limit);
  const items = await namesOf(c.orgId, 'catalogItems', page.map(s => s.id)), refs = await refsFor(c.orgId, [...items.values()]);
  const rows = page.filter(s => items.has(s.id)).map(s => rowDto(s.id, s.data(), items.get(s.id)!, refs));
  return { rows, nextCursor: snap.size > limit ? page[page.length - 1].id : null };
}
export async function exportPriceList(c: Ctx, id: string) {
  needView(c);
  if (!listCan.export(actorOf(c))) throw forbid('Bạn không có quyền xuất bảng giá.');
  const list = (await getPriceList(c, id)).list, rows: PriceListRowDto[] = []; let cursor: string | null = null;
  do { const r: PriceListRows = await listPriceListRows(c, id, { limit: String(PAGE_MAX), cursor: cursor ?? undefined }); rows.push(...r.rows); cursor = r.nextCursor; } while (cursor && rows.length < EXPORT_MAX);
  return { list, rows: rows.slice(0, EXPORT_MAX), truncated: !!cursor };
}

/** Thêm mặt hàng và/hoặc đặt giá hàng loạt (tối đa 100 dòng). Dòng lỗi được báo riêng, các dòng hợp lệ vẫn được áp dụng trong cùng một giao dịch. */
export async function savePrices(c: Ctx, id: string, raw: unknown, attrib?: Attrib): Promise<{ results: UpsertResult[] }> {
  needEdit(c);
  const p = parseUpsert(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const { rows, reason, mode } = p.value, listRef = col('priceLists').doc(id);
  return db().runTransaction(async tx => {
    const ls = (await tx.get(listRef)).data();
    if (!ls || ls.organizationId !== c.orgId || ls.deletedAt) throw notFound();
    const ids = rows.map(r => r.itemId ?? docId(c.orgId, (r.code ?? '').toUpperCase()));
    const uniq = [...new Set(ids)];
    const [its, rws] = await Promise.all([Promise.all(uniq.map(i => tx.get(col('catalogItems').doc(i)))), Promise.all(uniq.map(i => tx.get(listRef.collection('items').doc(i))))]);
    const item = new Map(uniq.map((i, k) => [i, its[k].data()])), row = new Map(uniq.map((i, k) => [i, rws[k].data()])), seen = new Set<string>();
    const results: UpsertResult[] = [], writes: (() => void)[] = []; let added = 0;
    rows.forEach((r, index) => {
      const iid = ids[index], it = item.get(iid), cur = row.get(iid), err = (e: string): void => { results.push({ index, itemId: it ? iid : null, result: 'error', error: e }); };
      if (!it || it.organizationId !== c.orgId || it.deletedAt) return err('Không tìm thấy sản phẩm / dịch vụ.');
      if (seen.has(iid)) return err('Mặt hàng bị lặp trong cùng yêu cầu.');
      seen.add(iid);
      const base = { itemId: iid, itemCode: it.code };
      if (!cur) {
        if (it.status !== 'active') return err('Mặt hàng đang ngừng kinh doanh, không thể thêm vào bảng giá.');
        added++; results.push({ index, itemId: iid, result: 'added' });
        writes.push(() => {
          tx.create(listRef.collection('items').doc(iid), { organizationId: c.orgId, ...base, price: r.price, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid, updatedByName: c.name });
          tx.set(listRef.collection('history').doc(), { ...hist(c, 'item_added', []), ...base, itemName: it.name, oldPrice: null, newPrice: r.price, reason });
          logPrice(tx, c, { kind: 'priceList', scopeId: id, scopeName: `${ls.code} – ${ls.name}`, itemId: iid, itemCode: it.code, itemName: it.name, oldPrice: null, newPrice: r.price, reason, mode: 'added', ...approved(attrib) });
        });
        return;
      }
      if (mode === 'add') return err('Mặt hàng đã có trong bảng giá.'); // chế độ "chỉ thêm" không bao giờ ghi đè giá đang có
      if (r.expectedPrice !== null && r.expectedPrice !== cur.price) return err(`Giá trong bảng giá đã thay đổi (hiện là ${formatVnd(cur.price)}). Vui lòng tải lại.`);
      if (cur.price === r.price) return void results.push({ index, itemId: iid, result: 'unchanged' });
      results.push({ index, itemId: iid, result: 'updated' });
      writes.push(() => {
        tx.update(listRef.collection('items').doc(iid), { price: r.price, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid, updatedByName: c.name });
        tx.set(listRef.collection('history').doc(), { ...hist(c, 'price_changed', []), ...base, itemName: it.name, oldPrice: cur.price, newPrice: r.price, reason });
        logPrice(tx, c, { kind: 'priceList', scopeId: id, scopeName: `${ls.code} – ${ls.name}`, itemId: iid, itemCode: it.code, itemName: it.name, oldPrice: cur.price, newPrice: r.price, reason, mode: 'changed', ...approved(attrib) });
      });
    });
    if (writes.length) { writes.forEach(w => w()); tx.update(listRef, { ...touch(c), ...(added ? { itemCount: FieldValue.increment(added) } : {}) }); }
    return { results };
  });
}
export async function removePriceListItems(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const p = parseRemove(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const listRef = col('priceLists').doc(id);
  return db().runTransaction(async tx => {
    const ls = (await tx.get(listRef)).data();
    if (!ls || ls.organizationId !== c.orgId || ls.deletedAt) throw notFound();
    const [rws, its] = await Promise.all([Promise.all(p.value.map(i => tx.get(listRef.collection('items').doc(i)))), Promise.all(p.value.map(i => tx.get(col('catalogItems').doc(i))))]);
    let removed = 0;
    p.value.forEach((iid, k) => {
      const cur = rws[k].data(); if (!cur) return;
      removed++; tx.delete(listRef.collection('items').doc(iid));
      tx.set(listRef.collection('history').doc(), { ...hist(c, 'item_removed', []), itemId: iid, itemCode: cur.itemCode, itemName: its[k].data()?.name ?? cur.itemCode, oldPrice: cur.price, newPrice: null, reason: '' });
    });
    if (removed) tx.update(listRef, { ...touch(c), itemCount: FieldValue.increment(-removed) });
    return { removed };
  });
}
export async function listPriceListHistory(c: Ctx, id: string): Promise<{ items: PriceListHistoryDto[] }> {
  needView(c); await loadList(c, id);
  const snap = await col('priceLists').doc(id).collection('history').orderBy('at', 'desc').limit(300).get();
  return { items: snap.docs.map(s => { const d = s.data(); return { id: s.id, type: d.type, itemId: d.itemId ?? null, itemCode: d.itemCode ?? null, itemName: d.itemName ?? null, oldPrice: d.oldPrice ?? null, newPrice: d.newPrice ?? null,
    reason: d.reason ?? '', note: d.note ?? '', changes: d.changes ?? [], actorName: d.actorName ?? '', at: iso(d.at) ?? '' }; }) };
}
