// Kiểm thử luồng yêu cầu đổi giá bảng giá / giá theo nhóm: gửi → duyệt / từ chối / hủy, áp dụng, nhật ký, phân quyền.
import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './testing/fake-firestore';
import type { Ctx } from './auth';
import { HttpError } from './errors';

let fake = new FakeDb();
mock.module('./firebase-admin', { namedExports: { adminDb: () => fake, adminAuth: () => { throw new Error('không dùng'); } } });
let C: typeof import('./catalog'), L: typeof import('./price-lists'), P: typeof import('./pricing'), R: typeof import('./change-requests'), G: typeof import('./price-log');
const ctx = (role: string, uid = role, org = 'org1'): Ctx => ({ uid, name: `Tên ${uid}`, role, orgId: org, departmentId: null, branchId: null });
const sa = ctx('super_admin'), dir = ctx('director'), mgr = ctx('manager'), mgr2 = ctx('manager', 'manager2'), sales = ctx('sales'), ops = ctx('operations');
let n = 0; const rid = () => `req-${String(++n).padStart(16, '0')}`;
const fails = (p: Promise<unknown>, status: number, code?: string) => assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status && (!code || e.code === code));
async function seed() {
  fake.data.set('customerGroups/vip', { organizationId: 'org1', name: 'VIP' });
  const cat = (await C.createCategory(dir, { requestId: rid(), type: 'product', name: 'TB' })).id, unit = (await C.createUnit(dir, { requestId: rid(), name: 'Cái', symbol: 'Cái' })).id;
  const a = (await C.createItem(dir, { requestId: rid(), type: 'product', name: 'Máy in', categoryId: cat, unitId: unit, defaultPrice: 1000 })).id, off = (await C.createItem(dir, { requestId: rid(), type: 'product', name: 'Cũ', categoryId: cat, unitId: unit, defaultPrice: 5, status: 'inactive' })).id;
  const list = (await L.createPriceList(dir, { requestId: rid(), name: 'BG', type: 'standard' })).id; await L.savePrices(dir, list, { rows: [{ itemId: a, price: 800 }] }); await P.saveGroupPrices(dir, { groupId: 'vip', rows: [{ itemId: a, price: 700 }] });
  return { a, off, list };
}
beforeEach(async () => { fake = new FakeDb(); C = await import('./catalog'); L = await import('./price-lists'); P = await import('./pricing'); R = await import('./change-requests'); G = await import('./price-log'); });
const rowPrice = async (list: string, item: string) => (await L.listPriceListRows(dir, list, {})).rows.find(r => r.itemId === item)?.price;
const gprice = async () => (await P.listGroupPrices(dir, {})).items[0].price;

describe('yêu cầu đổi giá bảng giá / giá nhóm', () => {
  it('manager gửi → director duyệt: giá bảng giá đổi, nhật ký ghi người đề xuất + người duyệt, yêu cầu đóng', async () => {
    const s = await seed(), { id } = await R.requestChange(mgr, { kind: 'priceList', targetId: s.list, itemId: s.a, price: 750, reason: 'Cạnh tranh' });
    assert.equal(await rowPrice(s.list, s.a), 800); const q = (await R.listChangeRequests(dir, 'pending')).items[0]; assert.deepEqual([q.targetName, q.oldPrice, q.newPrice, q.requestedByName], ['BG001 – BG', 800, 750, 'Tên manager']);
    assert.deepEqual(await R.decideChange(dir, id, { decision: 'approve' }), { id, status: 'approved' }); assert.equal(await rowPrice(s.list, s.a), 750);
    const log = (await G.listPriceLog(dir, { kind: 'priceList' })).items[0]; assert.deepEqual([log.mode, log.oldPrice, log.newPrice, log.changedByName, log.approvedByName], ['approved', 800, 750, 'Tên manager', 'Tên director']); assert.match(log.reason, /Cạnh tranh.*đề xuất bởi Tên manager.*duyệt bởi Tên director/);
    assert.equal((await R.listChangeRequests(dir, 'pending')).items.length, 0); assert.equal((await R.listChangeRequests(dir, 'approved')).items[0].decidedByName, 'Tên director');
  });
  it('giá nhóm: duyệt đổi giá; và yêu cầu thêm giá mới (oldPrice null) tạo dòng mới', async () => {
    const s = await seed(); const r1 = await R.requestChange(mgr, { kind: 'groupPrice', targetId: 'vip', itemId: s.a, price: 650, reason: 'x' }); await R.decideChange(sa, r1.id, { decision: 'approve' }); assert.equal(await gprice(), 650);
    const l2 = (await L.createPriceList(dir, { requestId: rid(), name: 'BG2', type: 'standard' })).id, r2 = await R.requestChange(mgr, { kind: 'priceList', targetId: l2, itemId: s.a, price: 900, reason: 'mới' });
    assert.equal((await R.listChangeRequests(dir, 'pending')).items[0].oldPrice, null); await R.decideChange(dir, r2.id, { decision: 'approve' }); assert.equal(await rowPrice(l2, s.a), 900);
  });
  it('từ chối / hủy: giá không đổi; không xử lý lại yêu cầu đã đóng', async () => {
    const s = await seed(), a = await R.requestChange(mgr, { kind: 'priceList', targetId: s.list, itemId: s.a, price: 1, reason: 'x' });
    assert.equal((await R.decideChange(dir, a.id, { decision: 'reject', note: 'không' })).status, 'rejected'); assert.equal(await rowPrice(s.list, s.a), 800); await fails(R.decideChange(dir, a.id, { decision: 'approve' }), 409, 'closed');
    const b = await R.requestChange(mgr, { kind: 'priceList', targetId: s.list, itemId: s.a, price: 2, reason: 'x' }); await fails(R.decideChange(mgr2, b.id, { decision: 'cancel' }), 403); assert.equal((await R.decideChange(mgr, b.id, { decision: 'cancel' })).status, 'cancelled');
    assert.equal((await R.listChangeRequests(dir, 'rejected')).items[0].decisionNote, 'không');
  });
  it('phân quyền: chỉ manager gửi (director không cần, sales/operations bị chặn); không tự duyệt; manager không duyệt', async () => {
    const s = await seed(), req = { kind: 'priceList', targetId: s.list, itemId: s.a, price: 700, reason: 'x' };
    for (const who of [dir, sa, sales, ops]) await fails(R.requestChange(who, req), 403);
    const { id } = await R.requestChange(mgr, req); await fails(R.decideChange(mgr, id, { decision: 'approve' }), 403); await fails(R.decideChange(mgr2, id, { decision: 'approve' }), 403); await fails(R.decideChange(sales, id, { decision: 'reject' }), 403);
  });
  it('người gửi chỉ thấy yêu cầu của mình; người duyệt thấy tất cả; tách tổ chức', async () => {
    const s = await seed(); await R.requestChange(mgr, { kind: 'priceList', targetId: s.list, itemId: s.a, price: 700, reason: 'x' }); const l2 = (await L.createPriceList(dir, { requestId: rid(), name: 'B2', type: 'standard' })).id; await R.requestChange(mgr2, { kind: 'priceList', targetId: l2, itemId: s.a, price: 700, reason: 'y' });
    assert.deepEqual([(await R.listChangeRequests(mgr, 'pending')).items.length, (await R.listChangeRequests(dir, 'pending')).items.length, (await R.listChangeRequests(mgr, 'pending')).can.approve, (await R.listChangeRequests(dir, 'pending')).can.approve], [1, 2, false, true]);
    await fails(R.listChangeRequests(sales), 403); assert.equal((await R.listChangeRequests(ctx('director', 'd2', 'org2'))).items.length, 0);
    const id = (await R.listChangeRequests(dir, 'pending')).items[0].id; await fails(R.decideChange(ctx('director', 'd2', 'org2'), id, { decision: 'reject' }), 404);
  });
  it('kiểm tra đầu vào: lý do bắt buộc, giá trùng, loại sai, mục tiêu / mặt hàng không hợp lệ, hàng ngừng KD khi thêm mới, trùng yêu cầu đang chờ', async () => {
    const s = await seed(), ok = { kind: 'priceList', targetId: s.list, itemId: s.a, price: 700, reason: 'x' };
    await fails(R.requestChange(mgr, { ...ok, reason: ' ' }), 400); await fails(R.requestChange(mgr, { ...ok, price: 800 }), 400, 'same-price'); await fails(R.requestChange(mgr, { ...ok, kind: 'x' }), 400); await fails(R.requestChange(mgr, { ...ok, price: -1 }), 400);
    await fails(R.requestChange(mgr, { ...ok, targetId: 'nope' }), 400, 'bad-ref'); await fails(R.requestChange(mgr, { ...ok, itemId: 'nope' }), 400, 'bad-ref'); await fails(R.requestChange(mgr, { kind: 'groupPrice', targetId: 'vip', itemId: s.off, price: 1, reason: 'x' }), 400, 'inactive-item');
    await R.requestChange(mgr, ok); await fails(R.requestChange(mgr2, { ...ok, price: 600 }), 409, 'pending-exists');
  });
  it('giá đã đổi sau khi gửi → duyệt bị chặn (stale), yêu cầu vẫn chờ, giá không bị ghi đè', async () => {
    const s = await seed(), { id } = await R.requestChange(mgr, { kind: 'groupPrice', targetId: 'vip', itemId: s.a, price: 650, reason: 'x' });
    const g = (await P.listGroupPrices(dir, {})).items[0]; await P.updateGroupPrice(dir, g.id, { price: 690, status: 'active', version: g.version });
    await fails(R.decideChange(dir, id, { decision: 'approve' }), 409, 'stale'); assert.equal(await gprice(), 690); assert.equal((await R.listChangeRequests(dir, 'pending')).items.length, 1);
  });
  it('áp dụng thất bại (mặt hàng bị ngừng KD khi yêu cầu thêm mới) → hoàn về chờ duyệt, không mất yêu cầu', async () => {
    const s = await seed(), l2 = (await L.createPriceList(dir, { requestId: rid(), name: 'B2', type: 'standard' })).id, { id } = await R.requestChange(mgr, { kind: 'priceList', targetId: l2, itemId: s.a, price: 500, reason: 'x' });
    const it = (await C.getItem(dir, s.a)).item; await C.updateItem(dir, s.a, { name: it.name, categoryId: it.categoryId, unitId: it.unitId, status: 'inactive', version: it.version });
    await fails(R.decideChange(dir, id, { decision: 'approve' }), 409, 'apply-failed'); assert.deepEqual((await R.listChangeRequests(dir, 'pending')).items.map(x => x.id), [id]); assert.equal(await rowPrice(l2, s.a), undefined);
  });
});
