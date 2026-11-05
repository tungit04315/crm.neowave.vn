// Kiểm thử giá theo nhóm, ưu tiên nhóm, xác định giá, chiết khấu trên Firestore giả.
import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './testing/fake-firestore';
import type { Ctx } from './auth';
import { HttpError } from './errors';

let fake = new FakeDb();
mock.module('./firebase-admin', { namedExports: { adminDb: () => fake, adminAuth: () => { throw new Error('không dùng'); } } });
let C: typeof import('./catalog'), L: typeof import('./price-lists'), P: typeof import('./pricing'), D: typeof import('./discounts');
const ctx = (role: string, uid = role, org = 'org1'): Ctx => ({ uid, name: `Tên ${uid}`, role, orgId: org, departmentId: null, branchId: null });
const sa = ctx('super_admin'), dir = ctx('director'), mgr = ctx('manager'), sales = ctx('sales'), ops = ctx('operations');
let n = 0; const rid = () => `req-${String(++n).padStart(16, '0')}`;
const fails = (p: Promise<unknown>, status: number, code?: string) => assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status && (!code || e.code === code));

async function seed() {
  fake.data.set('customerGroups/vip', { organizationId: 'org1', name: 'VIP' }); fake.data.set('customerGroups/partner', { organizationId: 'org1', name: 'Đối tác' }); fake.data.set('customerGroups/other', { organizationId: 'org2', name: 'Khác tổ chức' });
  fake.data.set('customers/c1', { organizationId: 'org1', name: 'KH 1' }); fake.data.set('customers/c2', { organizationId: 'org2', name: 'KH org2' });
  fake.data.set('customerGroupMembers/vip_c1', { organizationId: 'org1', groupId: 'vip', customerId: 'c1' }); fake.data.set('customerGroupMembers/partner_c1', { organizationId: 'org1', groupId: 'partner', customerId: 'c1' });
  const cat = await C.createCategory(dir, { requestId: rid(), type: 'product', name: 'Thiết bị' }), cat2 = await C.createCategory(dir, { requestId: rid(), type: 'product', name: 'Phụ kiện' }), unit = await C.createUnit(dir, { requestId: rid(), name: 'Cái', symbol: 'Cái' });
  const mk = async (name: string, price: number, categoryId = cat.id, status = 'active') => (await C.createItem(dir, { requestId: rid(), type: 'product', name, categoryId, unitId: unit.id, defaultPrice: price, status })).id;
  return { cat: cat.id, cat2: cat2.id, a: await mk('Máy in', 1000), b: await mk('Chuột', 200, cat2.id), off: await mk('Cũ', 5, cat.id, 'inactive') };
}
beforeEach(async () => { fake = new FakeDb(); C = await import('./catalog'); L = await import('./price-lists'); P = await import('./pricing'); D = await import('./discounts'); });
const gp = (groupId: string, rows: { itemId: string; price: number }[], over: Record<string, unknown> = {}) => P.saveGroupPrices(dir, { groupId, rows, ...over });
const price = async (itemId: string, q: Record<string, string> = {}) => (await P.resolvePrice(sales, { itemId, ...q })).result;

describe('giá theo nhóm', () => {
  it('thêm: id xác định, lịch sử created, giá hiện qua danh sách; nhận cả mã', async () => {
    const s = await seed(), r = await gp('vip', [{ itemId: s.a, price: 900 }, { code: 'sp00002', price: 150 } as never]);
    assert.deepEqual(r.results.map(x => x.result), ['added', 'added']);
    const l = await P.listGroupPrices(sales, { groupId: 'vip' }); assert.deepEqual(l.items.map(x => [x.id, x.itemCode, x.groupName, x.price, x.defaultPrice, x.state]), [[`${s.a}__vip`, 'SP00001', 'VIP', 900, 1000, 'current'], [`${s.b}__vip`, 'SP00002', 'VIP', 150, 200, 'current']]);
    assert.deepEqual((await P.listGroupPriceHistory(sales, `${s.a}__vip`)).items.map(h => [h.type, h.newPrice]), [['created', 900]]);
  });
  it('lỗi từng dòng; hàng ngừng KD, tổ chức khác, lặp; nhóm không tồn tại hoặc của tổ chức khác → 400', async () => {
    const s = await seed(), r = await gp('vip', [{ itemId: s.off, price: 1 }, { itemId: 'org1_SP99999', price: 1 }, { itemId: s.a, price: 5 }, { itemId: s.a, price: 6 }]);
    assert.deepEqual(r.results.map(x => x.result), ['error', 'error', 'added', 'error']);
    await fails(gp('nope', [{ itemId: s.a, price: 1 }]), 400, 'bad-ref'); await fails(gp('other', [{ itemId: s.a, price: 1 }]), 400, 'bad-ref');
  });
  it('"chỉ thêm" không ghi đè; "đặt giá" cập nhật + lịch sử price_changed; cùng giá → unchanged', async () => {
    const s = await seed(); await gp('vip', [{ itemId: s.a, price: 900 }]);
    assert.equal((await gp('vip', [{ itemId: s.a, price: 1 }], { mode: 'add' })).results[0].result, 'error'); assert.equal((await P.listGroupPrices(sales, {})).items[0].price, 900);
    assert.equal((await gp('vip', [{ itemId: s.a, price: 850 }], { reason: 'KM' })).results[0].result, 'updated'); assert.equal((await gp('vip', [{ itemId: s.a, price: 850 }])).results[0].result, 'unchanged');
    const h = (await P.listGroupPriceHistory(sales, `${s.a}__vip`)).items; assert.deepEqual(h.map(x => x.type).sort(), ['created', 'price_changed']); assert.equal(h.find(x => x.type === 'price_changed')!.reason, 'KM');
  });
  it('sửa giá / ngày / trạng thái qua PATCH: ghi lịch sử, kiểm tra version, không đổi → không ghi', async () => {
    const s = await seed(); await gp('vip', [{ itemId: s.a, price: 900 }]); const id = `${s.a}__vip`, v = (await P.listGroupPrices(sales, {})).items[0].version;
    await P.updateGroupPrice(dir, id, { price: 900, status: 'inactive', startDate: '2026-01-01', endDate: '2026-12-31', version: v, reason: 'dừng' });
    const row = (await P.listGroupPrices(sales, {})).items[0]; assert.deepEqual([row.status, row.state, row.startDate, row.version], ['inactive', 'inactive', '2026-01-01', v + 1]);
    assert.equal((await P.listGroupPriceHistory(sales, id)).items[0].type, 'updated');
    await fails(P.updateGroupPrice(dir, id, { price: 1, status: 'active', version: v }), 409, 'conflict');
    assert.equal((await P.updateGroupPrice(dir, id, { price: 900, status: 'inactive', startDate: '2026-01-01', endDate: '2026-12-31', version: v + 1 })).changed, false);
    await fails(P.updateGroupPrice(dir, id, { price: 1, status: 'active', startDate: '2026-02-01', endDate: '2026-01-01', version: v + 1 }), 400);
  });
  it('phân quyền: chỉ director / super_admin ghi; manager, sales xem; vai trò khác 403', async () => {
    const s = await seed();
    for (const who of [mgr, sales]) await fails(P.saveGroupPrices(who, { groupId: 'vip', rows: [{ itemId: s.a, price: 1 }] }), 403);
    await fails(P.listGroupPrices(ops, {}), 403); assert.equal((await P.listGroupPrices(mgr, {})).can.edit, false);
    assert.equal((await P.saveGroupPrices(sa, { groupId: 'vip', rows: [{ itemId: s.a, price: 1 }] })).results[0].result, 'added');
  });
  it('lọc theo nhóm / mặt hàng / trạng thái, phân trang con trỏ, tách biệt tổ chức', async () => {
    const s = await seed(); await gp('vip', [{ itemId: s.a, price: 900 }, { itemId: s.b, price: 150 }]); await gp('partner', [{ itemId: s.a, price: 850 }]);
    assert.equal((await P.listGroupPrices(sales, { groupId: 'partner' })).items.length, 1); assert.equal((await P.listGroupPrices(sales, { itemId: s.a })).items.length, 2);
    const p1 = await P.listGroupPrices(sales, { limit: '2' }), p2 = await P.listGroupPrices(sales, { limit: '2', cursor: p1.nextCursor! }); assert.equal(p1.items.length + p2.items.length, 3); assert.equal(p2.nextCursor, null);
    assert.equal((await P.listGroupPrices(ctx('director', 'd2', 'org2'), {})).items.length, 0);
    await fails(P.listGroupPriceHistory(ctx('director', 'd2', 'org2'), `${s.a}__vip`), 404);
  });
});

describe('ưu tiên nhóm', () => {
  it('mặc định 0; chỉ super_admin đặt (director bị chặn); kiểm tra 0–1000 và nhóm thuộc tổ chức; lịch sử', async () => {
    await seed();
    assert.deepEqual((await P.listGroupPriorities(sales)).items.map(x => [x.groupId, x.priority]).sort(), [['partner', 0], ['vip', 0]]);
    await fails(P.setGroupPriority(dir, { groupId: 'vip', priority: 5 }), 403); await fails(P.setGroupPriority(sales, { groupId: 'vip', priority: 5 }), 403);
    await fails(P.setGroupPriority(sa, { groupId: 'vip', priority: 1001 }), 400); await fails(P.setGroupPriority(sa, { groupId: 'other', priority: 1 }), 400, 'bad-ref');
    assert.equal((await P.setGroupPriority(sa, { groupId: 'vip', priority: 10 })).changed, true); assert.equal((await P.setGroupPriority(sa, { groupId: 'vip', priority: 10 })).changed, false);
    const l = await P.listGroupPriorities(sales); assert.deepEqual([l.items[0].groupId, l.items[0].priority, l.can.editPriority], ['vip', 10, false]);
    assert.equal([...fake.data.keys()].filter(k => k.startsWith('groupPriorities/org1_vip/history/')).length, 1);
  });
  it('số nhóm có giá đang áp dụng', async () => {
    const s = await seed(); await gp('vip', [{ itemId: s.a, price: 1 }, { itemId: s.b, price: 1 }]); assert.equal((await P.listGroupPriorities(sales)).items.find(x => x.groupId === 'vip')!.priceCount, 2);
  });
});

describe('xác định giá (tích hợp)', () => {
  it('không khách → giá mặc định; giá nhóm chỉ áp dụng cho khách thuộc nhóm (qua customerId hoặc groupIds)', async () => {
    const s = await seed(); await gp('vip', [{ itemId: s.a, price: 900 }]);
    assert.deepEqual([(await price(s.a)).price, (await price(s.a)).source], [1000, 'default']);
    assert.deepEqual([(await price(s.a, { customerId: 'c1' })).price, (await price(s.a, { groupIds: 'vip' })).source], [900, 'group']); assert.equal((await price(s.a, { groupIds: 'partner' })).price, 1000);
  });
  it('khách thuộc 2 nhóm: ưu tiên cao thắng; sau khi super_admin đổi ưu tiên kết quả đổi theo', async () => {
    const s = await seed(); await gp('vip', [{ itemId: s.a, price: 900 }]); await gp('partner', [{ itemId: s.a, price: 700 }]);
    assert.equal((await price(s.a, { customerId: 'c1' })).price, 700); // hòa ưu tiên → giá thấp hơn
    await P.setGroupPriority(sa, { groupId: 'vip', priority: 5 }); const r = await price(s.a, { customerId: 'c1' }); assert.deepEqual([r.price, r.groupId], [900, 'vip']);
  });
  it('hết hạn / chưa đến hạn / ngừng áp dụng → quay về cấp thấp hơn', async () => {
    const s = await seed(); await gp('vip', [{ itemId: s.a, price: 900 }], { endDate: '2000-01-01' }); assert.equal((await price(s.a, { groupIds: 'vip' })).source, 'default');
    await gp('partner', [{ itemId: s.a, price: 800 }], { startDate: '2999-01-01' }); assert.equal((await price(s.a, { groupIds: 'partner' })).source, 'default');
    assert.equal((await price(s.a, { groupIds: 'partner', date: '3000-01-01' })).price, 800); // tra cứu theo ngày chỉ định
  });
  it('bảng giá: dùng khi không có giá nhóm; gắn nhóm xét trước bảng giá chung; bảng giá hết hạn / ngừng bị bỏ qua', async () => {
    const s = await seed(); const mkList = async (name: string, groups: string[], over = {}) => { const id = (await L.createPriceList(dir, { requestId: rid(), name, type: 'standard', customerGroupIds: groups, ...over })).id; await L.savePrices(dir, id, { rows: [{ itemId: s.a, price: name === 'chung' ? 400 : 600 }] }); return id; };
    await mkList('chung', []); assert.deepEqual([(await price(s.a)).price, (await price(s.a)).source], [400, 'priceList']);
    await mkList('vip', ['vip']); assert.equal((await price(s.a, { groupIds: 'vip' })).price, 600); assert.equal((await price(s.a, { groupIds: 'partner' })).price, 400);
    await gp('vip', [{ itemId: s.a, price: 900 }]); assert.equal((await price(s.a, { groupIds: 'vip' })).source, 'group');
    await mkList('cũ', [], { endDate: '2000-01-01', name: 'cũ' }); assert.equal((await price(s.a)).price, 400);
    const off = await mkList('tắt', [], { status: 'inactive', name: 'tắt' }); void off; assert.equal((await price(s.a)).price, 400);
  });
  it('mặt hàng ngừng KD → không có giá; mặt hàng / khách / nhóm sai → lỗi rõ ràng; tách tổ chức', async () => {
    const s = await seed(); const r = await price(s.off); assert.deepEqual([r.found, r.price], [false, null]);
    await fails(P.resolvePrice(sales, { itemId: 'org1_SP99999' }), 404); await fails(P.resolvePrice(sales, { itemId: s.a, customerId: 'c2' }), 404); await fails(P.resolvePrice(sales, { itemId: s.a, groupIds: 'other' }), 400);
    await fails(P.resolvePrice(sales, { itemId: s.a, date: '15/06/2026' }), 400); await fails(P.resolvePrice(sales, {}), 400); await fails(P.resolvePrice(ops, { itemId: s.a }), 403);
    await fails(P.resolvePrice(ctx('director', 'd2', 'org2'), { itemId: s.a }), 404);
  });
  it('so sánh giá của một mặt hàng: mặc định, bảng giá, giá nhóm (kèm ưu tiên)', async () => {
    const s = await seed(); const l = (await L.createPriceList(dir, { requestId: rid(), name: 'BG', type: 'standard', customerGroupIds: ['vip'] })).id; await L.savePrices(dir, l, { rows: [{ itemId: s.a, price: 600 }] });
    await gp('vip', [{ itemId: s.a, price: 900 }]); await gp('partner', [{ itemId: s.a, price: 800 }]); await P.setGroupPriority(sa, { groupId: 'partner', priority: 3 });
    const r = await P.getItemPrices(sales, s.a); assert.equal(r.defaultPrice, 1000); assert.deepEqual(r.lists.map(x => [x.code, x.price, x.customerGroupNames]), [['BG001', 600, ['VIP']]]);
    assert.deepEqual(r.groupPrices.map(x => [x.groupName, x.price, x.priority]), [['Đối tác', 800, 3], ['VIP', 900, 0]]); await fails(P.getItemPrices(sales, 'org1_SP99999'), 404);
  });
});

const pol = (over: Record<string, unknown> = {}) => ({ requestId: rid(), name: 'Giảm 10%', kind: 'percent', value: 1000, ...over });
describe('chính sách chiết khấu', () => {
  it('mã CK001 tự sinh; idempotent; lịch sử; phân quyền; kiểm tra tham chiếu', async () => {
    const s = await seed(), body = pol({ itemIds: [s.a], customerGroupIds: ['vip'], categoryIds: [s.cat] }), r = await D.createPolicy(dir, body);
    assert.deepEqual(r, { id: 'org1_CK001', duplicate: false }); assert.equal((await D.createPolicy(dir, body)).duplicate, true); assert.equal((await D.listPolicies(sales, {})).items.length, 1);
    const g = await D.getPolicy(sales, r.id); assert.deepEqual([g.policy.customerGroupNames, g.policy.itemNames, g.policy.categoryNames, g.policy.state, g.can.edit], [['VIP'], ['SP00001 – Máy in'], ['Thiết bị'], 'current', false]);
    assert.deepEqual((await D.listPolicyHistory(sales, r.id)).items.map(h => h.type), ['created']);
    await fails(D.createPolicy(mgr, pol()), 403); await fails(D.createPolicy(sales, pol()), 403); await fails(D.getPolicy(ops, r.id), 403);
    for (const bad of [{ itemIds: ['org1_SP99999'] }, { customerGroupIds: ['other'] }, { categoryIds: ['nope'] }, { value: 0 }, { kind: 'x' }]) await fails(D.createPolicy(dir, pol(bad)), 400);
    await fails(D.getPolicy(ctx('director', 'd2', 'org2'), r.id), 404);
  });
  it('sửa: lịch sử thay đổi, version; không đổi → không ghi; kích hoạt / ngừng', async () => {
    await seed(); const id = (await D.createPolicy(dir, pol())).id, v = (await D.getPolicy(dir, id)).policy.version;
    await D.updatePolicy(dir, id, { ...pol({ value: 2000, stackable: true, name: 'Giảm 20%' }), version: v });
    const h = (await D.listPolicyHistory(dir, id)).items[0]; assert.equal(h.type, 'updated'); assert.deepEqual(h.changes.map(x => x.label).sort(), ['Cho phép cộng dồn', 'Giá trị', 'Tên']);
    await fails(D.updatePolicy(dir, id, { ...pol(), version: v }), 409, 'conflict'); assert.equal((await D.updatePolicy(dir, id, { ...pol({ value: 2000, stackable: true, name: 'Giảm 20%' }), version: v + 1 })).changed, false);
    await D.setPolicyStatus(dir, id, { status: 'inactive', version: v + 1 }); assert.equal((await D.getPolicy(dir, id)).policy.state, 'inactive'); assert.equal((await D.listPolicies(dir, { state: 'inactive' })).items.length, 1);
  });
  it('trạng thái hiệu lực: hết hạn / sắp áp dụng lọc được', async () => {
    await seed(); await D.createPolicy(dir, pol({ endDate: '2000-01-01' })); await D.createPolicy(dir, pol({ startDate: '2999-01-01' })); await D.createPolicy(dir, pol());
    assert.deepEqual([(await D.listPolicies(dir, { state: 'expired' })).items.length, (await D.listPolicies(dir, { state: 'upcoming' })).items.length, (await D.listPolicies(dir, { state: 'current' })).items.length], [1, 1, 1]);
  });
});

describe('tính thử giá + chiết khấu', () => {
  it('giá theo nhóm → chiết khấu theo nhóm hàng / nhóm khách / đơn tối thiểu, tách đúng dòng', async () => {
    const s = await seed(); await gp('vip', [{ itemId: s.a, price: 900 }]);
    await D.createPolicy(dir, pol({ name: 'VIP 10%', customerGroupIds: ['vip'] })); await D.createPolicy(dir, pol({ name: 'Phụ kiện 50k', kind: 'amount', value: 50, categoryIds: [s.cat2], stackable: true })); await D.createPolicy(dir, pol({ name: 'Đơn lớn', value: 3000, minOrderValue: 100000 }));
    const r = await D.evaluate(sales, { customerId: 'c1', lines: [{ itemId: s.a, quantity: 2 }, { itemId: s.b, quantity: 1 }] });
    assert.deepEqual(r.lines.map(l => [l.unitPrice, l.priceSource, l.lineTotal]), [[900, 'group', 1800], [200, 'default', 200]]); assert.equal(r.discount.subtotal, 2000);
    assert.deepEqual(r.discount.applied.map(p => p.code), ['CK001', 'CK002']); assert.deepEqual(r.discount.lineDiscounts, [180, 70]); assert.deepEqual([r.discount.totalDiscount, r.discount.netTotal], [250, 1750]);
    assert.deepEqual(r.discount.policies.find(p => p.code === 'CK003'), { policyId: 'org1_CK003', code: 'CK003', name: 'Đơn lớn', applicable: false, reason: 'Giá trị đơn hàng chưa đạt mức tối thiểu.', discount: 0, lineIndexes: [] });
    assert.deepEqual(r.discount.applied[1].lineIndexes, [1]);
  });
  it('khách không thuộc nhóm → chính sách nhóm không áp dụng', async () => {
    const s = await seed(); await D.createPolicy(dir, pol({ customerGroupIds: ['vip'] }));
    assert.equal((await D.evaluate(sales, { lines: [{ itemId: s.a, quantity: 1 }] })).discount.totalDiscount, 0); assert.equal((await D.evaluate(sales, { groupIds: ['vip'], lines: [{ itemId: s.a, quantity: 1 }] })).discount.totalDiscount, 100);
  });
  it('dòng lỗi (hàng ngừng KD, không tồn tại) báo riêng và không tính; đơn giá nhập tay giữ nguyên', async () => {
    const s = await seed(), r = await D.evaluate(sales, { lines: [{ itemId: s.off, quantity: 1 }, { itemId: 'org1_SP99999', quantity: 1 }, { itemId: s.a, quantity: 3, unitPrice: 777 }] });
    assert.deepEqual(r.lines.map(l => [!!l.error, l.unitPrice, l.priceSourceName]), [[true, null, ''], [true, null, ''], [false, 777, 'Nhập tay']]); assert.equal(r.discount.subtotal, 2331);
  });
  it('chỉ số dòng trong kết quả chính sách là chỉ số dòng gốc kể cả khi có dòng lỗi phía trước', async () => {
    const s = await seed(); await D.createPolicy(dir, pol({ itemIds: [s.b] }));
    const r = await D.evaluate(sales, { lines: [{ itemId: 'org1_SP99999', quantity: 1 }, { itemId: s.b, quantity: 1 }] }); assert.deepEqual(r.discount.applied[0].lineIndexes, [1]); assert.deepEqual(r.discount.lineDiscounts, [0, 20]);
  });
  it('hạn mức theo vai trò: sales giảm > 5% cần phê duyệt; director không', async () => {
    const s = await seed(); await D.createPolicy(dir, pol({ value: 1000 }));
    const rs = await D.evaluate(sales, { lines: [{ itemId: s.a, quantity: 1 }] }), rd = await D.evaluate(dir, { lines: [{ itemId: s.a, quantity: 1 }] });
    assert.deepEqual([rs.discountBp, rs.limitBp, rs.needsApproval, rd.needsApproval], [1000, 500, true, false]);
  });
  it('quy tắc giá thiếu → thông báo, không tự tạo giá; kiểm tra đầu vào và quyền', async () => {
    await seed(); await fails(D.evaluate(sales, { lines: [] }), 400); await fails(D.evaluate(sales, { lines: [{ itemId: 'x', quantity: 0 }] }), 400); await fails(D.evaluate(ops, { lines: [{ itemId: 'x', quantity: 1 }] }), 403);
    await fails(D.evaluate(sales, { customerId: 'c2', lines: [{ itemId: 'x', quantity: 1 }] }), 404);
  });
});

import { createHash } from 'node:crypto';
describe('thuế và snapshot giá', () => {
  async function seedTax() {
    const s = await seed(), tax = (await C.createTaxRate(dir, { requestId: rid(), name: 'VAT 10%', rateBp: 1000 })).id, unit = (await C.createUnit(dir, { requestId: rid(), name: 'Bộ', symbol: 'Bộ' })).id;
    const mk = async (name: string, price: number, includes: boolean, taxRateId: string | null) => (await C.createItem(dir, { requestId: rid(), type: 'product', name, categoryId: s.cat, unitId: unit, defaultPrice: price, taxRateId, priceIncludesTax: includes })).id;
    return { ...s, tax, excl: await mk('Chưa thuế', 1000, false, tax), incl: await mk('Gồm thuế', 1100, true, tax), none: await mk('Không thuế', 500, false, null) };
  }
  it('thuế từng dòng + tổng: chưa gồm / đã gồm / không thuế; mang theo đơn vị và thuế suất', async () => {
    const s = await seedTax(), r = await D.evaluate(sales, { lines: [{ itemId: s.excl, quantity: 2 }, { itemId: s.incl, quantity: 1 }, { itemId: s.none, quantity: 3 }] });
    assert.deepEqual(r.lines.map(l => [l.lineTotal, l.amountBeforeTax, l.tax, l.total]), [[2000, 2000, 200, 2200], [1100, 1000, 100, 1100], [1500, 1500, 0, 1500]]);
    assert.deepEqual([r.lines[0].taxRateBp, r.lines[0].taxRateName, r.lines[0].unitName, r.lines[2].taxRateBp], [1000, 'VAT 10%', 'Bộ', null]); assert.deepEqual(r.totals, { subtotal: 4600, discount: 0, amountBeforeTax: 4500, tax: 300, total: 4800 });
  });
  it('thuế tính trên số tiền SAU chiết khấu', async () => {
    const s = await seedTax(); await D.createPolicy(dir, pol({ value: 1000 }));
    const r = await D.evaluate(dir, { lines: [{ itemId: s.excl, quantity: 2 }, { itemId: s.incl, quantity: 1 }] });
    assert.deepEqual(r.lines.map(l => [l.discount, l.amountBeforeTax, l.tax, l.total]), [[200, 1800, 180, 1980], [110, 900, 90, 990]]); assert.deepEqual(r.totals, { subtotal: 3100, discount: 310, amountBeforeTax: 2700, tax: 270, total: 2970 });
  });
  it('dòng lỗi không vào tổng; thành tiền quá lớn bị chặn', async () => {
    const s = await seedTax(), r = await D.evaluate(sales, { lines: [{ itemId: s.excl, quantity: 100, unitPrice: 9_999_999_999_999 }, { itemId: s.off, quantity: 1 }, { itemId: s.excl, quantity: 1 }] });
    assert.equal(r.lines[0].error, 'Thành tiền của dòng quá lớn.'); assert.ok(r.lines[1].error); assert.equal(r.lines[2].error, null); assert.equal(r.totals.total, 1100);
  });
  it('snapshot: dấu vân tay khớp nội dung, không ghi dữ liệu, không đổi khi giá đổi sau đó', async () => {
    const s = await seedTax(); await D.createPolicy(dir, pol({ value: 500 })); const before = fake.data.size;
    const snap = await D.snapshotPrice(sales, { lines: [{ itemId: s.excl, quantity: 2 }] }); assert.equal(fake.data.size, before);
    const { fingerprint, ...core } = snap; assert.equal(fingerprint, createHash('sha256').update(JSON.stringify(core)).digest('hex'));
    assert.deepEqual([snap.schema, snap.currency, snap.actor.role, snap.totals.total, snap.appliedPolicies[0].code], [1, 'VND', 'sales', 2090, 'CK001']);
    const copy = JSON.parse(JSON.stringify(snap)); await C.changePrice(dir, s.excl, { newPrice: 5000, expectedPrice: 1000, reason: 'đổi' }); assert.deepEqual(snap, copy);
    assert.equal((await D.snapshotPrice(sales, { lines: [{ itemId: s.excl, quantity: 2 }] })).totals.subtotal, 10000);
  });
  it('snapshot: có dòng không xác định được giá → 422; quyền xem; tổ chức khác', async () => {
    const s = await seedTax(); await fails(D.snapshotPrice(sales, { lines: [{ itemId: s.off, quantity: 1 }] }), 422, 'unpriced'); await fails(D.snapshotPrice(ops, { lines: [{ itemId: s.excl, quantity: 1 }] }), 403);
    await fails(D.snapshotPrice(ctx('director', 'd2', 'org2'), { lines: [{ itemId: s.excl, quantity: 1 }] }), 422);
  });
});
