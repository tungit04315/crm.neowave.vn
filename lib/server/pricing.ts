import { FieldPath, FieldValue, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import { actorOf, approved, type Attrib, forbid, hist, iso, logPrice, mutate, namesOf, notFound, stamp, touch } from './catalog';
import { docId, formatVnd } from '../catalog-core';
import { stateOf, todayVn } from '../price-list-core';
import { groupPriceId, parseGroupPriceBatch, parseGroupPriceUpdate, parsePriority, pricingCan, resolvePriceCore, type ResolveInput } from '../pricing-core';
import type { Change } from '@/types/catalog';
import type { GroupPriceDto, GroupPriceHistoryDto, GroupPriorityDto, ItemPricesDto, ResolveResult } from '@/types/pricing';
import type { UpsertResult } from '@/types/price-list';

const db = () => adminDb();
const col = (n: string) => db().collection(n);
export const needView = (c: Ctx) => { if (!pricingCan.view(actorOf(c))) throw forbid('Vai trò của bạn chưa được cấp quyền xem giá và chính sách giá.'); };
export const needEdit = (c: Ctx) => { needView(c); if (!pricingCan.edit(actorOf(c))) throw forbid('Bạn không có quyền chỉnh sửa giá theo nhóm và chính sách giá.'); };
const PAGE = 50, PAGE_MAX = 100;
const prioId = (org: string, groupId: string) => `${org}_${groupId}`;

/** Nhóm của khách hàng (từ thành viên nhóm) hợp với các nhóm truyền thẳng vào; mọi nhóm phải thuộc tổ chức */
export async function groupIdsFor(c: Ctx, customerId: string | null, groupIds: string[]): Promise<string[]> {
  const out = new Set(groupIds);
  if (customerId) {
    const cu = (await col('customers').doc(customerId).get()).data();
    if (!cu || cu.organizationId !== c.orgId || cu.deletedAt) throw new HttpError(404, 'not-found', 'Không tìm thấy khách hàng.');
    (await col('customerGroupMembers').where('customerId', '==', customerId).where('organizationId', '==', c.orgId).get()).docs.forEach(s => out.add(s.data().groupId));
  }
  const ids = [...out], known = await namesOf(c.orgId, 'customerGroups', ids);
  if (ids.some(g => !known.has(g))) throw new HttpError(400, 'bad-ref', 'Nhóm khách hàng không tồn tại.');
  return ids;
}

/** Xác định giá cho nhiều mặt hàng một lượt (gom truy vấn). Mặt hàng không tồn tại → không có kết quả. */
export async function resolveMany(c: Ctx, itemIds: string[], groupIds: string[], today: string): Promise<Map<string, { item: DocumentData; result: ResolveResult }>> {
  const uniq = [...new Set(itemIds)], items = await namesOf(c.orgId, 'catalogItems', uniq), out = new Map<string, { item: DocumentData; result: ResolveResult }>();
  const present = uniq.filter(i => items.has(i) && !items.get(i)!.deletedAt);
  const gpSnaps = await Promise.all(present.map(i => col('groupPrices').where('organizationId', '==', c.orgId).where('itemId', '==', i).limit(200).get()));
  const allGroups = [...new Set([...groupIds, ...gpSnaps.flatMap(s => s.docs.map(d => d.data().groupId as string))])];
  const [gNames, prioDocs] = await Promise.all([namesOf(c.orgId, 'customerGroups', allGroups), db().getAll(...allGroups.map(g => col('groupPriorities').doc(prioId(c.orgId, g))))]);
  const priorities: Record<string, number> = {}; prioDocs.forEach((s, k) => { if (s.exists) priorities[allGroups[k]] = s.data()!.priority; });
  const mine = new Set(groupIds);
  const lists = (await col('priceLists').where('organizationId', '==', c.orgId).limit(500).get()).docs.filter(s => { const d = s.data(); return !d.deletedAt && stateOf(d as never, today) === 'current' && ((d.customerGroupIds ?? []).length === 0 || (d.customerGroupIds as string[]).some(g => mine.has(g))); });
  const pairs = lists.flatMap(l => present.map(i => ({ l, i })));
  const rowSnaps = pairs.length ? await db().getAll(...pairs.map(p => col('priceLists').doc(p.l.id).collection('items').doc(p.i))) : [];
  const rowPrice = new Map<string, number>(); rowSnaps.forEach((s, k) => { if (s.exists) rowPrice.set(`${pairs[k].l.id}|${pairs[k].i}`, s.data()!.price); });
  present.forEach((id, k) => {
    const it = items.get(id)!, input: ResolveInput = {
      item: { id, code: it.code, status: it.status, defaultPrice: it.defaultPrice }, today, customerGroupIds: groupIds, priorities,
      groupPrices: gpSnaps[k].docs.map(s => { const d = s.data(); return { id: s.id, groupId: d.groupId, groupName: gNames.get(d.groupId)?.name ?? d.groupId, price: d.price, status: d.status, startDate: d.startDate ?? null, endDate: d.endDate ?? null }; }),
      lists: lists.map(l => { const d = l.data(); return { id: l.id, code: d.code, name: d.name, customerGroupIds: d.customerGroupIds ?? [], status: d.status, startDate: d.startDate ?? null, endDate: d.endDate ?? null, price: rowPrice.get(`${l.id}|${id}`) ?? null }; }),
    };
    out.set(id, { item: it, result: resolvePriceCore(input) });
  });
  return out;
}
export async function resolvePrice(c: Ctx, q: Record<string, string | undefined>) {
  needView(c);
  if (!q.itemId) throw new HttpError(400, 'invalid', 'Thiếu mặt hàng.');
  if (q.date && !/^\d{4}-\d{2}-\d{2}$/.test(q.date)) throw new HttpError(400, 'invalid', 'Ngày không hợp lệ (định dạng YYYY-MM-DD).');
  const groups = await groupIdsFor(c, q.customerId || null, (q.groupIds ?? '').split(',').map(x => x.trim()).filter(Boolean)), r = (await resolveMany(c, [q.itemId], groups, q.date || todayVn())).get(q.itemId);
  if (!r) throw notFound();
  return { item: { id: q.itemId, code: r.item.code, name: r.item.name }, groupIds: groups, result: r.result };
}

// ---------------- Giá theo nhóm ----------------
const toDto = (id: string, d: DocumentData, it: DocumentData | undefined, g: DocumentData | undefined, today: string): GroupPriceDto => ({
  id, itemId: d.itemId, itemCode: d.itemCode, itemName: it?.name ?? d.itemCode, groupId: d.groupId, groupName: g?.name ?? '(Nhóm không khả dụng)', price: d.price, defaultPrice: it?.defaultPrice ?? 0,
  startDate: d.startDate ?? null, endDate: d.endDate ?? null, status: d.status, state: stateOf({ status: d.status, startDate: d.startDate ?? null, endDate: d.endDate ?? null }, today),
  version: d.version, updatedByName: d.updatedByName ?? '', updatedAt: iso(d.updatedAt) ?? '',
});
export async function listGroupPrices(c: Ctx, q: Record<string, string | undefined>): Promise<{ items: GroupPriceDto[]; nextCursor: string | null; can: { edit: boolean; editPriority: boolean } }> {
  needView(c);
  const limit = Math.min(Math.max(Number(q.limit) || PAGE, 1), PAGE_MAX);
  let query = col('groupPrices').where('organizationId', '==', c.orgId);
  if (q.groupId) query = query.where('groupId', '==', q.groupId);
  if (q.itemId) query = query.where('itemId', '==', q.itemId);
  if (q.status === 'active' || q.status === 'inactive') query = query.where('status', '==', q.status);
  query = query.orderBy(FieldPath.documentId());
  if (q.cursor) query = query.startAfter(q.cursor);
  const snap = await query.limit(limit + 1).get(), page = snap.docs.slice(0, limit), today = todayVn();
  const [its, gs] = await Promise.all([namesOf(c.orgId, 'catalogItems', page.map(s => s.data().itemId)), namesOf(c.orgId, 'customerGroups', page.map(s => s.data().groupId))]);
  return { items: page.map(s => toDto(s.id, s.data(), its.get(s.data().itemId), gs.get(s.data().groupId), today)), nextCursor: snap.size > limit ? page[page.length - 1].id : null, can: { edit: pricingCan.edit(actorOf(c)), editPriority: pricingCan.editPriority(actorOf(c)) } };
}

/** Thêm / đặt giá theo nhóm hàng loạt (≤ 100 dòng). Dòng lỗi báo riêng, các dòng hợp lệ vẫn lưu. `mode:'add'` không bao giờ ghi đè giá đang có; `set` chỉ đổi giá (ngày và trạng thái đổi ở PATCH). */
export async function saveGroupPrices(c: Ctx, raw: unknown, attrib?: Attrib): Promise<{ results: UpsertResult[] }> {
  needEdit(c);
  const p = parseGroupPriceBatch(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const { groupId, rows, reason, mode, startDate, endDate } = p.value;
  return db().runTransaction(async tx => {
    const g = (await tx.get(col('customerGroups').doc(groupId))).data();
    if (!g || g.organizationId !== c.orgId) throw new HttpError(400, 'bad-ref', 'Nhóm khách hàng không tồn tại.');
    const ids = rows.map(r => r.itemId ?? docId(c.orgId, (r.code ?? '').toUpperCase())), uniq = [...new Set(ids)];
    const [its, gps] = await Promise.all([Promise.all(uniq.map(i => tx.get(col('catalogItems').doc(i)))), Promise.all(uniq.map(i => tx.get(col('groupPrices').doc(groupPriceId(i, groupId)))))]);
    const item = new Map(uniq.map((i, k) => [i, its[k].data()])), cur = new Map(uniq.map((i, k) => [i, gps[k].data()])), seen = new Set<string>(), results: UpsertResult[] = [], writes: (() => void)[] = [];
    rows.forEach((r, index) => {
      const iid = ids[index], it = item.get(iid), ex = cur.get(iid), err = (e: string): void => { results.push({ index, itemId: it ? iid : null, result: 'error', error: e }); };
      if (!it || it.organizationId !== c.orgId || it.deletedAt) return err('Không tìm thấy sản phẩm / dịch vụ.');
      if (seen.has(iid)) return err('Mặt hàng bị lặp trong cùng yêu cầu.'); seen.add(iid);
      const ref = col('groupPrices').doc(groupPriceId(iid, groupId));
      if (!ex) {
        if (it.status !== 'active') return err('Mặt hàng đang ngừng kinh doanh, không thể đặt giá theo nhóm.');
        results.push({ index, itemId: iid, result: 'added' });
        writes.push(() => { tx.create(ref, { ...stamp(c), itemId: iid, itemCode: it.code, groupId, price: r.price, startDate, endDate, status: 'active' });
          tx.set(ref.collection('history').doc(), { ...hist(c, 'created', []), oldPrice: null, newPrice: r.price, reason });
          logPrice(tx, c, { kind: 'groupPrice', scopeId: groupId, scopeName: g.name, itemId: iid, itemCode: it.code, itemName: it.name, oldPrice: null, newPrice: r.price, reason, mode: 'added', ...approved(attrib) }); });
        return;
      }
      if (mode === 'add') return err('Mặt hàng đã có giá riêng cho nhóm này.');
      if (ex.price === r.price) return void results.push({ index, itemId: iid, result: 'unchanged' });
      results.push({ index, itemId: iid, result: 'updated' });
      writes.push(() => { tx.update(ref, { price: r.price, ...touch(c) }); tx.set(ref.collection('history').doc(), { ...hist(c, 'price_changed', []), oldPrice: ex.price, newPrice: r.price, reason });
        logPrice(tx, c, { kind: 'groupPrice', scopeId: groupId, scopeName: g.name, itemId: iid, itemCode: it.code, itemName: it.name, oldPrice: ex.price, newPrice: r.price, reason, mode: 'changed', ...approved(attrib) }); });
    });
    writes.forEach(w => w());
    return { results };
  });
}
const SHOW = (s: string | null) => s ?? '—';
export async function updateGroupPrice(c: Ctx, id: string, raw: unknown) {
  needEdit(c);
  const p = parseGroupPriceUpdate(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const v = p.value;
  return mutate(c, 'groupPrices', id, v.version, async (d, tx) => {
    const changes: Change[] = [];
    if (d.price !== v.price) changes.push({ field: 'price', label: 'Giá', from: formatVnd(d.price), to: formatVnd(v.price) });
    if ((d.startDate ?? null) !== v.startDate) changes.push({ field: 'startDate', label: 'Ngày bắt đầu', from: SHOW(d.startDate ?? null), to: SHOW(v.startDate) });
    if ((d.endDate ?? null) !== v.endDate) changes.push({ field: 'endDate', label: 'Ngày kết thúc', from: SHOW(d.endDate ?? null), to: SHOW(v.endDate) });
    if (d.status !== v.status) changes.push({ field: 'status', label: 'Trạng thái', from: d.status === 'active' ? 'Đang áp dụng' : 'Ngừng áp dụng', to: v.status === 'active' ? 'Đang áp dụng' : 'Ngừng áp dụng' });
    if (!changes.length) return { update: null };
    if (d.price !== v.price) { const [is, gs] = await Promise.all([tx.get(col('catalogItems').doc(d.itemId)), tx.get(col('customerGroups').doc(d.groupId))]); logPrice(tx, c, { kind: 'groupPrice', scopeId: d.groupId, scopeName: gs.data()?.name ?? d.groupId, itemId: d.itemId, itemCode: d.itemCode, itemName: is.data()?.name ?? d.itemCode, oldPrice: d.price, newPrice: v.price, reason: v.reason, mode: 'changed' }); }
    const h = { ...hist(c, d.price !== v.price ? 'price_changed' : 'updated', changes), oldPrice: d.price, newPrice: v.price, reason: v.reason };
    return { update: { price: v.price, startDate: v.startDate, endDate: v.endDate, status: v.status }, history: h };
  });
}
export async function listGroupPriceHistory(c: Ctx, id: string): Promise<{ items: GroupPriceHistoryDto[] }> {
  needView(c);
  const d = (await col('groupPrices').doc(id).get()).data(); if (!d || d.organizationId !== c.orgId) throw notFound();
  const snap = await col('groupPrices').doc(id).collection('history').orderBy('at', 'desc').limit(200).get();
  return { items: snap.docs.map(s => { const h = s.data(); return { id: s.id, type: h.type, oldPrice: h.oldPrice ?? null, newPrice: h.newPrice ?? null, reason: h.reason ?? '', changes: h.changes ?? [], actorName: h.actorName ?? '', at: iso(h.at) ?? '' }; }) };
}

// ---------------- Ưu tiên nhóm ----------------
export async function listGroupPriorities(c: Ctx): Promise<{ items: GroupPriorityDto[]; can: { editPriority: boolean } }> {
  needView(c);
  const gs = (await col('customerGroups').where('organizationId', '==', c.orgId).limit(500).get()).docs;
  const [prios, counts] = await Promise.all([db().getAll(...gs.map(g => col('groupPriorities').doc(prioId(c.orgId, g.id)))),
    Promise.all(gs.map(g => col('groupPrices').where('organizationId', '==', c.orgId).where('groupId', '==', g.id).where('status', '==', 'active').count().get().then(s => s.data().count)))]);
  const items = gs.map((g, k) => ({ groupId: g.id, groupName: g.data().name ?? g.id, color: g.data().color ?? '#64748b', groupStatus: g.data().status ?? 'active', priority: prios[k].exists ? (prios[k].data()!.priority as number) : 0, priceCount: counts[k] }));
  items.sort((a, b) => b.priority - a.priority || a.groupName.localeCompare(b.groupName, 'vi'));
  return { items, can: { editPriority: pricingCan.editPriority(actorOf(c)) } };
}
/** Chỉ Quản trị viên (super_admin). Số ưu tiên càng cao càng được ưu tiên khi khách thuộc nhiều nhóm cùng có giá riêng. */
export async function setGroupPriority(c: Ctx, raw: unknown) {
  needView(c);
  if (!pricingCan.editPriority(actorOf(c))) throw forbid('Chỉ Quản trị viên được đặt số ưu tiên của nhóm khách hàng.');
  const p = parsePriority(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const { groupId, priority } = p.value, ref = col('groupPriorities').doc(prioId(c.orgId, groupId));
  return db().runTransaction(async (tx: Transaction) => {
    const [g, cur] = await Promise.all([tx.get(col('customerGroups').doc(groupId)), tx.get(ref)]);
    if (!g.exists || g.data()!.organizationId !== c.orgId) throw new HttpError(400, 'bad-ref', 'Nhóm khách hàng không tồn tại.');
    const old = cur.exists ? (cur.data()!.priority as number) : 0;
    if (old === priority && cur.exists) return { groupId, priority, changed: false };
    tx.set(ref, { organizationId: c.orgId, groupId, priority, updatedBy: c.uid, updatedByName: c.name, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ref.collection('history').doc(), { ...hist(c, 'priority_changed', [{ field: 'priority', label: 'Số ưu tiên', from: String(old), to: String(priority) }]) });
    return { groupId, priority, changed: true };
  });
}

// ---------------- So sánh giá của một mặt hàng ----------------
export async function getItemPrices(c: Ctx, itemId: string): Promise<ItemPricesDto> {
  needView(c);
  const it = (await col('catalogItems').doc(itemId).get()).data(); if (!it || it.organizationId !== c.orgId || it.deletedAt) throw notFound();
  const today = todayVn(), lists = (await col('priceLists').where('organizationId', '==', c.orgId).limit(500).get()).docs.filter(s => !s.data().deletedAt);
  const [rows, gps] = await Promise.all([db().getAll(...lists.map(l => col('priceLists').doc(l.id).collection('items').doc(itemId))), col('groupPrices').where('organizationId', '==', c.orgId).where('itemId', '==', itemId).limit(200).get()]);
  const gIds = [...new Set([...gps.docs.map(s => s.data().groupId as string), ...lists.flatMap(l => (l.data().customerGroupIds ?? []) as string[])])];
  const [gNames, prioDocs] = await Promise.all([namesOf(c.orgId, 'customerGroups', gIds), db().getAll(...gIds.map(g => col('groupPriorities').doc(prioId(c.orgId, g))))]);
  const prio = new Map(gIds.map((g, k) => [g, prioDocs[k].exists ? (prioDocs[k].data()!.priority as number) : 0]));
  return {
    itemId, code: it.code, name: it.name, defaultPrice: it.defaultPrice,
    lists: lists.flatMap((l, k) => (rows[k].exists ? [{ id: l.id, code: l.data().code, name: l.data().name, state: stateOf(l.data() as never, today), price: rows[k].data()!.price as number, customerGroupNames: ((l.data().customerGroupIds ?? []) as string[]).map(g => gNames.get(g)?.name ?? g) }] : [])),
    groupPrices: gps.docs.map(s => { const d = s.data(); return { id: s.id, groupId: d.groupId, groupName: gNames.get(d.groupId)?.name ?? '(Nhóm không khả dụng)', price: d.price, state: stateOf({ status: d.status, startDate: d.startDate ?? null, endDate: d.endDate ?? null }, today), priority: prio.get(d.groupId) ?? 0, startDate: d.startDate ?? null, endDate: d.endDate ?? null }; })
      .sort((a, b) => b.priority - a.priority || a.groupName.localeCompare(b.groupName, 'vi')),
  };
}
