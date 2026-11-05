// Logic thuần của phân hệ Chăm sóc khách hàng: phạm vi & quyền, kiểm tra dữ liệu, chuyển trạng thái, SLA theo giờ làm việc.
// KHÔNG phụ thuộc Firebase/trình duyệt để dùng chung ở server (API), client (giao diện) và kiểm thử độc lập.
// Thời gian trong file này là số mili-giây (epoch); lớp server tự đổi sang Timestamp / chuỗi ISO.
import { safeCell, toCsv } from './customer-io-core';
import {
  PRIORITIES, PRIORITY_LABEL, STATUSES, TICKET_STATUS_LABEL,
  type Change, type MessageType, type SlaState, type TicketDto, type TicketFlags, type TicketPriority, type TicketStatus, type TicketView,
} from '../types/care';

// ---------------------------------------------------------------- Phân quyền (GIẢ ĐỊNH A1, A8, A9 — chỉnh tại đây)
export const CARE_MANAGER_ROLES = ['super_admin', 'director', 'manager'];
export const CARE_ROLES = [...CARE_MANAGER_ROLES, 'customer_service'];

export interface Actor { uid: string; role: string; departmentId: string | null }
export type Scope = { kind: 'company' } | { kind: 'department'; departmentId: string } | { kind: 'none'; reason: string };

export function scopeOf(a: Actor): Scope {
  if (a.role === 'super_admin' || a.role === 'director') return { kind: 'company' };
  if (a.role === 'manager' || a.role === 'customer_service')
    return a.departmentId ? { kind: 'department', departmentId: a.departmentId } : { kind: 'none', reason: 'Tài khoản chưa được gán phòng ban. Vui lòng liên hệ quản trị viên.' };
  return { kind: 'none', reason: 'Vai trò của bạn chưa được cấp quyền xem yêu cầu hỗ trợ.' };
}
export const inScope = (s: Scope, o: { departmentId: string | null }): boolean =>
  s.kind === 'company' || (s.kind === 'department' && o.departmentId === s.departmentId);

export interface TicketRef { departmentId: string | null; assigneeUid: string | null; status: TicketStatus }
const isMgr = (a: Actor) => CARE_MANAGER_ROLES.includes(a.role);
const seen = (a: Actor, t: TicketRef) => inScope(scopeOf(a), t);
const handler = (a: Actor, t: TicketRef) => seen(a, t) && (isMgr(a) || t.assigneeUid === a.uid);
const isOpen = (s: TicketStatus) => s === 'new' || s === 'in_progress' || s === 'waiting_customer';

export const can = {
  view: (a: Actor, t: TicketRef) => seen(a, t),
  create: (a: Actor) => CARE_ROLES.includes(a.role) && scopeOf(a).kind !== 'none',
  edit: (a: Actor, t: TicketRef) => t.status !== 'closed' && handler(a, t),
  setPriority: (a: Actor, t: TicketRef) => isOpen(t.status) && isMgr(a) && seen(a, t),
  claim: (a: Actor, t: TicketRef) => isOpen(t.status) && !t.assigneeUid && seen(a, t) && CARE_ROLES.includes(a.role),
  assign: (a: Actor, t: TicketRef) => isOpen(t.status) && isMgr(a) && seen(a, t),
  transfer: (a: Actor, t: TicketRef) => isOpen(t.status) && isMgr(a) && seen(a, t),
  start: (a: Actor, t: TicketRef) => handler(a, t) && ((t.status === 'new' && !!t.assigneeUid) || t.status === 'waiting_customer'),
  wait: (a: Actor, t: TicketRef) => handler(a, t) && t.status === 'in_progress',
  resolve: (a: Actor, t: TicketRef) => handler(a, t) && (t.status === 'in_progress' || t.status === 'waiting_customer'),
  close: (a: Actor, t: TicketRef) => isMgr(a) && seen(a, t) && t.status === 'resolved',
  reopen: (a: Actor, t: TicketRef) => isMgr(a) && seen(a, t) && (t.status === 'resolved' || t.status === 'closed'),
  reply: (a: Actor, t: TicketRef) => t.status !== 'closed' && handler(a, t),
  note: (a: Actor, t: TicketRef) => t.status !== 'closed' && seen(a, t),
  bulk: (a: Actor) => isMgr(a) && scopeOf(a).kind !== 'none',
  export: (a: Actor) => isMgr(a) && scopeOf(a).kind !== 'none',
};
export const flagsOf = (a: Actor, t: TicketRef): TicketFlags => ({
  edit: can.edit(a, t), setPriority: can.setPriority(a, t), claim: can.claim(a, t), assign: can.assign(a, t), transfer: can.transfer(a, t),
  start: can.start(a, t), wait: can.wait(a, t), resolve: can.resolve(a, t), close: can.close(a, t), reopen: can.reopen(a, t), reply: can.reply(a, t), note: can.note(a, t),
});
/** Quyền đổi sang một trạng thái cụ thể (dùng cho API /status) */
export function canChangeStatus(a: Actor, t: TicketRef, to: TicketStatus): boolean {
  if (to === 'in_progress') return can.start(a, t);
  if (to === 'waiting_customer') return can.wait(a, t);
  if (to === 'resolved') return can.resolve(a, t);
  if (to === 'closed') return can.close(a, t);
  return false;
}
/** Người nhận xử lý hợp lệ: phải xem được phiếu, nếu không phiếu sẽ "mồ côi" */
export function canBeAssignee(target: { role: string; status: string; departmentId: string | null }, ticketDepartmentId: string | null): boolean {
  if (target.status !== 'active' || !CARE_ROLES.includes(target.role)) return false;
  return inScope(scopeOf({ uid: '', role: target.role, departmentId: target.departmentId }), { departmentId: ticketDepartmentId });
}

// ---------------------------------------------------------------- Trạng thái
export const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  new: ['in_progress'], in_progress: ['waiting_customer', 'resolved'], waiting_customer: ['in_progress', 'resolved'], resolved: ['closed'], closed: [],
};
export function checkTransition(from: TicketStatus, to: TicketStatus, assigneeUid: string | null): string | null {
  if (!TRANSITIONS[from].includes(to)) return `Không thể chuyển từ “${TICKET_STATUS_LABEL[from]}” sang “${TICKET_STATUS_LABEL[to]}”.`;
  if (to === 'in_progress' && !assigneeUid) return 'Cần có người phụ trách trước khi bắt đầu xử lý.';
  return null;
}

// ---------------------------------------------------------------- Kiểm tra dữ liệu
type R<T> = { ok: true; value: T } | { ok: false; error: string };
const obj = (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().startsWith(s);

export interface TicketInput { title: string; description: string; customerId: string; contactId: string | null; categoryId: string; priority: TicketPriority; departmentId: string | null }
export function parseTicketInput(raw: unknown): R<TicketInput> {
  const b = obj(raw), title = str(b.title), description = str(b.description), customerId = str(b.customerId), categoryId = str(b.categoryId);
  if (!title) return { ok: false, error: 'Vui lòng nhập tiêu đề yêu cầu.' };
  if (title.length > 200) return { ok: false, error: 'Tiêu đề tối đa 200 ký tự.' };
  if (description.length > 4000) return { ok: false, error: 'Mô tả tối đa 4000 ký tự.' };
  if (!customerId || !ID.test(customerId)) return { ok: false, error: 'Vui lòng chọn khách hàng.' };
  if (!categoryId || !ID.test(categoryId)) return { ok: false, error: 'Vui lòng chọn danh mục yêu cầu.' };
  const priority = b.priority === undefined || b.priority === '' ? 'medium' : b.priority;
  if (!PRIORITIES.includes(priority as TicketPriority)) return { ok: false, error: 'Mức độ ưu tiên không hợp lệ.' };
  const contactId = str(b.contactId) || null; if (contactId && !ID.test(contactId)) return { ok: false, error: 'Người liên hệ không hợp lệ.' };
  const departmentId = str(b.departmentId) || null; if (departmentId && !ID.test(departmentId)) return { ok: false, error: 'Phòng ban không hợp lệ.' };
  return { ok: true, value: { title, description, customerId, contactId, categoryId, priority: priority as TicketPriority, departmentId } };
}
export interface StatusInput { to: TicketStatus; reason: string; resolution: string; note: string }
export function parseStatusChange(raw: unknown): R<StatusInput> {
  const b = obj(raw), to = b.to as TicketStatus, reason = str(b.reason), resolution = str(b.resolution), note = str(b.note);
  if (!STATUSES.includes(to) || to === 'new') return { ok: false, error: 'Trạng thái không hợp lệ.' };
  if (to === 'waiting_customer' && !reason) return { ok: false, error: 'Vui lòng nhập lý do chờ khách hàng phản hồi.' };
  if (to === 'resolved' && !resolution) return { ok: false, error: 'Vui lòng ghi nhận kết quả xử lý trước khi chuyển sang “Đã giải quyết”.' };
  if (reason.length > 500 || note.length > 500) return { ok: false, error: 'Lý do và ghi chú tối đa 500 ký tự.' };
  if (resolution.length > 2000) return { ok: false, error: 'Kết quả xử lý tối đa 2000 ký tự.' };
  return { ok: true, value: { to, reason: to === 'waiting_customer' ? reason : '', resolution: to === 'resolved' ? resolution : '', note } };
}
export function parseAssign(raw: unknown): R<{ assigneeUid: string; note: string }> {
  const b = obj(raw), assigneeUid = str(b.assigneeUid), note = str(b.note);
  if (!assigneeUid || !ID.test(assigneeUid)) return { ok: false, error: 'Vui lòng chọn người phụ trách.' };
  if (note.length > 500) return { ok: false, error: 'Ghi chú tối đa 500 ký tự.' };
  return { ok: true, value: { assigneeUid, note } };
}
export function parseTransfer(raw: unknown): R<{ departmentId: string; note: string }> {
  const b = obj(raw), departmentId = str(b.departmentId), note = str(b.note);
  if (!departmentId || !ID.test(departmentId)) return { ok: false, error: 'Vui lòng chọn phòng ban nhận xử lý.' };
  if (note.length > 500) return { ok: false, error: 'Ghi chú tối đa 500 ký tự.' };
  return { ok: true, value: { departmentId, note } };
}
export function parseMessage(raw: unknown): R<{ type: MessageType; content: string }> {
  const b = obj(raw), type = b.type, content = str(b.content);
  if (type !== 'reply' && type !== 'internal') return { ok: false, error: 'Loại nội dung không hợp lệ.' };
  if (!content) return { ok: false, error: 'Vui lòng nhập nội dung.' };
  if (content.length > 4000) return { ok: false, error: 'Nội dung tối đa 4000 ký tự.' };
  return { ok: true, value: { type, content } };
}
export interface BulkInput { ids: string[]; action: 'assign' | 'priority'; assigneeUid: string; priority: TicketPriority | '' }
export const BULK_MAX = 50;
export function parseBulk(raw: unknown): R<BulkInput> {
  const b = obj(raw), ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === 'string'))] : [];
  if (!ids.length) return { ok: false, error: 'Vui lòng chọn ít nhất một yêu cầu.' };
  if (ids.length > BULK_MAX) return { ok: false, error: `Mỗi lần chỉ xử lý tối đa ${BULK_MAX} yêu cầu.` };
  if (!ids.every(i => ID.test(i))) return { ok: false, error: 'Danh sách yêu cầu không hợp lệ.' };
  if (b.action === 'assign') { const u = str(b.assigneeUid); if (!u || !ID.test(u)) return { ok: false, error: 'Vui lòng chọn người phụ trách.' }; return { ok: true, value: { ids, action: 'assign', assigneeUid: u, priority: '' } }; }
  if (b.action === 'priority') { if (!PRIORITIES.includes(b.priority as TicketPriority)) return { ok: false, error: 'Mức độ ưu tiên không hợp lệ.' }; return { ok: true, value: { ids, action: 'priority', assigneeUid: '', priority: b.priority as TicketPriority } }; }
  return { ok: false, error: 'Thao tác hàng loạt không hợp lệ.' };
}

export interface ListQuery {
  view: TicketView; status: TicketStatus | ''; priority: TicketPriority | ''; categoryId: string; assigneeUid: string; departmentId: string;
  from: string; to: string; sla: '' | 'ok' | 'warning' | 'breached'; q: string; limit: number; cursor: string;
}
export const LIST_DEFAULT = 20, LIST_MAX = 50;
/** Giá trị sai bị bỏ qua (không báo lỗi) để bộ lọc trên giao diện không làm hỏng trang */
export function parseListQuery(sp: URLSearchParams): ListQuery {
  const g = (k: string) => (sp.get(k) ?? '').trim();
  const views: TicketView[] = ['all', 'new', 'in-progress', 'waiting', 'resolved'];
  const n = Number(g('limit'));
  return {
    view: (views as string[]).includes(g('view')) ? (g('view') as TicketView) : 'all',
    status: (STATUSES as string[]).includes(g('status')) ? (g('status') as TicketStatus) : '',
    priority: (PRIORITIES as string[]).includes(g('priority')) ? (g('priority') as TicketPriority) : '',
    categoryId: ID.test(g('categoryId')) ? g('categoryId') : '',
    assigneeUid: g('assigneeUid') === 'none' || ID.test(g('assigneeUid')) ? g('assigneeUid') : '',
    departmentId: ID.test(g('departmentId')) ? g('departmentId') : '',
    from: isDate(g('from')) ? g('from') : '', to: isDate(g('to')) ? g('to') : '',
    sla: (['ok', 'warning', 'breached'] as string[]).includes(g('sla')) ? (g('sla') as ListQuery['sla']) : '',
    q: g('q').slice(0, 100),
    limit: Number.isInteger(n) && n > 0 ? Math.min(n, LIST_MAX) : LIST_DEFAULT,
    cursor: g('cursor').slice(0, 200),
  };
}

// ---------------------------------------------------------------- SLA theo giờ làm việc (GIẢ ĐỊNH A3, A4 — chỉnh tại đây)
export interface WorkCalendar { tzOffsetMin: number; startMin: number; endMin: number; workDays: number[]; holidays: string[] }
/** UTC+7, 08:00–17:30, thứ Hai–thứ Sáu, chưa có ngày lễ (holidays: 'YYYY-MM-DD' theo giờ địa phương) */
export const DEFAULT_CALENDAR: WorkCalendar = { tzOffsetMin: 420, startMin: 8 * 60, endMin: 17 * 60 + 30, workDays: [1, 2, 3, 4, 5], holidays: [] };
/** Số phút LÀM VIỆC mục tiêu (bảng tham khảo mục 3.3 của đặc tả) */
export const SLA_TARGETS_MIN: Record<TicketPriority, { first: number; resolve: number }> = {
  urgent: { first: 15, resolve: 240 }, high: { first: 30, resolve: 480 }, medium: { first: 120, resolve: 1440 }, low: { first: 240, resolve: 2880 },
};
export const WARNING_RATIO = 0.25; // còn ≤ 25% thời gian mục tiêu → "sắp quá hạn"
const MIN = 60_000, DAY = 86_400_000;
const isWorkday = (localDayStart: number, c: WorkCalendar) => c.workDays.includes(new Date(localDayStart).getUTCDay()) && !c.holidays.includes(new Date(localDayStart).toISOString().slice(0, 10));

/** Mốc thời gian sau khi cộng `ms` mili-giây làm việc (bắt đầu ngoài giờ thì tính từ lúc mở cửa kế tiếp) */
export function addWorkingMs(startMs: number, ms: number, cal: WorkCalendar = DEFAULT_CALENDAR): number {
  const off = cal.tzOffsetMin * MIN; let t = startMs + off, rem = Math.max(0, ms);
  for (let i = 0; i < 5000; i++) {
    const ds = Math.floor(t / DAY) * DAY;
    if (isWorkday(ds, cal)) {
      const from = Math.max(t, ds + cal.startMin * MIN), close = ds + cal.endMin * MIN;
      if (from < close) { const avail = close - from; if (rem <= avail) return from + rem - off; rem -= avail; }
    }
    t = ds + DAY;
  }
  throw new Error('Lịch làm việc không hợp lệ.');
}
/** Số mili-giây làm việc giữa hai mốc */
export function workingMsBetween(aMs: number, bMs: number, cal: WorkCalendar = DEFAULT_CALENDAR): number {
  if (bMs <= aMs) return 0;
  const off = cal.tzOffsetMin * MIN, a = aMs + off, b = bMs + off; let total = 0;
  for (let ds = Math.floor(a / DAY) * DAY; ds < b; ds += DAY) {
    if (!isWorkday(ds, cal)) continue;
    const from = Math.max(a, ds + cal.startMin * MIN), to = Math.min(b, ds + cal.endMin * MIN);
    if (to > from) total += to - from;
  }
  return total;
}
export const firstResponseDue = (receivedAt: number, p: TicketPriority, cal = DEFAULT_CALENDAR) => addWorkingMs(receivedAt, SLA_TARGETS_MIN[p].first * MIN, cal);
/** Hạn giải quyết = mốc bắt đầu SLA + mục tiêu + tổng thời gian đã chờ khách (A4) */
export const resolveDue = (slaStartAt: number, p: TicketPriority, waitedMs: number, cal = DEFAULT_CALENDAR) => addWorkingMs(slaStartAt, SLA_TARGETS_MIN[p].resolve * MIN + waitedMs, cal);
export const initialDues = (receivedAt: number, p: TicketPriority, cal = DEFAULT_CALENDAR) => ({ firstResponseDueAt: firstResponseDue(receivedAt, p, cal), resolveDueAt: resolveDue(receivedAt, p, 0, cal) });

export interface SlaSource {
  priority: TicketPriority; status: TicketStatus; receivedAt: number; slaStartAt: number; waitedMs: number; waitingSince: number | null;
  firstRespondedAt: number | null; resolvedAt: number | null; firstResponseDueAt: number; resolveDueAt: number;
}
export interface SlaPartMs { state: SlaState; dueAt: number; remainingMs: number | null }
function running(ref: number, due: number, targetMs: number, cal: WorkCalendar): { state: SlaState; remainingMs: number } {
  const remainingMs = ref <= due ? workingMsBetween(ref, due, cal) : -workingMsBetween(due, ref, cal);
  return { remainingMs, state: remainingMs < 0 ? 'breached' : remainingMs <= targetMs * WARNING_RATIO ? 'warning' : 'ok' };
}
export function computeSla(t: SlaSource, now: number, cal: WorkCalendar = DEFAULT_CALENDAR): { response: SlaPartMs; resolve: SlaPartMs } {
  const tg = SLA_TARGETS_MIN[t.priority], firstEnd = t.firstRespondedAt ?? t.resolvedAt; // giải quyết mà chưa phản hồi → dừng đồng hồ phản hồi
  const response: SlaPartMs = firstEnd !== null
    ? { state: firstEnd <= t.firstResponseDueAt ? 'met' : 'missed', dueAt: t.firstResponseDueAt, remainingMs: null }
    : { ...running(now, t.firstResponseDueAt, tg.first * MIN, cal), dueAt: t.firstResponseDueAt };
  let resolve: SlaPartMs;
  if (t.resolvedAt !== null) resolve = { state: t.resolvedAt <= t.resolveDueAt ? 'met' : 'missed', dueAt: t.resolveDueAt, remainingMs: null };
  else if (t.status === 'waiting_customer' && t.waitingSince !== null) resolve = { state: 'paused', dueAt: t.resolveDueAt, remainingMs: running(t.waitingSince, t.resolveDueAt, tg.resolve * MIN, cal).remainingMs };
  else resolve = { ...running(now, t.resolveDueAt, tg.resolve * MIN, cal), dueAt: t.resolveDueAt };
  return { response, resolve };
}
/** Gộp để lọc / thống kê: chỉ xét các đồng hồ ĐANG chạy */
export function slaBucket(s: { response: { state: SlaState }; resolve: { state: SlaState } }): 'ok' | 'warning' | 'breached' {
  const st = [s.response.state, s.resolve.state];
  return st.includes('breached') ? 'breached' : st.includes('warning') ? 'warning' : 'ok';
}
export function formatWorkingDuration(ms: number): string {
  const m = Math.round(Math.abs(ms) / MIN), h = Math.floor(m / 60), r = m % 60;
  return `${ms < 0 ? '-' : ''}${h > 0 ? `${h}g ` : ''}${r}p`;
}

// ---------------------------------------------------------------- Thay đổi dữ liệu khi đổi trạng thái (trả về các trường cần ghi; *At là mili-giây)
export interface PatchSource extends SlaSource { assigneeUid: string | null; reopenCount: number }
export const TIME_FIELDS = ['firstResponseDueAt', 'resolveDueAt', 'firstRespondedAt', 'resolvedAt', 'closedAt', 'waitingSince', 'slaStartAt'] as const;
type Patch = Record<string, unknown>;

/** Rời trạng thái chờ: cộng dồn thời gian chờ để dời hạn giải quyết */
function leaveWaiting(t: PatchSource, now: number, cal: WorkCalendar): Patch {
  if (t.waitingSince === null) return {};
  const waitedMs = t.waitedMs + workingMsBetween(t.waitingSince, now, cal);
  return { waitedMs, waitingSince: null, waitingReason: '', resolveDueAt: resolveDue(t.slaStartAt, t.priority, waitedMs, cal) };
}
export function statusPatch(t: PatchSource, to: TicketStatus, inp: { reason: string; resolution: string }, now: number, cal: WorkCalendar = DEFAULT_CALENDAR): Patch {
  if (to === 'in_progress') return { status: to, ...leaveWaiting(t, now, cal) };
  if (to === 'waiting_customer') return { status: to, waitingReason: inp.reason, waitingSince: now };
  if (to === 'resolved') return { status: to, ...leaveWaiting(t, now, cal), resolution: inp.resolution, resolvedAt: now };
  return { status: to, closedAt: now };
}
/** Mở lại: đồng hồ giải quyết tính lại từ đầu (A4), giữ nguyên mốc phản hồi đầu tiên */
export function reopenPatch(t: PatchSource, now: number, cal: WorkCalendar = DEFAULT_CALENDAR): Patch {
  return { status: t.assigneeUid ? 'in_progress' : 'new', reopenCount: t.reopenCount + 1, resolvedAt: null, closedAt: null, resolution: '', resolvedByUid: null, resolvedByName: '',
    slaStartAt: now, waitedMs: 0, waitingSince: null, waitingReason: '', resolveDueAt: resolveDue(now, t.priority, 0, cal) };
}
export function priorityPatch(t: PatchSource, p: TicketPriority, cal: WorkCalendar = DEFAULT_CALENDAR): Patch {
  return { priority: p, firstResponseDueAt: firstResponseDue(t.receivedAt, p, cal), resolveDueAt: resolveDue(t.slaStartAt, p, t.waitedMs, cal) };
}
/** Chuyển phòng: bỏ người phụ trách cũ; phiếu đang xử lý / chờ quay về "Mới" để phòng nhận phân công lại */
export function transferPatch(t: PatchSource, departmentId: string, now: number, cal: WorkCalendar = DEFAULT_CALENDAR): Patch {
  return { departmentId, assigneeUid: null, assigneeName: '', ...(t.status === 'new' ? {} : { status: 'new' }), ...leaveWaiting(t, now, cal) };
}
export const claimPatch = (t: { status: TicketStatus }): Patch => (t.status === 'new' ? { status: 'in_progress' } : {});

// ---------------------------------------------------------------- Định dạng & so sánh thay đổi
export const formatTicketCode = (n: number) => `TK${String(n).padStart(5, '0')}`;
/** 'YYYY-MM-DDTHH:mm…Z' → 'DD/MM/YYYY HH:mm' theo giờ Việt Nam (UTC+7) */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso); if (isNaN(ms)) return '—';
  const s = new Date(ms + 7 * 3600_000).toISOString();
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
}
const LABEL = { title: 'Tiêu đề', description: 'Mô tả', customerId: 'Khách hàng', contactId: 'Người liên hệ', categoryId: 'Danh mục', priority: 'Mức độ ưu tiên' } as const;
type DiffKey = keyof typeof LABEL;
type DiffSide = Pick<TicketInput, DiffKey>;
export function diffTicket(before: DiffSide, after: DiffSide, names?: Partial<Record<'customerId' | 'contactId' | 'categoryId', { from: string; to: string }>>): Change[] {
  const show = (k: DiffKey, v: unknown, side: 'from' | 'to') =>
    k === 'priority' ? PRIORITY_LABEL[v as TicketPriority] ?? String(v)
    : k === 'customerId' || k === 'contactId' || k === 'categoryId' ? (names?.[k]?.[side] ?? String(v ?? '') ) || '—'
    : String(v || '—');
  return (Object.keys(LABEL) as DiffKey[]).filter(k => (before[k] ?? null) !== (after[k] ?? null)).map(k => ({ field: k, label: LABEL[k], from: show(k, before[k], 'from'), to: show(k, after[k], 'to') }));
}

// ---------------------------------------------------------------- Xuất dữ liệu
export const ticketsCsv = (rows: TicketDto[]) => toCsv([
  ['Mã yêu cầu', 'Tiêu đề', 'Mã KH', 'Khách hàng', 'Danh mục', 'Mức độ', 'Trạng thái', 'Phòng ban', 'Phụ trách', 'Ngày tiếp nhận', 'Hạn phản hồi', 'Hạn giải quyết', 'Hoàn thành', 'Kết quả xử lý'],
  ...rows.map(r => [r.code, r.title, r.customerCode, r.customerName, r.categoryName, PRIORITY_LABEL[r.priority], TICKET_STATUS_LABEL[r.status], r.departmentName, r.assigneeName,
    formatDateTime(r.receivedAt), formatDateTime(r.firstResponseDueAt), formatDateTime(r.resolveDueAt), formatDateTime(r.resolvedAt), r.resolution].map(x => safeCell(String(x ?? '')))),
]);
