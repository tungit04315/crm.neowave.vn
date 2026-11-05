// Nghiệp vụ Support Ticket ở phía máy chủ (Admin SDK). Trình duyệt KHÔNG đọc/ghi trực tiếp các collection này (rules mặc định từ chối).
// Mẫu giống lib/server/opportunities.ts: xác thực → phạm vi → transaction đọc-kiểm-ghi → lịch sử. Logic thuần nằm ở lib/care-core.ts.
import { FieldPath, FieldValue, Timestamp, type DocumentReference, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import {
  BULK_MAX, CARE_ROLES, SLA_TARGETS_MIN, TIME_FIELDS, can, canBeAssignee, canChangeStatus, checkTransition, claimPatch, computeSla, diffTicket, flagsOf, formatTicketCode,
  initialDues, inScope, parseAssign, parseBulk, parseListQuery, parseMessage, parseStatusChange, parseTicketInput, parseTransfer, priorityPatch, reopenPatch, scopeOf, slaBucket,
  statusPatch, ticketsCsv, transferPatch, type Actor, type ListQuery, type PatchSource, type SlaPartMs,
} from '../care-core';
import {
  PRIORITY_LABEL, TICKET_STATUS_LABEL, VIEW_STATUS,
  type Change, type CategoryDto, type DepartmentDto, type HistoryDto, type MessageDto, type SlaInfo, type SlaPart, type StaffDto, type TicketDetail, type TicketDto, type TicketPriority, type TicketStats, type TicketStatus,
} from '../../types/care';

const col = () => adminDb().collection('supportTickets');
const actorOf = (c: Ctx): Actor => ({ uid: c.uid, role: c.role, departmentId: c.departmentId });
const body = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
const ms = (t: unknown): number | null => (t instanceof Timestamp ? t.toMillis() : null);
const iso = (t: unknown): string | null => (t instanceof Timestamp ? t.toDate().toISOString() : null);
const noteOf = (raw: unknown) => { const n = body(raw).note; return typeof n === 'string' ? n.trim().slice(0, 500) : ''; };
const notFound = () => new HttpError(404, 'not-found', 'Không tìm thấy yêu cầu hỗ trợ hoặc bạn không có quyền xem.');
const VN_OFFSET = 7 * 3_600_000, DAY = 86_400_000;
const vnDayStart = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) - VN_OFFSET; };
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();

interface TicketDoc {
  code: string; organizationId: string; branchId: string | null; departmentId: string | null;
  title: string; description: string; categoryId: string; categoryName: string; priority: TicketPriority; status: TicketStatus;
  customerId: string; customerCode: string; customerName: string; contactId: string | null; contactName: string; contactPhone: string; contactEmail: string;
  contractId: string | null; projectId: string | null; taskId: string | null;
  assigneeUid: string | null; assigneeName: string; receivedByUid: string; receivedByName: string;
  waitingReason: string; resolution: string; resolvedByUid: string | null; resolvedByName: string; reopenCount: number; waitedMs: number;
  receivedAt: Timestamp; slaStartAt: Timestamp; firstResponseDueAt: Timestamp; resolveDueAt: Timestamp; firstRespondedAt: Timestamp | null;
  resolvedAt: Timestamp | null; closedAt: Timestamp | null; waitingSince: Timestamp | null; lastActivityAt: Timestamp;
  version: number; createdBy: string; updatedBy: string; createdAt: Timestamp; updatedAt: Timestamp; deletedAt: Timestamp | null;
}

// ---------------------------------------------------------------- Dữ liệu gốc & tra cứu
async function loadRef<T extends { id: string; name: string }>(name: 'departments' | 'supportCategories', orgId: string): Promise<T[]> {
  const s = await adminDb().collection(name).where('organizationId', '==', orgId).where('status', '==', 'active').get();
  return s.docs.map(d => ({ id: d.id, name: (d.data().name as string) ?? d.id, order: (d.data().order as number) ?? 999 })).sort((a, b) => a.order - b.order).map(({ id, name }) => ({ id, name }) as T);
}
const loadDepartments = (orgId: string) => loadRef<DepartmentDto>('departments', orgId);
const loadCategories = (orgId: string) => loadRef<CategoryDto>('supportCategories', orgId);
async function requireDepartment(orgId: string, id: string) {
  const d = (await loadDepartments(orgId)).find(x => x.id === id);
  if (!d) throw new HttpError(400, 'bad-department', 'Phòng ban không tồn tại hoặc đã ngừng sử dụng.');
  return d;
}
async function requireCategory(orgId: string, id: string) {
  const d = (await loadCategories(orgId)).find(x => x.id === id);
  if (!d) throw new HttpError(400, 'bad-category', 'Danh mục yêu cầu không tồn tại hoặc đã ngừng sử dụng.');
  return d;
}
async function requireCustomer(orgId: string, id: string) {
  const d = (await adminDb().doc(`customers/${id}`).get()).data();
  if (!d || d.organizationId !== orgId || d.deletedAt) throw new HttpError(400, 'bad-customer', 'Khách hàng không tồn tại hoặc đã bị xóa.');
  return { code: (d.code as string) ?? '', name: (d.name as string) ?? '' };
}
async function loadContact(orgId: string, customerId: string, id: string | null) {
  if (!id) return { id: null as string | null, name: '', phone: '', email: '' };
  const d = (await adminDb().doc(`contacts/${id}`).get()).data();
  if (!d || d.organizationId !== orgId || d.deletedAt) throw new HttpError(400, 'bad-contact', 'Người liên hệ không tồn tại hoặc đã bị xóa.');
  if (d.customerId !== customerId) throw new HttpError(400, 'bad-contact', 'Người liên hệ không thuộc khách hàng này.');
  return { id, name: (d.name as string) ?? '', phone: (d.phone as string) ?? '', email: (d.email as string) ?? '' };
}
async function loadUser(orgId: string, uid: string) {
  const u = (await adminDb().doc(`users/${uid}`).get()).data();
  if (!u || u.organizationId !== orgId) return null;
  return { uid, displayName: (u.displayName || u.email || uid) as string, role: u.role as string, status: u.status as string, departmentId: (u.departmentId ?? null) as string | null, branchId: (u.branchId ?? null) as string | null };
}
function requireScope(c: Ctx) {
  const s = scopeOf(actorOf(c));
  if (s.kind === 'none') throw new HttpError(403, 'no-scope', s.reason);
  return s;
}

// ---------------------------------------------------------------- Chuyển đổi dữ liệu
const slaSource = (d: TicketDoc): PatchSource => ({
  priority: d.priority, status: d.status, receivedAt: ms(d.receivedAt)!, slaStartAt: ms(d.slaStartAt) ?? ms(d.receivedAt)!, waitedMs: d.waitedMs ?? 0, waitingSince: ms(d.waitingSince),
  firstRespondedAt: ms(d.firstRespondedAt), resolvedAt: ms(d.resolvedAt), firstResponseDueAt: ms(d.firstResponseDueAt)!, resolveDueAt: ms(d.resolveDueAt)!,
  assigneeUid: d.assigneeUid ?? null, reopenCount: d.reopenCount ?? 0,
});
const slaPart = (p: SlaPartMs): SlaPart => ({ state: p.state, dueAt: new Date(p.dueAt).toISOString(), remainingMs: p.remainingMs });
const slaOf = (d: TicketDoc, now: number): SlaInfo => { const s = computeSla(slaSource(d), now); return { response: slaPart(s.response), resolve: slaPart(s.resolve) }; };
function toDto(id: string, d: TicketDoc, depts: Map<string, string>, now: number): TicketDto {
  return {
    id, code: d.code, title: d.title, description: d.description, priority: d.priority, status: d.status, categoryId: d.categoryId, categoryName: d.categoryName,
    departmentId: d.departmentId, departmentName: d.departmentId ? depts.get(d.departmentId) ?? d.departmentId : '',
    customerId: d.customerId, customerCode: d.customerCode, customerName: d.customerName, contactId: d.contactId ?? null, contactName: d.contactName ?? '', contactPhone: d.contactPhone ?? '', contactEmail: d.contactEmail ?? '',
    contractId: d.contractId ?? null, projectId: d.projectId ?? null, taskId: d.taskId ?? null, assigneeUid: d.assigneeUid ?? null, assigneeName: d.assigneeName ?? '', receivedByName: d.receivedByName ?? '',
    waitingReason: d.waitingReason ?? '', resolution: d.resolution ?? '', resolvedByName: d.resolvedByName ?? '', reopenCount: d.reopenCount ?? 0,
    receivedAt: iso(d.receivedAt) ?? '', firstResponseDueAt: iso(d.firstResponseDueAt) ?? '', resolveDueAt: iso(d.resolveDueAt) ?? '', firstRespondedAt: iso(d.firstRespondedAt),
    resolvedAt: iso(d.resolvedAt), closedAt: iso(d.closedAt), waitingSince: iso(d.waitingSince), lastActivityAt: iso(d.lastActivityAt) ?? '',
    version: d.version, updatedAt: iso(d.updatedAt) ?? '', sla: slaOf(d, now),
  };
}
const deptMap = async (orgId: string) => new Map((await loadDepartments(orgId)).map(d => [d.id, d.name]));
/** Các patch của care-core dùng mili-giây cho trường thời gian; đổi sang Timestamp trước khi ghi */
const toDocPatch = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, (TIME_FIELDS as readonly string[]).includes(k) && typeof v === 'number' ? Timestamp.fromMillis(v) : v]));
const hist = (c: Ctx, type: string, changes: Change[], note = '') => ({ type, changes, note, actorUid: c.uid, actorName: c.name, at: FieldValue.serverTimestamp() });
const statusChange = (from: TicketStatus, to: TicketStatus): Change => ({ field: 'status', label: 'Trạng thái', from: TICKET_STATUS_LABEL[from], to: TICKET_STATUS_LABEL[to] });

// ---------------------------------------------------------------- Truy vấn danh sách
/** Truy vấn theo phạm vi quyền (+ bộ lọc có thể dựng bằng điều kiện bằng/khoảng). Các bộ lọc còn lại được lọc trong bộ nhớ khi quét. */
function baseQuery(c: Ctx, qp: Pick<ListQuery, 'departmentId' | 'from' | 'to'>, statuses: TicketStatus[] | null): Query {
  const s = requireScope(c);
  let q: Query = col().where('organizationId', '==', c.orgId);
  if (s.kind === 'department') q = q.where('departmentId', '==', s.departmentId);
  else if (qp.departmentId) q = q.where('departmentId', '==', qp.departmentId);
  if (statuses) q = statuses.length === 1 ? q.where('status', '==', statuses[0]) : q.where('status', 'in', statuses);
  if (qp.from) q = q.where('receivedAt', '>=', Timestamp.fromMillis(vnDayStart(qp.from)));
  if (qp.to) q = q.where('receivedAt', '<', Timestamp.fromMillis(vnDayStart(qp.to) + DAY));
  return q;
}
function viewStatuses(qp: ListQuery): TicketStatus[] | null {
  const vs = VIEW_STATUS[qp.view];
  return qp.status ? (vs ? (vs.includes(qp.status) ? [qp.status] : []) : [qp.status]) : vs;
}
const CURSOR = /^\d{10,16}_[A-Za-z0-9_-]{1,128}$/;
const cursorOf = (d: QueryDocumentSnapshot) => `${(d.get('receivedAt') as Timestamp).toMillis()}_${d.id}`;
const SCAN_BATCH = 100;

/** Quét theo trang cho tới khi đủ `want` bản ghi khớp hoặc chạm trần `cap` (tránh quét vô hạn). */
async function scan(c: Ctx, qp: ListQuery, want: number, cap: number) {
  const statuses = viewStatuses(qp);
  if (statuses && statuses.length === 0) return { docs: [] as QueryDocumentSnapshot[], nextCursor: null as string | null, partial: false };
  let q = baseQuery(c, qp, statuses).orderBy('receivedAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (qp.cursor) {
    if (!CURSOR.test(qp.cursor)) throw new HttpError(400, 'bad-cursor', 'Con trỏ phân trang không hợp lệ.');
    const i = qp.cursor.indexOf('_'); q = q.startAfter(Timestamp.fromMillis(Number(qp.cursor.slice(0, i))), qp.cursor.slice(i + 1));
  }
  const needle = norm(qp.q), now = Date.now(), found: QueryDocumentSnapshot[] = [];
  const match = (d: TicketDoc) =>
    !d.deletedAt && (!qp.priority || d.priority === qp.priority) && (!qp.categoryId || d.categoryId === qp.categoryId)
    && (!qp.assigneeUid || (qp.assigneeUid === 'none' ? !d.assigneeUid : d.assigneeUid === qp.assigneeUid))
    && (!qp.sla || slaBucket(computeSla(slaSource(d), now)) === qp.sla)
    && (!needle || norm(`${d.code} ${d.title} ${d.customerName} ${d.customerCode}`).includes(needle));
  let scanned = 0, exhausted = false, last: QueryDocumentSnapshot | null = null;
  while (found.length < want + 1 && scanned < cap) {
    const size = Math.min(SCAN_BATCH, cap - scanned), snap = await q.limit(size).get();
    scanned += snap.size;
    for (const doc of snap.docs) { last = doc; if (match(doc.data() as TicketDoc)) { found.push(doc); if (found.length >= want + 1) break; } }
    if (snap.size < size) { exhausted = true; break; }
    if (found.length >= want + 1) break;
    q = q.startAfter(last!);
  }
  const docs = found.slice(0, want);
  if (found.length > want) return { docs, nextCursor: cursorOf(docs[want - 1]), partial: false };
  if (!exhausted && last) return { docs, nextCursor: cursorOf(last), partial: true }; // chạm trần quét: còn dữ liệu phía sau, người dùng có thể "tải thêm"
  return { docs, nextCursor: null, partial: false };
}

export async function listTickets(c: Ctx, sp: URLSearchParams) {
  const qp = parseListQuery(sp), a = actorOf(c), now = Date.now();
  const [r, depts] = await Promise.all([scan(c, qp, qp.limit, 500), deptMap(c.orgId)]);
  return { items: r.docs.map(d => toDto(d.id, d.data() as TicketDoc, depts, now)), nextCursor: r.nextCursor, partial: r.partial, can: { create: can.create(a), bulk: can.bulk(a), export: can.export(a) } };
}

export async function ticketStats(c: Ctx, sp: URLSearchParams): Promise<TicketStats> {
  const departmentId = parseListQuery(sp).departmentId, base = { departmentId, from: '', to: '' };
  const count = async (st: TicketStatus) => ((await baseQuery(c, base, [st]).where('deletedAt', '==', null).count().get()).data().count as number) ?? 0;
  const OPEN: TicketStatus[] = ['new', 'in_progress', 'waiting_customer'], CAP = 500;
  const [nNew, nProg, nWait, nRes, nClosed, open] = await Promise.all([
    count('new'), count('in_progress'), count('waiting_customer'), count('resolved'), count('closed'),
    baseQuery(c, base, OPEN).orderBy('receivedAt', 'desc').limit(CAP).get(),
  ]);
  const now = Date.now(), breached = open.docs.filter(d => { const t = d.data() as TicketDoc; return !t.deletedAt && slaBucket(computeSla(slaSource(t), now)) === 'breached'; }).length;
  return { total: nNew + nProg + nWait + nRes + nClosed, new: nNew, inProgress: nProg, waiting: nWait, resolved: nRes + nClosed, breached, breachedCapped: open.size >= CAP };
}

export async function getTicket(c: Ctx, id: string): Promise<TicketDetail> {
  const s = await col().doc(id).get(), d = s.data() as TicketDoc | undefined, a = actorOf(c);
  if (!d || d.organizationId !== c.orgId || d.deletedAt || !can.view(a, d)) throw notFound();
  const [depts, m, h] = await Promise.all([deptMap(c.orgId), col().doc(id).collection('messages').orderBy('at', 'asc').limit(300).get(), col().doc(id).collection('history').orderBy('at', 'desc').limit(100).get()]);
  const messages: MessageDto[] = m.docs.map(x => { const v = x.data(); return { id: x.id, type: v.type, content: v.content, authorName: v.authorName, at: iso(v.at) ?? '' }; });
  const history: HistoryDto[] = h.docs.map(x => { const v = x.data(); return { id: x.id, type: v.type, changes: v.changes ?? [], note: v.note ?? '', actorName: v.actorName, at: iso(v.at) ?? '' }; });
  return { ticket: toDto(id, d, depts, Date.now()), messages, history, can: flagsOf(a, d) };
}

export async function careMeta(c: Ctx) {
  const s = requireScope(c), a = actorOf(c);
  const [departments, categories] = await Promise.all([loadDepartments(c.orgId), loadCategories(c.orgId)]);
  return { departments, categories, slaTargets: SLA_TARGETS_MIN, scope: s.kind === 'department' ? { kind: s.kind, departmentId: s.departmentId } : { kind: s.kind }, me: { uid: c.uid, role: c.role, departmentId: c.departmentId }, can: { create: can.create(a), bulk: can.bulk(a), export: can.export(a) } };
}
/** Người có thể nhận xử lý phiếu của một phòng ban (người dùng không thấy phiếu sẽ không có trong danh sách) */
export async function listStaff(c: Ctx, sp: URLSearchParams): Promise<{ users: StaffDto[] }> {
  const s = requireScope(c), want = s.kind === 'department' ? s.departmentId : (sp.get('departmentId') || null);
  const snap = await adminDb().collection('users').where('organizationId', '==', c.orgId).where('status', '==', 'active').get();
  const users = snap.docs.map(d => ({ uid: d.id, displayName: (d.data().displayName || d.data().email || d.id) as string, role: d.data().role as string, departmentId: (d.data().departmentId ?? null) as string | null }))
    .filter(u => CARE_ROLES.includes(u.role) && (want ? canBeAssignee({ role: u.role, status: 'active', departmentId: u.departmentId }, want) : scopeOf({ uid: u.uid, role: u.role, departmentId: u.departmentId }).kind !== 'none'))
    .sort((x, y) => x.displayName.localeCompare(y.displayName, 'vi'));
  return { users };
}

// ---------------------------------------------------------------- Ghi dữ liệu
export async function createTicket(c: Ctx, raw: unknown) {
  const a = actorOf(c);
  if (!can.create(a)) throw new HttpError(403, 'forbidden', 'Bạn không có quyền tạo yêu cầu hỗ trợ.');
  const p = parseTicketInput(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const requestId = typeof body(raw).requestId === 'string' ? (body(raw).requestId as string) : '';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(requestId)) throw new HttpError(400, 'invalid', 'Thiếu mã yêu cầu.');
  const s = requireScope(c), v = p.value;
  const departmentId = s.kind === 'department' ? s.departmentId : v.departmentId;
  if (!departmentId) throw new HttpError(400, 'invalid', 'Vui lòng chọn phòng ban tiếp nhận.');
  const [, category, customer] = await Promise.all([requireDepartment(c.orgId, departmentId), requireCategory(c.orgId, v.categoryId), requireCustomer(c.orgId, v.customerId)]);
  const contact = await loadContact(c.orgId, v.customerId, v.contactId);
  const db = adminDb(), ref = col().doc(`${c.uid.slice(0, 10)}_${requestId}`), counter = db.doc(`counters/${c.orgId}_ticket`);
  const now = Date.now(), dues = initialDues(now, v.priority), at = Timestamp.fromMillis(now);
  // ID cố định theo requestId: gửi lại cùng yêu cầu không tạo thêm phiếu
  return db.runTransaction(async tx => {
    const [ex, cn] = await Promise.all([tx.get(ref), tx.get(counter)]);
    if (ex.exists) return { id: ref.id, duplicate: true };
    const n = ((cn.data()?.value as number | undefined) ?? 0) + 1;
    tx.set(counter, { value: n });
    const doc: Record<string, unknown> = {
      code: formatTicketCode(n), organizationId: c.orgId, branchId: c.branchId, departmentId, title: v.title, description: v.description, categoryId: category.id, categoryName: category.name, priority: v.priority, status: 'new',
      customerId: v.customerId, customerCode: customer.code, customerName: customer.name, contactId: contact.id, contactName: contact.name, contactPhone: contact.phone, contactEmail: contact.email,
      contractId: null, projectId: null, taskId: null, assigneeUid: null, assigneeName: '', receivedByUid: c.uid, receivedByName: c.name,
      waitingReason: '', resolution: '', resolvedByUid: null, resolvedByName: '', reopenCount: 0, waitedMs: 0,
      receivedAt: at, slaStartAt: at, firstResponseDueAt: Timestamp.fromMillis(dues.firstResponseDueAt), resolveDueAt: Timestamp.fromMillis(dues.resolveDueAt),
      firstRespondedAt: null, resolvedAt: null, closedAt: null, waitingSince: null, lastActivityAt: at,
      version: 1, createdBy: c.uid, updatedBy: c.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), deletedAt: null,
    };
    tx.set(ref, doc);
    tx.set(ref.collection('history').doc(), hist(c, 'created', []));
    return { id: ref.id, duplicate: false };
  });
}

interface Plan { update: Record<string, unknown>; history: ReturnType<typeof hist> | null; message?: Record<string, unknown>; bump?: boolean }
/** Đọc trong transaction → kiểm tra phạm vi / phiên bản → ghi thay đổi + lịch sử (+ tin nhắn) cùng lúc */
async function mutate(c: Ctx, id: string, opts: { version?: number }, plan: (d: TicketDoc, now: number) => Plan) {
  const db = adminDb(), ref: DocumentReference = col().doc(id);
  return db.runTransaction(async tx => {
    const s = await tx.get(ref), d = s.data() as TicketDoc | undefined;
    if (!d || d.organizationId !== c.orgId || d.deletedAt || !inScope(scopeOf(actorOf(c)), d)) throw notFound();
    if (opts.version !== undefined && d.version !== opts.version) throw new HttpError(409, 'conflict', 'Yêu cầu vừa được người khác cập nhật. Vui lòng tải lại trang.');
    const p = plan(d, Date.now());
    if (!p.history && !p.message) return { id, changed: false };
    tx.update(ref, { ...toDocPatch(p.update), updatedBy: c.uid, updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp(), ...(p.bump === false ? {} : { version: FieldValue.increment(1) }) });
    if (p.history) tx.set(ref.collection('history').doc(), p.history);
    if (p.message) tx.set(ref.collection('messages').doc(), p.message);
    return { id, changed: true };
  });
}
const forbid = (msg: string) => new HttpError(403, 'forbidden', msg);

export async function updateTicket(c: Ctx, id: string, raw: unknown) {
  const p = parseTicketInput(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const version = body(raw).version; if (typeof version !== 'number') throw new HttpError(400, 'invalid', 'Thiếu số phiên bản.');
  const pre = (await col().doc(id).get()).data() as TicketDoc | undefined; if (!pre || pre.organizationId !== c.orgId) throw notFound();
  const v = p.value;
  const customer = v.customerId === pre.customerId ? { code: pre.customerCode, name: pre.customerName } : await requireCustomer(c.orgId, v.customerId);
  const category = v.categoryId === pre.categoryId ? { id: pre.categoryId, name: pre.categoryName } : await requireCategory(c.orgId, v.categoryId);
  const contact = v.contactId === (pre.contactId ?? null) && v.customerId === pre.customerId ? { id: pre.contactId ?? null, name: pre.contactName ?? '', phone: pre.contactPhone ?? '', email: pre.contactEmail ?? '' } : await loadContact(c.orgId, v.customerId, v.contactId);
  return mutate(c, id, { version }, d => {
    if (d.status === 'closed') throw new HttpError(409, 'closed', 'Yêu cầu đã đóng. Hãy mở lại trước khi chỉnh sửa.');
    const a = actorOf(c); if (!can.edit(a, d)) throw forbid('Bạn không có quyền sửa yêu cầu này.');
    const changes = diffTicket(d, v, { customerId: { from: d.customerName, to: customer.name }, contactId: { from: d.contactName ?? '', to: contact.name }, categoryId: { from: d.categoryName, to: category.name } });
    if (!changes.length) return { update: {}, history: null };
    const update: Record<string, unknown> = {
      title: v.title, description: v.description, customerId: v.customerId, customerCode: customer.code, customerName: customer.name,
      contactId: contact.id, contactName: contact.name, contactPhone: contact.phone, contactEmail: contact.email, categoryId: category.id, categoryName: category.name,
    };
    if (v.priority !== d.priority) {
      if (!can.setPriority(a, d)) throw forbid('Chỉ trưởng nhóm trở lên được đổi mức độ ưu tiên (và chỉ khi yêu cầu chưa giải quyết).');
      Object.assign(update, priorityPatch(slaSource(d), v.priority));
    }
    return { update, history: hist(c, 'updated', changes) };
  });
}

export async function claimTicket(c: Ctx, id: string) {
  return mutate(c, id, {}, d => {
    if (!can.claim(actorOf(c), d)) throw forbid(d.assigneeUid ? 'Yêu cầu đã có người phụ trách.' : 'Bạn không thể nhận xử lý yêu cầu này.');
    const patch = claimPatch(d), changes: Change[] = [{ field: 'assigneeUid', label: 'Người phụ trách', from: '—', to: c.name }];
    if (patch.status) changes.push(statusChange(d.status, patch.status as TicketStatus));
    return { update: { assigneeUid: c.uid, assigneeName: c.name, ...patch }, history: hist(c, 'claimed', changes) };
  });
}

type StaffTarget = NonNullable<Awaited<ReturnType<typeof loadUser>>>;
function assignPlan(c: Ctx, t: StaffTarget, note: string) {
  return (d: TicketDoc): Plan => {
    if (!can.assign(actorOf(c), d)) throw forbid('Bạn không có quyền phân công yêu cầu này (hoặc yêu cầu đã giải quyết / đóng).');
    if (!canBeAssignee(t, d.departmentId)) throw forbid('Người này không thuộc phòng xử lý yêu cầu, không thể được giao.');
    if (d.assigneeUid === t.uid) throw new HttpError(400, 'same-assignee', 'Người này đang là người phụ trách.');
    return { update: { assigneeUid: t.uid, assigneeName: t.displayName }, history: hist(c, 'assigned', [{ field: 'assigneeUid', label: 'Người phụ trách', from: d.assigneeName || '—', to: t.displayName }], note) };
  };
}
export async function assignTicket(c: Ctx, id: string, raw: unknown) {
  const p = parseAssign(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const t = await loadUser(c.orgId, p.value.assigneeUid); if (!t) throw forbid('Người này không thuộc tổ chức của bạn.');
  return mutate(c, id, {}, assignPlan(c, t, p.value.note));
}
export async function transferTicket(c: Ctx, id: string, raw: unknown) {
  const p = parseTransfer(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const dept = await requireDepartment(c.orgId, p.value.departmentId), names = await deptMap(c.orgId);
  return mutate(c, id, {}, (d, now) => {
    if (!can.transfer(actorOf(c), d)) throw forbid('Bạn không có quyền chuyển phòng yêu cầu này (hoặc yêu cầu đã giải quyết / đóng).');
    if (d.departmentId === dept.id) throw new HttpError(400, 'same-department', 'Yêu cầu đang thuộc phòng ban này.');
    const patch = transferPatch(slaSource(d), dept.id, now), changes: Change[] = [{ field: 'departmentId', label: 'Phòng ban xử lý', from: (d.departmentId && names.get(d.departmentId)) || '—', to: dept.name }];
    if (d.assigneeUid) changes.push({ field: 'assigneeUid', label: 'Người phụ trách', from: d.assigneeName, to: '—' });
    if (patch.status) changes.push(statusChange(d.status, patch.status as TicketStatus));
    return { update: patch, history: hist(c, 'transferred', changes, p.value.note) };
  });
}
export async function changeStatus(c: Ctx, id: string, raw: unknown) {
  const p = parseStatusChange(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const { to, reason, resolution, note } = p.value;
  return mutate(c, id, {}, (d, now) => {
    const err = checkTransition(d.status, to, d.assigneeUid ?? null); if (err) throw new HttpError(409, 'bad-transition', err);
    if (!canChangeStatus(actorOf(c), d, to)) throw forbid('Bạn không có quyền chuyển yêu cầu này sang trạng thái đó.');
    const update: Record<string, unknown> = statusPatch(slaSource(d), to, { reason, resolution }, now), changes: Change[] = [statusChange(d.status, to)];
    if (to === 'resolved') { Object.assign(update, { resolvedByUid: c.uid, resolvedByName: c.name }); changes.push({ field: 'resolution', label: 'Kết quả xử lý', from: '—', to: resolution }); }
    if (to === 'waiting_customer') changes.push({ field: 'waitingReason', label: 'Lý do chờ', from: '—', to: reason });
    return { update, history: hist(c, 'status', changes, note) };
  });
}
export async function reopenTicket(c: Ctx, id: string, raw: unknown) {
  return mutate(c, id, {}, (d, now) => {
    if (!can.reopen(actorOf(c), d)) throw forbid('Chỉ trưởng nhóm trở lên được mở lại yêu cầu đã giải quyết / đóng.');
    const patch = reopenPatch(slaSource(d), now);
    return { update: patch, history: hist(c, 'reopened', [statusChange(d.status, patch.status as TicketStatus)], noteOf(raw)) };
  });
}
export async function addMessage(c: Ctx, id: string, raw: unknown) {
  const p = parseMessage(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const { type, content } = p.value;
  // Tin nhắn không tăng `version` để không làm người khác đang sửa phiếu bị báo xung đột
  return mutate(c, id, {}, (d, now) => {
    const a = actorOf(c);
    if (type === 'reply' ? !can.reply(a, d) : !can.note(a, d)) throw forbid(type === 'reply' ? 'Chỉ người phụ trách hoặc trưởng nhóm được phản hồi khách hàng (và yêu cầu chưa đóng).' : 'Bạn không thể ghi chú vào yêu cầu này.');
    const update: Record<string, unknown> = type === 'reply' && d.firstRespondedAt === null ? { firstRespondedAt: now } : {}; // phản hồi đầu tiên (giả định A5)
    return { update, history: null, bump: false, message: { type, content, authorUid: c.uid, authorName: c.name, at: FieldValue.serverTimestamp() } };
  });
}

// ---------------------------------------------------------------- Hàng loạt & xuất dữ liệu
export async function bulkTickets(c: Ctx, raw: unknown) {
  if (!can.bulk(actorOf(c))) throw forbid('Bạn không có quyền thao tác hàng loạt.');
  const p = parseBulk(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const b = p.value, target = b.action === 'assign' ? await loadUser(c.orgId, b.assigneeUid) : null;
  if (b.action === 'assign' && !target) throw forbid('Người này không thuộc tổ chức của bạn.');
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of b.ids.slice(0, BULK_MAX)) { // lần lượt từng phiếu để mỗi phiếu có transaction và lịch sử riêng; báo kết quả từng phiếu
    try {
      if (b.action === 'assign') await mutate(c, id, {}, assignPlan(c, target!, ''));
      else await mutate(c, id, {}, d => {
        if (!can.setPriority(actorOf(c), d)) throw forbid('Không thể đổi mức độ ưu tiên (đã giải quyết / đóng hoặc ngoài phạm vi).');
        if (d.priority === b.priority) throw new HttpError(400, 'same-priority', 'Mức độ ưu tiên không thay đổi.');
        return { update: priorityPatch(slaSource(d), b.priority as TicketPriority), history: hist(c, 'updated', [{ field: 'priority', label: 'Mức độ ưu tiên', from: PRIORITY_LABEL[d.priority], to: PRIORITY_LABEL[b.priority as TicketPriority] }]) };
      });
      results.push({ id, ok: true });
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      results.push({ id, ok: false, error: e.message });
    }
  }
  return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
}
/** Xuất CSV: máy chủ kiểm tra quyền (không chỉ ẩn nút) và áp dụng cùng bộ lọc với danh sách; tối đa 1000 dòng */
export async function exportTickets(c: Ctx, sp: URLSearchParams) {
  if (!can.export(actorOf(c))) throw forbid('Bạn không có quyền xuất dữ liệu.');
  const qp = parseListQuery(sp), now = Date.now(), MAX = 1000;
  const [r, depts] = await Promise.all([scan(c, { ...qp, cursor: '' }, MAX, 3000), deptMap(c.orgId)]);
  const csv = ticketsCsv(r.docs.map(d => toDto(d.id, d.data() as TicketDoc, depts, now)));
  return new Response('\uFEFF' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="yeu-cau-ho-tro-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store', 'X-Truncated': r.nextCursor ? '1' : '0' } });
}
