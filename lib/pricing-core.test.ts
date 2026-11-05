import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { discountBp, evaluateDiscounts, exceedsLimit, parseEvaluate, parseGroupPriceBatch, parseGroupPriceUpdate, parsePolicy, parsePriority, pricingCan, resolvePriceCore, type PolicyLite, type ResolveInput } from './pricing-core';

const T = '2026-06-15';
const item = { id: 'org_SP1', code: 'SP1', status: 'active' as const, defaultPrice: 1000 };
const base = (over: Partial<ResolveInput> = {}): ResolveInput => ({ item, today: T, customerGroupIds: [], groupPrices: [], priorities: {}, lists: [], ...over });
const gp = (groupId: string, price: number, over = {}) => ({ id: `gp_${groupId}`, groupId, groupName: `Nhóm ${groupId}`, price, status: 'active' as const, startDate: null, endDate: null, ...over });
const pl = (code: string, price: number | null, groups: string[] = [], over = {}) => ({ id: `l_${code}`, code, name: `Bảng ${code}`, customerGroupIds: groups, status: 'active' as const, startDate: null, endDate: null, price, ...over });

describe('xác định giá', () => {
  it('không nhóm, không bảng giá → giá mặc định; giá mặc định 0 có cảnh báo', () => {
    const r = resolvePriceCore(base()); assert.deepEqual([r.found, r.price, r.source], [true, 1000, 'default']);
    assert.ok(resolvePriceCore(base({ item: { ...item, defaultPrice: 0 } })).warning);
  });
  it('mặt hàng ngừng kinh doanh → không có giá, không tự tạo giá', () => {
    const r = resolvePriceCore(base({ item: { ...item, status: 'inactive' } })); assert.deepEqual([r.found, r.price], [false, null]);
  });
  it('giá riêng của nhóm thắng bảng giá và giá mặc định', () => {
    const r = resolvePriceCore(base({ customerGroupIds: ['a'], groupPrices: [gp('a', 800)], lists: [pl('BG1', 500)] })); assert.deepEqual([r.price, r.source, r.groupId], [800, 'group', 'a']);
  });
  it('khách thuộc nhiều nhóm: ưu tiên cao hơn thắng dù giá cao hơn; hòa ưu tiên → giá thấp hơn; hòa nữa → mã nhóm', () => {
    const two = base({ customerGroupIds: ['a', 'b'], groupPrices: [gp('a', 700), gp('b', 900)] });
    assert.equal(resolvePriceCore({ ...two, priorities: { b: 10 } }).price, 900);
    assert.equal(resolvePriceCore(two).price, 700);
    assert.equal(resolvePriceCore({ ...two, groupPrices: [gp('b', 700), gp('a', 700)] }).groupId, 'a');
  });
  it('giá nhóm không dùng: nhóm khác, chưa đến hạn, hết hạn, ngừng áp dụng', () => {
    for (const g of [gp('z', 1), gp('a', 1, { startDate: '2026-06-16' }), gp('a', 1, { endDate: '2026-06-14' }), gp('a', 1, { status: 'inactive' })])
      assert.equal(resolvePriceCore(base({ customerGroupIds: ['a'], groupPrices: [g] })).source, 'default');
    assert.equal(resolvePriceCore(base({ customerGroupIds: ['a'], groupPrices: [gp('a', 5, { startDate: T, endDate: T })] })).price, 5);
  });
  it('bảng giá: gắn nhóm của khách xét trước bảng giá chung (kể cả khi đắt hơn); cùng tầng lấy giá thấp nhất; hòa → mã', () => {
    const lists = [pl('BG1', 400), pl('BG2', 600, ['a']), pl('BG3', 650, ['a']), pl('BG4', 600, ['a'])];
    assert.deepEqual([resolvePriceCore(base({ customerGroupIds: ['a'], lists })).price, resolvePriceCore(base({ customerGroupIds: ['a'], lists })).sourceId], [600, 'l_BG2']);
    assert.equal(resolvePriceCore(base({ customerGroupIds: ['x'], lists })).price, 400); // khách nhóm khác chỉ thấy bảng giá chung
    assert.equal(resolvePriceCore(base({ lists: [pl('BG2', 600, ['a'])] })).source, 'default'); // bảng giá gắn nhóm không dành cho khách không thuộc nhóm
  });
  it('bảng giá không dùng: hết hạn, ngừng, mặt hàng không có trong bảng giá', () => {
    for (const l of [pl('A', 1, [], { endDate: '2026-01-01' }), pl('B', 1, [], { status: 'inactive' }), pl('C', null), pl('D', 1, [], { startDate: '2999-01-01' })]) assert.equal(resolvePriceCore(base({ lists: [l] })).source, 'default');
  });
  it('vết giải thích có nội dung', () => assert.ok(resolvePriceCore(base({ lists: [pl('BG1', 400)] })).trace.length >= 2));
});

const pol = (over: Partial<PolicyLite> = {}): PolicyLite => ({ id: 'p1', code: 'CK001', name: 'CK', kind: 'percent', value: 1000, stackable: false, customerGroupIds: [], itemIds: [], categoryIds: [], minOrderValue: null, startDate: null, endDate: null, status: 'active', ...over });
const lines = [{ itemId: 'i1', categoryId: 'c1', quantity: 2, unitPrice: 1000 }, { itemId: 'i2', categoryId: 'c2', quantity: 1, unitPrice: 3000 }]; // tổng 5000
const ev = (ps: PolicyLite[], groups: string[] = []) => evaluateDiscounts(lines, { today: T, customerGroupIds: groups }, ps);

describe('chiết khấu', () => {
  it('phần trăm trên toàn đơn; số tiền không vượt tổng', () => {
    assert.deepEqual([ev([pol()]).totalDiscount, ev([pol()]).netTotal], [500, 4500]);
    assert.equal(ev([pol({ kind: 'amount', value: 99999 })]).totalDiscount, 5000);
  });
  it('theo mặt hàng / nhóm hàng: chỉ tính trên dòng phù hợp và chia cho đúng dòng', () => {
    const r = ev([pol({ itemIds: ['i1'] })]); assert.deepEqual(r.lineDiscounts, [200, 0]);
    assert.deepEqual(ev([pol({ categoryIds: ['c2'] })]).lineDiscounts, [0, 300]);
    assert.deepEqual(ev([pol({ itemIds: ['i1'], categoryIds: ['c2'], kind: 'amount', value: 501 })]).lineDiscounts, [200, 301]); // 501 chia theo tỷ lệ 2000:3000 → dòng cuối nhận phần dư
  });
  it('điều kiện: nhóm khách, giá trị tối thiểu, thời hạn, trạng thái — kèm lý do', () => {
    const reasons = ev([pol({ id: 'a', customerGroupIds: ['vip'] }), pol({ id: 'b', minOrderValue: 5001 }), pol({ id: 'c', endDate: '2026-06-14' }), pol({ id: 'd', startDate: '2026-06-16' }), pol({ id: 'e', status: 'inactive' }), pol({ id: 'f', itemIds: ['zzz'] })]).policies;
    assert.ok(reasons.every(p => !p.applicable && p.reason)); assert.equal(new Set(reasons.map(p => p.reason)).size, 6);
    assert.equal(ev([pol({ customerGroupIds: ['vip'] })], ['vip']).totalDiscount, 500); assert.equal(ev([pol({ minOrderValue: 5000 })]).totalDiscount, 500);
  });
  it('không tự cộng dồn: chọn chính sách không-cộng-dồn lớn nhất; chính sách cộng dồn được cộng thêm', () => {
    const a = pol({ id: 'a', code: 'CK001', value: 1000 }), b = pol({ id: 'b', code: 'CK002', value: 2000 }), s = pol({ id: 's', code: 'CK003', kind: 'amount', value: 100, stackable: true });
    assert.deepEqual(ev([a, b]).applied.map(p => p.policyId), ['b']); assert.equal(ev([a, b]).totalDiscount, 1000);
    assert.deepEqual(ev([a, b, s]).applied.map(p => p.policyId), ['b', 's']); assert.equal(ev([a, b, s]).totalDiscount, 1100);
    assert.deepEqual(ev([pol({ id: 'z', code: 'CK009' }), pol({ id: 'y', code: 'CK002' })]).applied.map(p => p.policyId), ['y']); // hòa → mã nhỏ hơn
  });
  it('mỗi dòng không giảm quá thành tiền; tổng bằng tổng các dòng', () => {
    const r = ev([pol({ id: 'a', value: 8000, stackable: true }), pol({ id: 'b', value: 8000, stackable: true })]); assert.ok(r.lineDiscounts.every((d, i) => d <= [2000, 3000][i])); assert.equal(r.totalDiscount, r.lineDiscounts.reduce((x, y) => x + y, 0)); assert.equal(r.netTotal, 0);
  });
  it('không có chính sách / giỏ rỗng', () => { assert.equal(ev([]).totalDiscount, 0); assert.equal(evaluateDiscounts([], { today: T, customerGroupIds: [] }, [pol()]).totalDiscount, 0); });
  it('hạn mức theo vai trò', () => {
    assert.equal(discountBp(500, 5000), 1000); assert.equal(discountBp(1, 0), 0);
    assert.equal(exceedsLimit('sales', 250, 5000), false); assert.equal(exceedsLimit('sales', 251, 5000), true); assert.equal(exceedsLimit('sales', 250, 5000 * 2), false); assert.equal(exceedsLimit('director', 5000, 5000), false); assert.equal(exceedsLimit('operations', 1, 5000), true);
  });
});

describe('kiểm tra dữ liệu', () => {
  it('chính sách', () => {
    const ok = { name: 'A', kind: 'percent', value: 1000 };
    assert.equal(parsePolicy(ok).ok, true);
    for (const bad of [{ ...ok, name: '' }, { ...ok, kind: 'x' }, { ...ok, value: 0 }, { ...ok, value: 10001 }, { ...ok, value: 1.5 }, { ...ok, minOrderValue: -1 }, { ...ok, endDate: '2026-01-01', startDate: '2026-02-01' }, { ...ok, itemIds: 'x' }, { ...ok, stackable: 'yes' }]) assert.equal(parsePolicy(bad).ok, false, JSON.stringify(bad));
    assert.equal(parsePolicy({ name: 'A', kind: 'amount', value: 500000 }).ok, true);
  });
  it('giá theo nhóm', () => {
    assert.equal(parseGroupPriceBatch({ groupId: 'g', rows: [{ code: 'SP1', price: '1.500' }] }).ok, true);
    for (const bad of [{ rows: [{ code: 'x', price: 1 }] }, { groupId: 'g', rows: [] }, { groupId: 'g', rows: [{ price: 1 }] }, { groupId: 'g', rows: [{ code: 'x', price: -1 }] }, { groupId: 'g', rows: [{ code: 'x', price: 1 }], mode: 'q' }]) assert.equal(parseGroupPriceBatch(bad).ok, false);
    assert.equal(parseGroupPriceUpdate({ price: 1, status: 'active', version: 1 }).ok, true); assert.equal(parseGroupPriceUpdate({ price: 1, status: 'active' }).ok, false);
  });
  it('ưu tiên nhóm 0–1000; tra cứu: tối đa 50 dòng, số lượng nguyên', () => {
    assert.equal(parsePriority({ groupId: 'g', priority: 1000 }).ok, true); assert.equal(parsePriority({ groupId: 'g', priority: 1001 }).ok, false); assert.equal(parsePriority({ groupId: 'g', priority: 1.5 }).ok, false);
    assert.equal(parseEvaluate({ lines: [{ itemId: 'a', quantity: 1 }] }).ok, true); assert.equal(parseEvaluate({ lines: [{ itemId: 'a', quantity: 0 }] }).ok, false); assert.equal(parseEvaluate({ lines: Array.from({ length: 51 }, () => ({ itemId: 'a', quantity: 1 })) }).ok, false);
  });
  it('quyền: chỉ super_admin đặt ưu tiên; director sửa giá nhóm / chiết khấu; manager chỉ xem', () => {
    assert.deepEqual([pricingCan.editPriority({ uid: 'u', role: 'director' }), pricingCan.editPriority({ uid: 'u', role: 'super_admin' }), pricingCan.edit({ uid: 'u', role: 'director' }), pricingCan.edit({ uid: 'u', role: 'manager' }), pricingCan.view({ uid: 'u', role: 'manager' })], [false, true, true, false, true]);
  });
});

import { lineTax, sumTotals, LINE_TOTAL_MAX } from './pricing-core';
describe('thuế', () => {
  it('giá chưa gồm thuế: cộng thuế vào', () => assert.deepEqual(lineTax(1_000_000, 1000, false), { amountBeforeTax: 1_000_000, tax: 100_000, total: 1_100_000 }));
  it('giá đã gồm thuế: tách thuế khỏi giá, tổng phải trả không đổi', () => assert.deepEqual(lineTax(1_100_000, 1000, true), { amountBeforeTax: 1_000_000, tax: 100_000, total: 1_100_000 }));
  it('làm tròn nửa lên', () => { assert.equal(lineTax(5, 1000, false).tax, 1); assert.equal(lineTax(4, 1000, false).tax, 0); assert.equal(lineTax(105, 500, true).tax, 5); assert.equal(lineTax(333, 800, false).tax, 27); });
  it('không thuế / thuế 0 / thiếu thuế suất', () => { for (const bp of [null, 0]) assert.deepEqual(lineTax(777, bp, false), { amountBeforeTax: 777, tax: 0, total: 777 }); });
  it('giá trị cực lớn không mất chính xác (BigInt)', () => { const r = lineTax(LINE_TOTAL_MAX, 1000, false); assert.equal(r.tax, 10_000_000_000_000); assert.equal(r.total, LINE_TOTAL_MAX + r.tax); });
  it('tổng hợp bỏ qua dòng lỗi', () => assert.deepEqual(sumTotals([{ error: null, lineTotal: 100, discount: 10, amountBeforeTax: 90, tax: 9, total: 99 }, { error: 'x', lineTotal: 5, discount: 1, amountBeforeTax: 1, tax: 1, total: 1 }]), { subtotal: 100, discount: 10, amountBeforeTax: 90, tax: 9, total: 99 }));
});
