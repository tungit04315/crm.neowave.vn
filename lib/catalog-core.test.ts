import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, diffItem, docId, formatCode, matchesTokens, parseCategory, parseItemCreate, parseItemInput, parsePrice, parsePriceChange, parseTax, parseUnit,
  planPriceChange, priceDelta, queryTokens, searchTokens, symbolKey, type ItemInput,
} from './catalog-core';

const valid = { type: 'product', name: ' Máy in A4 ', categoryId: 'c1', unitId: 'u1', defaultPrice: 1500000 };
const A = (role: string, uid = 'u') => ({ uid, role });
const item: ItemInput = { name: 'A', categoryId: 'c1', unitId: 'u1', shortDescription: '', description: '', taxRateId: null, priceIncludesTax: false, status: 'active', note: '' };

describe('phân quyền (ma trận giả định)', () => {
  it('xem: 4 vai trò theo đặc tả; 3 vai trò còn lại không', () => {
    for (const r of ['super_admin', 'director', 'manager', 'sales']) assert.equal(can.view(A(r)), true);
    for (const r of ['operations', 'accountant', 'customer_service', 'khac']) assert.equal(can.view(A(r)), false);
  });
  it('sales không sửa danh mục, không xuất', () => {
    assert.equal(can.edit(A('sales')), false); assert.equal(can.export(A('sales')), false); assert.equal(can.edit(A('manager')), true);
  });
  it('thuế chỉ super_admin / director', () => {
    assert.equal(can.editTax(A('manager')), false); assert.equal(can.editTax(A('director')), true);
  });
  it('người duyệt không tự duyệt yêu cầu của mình', () => {
    assert.equal(can.approvePrice(A('director', 'x'), { requestedBy: 'x' }), false);
    assert.equal(can.approvePrice(A('director', 'x'), { requestedBy: 'y' }), true);
    assert.equal(can.approvePrice(A('manager', 'x'), { requestedBy: 'y' }), false);
  });
});

describe('quy trình đổi giá', () => {
  it('cùng giá → none', () => assert.equal(planPriceChange(A('director'), 100, 100), 'none'));
  it('director / super_admin đổi trực tiếp', () => { assert.equal(planPriceChange(A('director'), 100, 200), 'direct'); assert.equal(planPriceChange(A('super_admin'), 100, 0), 'direct'); });
  it('manager phải gửi yêu cầu', () => assert.equal(planPriceChange(A('manager'), 100, 200), 'request'));
  it('sales và vai trò khác bị từ chối', () => { assert.equal(planPriceChange(A('sales'), 100, 200), 'forbidden'); assert.equal(planPriceChange(A('accountant'), 1, 2), 'forbidden'); });
  it('chênh lệch và tỷ lệ theo điểm cơ bản', () => {
    assert.deepEqual(priceDelta(1000, 1100), { diff: 100, pctBp: 1000 });
    assert.deepEqual(priceDelta(1000, 900), { diff: -100, pctBp: -1000 });
    assert.deepEqual(priceDelta(0, 500), { diff: 500, pctBp: null });
  });
  it('kiểm tra dữ liệu đổi giá: bắt buộc lý do và giá hiện tại', () => {
    assert.equal(parsePriceChange({ newPrice: 10, expectedPrice: 5, reason: ' ' }).ok, false);
    assert.equal(parsePriceChange({ newPrice: 10, reason: 'x' }).ok, false);
    assert.deepEqual(parsePriceChange({ newPrice: '1.000', expectedPrice: 5, reason: ' tăng giá ' }), { ok: true, value: { newPrice: 1000, expectedPrice: 5, reason: 'tăng giá' } });
  });
});

describe('giá VND', () => {
  it('chấp nhận số nguyên và chuỗi có dấu phân cách', () => {
    assert.deepEqual(parsePrice(0), { ok: true, value: 0 }); assert.deepEqual(parsePrice('1.250.000'), { ok: true, value: 1250000 });
  });
  it('từ chối số âm, số thực, NaN, chữ, quá lớn', () => {
    for (const v of ['1.5', '1,5', '1.500,50', '12.34', '1..000', -1, 1.5, NaN, Infinity, 'abc', '-5', '', null, undefined, {}, 10_000_000_000_000]) assert.equal(parsePrice(v).ok, false, String(v));
  });
});

describe('kiểm tra sản phẩm / dịch vụ', () => {
  it('tạo hợp lệ, cắt khoảng trắng, mặc định đang kinh doanh, thuế rỗng', () => {
    const r = parseItemCreate(valid); assert.equal(r.ok, true);
    if (r.ok) { assert.equal(r.value.name, 'Máy in A4'); assert.equal(r.value.status, 'active'); assert.equal(r.value.taxRateId, null); assert.equal(r.value.priceIncludesTax, false); }
  });
  it('giá mặc định không nhập → 0', () => { const r = parseItemCreate({ ...valid, defaultPrice: undefined }); assert.equal(r.ok && r.value.defaultPrice, 0); });
  it('thiếu / sai trường bắt buộc', () => {
    for (const bad of [{ ...valid, name: ' ' }, { ...valid, type: 'x' }, { ...valid, categoryId: '' }, { ...valid, unitId: '' }, { ...valid, status: 'zzz' },
      { ...valid, priceIncludesTax: 'yes' }, { ...valid, name: 'a'.repeat(201) }, { ...valid, defaultPrice: -1 }]) assert.equal(parseItemCreate(bad).ok, false, JSON.stringify(bad));
  });
  it('cập nhật KHÔNG nhận giá hay loại (đổi giá phải qua quy trình đổi giá)', () => {
    const r = parseItemInput({ ...valid, defaultPrice: 999 }); assert.equal(r.ok, true);
    if (r.ok) { assert.equal('defaultPrice' in r.value, false); assert.equal('type' in r.value, false); }
  });
  it('so sánh thay đổi dùng tên hiển thị', () => {
    const after = { ...item, categoryId: 'c2', status: 'inactive' as const, priceIncludesTax: true };
    const names = { c1: 'Nhóm 1', c2: 'Nhóm 2' } as Record<string, string>;
    const ch = diffItem(item, after, (_k, id) => (id ? names[id] ?? id : '—'));
    assert.deepEqual(ch.map(c => [c.field, c.from, c.to]), [['categoryId', 'Nhóm 1', 'Nhóm 2'], ['priceIncludesTax', 'Không', 'Có'], ['status', 'Đang kinh doanh', 'Ngừng kinh doanh']]);
    assert.deepEqual(diffItem(item, { ...item }, () => ''), []);
  });
});

describe('nhóm, đơn vị, thuế', () => {
  it('nhóm: màu hợp lệ, mặc định xanh', () => {
    assert.equal(parseCategory({ name: 'A', color: 'red' }).ok, false);
    const r = parseCategory({ name: 'A' }); assert.equal(r.ok && r.value.color, '#2563eb');
  });
  it('đơn vị: ký hiệu bắt buộc; khóa duy nhất không phân biệt hoa thường/dấu', () => {
    assert.equal(parseUnit({ name: 'Cái', symbol: '' }).ok, false); assert.equal(parseUnit({ name: 'x', symbol: '%%' }).ok, false);
    assert.equal(symbolKey('Tháng'), symbolKey(' thang ')); assert.notEqual(symbolKey('SP'), symbolKey('DV'));
  });
  it('thuế: nhận phần trăm hoặc điểm cơ bản, 0–100%, tối đa 2 số lẻ; không có mặc định', () => {
    assert.deepEqual(parseTax({ name: 'T', ratePercent: 8 }), { ok: true, value: { name: 'T', rateBp: 800, status: 'active' } });
    assert.deepEqual(parseTax({ name: 'T', ratePercent: 5.25 }), { ok: true, value: { name: 'T', rateBp: 525, status: 'active' } });
    assert.equal(parseTax({ name: 'T', rateBp: 0 }).ok, true);
    for (const bad of [{ name: 'T' }, { name: 'T', ratePercent: 101 }, { name: 'T', ratePercent: -1 }, { name: 'T', ratePercent: 1.234 }, { name: '', rateBp: 1 }]) assert.equal(parseTax(bad).ok, false, JSON.stringify(bad));
  });
});

describe('mã và tìm kiếm', () => {
  it('mã tự sinh và id tài liệu', () => { assert.equal(formatCode('SP', 7, 5), 'SP00007'); assert.equal(formatCode('NSP', 12, 3), 'NSP012'); assert.equal(docId('org1', 'SP00007'), 'org1_SP00007'); });
  it('tìm theo tiền tố của BẤT KỲ từ nào, không phân biệt dấu', () => {
    const have = searchTokens('SP00007', 'Thiết kế website');
    for (const q of ['web', 'thiet', 'TK', 'sp0000', 'website thiet', 'đế']) {
      const want = queryTokens(q); if (q === 'TK' || q === 'đế') assert.equal(matchesTokens(have, want), false, q); else assert.equal(matchesTokens(have, want), true, q);
    }
  });
  it('từ khóa dài hơn 12 ký tự được cắt khi lưu và khi tìm', () => {
    const have = searchTokens('Chuyểnđổisốdoanhnghiệp'); assert.equal(matchesTokens(have, queryTokens('chuyendoisodoanhnghiep')), true);
  });
  it('truy vấn rỗng → không có từ khóa', () => assert.deepEqual(queryTokens('  !!  '), []));
});

import { exportMatrix, importTemplate, parseImportRows, type ImportRefs } from './catalog-io-core';
describe('nhập / xuất: lõi', () => {
  const refs: ImportRefs = { categories: [{ id: 'c1', name: 'Thiết bị', type: 'product' }, { id: 'c2', name: 'Tư vấn', type: 'service' }], units: [{ id: 'u1', name: 'Cái' }, { id: 'u2', name: 'Giờ' }], taxRates: [{ id: 't1', name: 'VAT 8%' }] };
  const H = importTemplate()[0], M = (...r: unknown[][]) => [H, ...r];
  it('dòng hợp lệ: nhận tên không phân biệt dấu/hoa thường; thuế, giá, trạng thái', () => {
    const r = parseImportRows(M(['sản phẩm', 'Máy in', 'thiet bi', 'CÁI', '1.500.000', 'vat 8%', 'Có', 'Ngừng kinh doanh', '', '', '']), refs);
    assert.equal(r.rows[0].status, 'valid'); assert.deepEqual(r.rows[0].data && [r.rows[0].data.categoryId, r.rows[0].data.unitId, r.rows[0].data.taxRateId, r.rows[0].data.defaultPrice, r.rows[0].data.priceIncludesTax, r.rows[0].data.status], ['c1', 'u1', 't1', 1500000, true, 'inactive']);
  });
  it('lỗi rõ ràng: nhóm sai loại, đơn vị lạ, giá âm/thập phân, loại sai, thiếu tên', () => {
    const r = parseImportRows(M(['Dịch vụ', 'X', 'Thiết bị', 'Cái', '', '', '', '', '', '', ''], ['Sản phẩm', 'Y', 'Thiết bị', 'Lạ', '', '', '', '', '', '', ''], ['Sản phẩm', 'Z', 'Thiết bị', 'Cái', '-5', '', '', '', '', '', ''],
      ['Sản phẩm', 'Z', 'Thiết bị', 'Cái', '1.5', '', '', '', '', '', ''], ['Hàng', 'W', 'Thiết bị', 'Cái', '', '', '', '', '', '', ''], ['Sản phẩm', '', 'Thiết bị', 'Cái', '', '', '', '', '', '', '']), refs);
    assert.deepEqual(r.rows.map(x => x.status), ['error', 'error', 'error', 'error', 'error', 'error']); assert.ok(r.rows.every(x => x.data === null && x.messages.length));
  });
  it('trùng tên + đơn vị trong tệp → dup; bỏ qua dòng trống; số dòng tính từ 2', () => {
    const r = parseImportRows(M(['Sản phẩm', 'A', 'Thiết bị', 'Cái', '', '', '', '', '', '', ''], [], ['Sản phẩm', ' a ', 'Thiết bị', 'Cái', '', '', '', '', '', '', ''], ['Sản phẩm', 'A', 'Thiết bị', 'Giờ', '', '', '', '', '', '', '']), refs);
    assert.deepEqual(r.rows.map(x => [x.line, x.status]), [[2, 'valid'], [4, 'dup'], [5, 'valid']]);
  });
  it('thiếu cột bắt buộc / tệp rỗng / quá nhiều dòng', () => {
    assert.match(parseImportRows([['Tên'], ['A']], refs).error ?? '', /Thiếu cột/); assert.ok(parseImportRows([H], refs).error);
    assert.ok(parseImportRows([H, ...Array.from({ length: 2001 }, () => ['Sản phẩm', 'A', 'Thiết bị', 'Cái'])], refs).error);
  });
  it('xuất chống chèn công thức', () => {
    const m = exportMatrix([{ code: 'SP1', type: 'product', name: '=cmd()', categoryName: 'N', unitName: 'Cái', defaultPrice: 5, taxRateName: '', priceIncludesTax: false, status: 'active', shortDescription: '@x', note: '', updatedAt: '' } as never]);
    assert.equal(m[1][2], "'=cmd()"); assert.equal(m[1][9], "'@x");
  });
});

import { adjustPrice, exportPriceListMatrix, listCan, parsePriceMatrix, parsePriceList, parseUpsert, stateOf, todayVn } from './price-list-core';
describe('bảng giá: lõi', () => {
  it('trạng thái hiệu lực theo ngày (so sánh cả ngày đầu / ngày cuối)', () => {
    const t = '2026-06-15', s = (status: 'active' | 'inactive', startDate: string | null, endDate: string | null) => stateOf({ status, startDate, endDate }, t);
    assert.deepEqual([s('active', null, null), s('active', t, t), s('active', '2026-06-16', null), s('active', null, '2026-06-14'), s('inactive', null, null)], ['current', 'current', 'upcoming', 'expired', 'inactive']);
  });
  it('ngày hôm nay theo giờ Việt Nam (UTC+7)', () => { assert.equal(todayVn(new Date('2026-06-14T18:30:00Z')), '2026-06-15'); assert.equal(todayVn(new Date('2026-06-14T16:59:00Z')), '2026-06-14'); });
  it('kiểm tra bảng giá: ngày lịch không tồn tại, ngày kết thúc < bắt đầu, nhóm trùng được gộp', () => {
    assert.equal(parsePriceList({ name: 'A', type: 'standard', startDate: '2026-02-30' }).ok, false);
    assert.equal(parsePriceList({ name: 'A', type: 'standard', startDate: '2026-02-10', endDate: '2026-02-09' }).ok, false);
    const r = parsePriceList({ name: 'A', type: 'standard', customerGroupIds: ['g', 'g'] }); assert.deepEqual(r.ok && r.value.customerGroupIds, ['g']);
  });
  it('dữ liệu giá hàng loạt: giá nguyên không âm, cần itemId hoặc mã, tối đa 100 dòng', () => {
    assert.equal(parseUpsert({ rows: [{ price: 1 }] }).ok, false); assert.equal(parseUpsert({ rows: [{ code: 'SP1', price: 1.5 }] }).ok, false); assert.equal(parseUpsert({ rows: [{ code: 'SP1', price: '1.500' }] }).ok, true);
    assert.equal(parseUpsert({ rows: [] }).ok, false); assert.equal(parseUpsert({ rows: [{ code: 'SP1', price: 1, expectedPrice: -3 }] }).ok, false);
  });
  it('điều chỉnh giá theo %: làm tròn và không âm', () => { assert.equal(adjustPrice(1000, 1000), 1100); assert.equal(adjustPrice(1000, -10000), 0); assert.equal(adjustPrice(1234, 500, 1000), 1000); assert.equal(adjustPrice(1999, -1, 1), 1999); });
  it('quyền bảng giá', () => { assert.equal(listCan.edit({ uid: 'u', role: 'manager' }), false); assert.equal(listCan.edit({ uid: 'u', role: 'director' }), true); assert.equal(listCan.view({ uid: 'u', role: 'sales' }), true); });
});

describe('bảng giá: nhập giá từ tệp', () => {
  it('nhận cột theo tên (không dấu), mã viết thường, giá có phân cách nghìn; báo lỗi từng dòng', () => {
    const r = parsePriceMatrix([['Mã', 'Giá bán'], ['sp00001', '1.500.000'], ['SP00002', 'abc'], ['SP00001', 5], [], ['', 7]]);
    assert.deepEqual(r.rows.map(x => [x.line, x.code, x.price, !!x.error]), [[2, 'SP00001', 1500000, false], [3, 'SP00002', null, true], [4, 'SP00001', null, true], [6, '', null, true]]);
  });
  it('thiếu cột / tệp rỗng / quá lớn', () => {
    assert.ok(parsePriceMatrix([['Mã'], ['SP1']]).error); assert.ok(parsePriceMatrix([['Mã', 'Giá']]).error); assert.ok(parsePriceMatrix([['Mã', 'Giá'], ...Array.from({ length: 2001 }, () => ['SP1', '1'])]).error);
  });
  it('xuất chống chèn công thức', () => {
    const m = exportPriceListMatrix([{ itemId: 'x', code: 'SP1', name: '=1+1', type: 'product', categoryName: 'N', unitName: 'Cái', taxText: '', itemStatus: 'active', defaultPrice: 5, price: 4, updatedAt: '', updatedByName: '' }]);
    assert.equal(m[1][1], "'=1+1"); assert.equal(m[1][6], '4');
  });
});
