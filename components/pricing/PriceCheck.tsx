'use client';
import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPercentBp } from '@/lib/catalog-core';
import type { ItemDto } from '@/types/catalog';
import type { EvaluateOut } from '@/types/pricing';
import { Alert, fmtNum, inp, L } from '@/components/ui/form';
import { Denied, errMsg, money } from '@/components/catalog/shared';
import { GroupChips, ItemPicker, SOURCE_LABEL, useGroupList } from './shared';

type Line = { item: ItemDto; qty: string; price: string };
/** Công cụ tính thử: giá áp dụng + chiết khấu cho một khách hàng / nhóm khách hàng giả định */
export default function PriceCheck() {
  const { groups, denied } = useGroupList();
  const [groupIds, setGroupIds] = useState<string[]>([]), [date, setDate] = useState(''), [lines, setLines] = useState<Line[]>([]), [adding, setAdding] = useState<ItemDto[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [out, setOut] = useState<EvaluateOut | null>(null);
  if (denied) return <Denied />;
  const add = () => { setLines(l => [...l, ...adding.filter(a => !l.some(x => x.item.id === a.id)).map(item => ({ item, qty: '1', price: '' }))]); setAdding([]); setOut(null); };
  const upd = (i: number, p: Partial<Line>) => { setLines(l => l.map((x, k) => (k === i ? { ...x, ...p } : x))); setOut(null); };
  async function run() {
    if (busy) return; if (!lines.length) return setErr('Vui lòng thêm ít nhất một mặt hàng.'); if (lines.some(l => !/^\d+$/.test(l.qty) || Number(l.qty) < 1)) return setErr('Số lượng phải là số nguyên từ 1.');
    setBusy(true); setErr(null);
    try { setOut(await api<EvaluateOut>('/api/catalog/discounts/evaluate', { method: 'POST', json: { groupIds, date: date || undefined, lines: lines.map(l => ({ itemId: l.item.id, quantity: Number(l.qty), ...(l.price ? { unitPrice: Number(l.price) } : {}) })) } })); } catch (e) { setErr(errMsg(e, 'Không tính được.')); } finally { setBusy(false); }
  }
  const d = out?.discount;
  return (<div className="space-y-4"><div><h1 className="text-2xl font-bold text-slate-900">Tính thử giá và chiết khấu</h1><p className="text-sm text-slate-500">Chọn nhóm khách hàng và mặt hàng để xem giá nào được áp dụng và chiết khấu nào được tính. Không lưu dữ liệu.</p></div>
    {err && <Alert>{err}</Alert>}
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div><div className="mb-1 text-xs font-medium text-slate-600">Khách hàng thuộc nhóm</div><GroupChips groups={groups} value={groupIds} onChange={v => { setGroupIds(v); setOut(null); }} /></div>
      <L t="Tính theo ngày" hint="Để trống = hôm nay."><input type="date" className={`${inp} max-w-[200px]`} value={date} onChange={e => { setDate(e.target.value); setOut(null); }} /></L>
      <div><div className="mb-1 text-xs font-medium text-slate-600">Thêm mặt hàng</div><ItemPicker value={adding} onChange={setAdding} /><button type="button" disabled={!adding.length} onClick={add} className="mt-2 flex h-9 items-center gap-2 rounded-lg border border-blue-200 px-3 text-sm text-blue-700 disabled:opacity-40"><Plus size={15} />Thêm {adding.length || ''} mặt hàng vào đơn</button></div>
      {lines.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mặt hàng', 'Số lượng', 'Đơn giá nhập tay (tuỳ chọn)', ''].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{lines.map((l, i) => <tr key={l.item.id} className="border-b last:border-0"><td className="p-2"><span className="font-medium">{l.item.code}</span> {l.item.name}</td>
          <td className="p-2"><input aria-label={`Số lượng ${l.item.code}`} inputMode="numeric" value={l.qty} onChange={e => upd(i, { qty: e.target.value.replace(/\D/g, '').slice(0, 7) })} className="h-8 w-24 rounded-md border border-slate-200 px-2 text-right text-sm" /></td>
          <td className="p-2"><input aria-label={`Đơn giá ${l.item.code}`} inputMode="numeric" placeholder="Tự động" value={fmtNum(l.price)} onChange={e => upd(i, { price: e.target.value.replace(/\D/g, '').slice(0, 13) })} className="h-8 w-36 rounded-md border border-slate-200 px-2 text-right text-sm" /></td>
          <td className="p-2"><button aria-label={`Xóa ${l.item.code}`} onClick={() => { setLines(x => x.filter((_, k) => k !== i)); setOut(null); }} className="text-slate-400 hover:text-red-600"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>}
      <button onClick={run} disabled={busy || !lines.length} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}Tính giá</button></div>
    {out && d && <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Kết quả tính giá"><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mặt hàng', 'SL', 'Đơn giá', 'Nguồn giá', 'Thành tiền', 'Chiết khấu', 'Thuế', 'Phải trả'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{out.lines.map(l => <tr key={l.index} className="border-b last:border-0"><td className="p-2"><span className="font-medium">{l.code}</span> {l.name}</td><td className="p-2">{l.quantity}</td>
        {l.error ? <td colSpan={6} className="p-2 text-red-600">{l.error}</td> : <><td className="p-2">{l.unitPrice === null ? '—' : money(l.unitPrice)}</td><td className="p-2">{[l.priceSource ? SOURCE_LABEL[l.priceSource] : '', l.priceSource === 'default' ? '' : l.priceSourceName].filter(Boolean).join(': ')}{l.warning && <div className="text-amber-600">{l.warning}</div>}</td><td className="p-2">{money(l.lineTotal)}</td><td className="p-2">{l.discount ? `-${money(l.discount)}` : '—'}</td><td className="p-2">{l.taxRateBp ? `${formatPercentBp(l.taxRateBp)} · ${money(l.tax)}` : 'Không thuế'}<div className="text-slate-400">{l.taxRateBp ? (l.priceIncludesTax ? 'giá đã gồm thuế' : 'giá chưa gồm thuế') : ''}</div></td><td className="p-2 font-semibold">{money(l.total)}</td></>}</tr>)}</tbody></table></div>
      <div className="grid gap-4 md:grid-cols-2"><div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Chính sách chiết khấu</h3>{d.policies.length === 0 ? <p className="text-xs text-slate-400">Không có chính sách đang hoạt động.</p> : <ul className="space-y-1 text-xs">{d.policies.map(p => <li key={p.policyId} className={p.applicable ? 'text-emerald-700' : 'text-slate-500'}>{p.code} – {p.name}: {d.applied.some(a => a.policyId === p.policyId) ? `áp dụng, -${money(p.discount)}` : p.applicable ? 'đủ điều kiện nhưng không được chọn (đã có chính sách giảm nhiều hơn)' : p.reason}</li>)}</ul>}</div>
        <dl className="space-y-1 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Tạm tính</dt><dd>{money(d.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Tổng chiết khấu ({formatPercentBp(out.discountBp)})</dt><dd>-{money(d.totalDiscount)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Tiền hàng chưa thuế</dt><dd>{money(out.totals.amountBeforeTax)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Thuế</dt><dd>{money(out.totals.tax)}</dd></div><div className="flex justify-between border-t pt-1 text-base font-bold"><dt>Tổng phải trả</dt><dd>{money(out.totals.total)}</dd></div></dl></div>
      <p className={`rounded-lg p-3 text-xs ${out.needsApproval ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'}`}>Hạn mức chiết khấu của vai trò bạn: {formatPercentBp(out.limitBp)}. {out.needsApproval ? 'Mức chiết khấu này vượt hạn mức nên cần được phê duyệt.' : 'Mức chiết khấu nằm trong hạn mức.'}</p></div>}</div>);
}
