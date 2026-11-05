// Kiểm thử logic giao dịch của lib/server/catalog.ts trên Firestore giả (xem testing/fake-firestore.ts).
// Chạy: npm test (script đã bật --experimental-test-module-mocks)
import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './testing/fake-firestore';
import type { Ctx } from './auth';
import { HttpError } from './errors';

let fake = new FakeDb();
mock.module('./firebase-admin', { namedExports: { adminDb: () => fake, adminAuth: () => { throw new Error('không dùng'); } } });
type Svc = typeof import('./catalog');
let S: Svc;
const ctx = (role: string, uid = role, org = 'org1'): Ctx => ({ uid, name: `Tên ${uid}`, role, orgId: org, departmentId: null, branchId: null });
const dir = ctx('director'), mgr = ctx('manager'), sales = ctx('sales');
let n = 0;
const rid = () => `req-${String(++n).padStart(16, '0')}`;
const fails = async (p: Promise<unknown>, status: number, code?: string) => {
  await assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status && (!code || e.code === code), `kỳ vọng HttpError ${status} ${code ?? ''}`);
};

async function seed(c: Ctx = dir, org = c.orgId) {
  const cat = await S.createCategory({ ...c, orgId: org }, { requestId: rid(), type: 'product', name: 'Thiết bị' });
  const svcCat = await S.createCategory({ ...c, orgId: org }, { requestId: rid(), type: 'service', name: 'Website' });
  const unit = await S.createUnit({ ...c, orgId: org }, { requestId: rid(), name: 'Cái', symbol: 'Cái' });
  return { cat: cat.id, svcCat: svcCat.id, unit: unit.id };
}
const item = (s: { cat: string; unit: string }, over: Record<string, unknown> = {}) => ({ requestId: rid(), type: 'product', name: 'Máy in A4', categoryId: s.cat, unitId: s.unit, defaultPrice: 1000, ...over });

beforeEach(async () => { fake = new FakeDb(); S = await import('./catalog'); });

describe('tạo sản phẩm / dịch vụ', () => {
  it('mã tự sinh, ID theo tổ chức, lịch sử và giá ban đầu', async () => {
    const s = await seed(), r = await S.createItem(dir, item(s));
    assert.deepEqual(r, { id: 'org1_SP00001', duplicate: false });
    const d = await S.getItem(dir, r.id);
    assert.equal(d.item.code, 'SP00001'); assert.equal(d.item.defaultPrice, 1000); assert.equal(d.item.version, 1); assert.equal(d.item.categoryName, 'Thiết bị'); assert.equal(d.item.unitSymbol, 'Cái');
    assert.deepEqual(d.history.map(h => h.type), ['created']);
    assert.equal(d.priceHistory.length, 1); assert.equal(d.priceHistory[0].mode, 'initial'); assert.equal(d.priceHistory[0].oldPrice, null); assert.equal(d.priceHistory[0].newPrice, 1000);
  });
  it('gửi lại cùng requestId không tạo bản ghi thứ hai và không tăng bộ đếm', async () => {
    const s = await seed(), body = item(s), a = await S.createItem(dir, body), b = await S.createItem(dir, body);
    assert.equal(b.duplicate, true); assert.equal(b.id, a.id);
    assert.equal((await S.createItem(dir, item(s))).id, 'org1_SP00002');
  });
  it('dịch vụ có bộ đếm riêng (DV00001) và phải dùng nhóm dịch vụ', async () => {
    const s = await seed();
    assert.equal((await S.createItem(dir, item(s, { type: 'service', categoryId: s.svcCat, name: 'Thiết kế website' }))).id, 'org1_DV00001');
    await fails(S.createItem(dir, item(s, { type: 'service', categoryId: s.cat })), 400, 'bad-ref'); // nhóm sản phẩm không dùng cho dịch vụ
  });
  it('từ chối nhóm / đơn vị / thuế không tồn tại, đang ngừng, hoặc của tổ chức khác', async () => {
    const s = await seed();
    await fails(S.createItem(dir, item(s, { categoryId: 'khong-co' })), 400, 'bad-ref');
    await fails(S.createItem(dir, item(s, { taxRateId: 'khong-co' })), 400, 'bad-ref');
    const other = await seed(ctx('director', 'd2', 'org2'));
    await fails(S.createItem(dir, item(s, { unitId: other.unit })), 400, 'bad-ref');
    const u2 = await S.createUnit(dir, { requestId: rid(), name: 'Bộ', symbol: 'Bộ' });
    await S.updateUnit(dir, u2.id, { name: 'Bộ', symbol: 'Bộ', status: 'inactive', version: 1 });
    await fails(S.createItem(dir, item(s, { unitId: u2.id })), 400, 'bad-ref');
  });
  it('phân quyền: sales không tạo được; role ngoài đặc tả không xem được', async () => {
    const s = await seed();
    await fails(S.createItem(sales, item(s)), 403); await fails(S.listItems(ctx('accountant'), {}), 403); await fails(S.getItem(ctx('operations'), 'x'), 403);
    assert.equal((await S.listItems(sales, {})).can.create, false);
  });
  it('thiếu requestId hoặc dữ liệu sai → 400', async () => {
    const s = await seed();
    await fails(S.createItem(dir, { ...item(s), requestId: 'ngan' }), 400); await fails(S.createItem(dir, item(s, { name: ' ' })), 400); await fails(S.createItem(dir, item(s, { defaultPrice: -5 })), 400);
  });
});

describe('sửa sản phẩm', () => {
  it('ghi lịch sử, tăng version, cập nhật từ khóa tìm kiếm; không sửa được giá qua PATCH', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s));
    const r = await S.updateItem(mgr, id, { name: 'Máy chiếu', categoryId: s.cat, unitId: s.unit, version: 1, defaultPrice: 999999 });
    assert.deepEqual(r, { id, changed: true });
    const d = await S.getItem(dir, id);
    assert.equal(d.item.name, 'Máy chiếu'); assert.equal(d.item.version, 2); assert.equal(d.item.defaultPrice, 1000); // giá không đổi
    assert.equal(d.history[0].type, 'updated'); assert.equal(d.history[0].changes[0].from, 'Máy in A4');
    assert.equal((await S.listItems(dir, { q: 'chieu' })).items.length, 1); assert.equal((await S.listItems(dir, { q: 'in' })).items.length, 0);
  });
  it('sai version → 409; không có thay đổi → changed:false; sales → 403', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s)), same = { name: 'Máy in A4', categoryId: s.cat, unitId: s.unit };
    await fails(S.updateItem(dir, id, { ...same, version: 7 }), 409, 'conflict');
    assert.deepEqual(await S.updateItem(dir, id, { ...same, version: 1 }), { id, changed: false });
    await fails(S.updateItem(sales, id, { ...same, version: 1 }), 403);
  });
  it('ngừng kinh doanh qua cập nhật trạng thái', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s));
    await S.updateItem(dir, id, { name: 'Máy in A4', categoryId: s.cat, unitId: s.unit, status: 'inactive', version: 1 });
    assert.equal((await S.listItems(dir, { status: 'inactive' })).items.length, 1); assert.equal((await S.listItems(dir, { status: 'active' })).items.length, 0);
  });
});

describe('đổi giá và phê duyệt', () => {
  it('director đổi trực tiếp: áp dụng ngay, ghi lịch sử giá có chênh lệch và tỷ lệ', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s));
    assert.deepEqual(await S.changePrice(dir, id, { newPrice: 1100, expectedPrice: 1000, reason: 'Tăng giá nguyên liệu' }), { id, applied: true, requestId: null });
    const d = await S.getItem(dir, id);
    assert.equal(d.item.defaultPrice, 1100); assert.equal(d.item.version, 2);
    assert.equal(d.priceHistory[0].mode, 'direct'); assert.equal(d.priceHistory[0].diff, 100); assert.equal(d.priceHistory[0].pctBp, 1000); assert.equal(d.priceHistory[0].reason, 'Tăng giá nguyên liệu');
    assert.equal(d.history[0].type, 'price_changed');
  });
  it('kiểm tra đầu vào: cùng giá, lệch giá hiện tại, thiếu lý do, quyền', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s));
    await fails(S.changePrice(dir, id, { newPrice: 1000, expectedPrice: 1000, reason: 'x' }), 400, 'same-price');
    await fails(S.changePrice(dir, id, { newPrice: 2000, expectedPrice: 900, reason: 'x' }), 409, 'conflict');
    await fails(S.changePrice(dir, id, { newPrice: 2000, expectedPrice: 1000, reason: ' ' }), 400);
    await fails(S.changePrice(sales, id, { newPrice: 2000, expectedPrice: 1000, reason: 'x' }), 403);
    await fails(S.changePrice(ctx('director', 'd', 'org2'), id, { newPrice: 2000, expectedPrice: 1000, reason: 'x' }), 404);
  });
  it('manager chỉ gửi được yêu cầu: giá chưa đổi, mặt hàng được đánh dấu chờ duyệt; không gửi trùng', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s));
    const r = await S.changePrice(mgr, id, { newPrice: 1500, expectedPrice: 1000, reason: 'Khách lớn' });
    assert.equal(r.applied, false); assert.ok(r.requestId);
    const d = await S.getItem(dir, id);
    assert.equal(d.item.defaultPrice, 1000); assert.equal(d.item.version, 1); assert.equal(d.item.pendingPriceRequestId, r.requestId); assert.equal(d.pendingRequest?.newPrice, 1500);
    await fails(S.changePrice(mgr, id, { newPrice: 1600, expectedPrice: 1000, reason: 'x' }), 409, 'pending-exists');
  });
  it('duyệt: manager không được duyệt; director duyệt thì giá đổi, lịch sử ghi người đề xuất và người duyệt', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s)), { requestId } = await S.changePrice(mgr, id, { newPrice: 1500, expectedPrice: 1000, reason: 'Khách lớn' });
    await fails(S.decidePriceRequest(mgr, requestId!, { decision: 'approve' }), 403);
    await fails(S.decidePriceRequest(sales, requestId!, { decision: 'approve' }), 403);
    assert.deepEqual(await S.decidePriceRequest(dir, requestId!, { decision: 'approve', note: 'OK' }), { id: requestId, status: 'approved' });
    const d = await S.getItem(dir, id);
    assert.equal(d.item.defaultPrice, 1500); assert.equal(d.item.version, 2); assert.equal(d.item.pendingPriceRequestId, null); assert.equal(d.pendingRequest, null);
    assert.equal(d.priceHistory[0].mode, 'approved'); assert.equal(d.priceHistory[0].changedByName, 'Tên manager'); assert.equal(d.priceHistory[0].approvedByName, 'Tên director');
    await fails(S.decidePriceRequest(dir, requestId!, { decision: 'approve' }), 409, 'closed'); // xử lý lần hai
  });
  it('không tự duyệt yêu cầu của chính mình (kể cả khi đã được nâng vai trò)', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s)), { requestId } = await S.changePrice(mgr, id, { newPrice: 1500, expectedPrice: 1000, reason: 'x' });
    await fails(S.decidePriceRequest({ ...mgr, role: 'director' }, requestId!, { decision: 'approve' }), 403);
    assert.equal((await S.getItem(dir, id)).item.defaultPrice, 1000);
  });
  it('từ chối: giá giữ nguyên, gỡ dấu chờ duyệt, cho phép gửi yêu cầu mới', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s)), { requestId } = await S.changePrice(mgr, id, { newPrice: 1500, expectedPrice: 1000, reason: 'x' });
    assert.deepEqual(await S.decidePriceRequest(dir, requestId!, { decision: 'reject', note: 'Không phù hợp' }), { id: requestId, status: 'rejected' });
    const d = await S.getItem(dir, id);
    assert.equal(d.item.defaultPrice, 1000); assert.equal(d.item.pendingPriceRequestId, null); assert.equal(d.history[0].type, 'price_rejected'); assert.equal(d.priceHistory.length, 1);
    assert.equal((await S.changePrice(mgr, id, { newPrice: 1400, expectedPrice: 1000, reason: 'Gửi lại' })).applied, false);
  });
  it('hủy: chỉ người gửi', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s)), { requestId } = await S.changePrice(mgr, id, { newPrice: 1500, expectedPrice: 1000, reason: 'x' });
    await fails(S.decidePriceRequest(ctx('manager', 'khac'), requestId!, { decision: 'cancel' }), 403);
    assert.deepEqual(await S.decidePriceRequest(mgr, requestId!, { decision: 'cancel' }), { id: requestId, status: 'cancelled' });
    assert.equal((await S.getItem(dir, id)).item.pendingPriceRequestId, null);
  });
  it('director đổi trực tiếp khi đang có yêu cầu chờ → yêu cầu tự hủy', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s)), { requestId } = await S.changePrice(mgr, id, { newPrice: 1500, expectedPrice: 1000, reason: 'x' });
    await S.changePrice(dir, id, { newPrice: 1300, expectedPrice: 1000, reason: 'Điều chỉnh' });
    assert.equal((await S.getItem(dir, id)).item.pendingPriceRequestId, null);
    const list = await S.listPriceRequests(dir, 'cancelled'); assert.equal(list.items[0].id, requestId);
  });
  it('yêu cầu lỗi thời (giá đã khác lúc gửi) không duyệt được', async () => {
    const s = await seed(), { id } = await S.createItem(dir, item(s)), { requestId } = await S.changePrice(mgr, id, { newPrice: 1500, expectedPrice: 1000, reason: 'x' });
    fake.data.set(`catalogItems/${id}`, { ...fake.data.get(`catalogItems/${id}`)!, defaultPrice: 1234 }); // giả lập giá bị đổi bằng đường khác
    await fails(S.decidePriceRequest(dir, requestId!, { decision: 'approve' }), 409, 'stale');
    assert.equal((await S.getItem(dir, id)).item.defaultPrice, 1234);
  });
  it('danh sách yêu cầu: manager chỉ thấy của mình, director thấy tất cả, sales bị chặn', async () => {
    const s = await seed(), a = await S.createItem(dir, item(s)), b = await S.createItem(dir, item(s, { name: 'Máy scan' }));
    await S.changePrice(mgr, a.id, { newPrice: 1500, expectedPrice: 1000, reason: 'x' }); await S.changePrice(ctx('manager', 'm2'), b.id, { newPrice: 1500, expectedPrice: 1000, reason: 'y' });
    assert.equal((await S.listPriceRequests(mgr, 'pending')).items.length, 1); assert.equal((await S.listPriceRequests(dir, 'pending')).items.length, 2); assert.equal((await S.listPriceRequests(dir)).can.approve, true);
    await fails(S.listPriceRequests(sales), 403);
  });
});

describe('danh sách, tìm kiếm, phân trang', () => {
  async function many() {
    const s = await seed(); const names = ['Thiết kế website', 'Máy in laser', 'Máy chiếu', 'Màn hình', 'Website bán hàng'];
    for (const [i, name] of names.entries()) await S.createItem(dir, item(s, { name, defaultPrice: (i + 1) * 1000, ...(i === 3 ? {} : {}) }));
    return s;
  }
  it('phân trang theo con trỏ: đủ mục, không trùng, không sót', async () => {
    await many(); const seen: string[] = []; let cursor: string | undefined;
    for (let i = 0; i < 10; i++) { const r = await S.listItems(dir, { limit: '2', cursor }); seen.push(...r.items.map(x => x.code)); if (!r.nextCursor) break; cursor = r.nextCursor; }
    assert.deepEqual(seen, ['SP00001', 'SP00002', 'SP00003', 'SP00004', 'SP00005']);
  });
  it('tìm theo tiền tố của từ bất kỳ, không phân biệt dấu; nhiều từ phải khớp hết', async () => {
    await many();
    assert.deepEqual((await S.listItems(dir, { q: 'web' })).items.map(x => x.name), ['Thiết kế website', 'Website bán hàng']);
    assert.equal((await S.listItems(dir, { q: 'may' })).items.length, 2); assert.equal((await S.listItems(dir, { q: 'website ban' })).items.length, 1);
    assert.equal((await S.listItems(dir, { q: 'sp00003' })).items[0].name, 'Máy chiếu'); assert.equal((await S.listItems(dir, { q: 'khongco' })).items.length, 0);
  });
  it('lọc theo giá, loại, nhóm; tìm kết hợp lọc giá vẫn phân trang đúng', async () => {
    const s = await many(); await S.createItem(dir, item(s, { type: 'service', categoryId: s.svcCat, name: 'Dịch vụ A', defaultPrice: 500 }));
    assert.equal((await S.listItems(dir, { minPrice: '2000', maxPrice: '4000' })).items.length, 3);
    assert.equal((await S.listItems(dir, { type: 'service' })).items.length, 1); assert.equal((await S.listItems(dir, { categoryId: s.cat })).items.length, 5);
    const r = await S.listItems(dir, { q: 'may', maxPrice: '3000', limit: '1' }); assert.equal(r.items.length, 1); assert.ok(r.nextCursor === null || typeof r.nextCursor === 'string');
    await fails(S.listItems(dir, { minPrice: 'abc' }), 400);
  });
  it('tách biệt dữ liệu giữa các tổ chức; thống kê đếm đúng', async () => {
    const s = await many(); const o2 = ctx('director', 'd2', 'org2'), s2 = await seed(o2); await S.createItem(o2, item(s2, { name: 'Của org2' }));
    assert.equal((await S.listItems(dir, {})).items.length, 5); assert.equal((await S.listItems(o2, {})).items.length, 1);
    await S.createItem(dir, item(s, { type: 'service', categoryId: s.svcCat, name: 'DV' }));
    assert.deepEqual(await S.catalogStats(dir), { products: 5, productsActive: 5, services: 1, servicesActive: 1, categories: 2 });
    await fails(S.getItem(o2, 'org1_SP00001'), 404);
  });
});

describe('nhóm, đơn vị, thuế', () => {
  it('ký hiệu đơn vị duy nhất (không phân biệt hoa thường/dấu); đổi ký hiệu giải phóng ký hiệu cũ', async () => {
    const u = await S.createUnit(dir, { requestId: rid(), name: 'Tháng', symbol: 'Tháng' });
    await fails(S.createUnit(dir, { requestId: rid(), name: 'Thang 2', symbol: ' thang ' }), 409, 'duplicate');
    await S.updateUnit(dir, u.id, { name: 'Tháng', symbol: 'Th', version: 1 });
    assert.equal((await S.createUnit(dir, { requestId: rid(), name: 'Tháng mới', symbol: 'Tháng' })).duplicate, false);
    await fails(S.updateUnit(dir, u.id, { name: 'Tháng', symbol: 'tháng', version: 2 }), 409, 'duplicate');
  });
  it('không xóa nhóm / đơn vị đang dùng; xóa được khi trống và giải phóng ký hiệu', async () => {
    const s = await seed(); await S.createItem(dir, item(s));
    await fails(S.deleteCategory(dir, s.cat), 409, 'in-use'); await fails(S.deleteUnit(dir, s.unit), 409, 'in-use');
    await S.deleteCategory(dir, s.svcCat); assert.equal((await S.listCategories(dir, 'service')).items.length, 0);
    const u = await S.createUnit(dir, { requestId: rid(), name: 'Gói', symbol: 'Gói' }); await S.deleteUnit(dir, u.id);
    assert.equal((await S.createUnit(dir, { requestId: rid(), name: 'Gói 2', symbol: 'Gói' })).duplicate, false);
  });
  it('số lượng mặt hàng trong nhóm / đơn vị', async () => {
    const s = await seed(); await S.createItem(dir, item(s)); await S.createItem(dir, item(s, { name: 'B' }));
    assert.equal((await S.listCategories(dir, 'product')).items[0].itemCount, 2); assert.equal((await S.listUnits(dir)).items[0].itemCount, 2);
  });
  it('thuế: chỉ super_admin/director; không có mức mặc định; dùng được cho mặt hàng', async () => {
    assert.deepEqual((await S.listTaxRates(dir)).items, []);
    await fails(S.createTaxRate(mgr, { requestId: rid(), name: 'T', ratePercent: 10 }), 403);
    const t = await S.createTaxRate(dir, { requestId: rid(), name: 'Thuế A', ratePercent: 8 }), s = await seed(), it1 = await S.createItem(dir, item(s, { taxRateId: t.id, priceIncludesTax: true }));
    const d = await S.getItem(dir, it1.id); assert.equal(d.item.taxRateBp, 800); assert.equal(d.item.taxRateName, 'Thuế A'); assert.equal(d.item.priceIncludesTax, true);
    await S.updateTaxRate(dir, t.id, { name: 'Thuế A', ratePercent: 10, version: 1 }); assert.equal((await S.getItem(dir, it1.id)).item.taxRateBp, 1000);
    await fails(S.createTaxRate(dir, { requestId: rid(), name: 'X', ratePercent: 150 }), 400);
  });
  it('sales xem được nhóm / đơn vị nhưng không sửa', async () => {
    await seed(); assert.equal((await S.listCategories(sales)).can.edit, false);
    await fails(S.createUnit(sales, { requestId: rid(), name: 'X', symbol: 'X' }), 403); await fails(S.createCategory(sales, { requestId: rid(), type: 'product', name: 'X' }), 403);
  });
});

describe('nhập / xuất', () => {
  const row = (s: { cat: string; unit: string }, name: string, over: Record<string, unknown> = {}) => ({ requestId: rid(), type: 'product', name, categoryId: s.cat, unitId: s.unit, defaultPrice: 500, ...over });
  it('nhập từng dòng qua đường tạo mới: mã tự sinh, lịch sử, dòng lỗi không làm hỏng dòng khác', async () => {
    const s = await seed(), r = await S.importItems(dir, { rows: [row(s, 'A'), row(s, 'B', { categoryId: 'org1_NSP999' }), row(s, 'C')] });
    assert.deepEqual(r.results.map(x => [x.ok, x.code ?? null]), [[true, 'SP00001'], [false, null], [true, 'SP00002']]);
    assert.ok(r.results[1].error);
    assert.equal((await S.getItem(dir, 'org1_SP00002')).priceHistory.length, 1);
  });
  it('nhập lại cùng requestId không tạo bản sao', async () => {
    const s = await seed(), rows = [row(s, 'A'), row(s, 'B')];
    await S.importItems(dir, { rows }); const again = await S.importItems(dir, { rows });
    assert.deepEqual(again.results.map(x => x.duplicate), [true, true]); assert.equal((await S.listItems(dir, {})).items.length, 2);
  });
  it('quyền và giới hạn: sales/manager-không-quyền bị chặn, quá 50 dòng hoặc rỗng → 400', async () => {
    const s = await seed();
    await fails(S.importItems(sales, { rows: [row(s, 'A')] }), 403); await fails(S.importItems(dir, { rows: [] }), 400);
    await fails(S.importItems(dir, { rows: Array.from({ length: 51 }, (_, i) => row(s, 'X' + i)) }), 400);
    assert.equal((await S.importItems(mgr, { rows: [row(s, 'M')] })).results[0].ok, true); // manager có quyền chỉnh danh mục
  });
  it('xuất: kiểm tra quyền ở server; áp dụng bộ lọc; sales không xuất được', async () => {
    const s = await seed(); await S.importItems(dir, { rows: [row(s, 'Máy in'), row(s, 'Bàn', { status: 'inactive' })] });
    await fails(S.exportItems(sales, {}), 403);
    assert.equal((await S.exportItems(mgr, {})).items.length, 2);
    assert.deepEqual((await S.exportItems(dir, { status: 'inactive' })).items.map(i => i.name), ['Bàn']);
    assert.equal((await S.exportItems(ctx('director', 'd2', 'org2'), {})).items.length, 0);
  });
  it('xuất đủ khi nhiều hơn một trang (>100 dòng), không trùng', async () => {
    const s = await seed(); for (let i = 0; i < 3; i++) await S.importItems(dir, { rows: Array.from({ length: 40 }, (_, j) => row(s, `SP ${i}-${j}`)) });
    const r = await S.exportItems(dir, {}); assert.equal(r.items.length, 120); assert.equal(new Set(r.items.map(i => i.id)).size, 120); assert.equal(r.truncated, false);
  });
});
