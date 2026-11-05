// Kiểm thử nhật ký giá tập trung: ghi từ mọi nguồn, lọc, phân trang, xuất, tách tổ chức.
import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './testing/fake-firestore';
import type { Ctx } from './auth';
import { HttpError } from './errors';

let fake = new FakeDb();
mock.module('./firebase-admin', { namedExports: { adminDb: () => fake, adminAuth: () => { throw new Error('không dùng'); } } });
let C: typeof import('./catalog'), L: typeof import('./price-lists'), P: typeof import('./pricing'), G: typeof import('./price-log');
const ctx = (role: string, uid = role, org = 'org1'): Ctx => ({ uid, name: `Tên ${uid}`, role, orgId: org, departmentId: null, branchId: null });
const dir = ctx('director'), mgr = ctx('manager'), sales = ctx('sales'), ops = ctx('operations');
let n = 0; const rid = () => `req-${String(++n).padStart(16, '0')}`;
const fails = (p: Promise<unknown>, status: number) => assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status);
async function seed() {
  fake.data.set('customerGroups/vip', { organizationId: 'org1', name: 'VIP' });
  const cat = (await C.createCategory(dir, { requestId: rid(), type: 'product', name: 'TB' })).id, unit = (await C.createUnit(dir, { requestId: rid(), name: 'Cái', symbol: 'Cái' })).id;
  const a = (await C.createItem(dir, { requestId: rid(), type: 'product', name: 'Máy in', categoryId: cat, unitId: unit, defaultPrice: 1000 })).id, b = (await C.createItem(dir, { requestId: rid(), type: 'product', name: 'Chuột', categoryId: cat, unitId: unit, defaultPrice: 200 })).id;
  return { a, b };
}
beforeEach(async () => { fake = new FakeDb(); C = await import('./catalog'); L = await import('./price-lists'); P = await import('./pricing'); G = await import('./price-log'); });
const tick = () => new Promise(r => setTimeout(r, 3)); // khóa nhật ký theo mili-giây: tách thứ tự giữa các thao tác

describe('lịch sử giá tổng hợp', () => {
  it('ghi đủ mọi nguồn giá: giá ban đầu, đổi trực tiếp, bảng giá, giá nhóm (thêm + đổi), mới nhất trước', async () => {
    const s = await seed(); await tick();
    await C.changePrice(dir, s.a, { newPrice: 900, expectedPrice: 1000, reason: 'KM' }); await tick();
    const l = (await L.createPriceList(dir, { requestId: rid(), name: 'BG', type: 'standard' })).id; await L.savePrices(dir, l, { rows: [{ itemId: s.a, price: 800 }] }); await tick(); await L.savePrices(dir, l, { rows: [{ itemId: s.a, price: 750 }], reason: 'đổi' }); await tick();
    await P.saveGroupPrices(dir, { groupId: 'vip', rows: [{ itemId: s.a, price: 700 }] }); await tick(); await P.saveGroupPrices(dir, { groupId: 'vip', rows: [{ itemId: s.a, price: 650 }] });
    const r = await G.listPriceLog(sales, {}); assert.deepEqual(r.items.slice(0, 5).map(x => [x.kind, x.mode, x.oldPrice, x.newPrice]), [['groupPrice', 'changed', 700, 650], ['groupPrice', 'added', null, 700], ['priceList', 'changed', 800, 750], ['priceList', 'added', null, 800], ['default', 'direct', 1000, 900]]);
    assert.deepEqual(r.items.slice(5).map(x => [x.kind, x.mode, x.oldPrice]), [['default', 'initial', null], ['default', 'initial', null]]);
    assert.equal(r.items.length, 7); assert.deepEqual([r.items[0].scopeName, r.items[2].scopeName, r.items[0].diff, r.items[0].pctBp], ['VIP', 'BG001 – BG', -50, -714]);
    assert.equal(r.items.find(x => x.reason === 'KM')!.changedByName, 'Tên director');
  });
  it('đổi giá qua tay quản lý yêu cầu → duyệt: ghi nhận người gửi (người thực hiện) và người duyệt', async () => {
    const s = await seed(), sa = ctx('super_admin'); await tick(); const r = await C.changePrice(mgr, s.b, { newPrice: 250, expectedPrice: 200, reason: 'xin' }); await tick(); await C.decidePriceRequest(sa, r.requestId!, { decision: 'approve' });
    const x = (await G.listPriceLog(sales, { itemId: s.b })).items[0]; assert.deepEqual([x.mode, x.changedByName, x.approvedByName, x.newPrice], ['approved', 'Tên manager', 'Tên super_admin', 250]);
  });
  it('sửa giá nhóm qua PATCH ghi nhật ký; sửa ngày/trạng thái (không đổi giá) thì không', async () => {
    const s = await seed(); await P.saveGroupPrices(dir, { groupId: 'vip', rows: [{ itemId: s.a, price: 700 }] }); const g = (await P.listGroupPrices(dir, {})).items[0], base = (await G.listPriceLog(dir, {})).items.length; await tick();
    await P.updateGroupPrice(dir, g.id, { price: 700, status: 'inactive', version: g.version }); assert.equal((await G.listPriceLog(dir, {})).items.length, base);
    await P.updateGroupPrice(dir, g.id, { price: 600, status: 'inactive', version: g.version + 1, reason: 'giảm' }); const x = (await G.listPriceLog(dir, {})).items[0]; assert.deepEqual([x.kind, x.oldPrice, x.newPrice, x.reason, x.itemName], ['groupPrice', 700, 600, 'giảm', 'Máy in']);
  });
  it('giá không đổi / thêm trùng không tạo bản ghi', async () => {
    const s = await seed(); await P.saveGroupPrices(dir, { groupId: 'vip', rows: [{ itemId: s.a, price: 700 }] }); const base = (await G.listPriceLog(dir, {})).items.length;
    await P.saveGroupPrices(dir, { groupId: 'vip', rows: [{ itemId: s.a, price: 700 }] }); await P.saveGroupPrices(dir, { groupId: 'vip', rows: [{ itemId: s.a, price: 1 }], mode: 'add' }); assert.equal((await G.listPriceLog(dir, {})).items.length, base);
  });
  it('lọc theo nguồn / mặt hàng / hình thức / từ khóa / ngày; ngày tính theo giờ Việt Nam', async () => {
    const s = await seed(); await tick(); await C.changePrice(dir, s.a, { newPrice: 900, expectedPrice: 1000, reason: 'Khuyến mại hè' }); await P.saveGroupPrices(dir, { groupId: 'vip', rows: [{ itemId: s.b, price: 150 }] });
    const cnt = async (q: Record<string, string>) => (await G.listPriceLog(dir, q)).items.length;
    assert.deepEqual([await cnt({ kind: 'groupPrice' }), await cnt({ itemId: s.b }), await cnt({ mode: 'direct' }), await cnt({ q: 'khuyến' }), await cnt({ q: 'vip' }), await cnt({ scopeId: 'vip' })], [1, 2, 1, 1, 1, 1]);
    // ngày lọc tính theo giờ Việt Nam (UTC+7), không phải UTC
    const at = (await G.listPriceLog(dir, {})).items[0].at, vn = new Date(new Date(at).getTime() + 7 * 3600_000).toISOString().slice(0, 10), utc = at.slice(0, 10);
    assert.deepEqual([await cnt({ from: vn, to: vn }), await cnt({ to: '2000-01-01' }), await cnt({ from: '2999-01-01' })], [4, 0, 0]); if (utc !== vn) assert.equal(await cnt({ from: utc, to: utc }), 0);
    for (const bad of [{ kind: 'x' }, { mode: 'x' }, { from: '01/01/2026' }, { from: '2026-02-01', to: '2026-01-01' }]) await fails(G.listPriceLog(dir, bad), 400);
  });
  it('phân trang bằng con trỏ: không trùng, không sót, cả khi có lọc; hết dữ liệu → nextCursor null', async () => {
    const s = await seed(); for (let i = 0; i < 6; i++) { await tick(); await C.changePrice(dir, s.a, { newPrice: 900 - i, expectedPrice: i === 0 ? 1000 : 900 - i + 1, reason: `r${i}` }); }
    const seen: string[] = []; let cur: string | undefined;
    for (let k = 0; k < 10; k++) { const p = await G.listPriceLog(dir, { limit: '3', itemId: s.a, ...(cur ? { cursor: cur } : {}) }); seen.push(...p.items.map(x => x.id)); if (!p.nextCursor) break; cur = p.nextCursor; }
    assert.equal(seen.length, 7); assert.equal(new Set(seen).size, 7); assert.deepEqual(seen, [...seen].sort().reverse());
  });
  it('giới hạn quét: bộ lọc hiếm trong dữ liệu lớn trả nextCursor để tiếp tục, không mất kết quả', async () => {
    const s = await seed(); for (let i = 0; i < 5; i++) { await tick(); await C.changePrice(dir, s.b, { newPrice: 300 + i, expectedPrice: i === 0 ? 200 : 300 + i - 1, reason: 'x' }); }
    await tick(); await C.changePrice(dir, s.a, { newPrice: 1, expectedPrice: 1000, reason: 'hiếm' });
    const p1 = await G.listPriceLog(dir, { q: 'chuột', limit: '2' }, 3); assert.equal(p1.items.length, 2); assert.ok(p1.nextCursor);
    const all: string[] = []; let cur: string | undefined; for (let k = 0; k < 20; k++) { const p = await G.listPriceLog(dir, { q: 'chuột', limit: '50', ...(cur ? { cursor: cur } : {}) }, 3); all.push(...p.items.map(x => x.id)); if (!p.nextCursor) break; cur = p.nextCursor; }
    assert.equal(all.length, 6); assert.equal(new Set(all).size, 6);
  });
  it('quyền: xem = super_admin/director/manager/sales; xuất = trừ sales; operations 403; tách tổ chức', async () => {
    const s = await seed(); await C.changePrice(dir, s.a, { newPrice: 900, expectedPrice: 1000, reason: 'x' });
    await fails(G.listPriceLog(ops, {}), 403); assert.deepEqual([(await G.listPriceLog(sales, {})).can.export, (await G.listPriceLog(mgr, {})).can.export], [false, true]);
    await fails(G.exportPriceLog(sales, {}), 403); const ex = await G.exportPriceLog(mgr, { itemId: s.a }); assert.deepEqual([ex.items.length, ex.truncated], [2, false]);
    assert.equal((await G.listPriceLog(ctx('director', 'd2', 'org2'), {})).items.length, 0);
  });
});
