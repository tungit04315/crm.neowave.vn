// Kiểm thử logic bảng giá trên Firestore giả (xem testing/fake-firestore.ts).
import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './testing/fake-firestore';
import type { Ctx } from './auth';
import { HttpError } from './errors';

let fake = new FakeDb();
mock.module('./firebase-admin', { namedExports: { adminDb: () => fake, adminAuth: () => { throw new Error('không dùng'); } } });
let C: typeof import('./catalog'), P: typeof import('./price-lists');
const ctx = (role: string, uid = role, org = 'org1'): Ctx => ({ uid, name: `Tên ${uid}`, role, orgId: org, departmentId: null, branchId: null });
const dir = ctx('director'), mgr = ctx('manager'), sales = ctx('sales'), ops = ctx('operations');
let n = 0; const rid = () => `req-${String(++n).padStart(16, '0')}`;
const fails = (p: Promise<unknown>, status: number, code?: string) => assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status && (!code || e.code === code));

async function seed() {
  const cat = await C.createCategory(dir, { requestId: rid(), type: 'product', name: 'Thiết bị' }), unit = await C.createUnit(dir, { requestId: rid(), name: 'Cái', symbol: 'Cái' });
  const mk = async (name: string, price: number, status = 'active') => (await C.createItem(dir, { requestId: rid(), type: 'product', name, categoryId: cat.id, unitId: unit.id, defaultPrice: price, status })).id;
  return { a: await mk('Máy in', 1000), b: await mk('Máy quét', 2000), off: await mk('Cũ', 50, 'inactive') };
}
const newList = (over: Record<string, unknown> = {}) => ({ requestId: rid(), name: 'Bảng giá VIP', type: 'customer_group', ...over });
const mkList = async (over: Record<string, unknown> = {}) => (await P.createPriceList(dir, newList(over))).id;

beforeEach(async () => { fake = new FakeDb(); C = await import('./catalog'); P = await import('./price-lists'); });

describe('tạo / sửa bảng giá', () => {
  it('mã BG001 tự sinh, ID theo tổ chức, mặc định đang hoạt động, tiền tệ VND, lịch sử created', async () => {
    const r = await P.createPriceList(dir, newList()); assert.deepEqual(r, { id: 'org1_BG001', duplicate: false });
    const d = await P.getPriceList(dir, r.id); assert.equal(d.list.code, 'BG001'); assert.equal(d.list.status, 'active'); assert.equal(d.list.currency, 'VND'); assert.equal(d.list.itemCount, 0);
    assert.deepEqual((await P.listPriceListHistory(dir, r.id)).items.map(h => h.type), ['created']);
    assert.equal((await P.createPriceList(dir, newList())).id, 'org1_BG002');
  });
  it('gửi lại cùng requestId không tạo bản sao', async () => {
    const body = newList(); await P.createPriceList(dir, body); assert.equal((await P.createPriceList(dir, body)).duplicate, true); assert.equal((await P.listPriceLists(dir, {})).items.length, 1);
  });
  it('kiểm tra đầu vào: tên, loại, ngày sai, ngày kết thúc trước ngày bắt đầu, nhóm khách không tồn tại', async () => {
    for (const bad of [{ name: ' ' }, { type: 'x' }, { startDate: '2026-13-40' }, { startDate: '2026-05-10', endDate: '2026-05-09' }, { customerGroupIds: ['nope'] }, { status: 'zzz' }])
      await fails(P.createPriceList(dir, newList(bad)), 400);
  });
  it('nhóm khách hàng áp dụng: lưu và hiển thị tên; không dùng được nhóm của tổ chức khác', async () => {
    fake.data.set('customerGroups/g1', { organizationId: 'org1', name: 'VIP' }); fake.data.set('customerGroups/g2', { organizationId: 'org2', name: 'Khác' });
    const id = await mkList({ customerGroupIds: ['g1'] }); assert.deepEqual((await P.getPriceList(dir, id)).list.customerGroupNames, ['VIP']);
    await fails(P.createPriceList(dir, newList({ customerGroupIds: ['g2'] })), 400, 'bad-ref');
  });
  it('trạng thái hiệu lực theo ngày: sắp áp dụng / hết hiệu lực / ngừng', async () => {
    const f = await mkList({ startDate: '2999-01-01' }), e = await mkList({ endDate: '2000-01-01' }), o = await mkList({ status: 'inactive' }), cur = await mkList();
    const st = Object.fromEntries((await P.listPriceLists(dir, {})).items.map(l => [l.id, l.state]));
    assert.deepEqual([st[f], st[e], st[o], st[cur]], ['upcoming', 'expired', 'inactive', 'current']);
    assert.equal((await P.listPriceLists(dir, { state: 'expired' })).items.length, 1);
  });
  it('sửa: ghi lịch sử thay đổi, tăng version; sai version → 409; không đổi gì → không ghi', async () => {
    const id = await mkList(), v = (await P.getPriceList(dir, id)).list.version;
    await P.updatePriceList(dir, id, { ...newList({ name: 'VIP mới', endDate: '2030-12-31' }), version: v });
    const l = (await P.getPriceList(dir, id)).list; assert.equal(l.name, 'VIP mới'); assert.equal(l.version, v + 1);
    const h = (await P.listPriceListHistory(dir, id)).items[0]; assert.equal(h.type, 'updated'); assert.deepEqual(h.changes.map(x => x.label).sort(), ['Ngày kết thúc', 'Tên bảng giá']);
    await fails(P.updatePriceList(dir, id, { ...newList({ name: 'X' }), version: v }), 409, 'conflict');
    const r = await P.updatePriceList(dir, id, { ...newList({ name: 'VIP mới', endDate: '2030-12-31' }), version: v + 1 }); assert.equal(r.changed, false);
  });
  it('phân quyền: director/super_admin sửa; manager, sales chỉ xem; vai trò khác không thấy', async () => {
    const id = await mkList();
    await fails(P.createPriceList(mgr, newList()), 403); await fails(P.createPriceList(sales, newList()), 403); await fails(P.getPriceList(ops, id), 403);
    assert.equal((await P.getPriceList(mgr, id)).can.edit, false); assert.equal((await P.getPriceList(mgr, id)).can.export, true); assert.equal((await P.getPriceList(sales, id)).can.export, false);
    assert.equal((await P.createPriceList(ctx('super_admin'), newList())).duplicate, false);
  });
  it('tách biệt giữa các tổ chức', async () => {
    const id = await mkList(); await fails(P.getPriceList(ctx('director', 'd2', 'org2'), id), 404); assert.equal((await P.listPriceLists(ctx('director', 'd2', 'org2'), {})).items.length, 0);
  });
});

describe('mặt hàng và giá trong bảng giá', () => {
  it('thêm mặt hàng: ghi giá, tăng itemCount, lịch sử item_added; nhận cả itemId và mã', async () => {
    const s = await seed(), id = await mkList();
    const r = await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 900 }, { code: 'sp00002', price: 1800 }] });
    assert.deepEqual(r.results.map(x => x.result), ['added', 'added']); assert.equal((await P.getPriceList(dir, id)).list.itemCount, 2);
    const rows = (await P.listPriceListRows(dir, id, {})).rows; assert.deepEqual(rows.map(x => [x.code, x.defaultPrice, x.price]), [['SP00001', 1000, 900], ['SP00002', 2000, 1800]]);
    assert.deepEqual((await P.listPriceListHistory(dir, id)).items.map(h => h.type).sort(), ['created', 'item_added', 'item_added']);
  });
  it('dòng lỗi báo riêng, dòng hợp lệ vẫn lưu: mặt hàng không có, ngừng kinh doanh, lặp, giá sai', async () => {
    const s = await seed(), id = await mkList();
    const r = await P.savePrices(dir, id, { rows: [{ itemId: 'org1_SP99999', price: 1 }, { itemId: s.off, price: 1 }, { itemId: s.a, price: 5 }, { itemId: s.a, price: 6 }] });
    assert.deepEqual(r.results.map(x => x.result), ['error', 'error', 'added', 'error']); assert.equal((await P.getPriceList(dir, id)).list.itemCount, 1);
    assert.equal((await P.listPriceListRows(dir, id, {})).rows[0].price, 5);
    await fails(P.savePrices(dir, id, { rows: [{ itemId: s.a, price: -1 }] }), 400); await fails(P.savePrices(dir, id, { rows: [] }), 400);
    await fails(P.savePrices(dir, id, { rows: Array.from({ length: 101 }, () => ({ itemId: s.a, price: 1 })) }), 400);
  });
  it('chế độ "chỉ thêm" không ghi đè giá đang có; chế độ mặc định thì ghi', async () => {
    const s = await seed(), id = await mkList(); await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 900 }] });
    const r = await P.savePrices(dir, id, { mode: 'add', rows: [{ itemId: s.a, price: 1 }, { itemId: s.b, price: 5 }] });
    assert.deepEqual(r.results.map(x => x.result), ['error', 'added']); assert.deepEqual((await P.listPriceListRows(dir, id, {})).rows.map(x => x.price), [900, 5]);
    await fails(P.savePrices(dir, id, { mode: 'zzz', rows: [{ itemId: s.a, price: 1 }] }), 400);
  });
  it('mặt hàng ở tổ chức khác không thêm được', async () => {
    const s = await seed(), id = await mkList(), r = await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 1 }] }); assert.equal(r.results[0].result, 'added');
    const other = ctx('director', 'd2', 'org2'), oid = (await P.createPriceList(other, newList())).id;
    assert.equal((await P.savePrices(other, oid, { rows: [{ itemId: s.a, price: 1 }] })).results[0].result, 'error');
  });
  it('đổi giá: lưu lịch sử giá cũ → mới kèm lý do; cùng giá → unchanged; giá lệch expectedPrice → từ chối dòng đó', async () => {
    const s = await seed(), id = await mkList(); await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 900 }, { itemId: s.b, price: 1800 }] });
    const r = await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 950, expectedPrice: 900 }, { itemId: s.b, price: 1800 }], reason: 'Điều chỉnh quý 4' });
    assert.deepEqual(r.results.map(x => x.result), ['updated', 'unchanged']);
    const h = (await P.listPriceListHistory(dir, id)).items.find(x => x.type === 'price_changed')!; assert.deepEqual([h.itemCode, h.oldPrice, h.newPrice, h.reason], ['SP00001', 900, 950, 'Điều chỉnh quý 4']);
    const stale = await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 1, expectedPrice: 900 }] }); assert.equal(stale.results[0].result, 'error'); assert.equal((await P.listPriceListRows(dir, id, {})).rows[0].price, 950);
    assert.equal((await P.getPriceList(dir, id)).list.itemCount, 2);
  });
  it('giá trong bảng giá độc lập với giá mặc định; đổi giá mặc định không làm đổi giá bảng giá', async () => {
    const s = await seed(), id = await mkList(); await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 900 }] });
    await C.changePrice(dir, s.a, { newPrice: 1200, expectedPrice: 1000, reason: 'x' });
    const r = (await P.listPriceListRows(dir, id, {})).rows[0]; assert.deepEqual([r.defaultPrice, r.price], [1200, 900]);
  });
  it('xóa mặt hàng: giảm itemCount, ghi lịch sử với giá cũ; mặt hàng không có trong bảng giá bị bỏ qua', async () => {
    const s = await seed(), id = await mkList(); await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 900 }, { itemId: s.b, price: 1800 }] });
    assert.deepEqual(await P.removePriceListItems(dir, id, { itemIds: [s.a, 'org1_SP77777'] }), { removed: 1 });
    assert.equal((await P.getPriceList(dir, id)).list.itemCount, 1); assert.deepEqual((await P.listPriceListRows(dir, id, {})).rows.map(r => r.code), ['SP00002']);
    const h = (await P.listPriceListHistory(dir, id)).items.find(x => x.type === 'item_removed')!; assert.deepEqual([h.itemCode, h.oldPrice], ['SP00001', 900]);
    await fails(P.removePriceListItems(mgr, id, { itemIds: [s.b] }), 403);
  });
  it('phân quyền ghi giá: manager / sales bị chặn', async () => {
    const s = await seed(), id = await mkList();
    await fails(P.savePrices(mgr, id, { rows: [{ itemId: s.a, price: 1 }] }), 403); await fails(P.savePrices(sales, id, { rows: [{ itemId: s.a, price: 1 }] }), 403);
  });
  it('phân trang theo con trỏ, đủ mục và không trùng', async () => {
    const s = await seed(), id = await mkList(); void s;
    const cat = Object.values(s)[0]; void cat;
    for (let i = 0; i < 3; i++) await C.createItem(dir, { requestId: rid(), type: 'product', name: 'Hàng ' + i, categoryId: 'org1_NSP001', unitId: 'org1_DVT001', defaultPrice: 1 });
    await P.savePrices(dir, id, { rows: ['SP00001', 'SP00002', 'SP00004', 'SP00005', 'SP00006'].map(code => ({ code, price: 10 })) });
    const p1 = await P.listPriceListRows(dir, id, { limit: '2' }), p2 = await P.listPriceListRows(dir, id, { limit: '2', cursor: p1.nextCursor! }), p3 = await P.listPriceListRows(dir, id, { limit: '2', cursor: p2.nextCursor! });
    assert.deepEqual([...p1.rows, ...p2.rows, ...p3.rows].map(r => r.code), ['SP00001', 'SP00002', 'SP00004', 'SP00005', 'SP00006']); assert.equal(p3.nextCursor, null);
  });
});

describe('trạng thái, nhân bản, xóa, xuất', () => {
  it('kích hoạt / ngừng: ghi lịch sử, kiểm tra version', async () => {
    const id = await mkList(), v = (await P.getPriceList(dir, id)).list.version;
    await P.setPriceListStatus(dir, id, { status: 'inactive', version: v }); assert.equal((await P.getPriceList(dir, id)).list.status, 'inactive');
    assert.equal((await P.listPriceListHistory(dir, id)).items[0].type, 'status_changed'); await fails(P.setPriceListStatus(dir, id, { status: 'active', version: v }), 409);
    assert.equal((await P.setPriceListStatus(dir, id, { status: 'inactive', version: v + 1 })).changed, false);
  });
  it('xóa mềm: chỉ khi đã ngừng hoạt động; sau xóa không còn trong danh sách và không truy cập được', async () => {
    const id = await mkList(), v = (await P.getPriceList(dir, id)).list.version;
    await fails(P.deletePriceList(dir, id, { version: v }), 409, 'not-deletable');
    await P.setPriceListStatus(dir, id, { status: 'inactive', version: v }); await P.deletePriceList(dir, id, { version: v + 1 });
    assert.equal((await P.listPriceLists(dir, {})).items.length, 0); await fails(P.getPriceList(dir, id), 404); await fails(P.savePrices(dir, id, { rows: [{ itemId: 'x', price: 1 }] }), 404);
    await fails(P.deletePriceList(mgr, id, { version: 1 }), 403);
  });
  it('nhân bản: sao chép giá, bản sao ngừng hoạt động, mã mới, lịch sử duplicated; bản gốc không đổi; idempotent', async () => {
    const s = await seed(), id = await mkList({ endDate: '2030-01-01' }); await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 900 }, { itemId: s.b, price: 1800 }] });
    const body = { requestId: rid() }, r = await P.duplicatePriceList(dir, id, body); assert.equal(r.id, 'org1_BG002');
    const d = (await P.getPriceList(dir, r.id)).list; assert.deepEqual([d.status, d.itemCount, d.endDate, d.name], ['inactive', 2, '2030-01-01', 'Bảng giá VIP (bản sao)']);
    assert.deepEqual((await P.listPriceListRows(dir, r.id, {})).rows.map(x => x.price), [900, 1800]); assert.equal((await P.listPriceListHistory(dir, r.id)).items.some(h => h.type === 'duplicated'), true);
    assert.equal((await P.duplicatePriceList(dir, id, body)).duplicate, true); assert.equal((await P.listPriceLists(dir, {})).items.length, 2);
    await P.savePrices(dir, r.id, { rows: [{ itemId: s.a, price: 1 }] }); assert.equal((await P.listPriceListRows(dir, id, {})).rows[0].price, 900);
    await fails(P.duplicatePriceList(mgr, id, { requestId: rid() }), 403);
  });
  it('xuất: kiểm tra quyền ở server', async () => {
    const s = await seed(), id = await mkList(); await P.savePrices(dir, id, { rows: [{ itemId: s.a, price: 900 }] });
    assert.equal((await P.exportPriceList(mgr, id)).rows.length, 1); await fails(P.exportPriceList(sales, id), 403);
  });
});
