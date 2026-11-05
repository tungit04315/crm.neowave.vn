'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Pencil, Plus, Power } from 'lucide-react';
import { api } from '@/lib/api';
import { LIST_STATE_LABEL } from '@/lib/price-list-core';
import type { DiscountPolicyDto } from '@/types/pricing';
import { Alert } from '@/components/ui/form';
import { Denied, errMsg, money, useApiData } from '@/components/catalog/shared';
import { period, StateBadge } from '@/components/pricelist/shared';
import { discountText, sel } from './shared';

export const scopeText = (p: DiscountPolicyDto) => [p.customerGroupNames.length ? `Nhóm KH: ${p.customerGroupNames.join(', ')}` : '', p.itemNames.length ? `${p.itemNames.length} mặt hàng` : '', p.categoryNames.length ? `Nhóm hàng: ${p.categoryNames.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Tất cả';
/** Danh sách chính sách chiết khấu */
export default function Discounts() {
  const [q, setQ] = useState(''), [state, setState] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const { data, err, denied, loading, reload } = useApiData<{ items: DiscountPolicyDto[]; can: { edit: boolean } }>('/api/catalog/discounts');
  const rows = useMemo(() => (data?.items ?? []).filter(p => (!state || p.state === state) && (!q || `${p.code} ${p.name}`.toLowerCase().includes(q.toLowerCase()))), [data, q, state]);
  if (denied) return <Denied />;
  async function toggle(p: DiscountPolicyDto) {
    if (busy) return; setBusy(true); setMsg(null);
    try { await api(`/api/catalog/discounts/${p.id}/status`, { method: 'POST', json: { status: p.status === 'active' ? 'inactive' : 'active', version: p.version } }); } catch (e) { setMsg(errMsg(e, 'Không đổi được trạng thái.')); } finally { setBusy(false); reload(); }
  }
  const ib = 'text-slate-500 hover:text-blue-600 disabled:opacity-40';
  return (<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Chính sách chiết khấu</h1><p className="text-sm text-slate-500">Chiết khấu theo nhóm khách hàng, mặt hàng, nhóm hàng và giá trị đơn hàng.</p></div>
    {data?.can.edit && <Link href="/products/discounts/new" className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Tạo chính sách</Link>}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo mã hoặc tên…" aria-label="Tìm chính sách" className="h-9 min-w-[220px] flex-1 rounded-lg bg-slate-100 px-3 text-sm outline-none" />
      <select aria-label="Lọc trạng thái" value={state} onChange={e => setState(e.target.value)} className={sel}><option value="">Tất cả trạng thái</option>{Object.entries(LIST_STATE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      {(msg || err) && <div className="mb-3"><Alert>{msg ?? err}</Alert></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Tên chính sách', 'Mức chiết khấu', 'Cộng dồn', 'Phạm vi', 'Đơn tối thiểu', 'Thời gian hiệu lực', 'Trạng thái', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(p => (<tr key={p.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2 font-medium">{p.code}</td><td className="p-2"><Link href={`/products/discounts/${p.id}`} className="font-semibold text-blue-700 hover:underline">{p.name}</Link></td>
          <td className="p-2 font-semibold">{discountText(p)}</td><td className="p-2">{p.stackable ? 'Có' : 'Không'}</td><td className="max-w-[240px] truncate p-2 text-slate-600">{scopeText(p)}</td><td className="p-2">{p.minOrderValue ? money(p.minOrderValue) : '—'}</td>
          <td className="p-2 whitespace-nowrap">{period(p.startDate, p.endDate)}</td><td className="p-2"><StateBadge s={p.state} /></td>
          <td className="p-2"><span className="flex gap-3"><Link href={`/products/discounts/${p.id}`} aria-label={`Xem ${p.code}`} className={ib}><Eye size={15} /></Link>
            {data?.can.edit && <><Link href={`/products/discounts/${p.id}/edit`} aria-label={`Sửa ${p.code}`} className={ib}><Pencil size={15} /></Link><button disabled={busy} onClick={() => toggle(p)} aria-label={p.status === 'active' ? `Ngừng ${p.code}` : `Kích hoạt ${p.code}`} className={ib}><Power size={15} /></button></>}</span></td></tr>))}</tbody></table>
        {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{data?.items.length ? 'Không có chính sách nào khớp bộ lọc.' : 'Chưa có chính sách chiết khấu nào.'}</p>}</div></div></div>);
}
