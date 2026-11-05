import { FieldValue, Timestamp, type DocumentReference, type Query } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import type { HistoryDto, OpportunityDto } from '@/types/opportunity';
import { getConfig, stageNames } from './sales-config';
import { assignable, can, diffInput, inScope, opportunitiesCsv, parseClose, parseInput, scopeOf, STATUS_LABEL, type Actor, type Change, type OppInput, type OppStatus } from '../opportunity-core';

const LIMIT = 1000;
export const col = () => adminDb().collection('opportunities');
export const actorOf = (c: Ctx): Actor => ({ uid: c.uid, role: c.role, departmentId: c.departmentId });
const body = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
export const iso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);

export interface OppDoc extends OppInput {
  code: string; organizationId: string; departmentId: string | null; branchId: string | null; stageId: string; status: OppStatus; lostReason: string; closedAt: Timestamp | null;
  prevProbability: number | null; stageReached?: string[]; stageEnteredAt?: Timestamp | null; prevStageId?: string | null; ownerUid: string; ownerName: string; version: number; createdBy: string; updatedBy: string; createdAt: Timestamp; updatedAt: Timestamp; deletedAt: Timestamp | null;
}
interface Cust { code: string; name: string }

function scopeQuery(c: Ctx): Query {
  const s = scopeOf(actorOf(c));
  if (s.kind === 'none') throw new HttpError(403, 'no-scope', s.reason);
  let q: Query = col().where('organizationId', '==', c.orgId);
  if (s.kind === 'department') q = q.where('departmentId', '==', s.departmentId);
  if (s.kind === 'own') q = q.where('ownerUid', '==', s.uid);
  return q; // chỉ dùng điều kiện bằng nhau nên không cần Composite Index
}
export async function customerMap(orgId: string, ids: string[]): Promise<Map<string, Cust>> {
  const uniq = [...new Set(ids.filter(Boolean))], out = new Map<string, Cust>(), db = adminDb();
  for (let i = 0; i < uniq.length; i += 300) {
    const snaps = await db.getAll(...uniq.slice(i, i + 300).map(id => db.doc(`customers/${id}`)));
    snaps.forEach(s => { const d = s.data(); if (d && d.organizationId === orgId && !d.deletedAt) out.set(s.id, { code: d.code, name: d.name }); });
  }
  return out;
}
export const toDto = (id: string, d: OppDoc, m: Map<string, Cust>, names: Map<string, string>): OpportunityDto => ({
  id, code: d.code, title: d.title, description: d.description, customerId: d.customerId, customerCode: m.get(d.customerId)?.code ?? '', customerName: m.get(d.customerId)?.name ?? '(Khách hàng không khả dụng)',
  value: d.value, probability: d.probability, expectedCloseDate: d.expectedCloseDate, source: d.source, stageId: d.stageId, status: d.status, lostReason: d.lostReason,
  stageName: d.status === 'won' ? 'Thành công' : d.status === 'lost' ? 'Thất bại' : names.get(d.stageId) ?? '(Giai đoạn đã xóa)', stageReached: d.stageReached ?? [], stageEnteredAt: iso(d.stageEnteredAt),
  closedAt: iso(d.closedAt), ownerUid: d.ownerUid, ownerName: d.ownerName, departmentId: d.departmentId, version: d.version, createdAt: iso(d.createdAt) ?? '', updatedAt: iso(d.updatedAt) ?? '',
});
const flags = (c: Ctx, d: OppDoc) => { const a = actorOf(c), o = { ownerUid: d.ownerUid, departmentId: d.departmentId, status: d.status }; return { edit: can.edit(a, o), close: can.close(a, o), assign: can.assign(a, o), reopen: can.reopen(a, o), remove: can.remove(a, o) }; };

async function loadUser(orgId: string, uid: string) {
  const s = await adminDb().doc(`users/${uid}`).get(), u = s.data();
  if (!u || u.organizationId !== orgId) return null;
  return { uid, displayName: (u.displayName || u.email || uid) as string, role: u.role as string, status: u.status as string, departmentId: (u.departmentId ?? null) as string | null, branchId: (u.branchId ?? null) as string | null };
}
async function requireCustomer(orgId: string, id: string) {
  const m = await customerMap(orgId, [id]), c = m.get(id);
  if (!c) throw new HttpError(400, 'bad-customer', 'Khách hàng không tồn tại hoặc đã bị xóa.');
  return c;
}
export const hist = (c: Ctx, type: string, changes: Change[], note = '') => ({ type, changes, note, actorUid: c.uid, actorName: c.name, at: FieldValue.serverTimestamp() });
export const notFound = () => new HttpError(404, 'not-found', 'Không tìm thấy cơ hội hoặc bạn không có quyền xem.');

// ---------------- Truy vấn ----------------
export async function listOpportunities(c: Ctx, customerId?: string) {
  let q = scopeQuery(c);
  if (customerId) q = q.where('customerId', '==', customerId);
  const snap = await q.limit(LIMIT + 1).get();
  const docs = snap.docs.filter(d => !d.data().deletedAt).slice(0, LIMIT);
  const [m, cfg] = await Promise.all([customerMap(c.orgId, docs.map(d => d.data().customerId)), getConfig(c.orgId)]), names = stageNames(cfg);
  const items = docs.map(d => toDto(d.id, d.data() as OppDoc, m, names)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items, truncated: snap.size > LIMIT, can: { create: can.create(actorOf(c)), export: can.export(actorOf(c)), assign: ['super_admin', 'director', 'manager'].includes(c.role) } };
}
export async function getOpportunity(c: Ctx, id: string) {
  const s = await col().doc(id).get(), d = s.data() as OppDoc | undefined;
  if (!d || d.organizationId !== c.orgId || d.deletedAt || !inScope(scopeOf(actorOf(c)), d)) throw notFound();
  const [m, cfg, h] = await Promise.all([customerMap(c.orgId, [d.customerId]), getConfig(c.orgId), col().doc(id).collection('history').orderBy('at', 'desc').limit(100).get()]);
  const history: HistoryDto[] = h.docs.map(x => { const v = x.data(); return { id: x.id, type: v.type, changes: v.changes ?? [], note: v.note ?? '', actorName: v.actorName, at: iso(v.at) ?? '' }; });
  return { opportunity: toDto(id, d, m, stageNames(cfg)), history, can: flags(c, d) };
}
export async function listAssignable(c: Ctx) {
  const a = actorOf(c), snap = await adminDb().collection('users').where('organizationId', '==', c.orgId).where('status', '==', 'active').get();
  const users = snap.docs.map(d => ({ uid: d.id, displayName: (d.data().displayName || d.data().email || d.id) as string, role: d.data().role as string, departmentId: (d.data().departmentId ?? null) as string | null }))
    .filter(u => u.uid === c.uid ? can.create(a) : assignable(a, { role: u.role, status: 'active', departmentId: u.departmentId }));
  return { users };
}

// ---------------- Ghi dữ liệu ----------------
export async function createOpportunity(c: Ctx, raw: unknown) {
  const a = actorOf(c);
  if (!can.create(a)) throw new HttpError(403, 'forbidden', 'Bạn không có quyền tạo cơ hội bán hàng.');
  const p = parseInput(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const b = body(raw), requestId = typeof b.requestId === 'string' ? b.requestId : '';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(requestId)) throw new HttpError(400, 'invalid', 'Thiếu mã yêu cầu.');
  await requireCustomer(c.orgId, p.value.customerId);
  const first = (await getConfig(c.orgId)).stages[0]; // cơ hội mới luôn vào giai đoạn đầu của cấu hình hiện hành
  let owner = { uid: c.uid, name: c.name, departmentId: c.departmentId, branchId: c.branchId };
  if (typeof b.ownerUid === 'string' && b.ownerUid && b.ownerUid !== c.uid) {
    const t = await loadUser(c.orgId, b.ownerUid);
    if (!t || !assignable(a, t)) throw new HttpError(403, 'forbidden', 'Bạn không thể giao cơ hội cho người này.');
    owner = { uid: t.uid, name: t.displayName, departmentId: t.departmentId, branchId: t.branchId };
  }
  const db = adminDb(), ref = col().doc(`${c.uid.slice(0, 10)}_${requestId}`), counter = db.doc(`counters/${c.orgId}_opportunity`);
  // ID cố định theo requestId: gửi lại cùng yêu cầu (bấm nhiều lần, mạng chập chờn) không tạo thêm bản ghi
  return db.runTransaction(async tx => {
    const [ex, cn] = await Promise.all([tx.get(ref), tx.get(counter)]);
    if (ex.exists) return { id: ref.id, duplicate: true };
    const n = ((cn.data()?.value as number | undefined) ?? 0) + 1;
    tx.set(counter, { value: n });
    tx.set(ref, { ...p.value, code: `OP${String(n).padStart(5, '0')}`, organizationId: c.orgId, branchId: owner.branchId, departmentId: owner.departmentId, stageId: first.id, stageReached: [first.id], stageEnteredAt: FieldValue.serverTimestamp(), status: 'open', lostReason: '', closedAt: null,
      prevProbability: null, ownerUid: owner.uid, ownerName: owner.name, version: 1, createdBy: c.uid, updatedBy: c.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), deletedAt: null });
    tx.set(ref.collection('history').doc(), hist(c, 'created', []));
    return { id: ref.id, duplicate: false };
  });
}

/** Mẫu chung: đọc trong transaction → kiểm tra phạm vi/quyền/phiên bản → ghi thay đổi + lịch sử cùng lúc */
export async function mutate(c: Ctx, id: string, opts: { version?: number }, plan: (d: OppDoc) => { update: Record<string, unknown>; history: ReturnType<typeof hist> | null }) {
  const db = adminDb(), ref: DocumentReference = col().doc(id);
  return db.runTransaction(async tx => {
    const s = await tx.get(ref), d = s.data() as OppDoc | undefined;
    if (!d || d.organizationId !== c.orgId || d.deletedAt || !inScope(scopeOf(actorOf(c)), d)) throw notFound();
    if (opts.version !== undefined && d.version !== opts.version) throw new HttpError(409, 'conflict', 'Cơ hội vừa được người khác cập nhật. Vui lòng tải lại trang.');
    const { update, history } = plan(d);
    if (!history) return { id, changed: false };
    tx.update(ref, { ...update, updatedBy: c.uid, updatedAt: FieldValue.serverTimestamp(), version: FieldValue.increment(1) });
    tx.set(ref.collection('history').doc(), history);
    return { id, changed: true };
  });
}

export async function updateOpportunity(c: Ctx, id: string, raw: unknown) {
  const p = parseInput(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const version = body(raw).version; if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  const pre = (await col().doc(id).get()).data() as OppDoc | undefined; if (!pre || pre.organizationId !== c.orgId) throw notFound();
  const names = await customerMap(c.orgId, [pre.customerId, p.value.customerId]);
  if (!names.has(p.value.customerId)) throw new HttpError(400, 'bad-customer', 'Khách hàng không tồn tại hoặc đã bị xóa.');
  return mutate(c, id, { version }, d => {
    if (d.status !== 'open') throw new HttpError(409, 'closed', 'Cơ hội đã đóng. Hãy mở lại trước khi chỉnh sửa.');
    if (!can.edit(actorOf(c), d)) throw new HttpError(403, 'forbidden', 'Bạn không có quyền sửa cơ hội này.');
    const changes = diffInput(d, p.value, { from: names.get(d.customerId)?.name ?? d.customerId, to: names.get(p.value.customerId)!.name });
    return { update: { ...p.value }, history: changes.length ? hist(c, 'updated', changes) : null };
  });
}
export async function assignOpportunity(c: Ctx, id: string, raw: unknown) {
  const b = body(raw), ownerUid = typeof b.ownerUid === 'string' ? b.ownerUid : '', note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : '';
  const t = ownerUid ? await loadUser(c.orgId, ownerUid) : null;
  if (!t || !assignable(actorOf(c), t)) throw new HttpError(403, 'forbidden', 'Bạn không thể giao cơ hội cho người này.');
  return mutate(c, id, {}, d => {
    if (!can.assign(actorOf(c), d)) throw new HttpError(403, 'forbidden', 'Bạn không có quyền phân công cơ hội này.');
    if (d.ownerUid === t.uid) throw new HttpError(400, 'same-owner', 'Người này đang là người phụ trách.');
    return { update: { ownerUid: t.uid, ownerName: t.displayName, departmentId: t.departmentId, branchId: t.branchId }, history: hist(c, 'assigned', [{ field: 'ownerUid', label: 'Người phụ trách', from: d.ownerName, to: t.displayName }], note) };
  });
}
export async function closeOpportunity(c: Ctx, id: string, raw: unknown) {
  const p = parseClose(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const { result, reason, note } = p.value;
  return mutate(c, id, {}, d => {
    if (d.status !== 'open') throw new HttpError(409, 'closed', 'Cơ hội đã được đóng trước đó.');
    if (!can.close(actorOf(c), d)) throw new HttpError(403, 'forbidden', 'Bạn không có quyền đóng cơ hội này.');
    const prob = result === 'won' ? 100 : 0;
    const changes: Change[] = [{ field: 'status', label: 'Trạng thái', from: STATUS_LABEL.open, to: STATUS_LABEL[result] }, { field: 'probability', label: 'Xác suất', from: `${d.probability}%`, to: `${prob}%` }];
    if (result === 'lost') changes.push({ field: 'lostReason', label: 'Lý do thất bại', from: '—', to: reason });
    return { update: { status: result, lostReason: reason, closedAt: Timestamp.now(), probability: prob, prevProbability: d.probability, prevStageId: d.stageId, stageId: result }, history: hist(c, result, changes, note) };
  });
}
export async function reopenOpportunity(c: Ctx, id: string) {
  const cfg = await getConfig(c.orgId);
  return mutate(c, id, {}, d => {
    if (!can.reopen(actorOf(c), d)) throw new HttpError(403, 'forbidden', 'Chỉ quản lý mới được mở lại cơ hội đã đóng.');
    const prob = d.prevProbability ?? 20;
    // quay về giai đoạn trước khi đóng; nếu giai đoạn đó đã bị xóa thì về giai đoạn đầu
    const sid = cfg.stages.some(x => x.id === d.prevStageId) ? d.prevStageId! : cfg.stages[0].id;
    return { update: { status: 'open', lostReason: '', closedAt: null, probability: prob, prevProbability: null, prevStageId: null, stageId: sid, stageEnteredAt: Timestamp.now(), stageReached: FieldValue.arrayUnion(sid) },
      history: hist(c, 'reopened', [{ field: 'status', label: 'Trạng thái', from: STATUS_LABEL[d.status], to: STATUS_LABEL.open }, { field: 'probability', label: 'Xác suất', from: `${d.probability}%`, to: `${prob}%` }]) };
  });
}
export async function removeOpportunity(c: Ctx, id: string) {
  return mutate(c, id, {}, d => {
    if (!can.remove(actorOf(c), d)) throw new HttpError(403, 'forbidden', 'Chỉ quản lý mới được xóa cơ hội.');
    return { update: { deletedAt: Timestamp.now() }, history: hist(c, 'deleted', []) };
  });
}
/** Xuất CSV do máy chủ kiểm tra quyền (không chỉ ẩn nút trên giao diện) */
export async function exportOpportunities(c: Ctx) {
  if (!can.export(actorOf(c))) throw new HttpError(403, 'forbidden', 'Bạn không có quyền xuất dữ liệu.');
  const { items } = await listOpportunities(c);
  const csv = opportunitiesCsv(items);
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="co-hoi-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}
