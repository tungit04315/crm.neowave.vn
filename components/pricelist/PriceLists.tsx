'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Download, Eye, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadXlsx, stamp } from '@/lib/customer-io';
import { LIST_STATE_LABEL, LIST_TYPE_LABEL } from '@/lib/price-list-core';
import type { PriceListDto } from '@/types/price-list';
import { Alert, newRequestId } from '@/components/ui/form';
import { Denied, errMsg, useApiData } from '@/components/catalog/shared';
import { period, StateBadge } from './shared';

const sel = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs';
/** Danh sách bảng giá (10.2.1): tìm theo tên/mã, lọc trạng thái và thời gian hiệu lực */
export default function PriceLists() {
  const router = useRouter(); const [q, setQ] = useState(''); const [state, setState] = useState(''); const [on, setOn] = useState('');
  const { data, err, denied, loading, reload } = useApiData<{ items: PriceListDto[]; can: { edit: boolean; export: boolean } }>('/api/catalog/price-lists');
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const rows = useMemo(() => (data?.items ?? []).filter(l => (!state || l.state === state) && (!q || `${l.code} ${l.name}`.toLowerCase().includes(q.toLowerCase()))
    && (!on || ((!l.startDate || l.startDate <= on) && (!l.endDate || l.endDate >= on)))), [data, q, state, on]);
  if (denied) return <Denied />;
  async function act(fn: () => Promise<unknown>, fallback: string) { if (busy) return; setBusy(true); setMsg(null); try { await fn(); reload(); } catch (e) { setMsg(errMsg(e, fallback)); reload(); } finally { setBusy(false); } }
  const dup = (l: PriceListDto) => confirm(`Nhân bản “${l.name}” kèm ${l.itemCount} mặt hàng?`) && act(async () => { const r = await api<{ id: string }>(`/api/catalog/price-lists/${l.id}/duplicate`, { method: 'POST', json: { requestId: newRequestId() } }); router.push(`/products/price-lists/${r.id}`); }, 'Không nhân bản được.');
  const toggle = (l: PriceListDto) => act(() => api(`/api/catalog/price-lists/${l.id}/status`, { method: 'POST', json: { status: l.status === 'active' ? 'inactive' : 'active', version: l.version } }), 'Không đổi được trạng thái.');
  const del = (l: PriceListDto) => confirm(`Xóa bảng giá “${l.name}”? Thao tác này không hoàn tác được trên giao diện.`) && act(() => api(`/api/catalog/price-lists/${l.id}`, { method: 'DELETE', json: { version: l.version } }), 'Không xóa được bảng giá.');
  const exportList = () => downloadXlsx([['Mã', 'Tên bảng giá', 'Loại', 'Phạm vi', 'Ngày bắt đầu', 'Ngày kết thúc', 'Số mặt hàng', 'Trạng thái', 'Người tạo'], ...rows.map(l => [l.code, l.name, LIST_TYPE_LABEL[l.type], l.customerGroupNames.join(', ') || l.scopeNote, l.startDate ?? '', l.endDate ?? '', String(l.itemCount), LIST_STATE_LABEL[l.state], l.createdByName])], `bang-gia-${stamp()}.xlsx`).catch(() => setMsg('Không xuất được tệp.'));
  const ib = 'text-slate-500 hover:text-blue-600 disabled:opacity-40';
  return (<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Bảng giá</h1><p className="text-sm text-slate-500">Quản lý các bảng giá theo chính sách kinh doanh.</p></div>
    <div className="flex flex-wrap gap-2">{data?.can.export && <button onClick={exportList} className="flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700"><Download size={15} />Xuất Excel</button>}
      {data?.can.edit && <Link href="/products/price-lists/new" className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Tạo bảng giá</Link>}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo mã hoặc tên bảng giá…" aria-label="Tìm bảng giá" className="h-9 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
        <select aria-label="Lọc trạng thái" value={state} onChange={e => setState(e.target.value)} className={sel}><option value="">Tất cả trạng thái</option>{Object.entries(LIST_STATE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="flex items-center gap-2 text-xs text-slate-500">Hiệu lực tại ngày<input type="date" value={on} onChange={e => setOn(e.target.value)} className={sel} /></label></div>
      {(msg || err) && <div className="mb-3"><Alert>{msg ?? err}</Alert></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Tên bảng giá', 'Loại', 'Phạm vi', 'Thời gian hiệu lực', 'Số mặt hàng', 'Trạng thái', 'Người tạo', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(l => (<tr key={l.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2 font-medium">{l.code}</td><td className="p-2"><Link href={`/products/price-lists/${l.id}`} className="font-semibold text-blue-700 hover:underline">{l.name}</Link></td>
          <td className="p-2">{LIST_TYPE_LABEL[l.type]}</td><td className="max-w-[200px] truncate p-2 text-slate-600">{l.customerGroupNames.join(', ') || l.scopeNote || '—'}</td><td className="p-2 whitespace-nowrap">{period(l.startDate, l.endDate)}</td>
          <td className="p-2">{l.itemCount}</td><td className="p-2"><StateBadge s={l.state} /></td><td className="p-2">{l.createdByName}</td>
          <td className="p-2"><span className="flex gap-3"><Link href={`/products/price-lists/${l.id}`} aria-label={`Xem ${l.code}`} className={ib}><Eye size={15} /></Link>
            {data?.can.edit && <><Link href={`/products/price-lists/${l.id}/edit`} aria-label={`Sửa ${l.code}`} className={ib}><Pencil size={15} /></Link><button disabled={busy} onClick={() => dup(l)} aria-label={`Nhân bản ${l.code}`} className={ib}><Copy size={15} /></button>
              <button disabled={busy} onClick={() => toggle(l)} aria-label={l.status === 'active' ? `Ngừng ${l.code}` : `Kích hoạt ${l.code}`} title={l.status === 'active' ? 'Ngừng hoạt động' : 'Kích hoạt'} className={ib}><Power size={15} /></button>
              {l.status === 'inactive' && <button disabled={busy} onClick={() => del(l)} aria-label={`Xóa ${l.code}`} className={`${ib} hover:!text-red-600`}><Trash2 size={15} /></button>}</>}</span></td></tr>))}</tbody></table>
        {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{data?.items.length ? 'Không có bảng giá nào khớp bộ lọc.' : 'Chưa có bảng giá nào.'}</p>}</div></div></div>);
}
