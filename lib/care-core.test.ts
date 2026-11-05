// Kiểm thử độc lập (không cần Firebase). Chạy:  npx tsx lib/care-core.test.ts
import assert from 'node:assert/strict';
import {
  addWorkingMs, workingMsBetween, initialDues, computeSla, slaBucket, statusPatch, reopenPatch, priorityPatch, transferPatch, claimPatch, resolveDue,
  scopeOf, can, flagsOf, canChangeStatus, canBeAssignee, checkTransition, parseTicketInput, parseStatusChange, parseAssign, parseTransfer, parseMessage, parseBulk,
  parseListQuery, diffTicket, formatDateTime, formatWorkingDuration, formatTicketCode, ticketsCsv, DEFAULT_CALENDAR,
  type Actor, type PatchSource, type TicketRef,
} from './care-core';

const MIN = 60_000;
/** 'YYYY-MM-DD HH:mm' theo giờ Việt Nam → epoch ms */
const vn = (s: string) => { const [d, h] = s.split(' '); const [y, m, dd] = d.split('-').map(Number); const [hh, mm] = h.split(':').map(Number); return Date.UTC(y, m - 1, dd, hh, mm) - 7 * 3600_000; };
const show = (ms: number) => formatDateTime(new Date(ms).toISOString()).replace(/^(\d\d)\/(\d\d)\/(\d{4}) /, '$3-$2-$1 ');
let n = 0; const t = (name: string, fn: () => void) => { try { fn(); n++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', (e as Error).message); process.exitCode = 1; } };

// 2026-11-02 là thứ Hai; 11-06 thứ Sáu; 11-07 thứ Bảy
console.log('Lịch làm việc');
t('cộng 15 phút trong giờ', () => assert.equal(show(addWorkingMs(vn('2026-11-02 09:00'), 15 * MIN)), '2026-11-02 09:15'));
t('tràn sang ngày làm việc kế tiếp', () => assert.equal(show(addWorkingMs(vn('2026-11-02 17:00'), 60 * MIN)), '2026-11-03 08:30'));
t('thứ Sáu → thứ Hai', () => assert.equal(show(addWorkingMs(vn('2026-11-06 17:00'), 60 * MIN)), '2026-11-09 08:30'));
t('bắt đầu cuối tuần → tính từ sáng thứ Hai', () => assert.equal(show(addWorkingMs(vn('2026-11-07 10:00'), 30 * MIN)), '2026-11-09 08:30'));
t('bắt đầu trước giờ mở cửa', () => assert.equal(show(addWorkingMs(vn('2026-11-02 06:00'), 30 * MIN)), '2026-11-02 08:30'));
t('đúng một ngày làm việc (570p) kết thúc 17:30', () => assert.equal(show(addWorkingMs(vn('2026-11-02 08:00'), 570 * MIN)), '2026-11-02 17:30'));
t('570p + 1p sang hôm sau', () => assert.equal(show(addWorkingMs(vn('2026-11-02 08:00'), 571 * MIN)), '2026-11-03 08:01'));
t('khẩn cấp 4 giờ từ 15:00', () => assert.equal(show(addWorkingMs(vn('2026-11-02 15:00'), 240 * MIN)), '2026-11-03 09:30'));
t('ngày lễ bị bỏ qua', () => assert.equal(show(addWorkingMs(vn('2026-11-02 17:00'), 60 * MIN, { ...DEFAULT_CALENDAR, holidays: ['2026-11-03'] })), '2026-11-04 08:30'));
t('đo thứ Sáu 16:00 → thứ Hai 09:00 = 150p', () => assert.equal(workingMsBetween(vn('2026-11-06 16:00'), vn('2026-11-09 09:00')) / MIN, 150));
t('đo qua cuối tuần = 0', () => assert.equal(workingMsBetween(vn('2026-11-07 10:00'), vn('2026-11-08 20:00')), 0));
t('đo ngược = 0', () => assert.equal(workingMsBetween(vn('2026-11-03 10:00'), vn('2026-11-02 10:00')), 0));
t('lịch không có ngày làm việc → báo lỗi', () => assert.throws(() => addWorkingMs(1, 1, { ...DEFAULT_CALENDAR, workDays: [] })));

console.log('SLA');
const base = (o: Partial<PatchSource> = {}): PatchSource => {
  const received = vn('2026-11-02 09:00'), d = initialDues(received, 'medium');
  return { priority: 'medium', status: 'new', receivedAt: received, slaStartAt: received, waitedMs: 0, waitingSince: null, firstRespondedAt: null, resolvedAt: null, ...d, assigneeUid: null, reopenCount: 0, ...o };
};
t('hạn ban đầu (trung bình): phản hồi 11:00, giải quyết thứ Tư 14:00', () => {
  const s = base(); assert.equal(show(s.firstResponseDueAt), '2026-11-02 11:00'); assert.equal(show(s.resolveDueAt), '2026-11-04 14:00');
});
t('phản hồi: ok → warning → breached', () => {
  const s = base();
  assert.equal(computeSla(s, vn('2026-11-02 10:00')).response.state, 'ok');
  assert.equal(computeSla(s, vn('2026-11-02 10:40')).response.state, 'warning');
  const late = computeSla(s, vn('2026-11-02 11:30')).response;
  assert.equal(late.state, 'breached'); assert.equal(late.remainingMs, -30 * MIN);
});
t('đã phản hồi đúng hạn → met; trễ → missed', () => {
  assert.equal(computeSla(base({ firstRespondedAt: vn('2026-11-02 10:00') }), vn('2026-11-05 10:00')).response.state, 'met');
  assert.equal(computeSla(base({ firstRespondedAt: vn('2026-11-02 12:00') }), vn('2026-11-05 10:00')).response.state, 'missed');
});
t('ngoài giờ không bị tính quá hạn: tối thứ Hai vẫn còn hạn phản hồi sáng mai', () => {
  const s = base({ receivedAt: vn('2026-11-02 17:00'), ...initialDues(vn('2026-11-02 17:00'), 'urgent') }); // 15p: 17:15
  assert.equal(computeSla(s, vn('2026-11-02 17:10')).response.state, 'warning');
  assert.equal(computeSla(s, vn('2026-11-02 23:00')).response.state, 'breached');
});
t('chờ khách: tạm dừng, hạn giải quyết dời đúng thời gian đã chờ', () => {
  const s = base({ assigneeUid: 'u1', status: 'in_progress' });
  const w = statusPatch(s, 'waiting_customer', { reason: 'Chờ log', resolution: '' }, vn('2026-11-02 11:00'));
  assert.equal(w.waitingReason, 'Chờ log');
  const waiting = { ...s, ...w } as PatchSource;
  const sla = computeSla(waiting, vn('2026-11-04 10:00'));
  assert.equal(sla.resolve.state, 'paused'); // dù đã qua nhiều ngày
  const back = statusPatch(waiting, 'in_progress', { reason: '', resolution: '' }, vn('2026-11-03 11:00'));
  assert.equal((back.waitedMs as number) / MIN, 390 + 180); // thứ Hai 11:00→17:30 + thứ Ba 08:00→11:00
  assert.equal(show(back.resolveDueAt as number), '2026-11-05 14:00');
  assert.equal(back.waitingSince, null);
});
t('giải quyết trực tiếp từ trạng thái chờ cũng cộng dồn thời gian chờ', () => {
  const waiting = base({ assigneeUid: 'u1', status: 'waiting_customer', waitingSince: vn('2026-11-02 11:00') });
  const p = statusPatch(waiting, 'resolved', { reason: '', resolution: 'Đã xử lý' }, vn('2026-11-02 12:00'));
  assert.equal((p.waitedMs as number) / MIN, 60); assert.equal(p.resolvedAt, vn('2026-11-02 12:00')); assert.equal(p.resolution, 'Đã xử lý');
});
t('giải quyết trước hạn → met', () => {
  const s = base({ resolvedAt: vn('2026-11-03 10:00'), status: 'resolved' });
  assert.equal(computeSla(s, vn('2026-11-09 10:00')).resolve.state, 'met');
  assert.equal(computeSla({ ...s, resolvedAt: vn('2026-11-05 10:00') }, vn('2026-11-09 10:00')).resolve.state, 'missed');
});
t('giải quyết mà chưa phản hồi → dừng đồng hồ phản hồi', () => {
  const s = base({ resolvedAt: vn('2026-11-02 09:30'), status: 'resolved' });
  assert.equal(computeSla(s, vn('2026-11-09 10:00')).response.state, 'met');
});
t('slaBucket chỉ xét đồng hồ đang chạy', () => {
  assert.equal(slaBucket({ response: { state: 'missed' }, resolve: { state: 'ok' } }), 'ok');
  assert.equal(slaBucket({ response: { state: 'ok' }, resolve: { state: 'warning' } }), 'warning');
  assert.equal(slaBucket({ response: { state: 'warning' }, resolve: { state: 'breached' } }), 'breached');
  assert.equal(slaBucket({ response: { state: 'met' }, resolve: { state: 'paused' } }), 'ok');
});
t('mở lại: đồng hồ giải quyết tính lại, giữ mốc phản hồi', () => {
  const s = base({ assigneeUid: 'u1', status: 'closed', resolvedAt: vn('2026-11-03 10:00'), waitedMs: 5 * MIN, firstRespondedAt: vn('2026-11-02 10:00'), reopenCount: 1 });
  const p = reopenPatch(s, vn('2026-11-09 10:00'));
  assert.equal(p.status, 'in_progress'); assert.equal(p.reopenCount, 2); assert.equal(p.resolvedAt, null); assert.equal(p.waitedMs, 0);
  assert.equal(show(p.resolveDueAt as number), '2026-11-11 15:00'); // 10:00 thứ Hai + 1440p làm việc
  assert.equal('firstRespondedAt' in p, false);
  assert.equal(reopenPatch({ ...s, assigneeUid: null }, vn('2026-11-09 10:00')).status, 'new');
});
t('đổi ưu tiên tính lại hạn từ mốc ban đầu, giữ thời gian đã chờ', () => {
  const s = base({ waitedMs: 60 * MIN });
  const p = priorityPatch(s, 'urgent');
  assert.equal(show(p.firstResponseDueAt as number), '2026-11-02 09:15');
  assert.equal(p.resolveDueAt, resolveDue(s.slaStartAt, 'urgent', 60 * MIN)); // 09:00 + 240p + 60p = 14:00
  assert.equal(show(p.resolveDueAt as number), '2026-11-02 14:00');
});
t('chuyển phòng: bỏ người phụ trách, đưa về “Mới”, cộng dồn thời gian chờ', () => {
  const s = base({ assigneeUid: 'u1', status: 'waiting_customer', waitingSince: vn('2026-11-02 11:00') });
  const p = transferPatch(s, 'KINHDOANH', vn('2026-11-02 12:00'));
  assert.equal(p.departmentId, 'KINHDOANH'); assert.equal(p.assigneeUid, null); assert.equal(p.status, 'new'); assert.equal(p.waitedMs, 60 * MIN);
  assert.equal(transferPatch(base(), 'KINHDOANH', 0).status, undefined); // đang "Mới" thì giữ nguyên
});
t('nhận xử lý chuyển “Mới” → “Đang xử lý”', () => { assert.deepEqual(claimPatch({ status: 'new' }), { status: 'in_progress' }); assert.deepEqual(claimPatch({ status: 'waiting_customer' }), {}); });

console.log('Phân quyền');
const act = (role: string, departmentId: string | null, uid = 'u'): Actor => ({ uid, role, departmentId });
const tk = (o: Partial<TicketRef> = {}): TicketRef => ({ departmentId: 'CSKH', assigneeUid: null, status: 'new', ...o });
const cs = act('customer_service', 'CSKH', 'cs1'), mgr = act('manager', 'CSKH', 'm1'), mgrOther = act('manager', 'KINHDOANH', 'm2'), sa = act('super_admin', null, 'sa'), dir = act('director', null, 'd');
t('phạm vi', () => {
  assert.equal(scopeOf(sa).kind, 'company'); assert.equal(scopeOf(dir).kind, 'company'); assert.equal(scopeOf(mgr).kind, 'department'); assert.equal(scopeOf(cs).kind, 'department');
  assert.equal(scopeOf(act('manager', null)).kind, 'none'); assert.equal(scopeOf(act('customer_service', null)).kind, 'none'); assert.equal(scopeOf(act('sales', 'KINHDOANH')).kind, 'none');
});
t('xem theo phòng ban', () => {
  assert.ok(can.view(cs, tk())); assert.ok(!can.view(cs, tk({ departmentId: 'KINHDOANH' }))); assert.ok(can.view(sa, tk({ departmentId: 'X' }))); assert.ok(!can.view(act('sales', 'CSKH'), tk()));
});
t('tạo phiếu: role CSKH có, sales / thiếu phòng ban không', () => {
  assert.ok(can.create(cs) && can.create(mgr) && can.create(sa)); assert.ok(!can.create(act('sales', 'CSKH'))); assert.ok(!can.create(act('customer_service', null)));
});
t('nhân viên: nhận phiếu chưa có người, không phân công người khác', () => {
  assert.ok(can.claim(cs, tk())); assert.ok(!can.claim(cs, tk({ assigneeUid: 'x' }))); assert.ok(!can.claim(cs, tk({ status: 'closed' }))); assert.ok(!can.assign(cs, tk()));
});
t('nhân viên: chỉ xử lý phiếu được giao', () => {
  const mine = tk({ status: 'in_progress', assigneeUid: 'cs1' }), other = tk({ status: 'in_progress', assigneeUid: 'cs2' });
  assert.ok(can.wait(cs, mine) && can.resolve(cs, mine) && can.reply(cs, mine) && can.edit(cs, mine));
  assert.ok(!can.wait(cs, other) && !can.resolve(cs, other) && !can.reply(cs, other) && !can.edit(cs, other));
  assert.ok(can.note(cs, other), 'ghi chú nội bộ: ai xem được phiếu đều viết được');
});
t('nhân viên không đóng / mở lại / đổi ưu tiên / chuyển phòng', () => {
  const r = tk({ status: 'resolved', assigneeUid: 'cs1' });
  assert.ok(!can.close(cs, r) && !can.reopen(cs, r) && !can.setPriority(cs, tk()) && !can.transfer(cs, tk()) && !can.bulk(cs) && !can.export(cs));
});
t('trưởng nhóm: trong phòng được, phòng khác không', () => {
  const r = tk({ status: 'resolved', assigneeUid: 'cs1' });
  assert.ok(can.close(mgr, r) && can.reopen(mgr, r) && can.assign(mgr, tk()) && can.setPriority(mgr, tk()) && can.bulk(mgr) && can.export(mgr));
  assert.ok(!can.close(mgrOther, r) && !can.assign(mgrOther, tk()) && !can.view(mgrOther, tk()));
});
t('đóng chỉ từ “Đã giải quyết”; mở lại từ giải quyết / đóng', () => {
  assert.ok(!can.close(mgr, tk({ status: 'in_progress', assigneeUid: 'x' }))); assert.ok(can.reopen(mgr, tk({ status: 'closed' }))); assert.ok(!can.reopen(mgr, tk({ status: 'new' })));
});
t('phiếu đã đóng: không sửa, không nhắn', () => {
  const c = tk({ status: 'closed', assigneeUid: 'cs1' }); assert.ok(!can.edit(sa, c) && !can.reply(sa, c) && !can.note(sa, c));
});
t('bắt đầu xử lý cần người phụ trách', () => { assert.ok(!can.start(mgr, tk())); assert.ok(can.start(mgr, tk({ assigneeUid: 'cs1' }))); assert.ok(can.start(cs, tk({ status: 'waiting_customer', assigneeUid: 'cs1' }))); });
t('canChangeStatus và flagsOf nhất quán', () => {
  const x = tk({ status: 'in_progress', assigneeUid: 'cs1' });
  assert.ok(canChangeStatus(cs, x, 'resolved')); assert.ok(!canChangeStatus(cs, x, 'closed')); assert.ok(!canChangeStatus(cs, x, 'new'));
  const f = flagsOf(cs, x); assert.ok(f.resolve && f.wait && !f.close && !f.assign);
});
t('người nhận phân công hợp lệ', () => {
  assert.ok(canBeAssignee({ role: 'customer_service', status: 'active', departmentId: 'CSKH' }, 'CSKH'));
  assert.ok(!canBeAssignee({ role: 'customer_service', status: 'active', departmentId: 'KINHDOANH' }, 'CSKH'));
  assert.ok(!canBeAssignee({ role: 'customer_service', status: 'inactive', departmentId: 'CSKH' }, 'CSKH'));
  assert.ok(!canBeAssignee({ role: 'customer_service', status: 'active', departmentId: null }, 'CSKH'));
  assert.ok(canBeAssignee({ role: 'director', status: 'active', departmentId: null }, 'CSKH'));
  assert.ok(!canBeAssignee({ role: 'sales', status: 'active', departmentId: 'CSKH' }, 'CSKH'));
});
t('chuyển trạng thái hợp lệ', () => {
  assert.equal(checkTransition('new', 'in_progress', 'u1'), null);
  assert.match(checkTransition('new', 'in_progress', null)!, /người phụ trách/);
  assert.match(checkTransition('new', 'resolved', 'u1')!, /Không thể chuyển/);
  assert.match(checkTransition('closed', 'in_progress', 'u1')!, /Không thể chuyển/);
  assert.equal(checkTransition('waiting_customer', 'resolved', 'u1'), null);
});

console.log('Kiểm tra dữ liệu');
t('tạo phiếu hợp lệ + giá trị mặc định', () => {
  const r = parseTicketInput({ title: '  Lỗi đăng nhập ', customerId: 'c1', categoryId: 'ky-thuat' });
  assert.ok(r.ok); if (r.ok) { assert.equal(r.value.title, 'Lỗi đăng nhập'); assert.equal(r.value.priority, 'medium'); assert.equal(r.value.contactId, null); assert.equal(r.value.departmentId, null); }
});
t('tạo phiếu sai dữ liệu', () => {
  const bad = (o: object) => { const r = parseTicketInput({ title: 'a', customerId: 'c1', categoryId: 'k', ...o }); assert.equal(r.ok, false); };
  bad({ title: '  ' }); bad({ title: 'x'.repeat(201) }); bad({ description: 'x'.repeat(4001) }); bad({ customerId: '' }); bad({ customerId: 'a/b' });
  bad({ categoryId: '' }); bad({ priority: 'asap' }); bad({ contactId: 'a b' });
  assert.equal(parseTicketInput(null).ok, false);
});
t('đổi trạng thái: bắt buộc lý do / kết quả', () => {
  assert.equal(parseStatusChange({ to: 'waiting_customer' }).ok, false);
  assert.equal(parseStatusChange({ to: 'resolved', resolution: ' ' }).ok, false);
  assert.equal(parseStatusChange({ to: 'new' }).ok, false);
  assert.equal(parseStatusChange({ to: 'xyz' }).ok, false);
  const ok = parseStatusChange({ to: 'resolved', resolution: 'Đã xử lý', reason: 'bỏ qua' }); assert.ok(ok.ok && ok.value.reason === '');
  const w = parseStatusChange({ to: 'waiting_customer', reason: 'Chờ log', resolution: 'bỏ qua' }); assert.ok(w.ok && w.value.resolution === '' && w.value.reason === 'Chờ log');
});
t('phân công / chuyển phòng / tin nhắn', () => {
  assert.equal(parseAssign({}).ok, false); assert.equal(parseAssign({ assigneeUid: 'u1', note: 'x'.repeat(501) }).ok, false); assert.ok(parseAssign({ assigneeUid: 'u1' }).ok);
  assert.equal(parseTransfer({ departmentId: 'a/b' }).ok, false); assert.ok(parseTransfer({ departmentId: 'KINHDOANH' }).ok);
  assert.equal(parseMessage({ type: 'sms', content: 'x' }).ok, false); assert.equal(parseMessage({ type: 'reply', content: '  ' }).ok, false); assert.ok(parseMessage({ type: 'internal', content: 'ok' }).ok);
  assert.equal(parseMessage({ type: 'reply', content: 'x'.repeat(4001) }).ok, false);
});
t('thao tác hàng loạt', () => {
  assert.equal(parseBulk({ ids: [], action: 'assign', assigneeUid: 'u' }).ok, false);
  assert.equal(parseBulk({ ids: Array.from({ length: 51 }, (_, i) => `id${i}`), action: 'assign', assigneeUid: 'u' }).ok, false);
  assert.equal(parseBulk({ ids: ['a/b'], action: 'assign', assigneeUid: 'u' }).ok, false);
  assert.equal(parseBulk({ ids: ['a'], action: 'assign' }).ok, false); assert.equal(parseBulk({ ids: ['a'], action: 'priority', priority: 'x' }).ok, false);
  assert.equal(parseBulk({ ids: ['a'], action: 'delete' }).ok, false);
  const r = parseBulk({ ids: ['a', 'a', 'b'], action: 'priority', priority: 'high' }); assert.ok(r.ok && r.value.ids.length === 2);
});
t('bộ lọc danh sách: bỏ qua giá trị sai, giới hạn số dòng', () => {
  const q = parseListQuery(new URLSearchParams('view=bad&status=zzz&priority=high&assigneeUid=none&from=2026-02-31&to=2026-11-01&sla=breached&q=%20abc%20&limit=9999'));
  assert.equal(q.view, 'all'); assert.equal(q.status, ''); assert.equal(q.priority, 'high'); assert.equal(q.assigneeUid, 'none'); assert.equal(q.from, ''); assert.equal(q.to, '2026-11-01');
  assert.equal(q.sla, 'breached'); assert.equal(q.q, 'abc'); assert.equal(q.limit, 50);
  assert.equal(parseListQuery(new URLSearchParams('limit=abc&view=in-progress')).limit, 20); assert.equal(parseListQuery(new URLSearchParams('view=in-progress')).view, 'in-progress');
  assert.equal(parseListQuery(new URLSearchParams('categoryId=a/b&departmentId=x y')).categoryId, '');
});

console.log('Định dạng');
t('mã phiếu, ngày giờ, thời lượng', () => {
  assert.equal(formatTicketCode(7), 'TK00007'); assert.equal(formatDateTime('2026-11-02T02:05:00.000Z'), '02/11/2026 09:05'); assert.equal(formatDateTime(null), '—'); assert.equal(formatDateTime('x'), '—');
  assert.equal(formatWorkingDuration(90 * MIN), '1g 30p'); assert.equal(formatWorkingDuration(-30 * MIN), '-30p');
});
t('so sánh thay đổi khi sửa phiếu', () => {
  const a = { title: 'A', description: '', customerId: 'c1', contactId: null, categoryId: 'k1', priority: 'medium' as const };
  const d = diffTicket(a, { ...a, title: 'B', priority: 'urgent', categoryId: 'k2' }, { categoryId: { from: 'Kỹ thuật', to: 'Bảo hành' } });
  assert.deepEqual(d.map(x => [x.field, x.from, x.to]), [['title', 'A', 'B'], ['categoryId', 'Kỹ thuật', 'Bảo hành'], ['priority', 'Trung bình', 'Khẩn cấp']]);
  assert.equal(diffTicket(a, { ...a }).length, 0);
});
t('xuất CSV chống công thức độc hại', () => {
  const row = { code: 'TK00001', title: '=HYPERLINK("x")', customerCode: 'KH1', customerName: 'A', categoryName: 'k', priority: 'high', status: 'new', departmentName: 'CSKH', assigneeName: '', receivedAt: '2026-11-02T02:00:00Z', firstResponseDueAt: '2026-11-02T04:00:00Z', resolveDueAt: '2026-11-04T07:00:00Z', resolvedAt: null, resolution: '' } as never;
  const csv = ticketsCsv([row]); assert.ok(csv.includes("\"'=HYPERLINK")); assert.ok(csv.includes('Cao') && csv.includes('Mới') && csv.includes('02/11/2026 09:00'));
});
console.log(`\n${n} kiểm thử đạt${process.exitCode ? ' — CÓ LỖI' : ''}`);
