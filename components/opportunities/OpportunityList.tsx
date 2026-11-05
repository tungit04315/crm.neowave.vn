'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Plus, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, download, ApiError } from '@/lib/api';
import { compactVnd, computeStats, formatDate, formatVnd, STATUS_LABEL } from '@/lib/opportunity-core';
import type { OpportunityDto } from '@/types/opportunity';
import { StatusBadge, today } from './ui';

export type View = 'all' | 'mine' | 'won' | 'lost';
const TITLE: Record<View, [string, string]> = { all: ['Tất cả cơ hội', 'Toàn bộ cơ hội trong phạm vi dữ liệu của bạn.'], mine: ['Cơ hội của tôi', 'Các cơ hội bạn đang phụ trách.'], won: ['Cơ hội thành công', 'Các cơ hội đã chốt thành công.'], lost: ['Cơ hội thất bại', 'Các cơ hội đã thất bại kèm lý do.'] };
const PAGE = 10;

export default function OpportunityList({ view }: { view: View }) {
  const { profile } = useAuth();
  const [data, setData] = useState<{ items: OpportunityDto[]; truncated: boolean; can: { create: boolean; export: boolean } } | null>(null); const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [owner, setOwner] = useState(''); const [page, setPage] = useState(0); const [exporting, setExporting] = useState(false);
  useEffect(() => { api<NonNullable<typeof data>>('/api/opportunities').then(setData).catch(e => setErr(e instanceof ApiError ? e.message : 'Không tải được dữ liệu.')); }, []);

  const base = useMemo(() => (data?.items ?? []).filter(o => view === 'won' ? o.status === 'won' : view === 'lost' ? o.status === 'lost' : view === 'mine' ? o.ownerUid === profile?.uid : true), [data, view, profile]);
  const owners = useMemo(() => [...new Map(base.map(o => [o.ownerUid, o.ownerName])).entries()], [base]);
  const list = useMemo(() => base.filter(o => (!status || o.status === status) && (!owner || o.ownerUid === owner) &&
    (!q || [o.title, o.code, o.customerName, o.customerCode].some(x => x.toLowerCase().includes(q.toLowerCase())))), [base, status, owner, q]);
  const st = computeStats(base);
  const cards: [string, string, string?][] = [['Tổng cơ hội', String(st.total)], ['Đang mở', String(st.open)], ['Giá trị đang mở', compactVnd(st.openValue)], ['Thành công', String(st.won), compactVnd(st.wonValue)], ['Thất bại', String(st.lost)], ['Tỷ lệ thắng', `${st.winRate}%`]];
  const sc = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs';
  async function exportCsv() { setExporting(true); try { await download('/api/opportunities/export', `co-hoi-${today()}.csv`); } catch (e) { alert(e instanceof ApiError ? e.message : 'Không xuất được dữ liệu.'); } finally { setExporting(false); } }

  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">{TITLE[view][0]}</h1><p className="text-sm text-slate-500">{TITLE[view][1]}</p></div>
      <div className="flex gap-2">{data?.can.export && <button onClick={exportCsv} disabled={exporting} className="flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 disabled:opacity-60"><Download size={15} />Xuất CSV</button>}
        {data?.can.create && <Link href="/opportunities/new" className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Tạo cơ hội</Link>}</div></div>
    {err && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{cards.map(([l, v, s]) => <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><b className="text-2xl">{v}</b>{s && <div className="text-xs text-emerald-600">{s}</div>}</div>)}</div>
    {data?.truncated && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">Chỉ hiển thị 1.000 cơ hội mới nhất trong phạm vi của bạn. Hãy dùng bộ lọc hoặc liên hệ quản trị để mở rộng.</p>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Tìm theo tên, mã cơ hội, khách hàng…" className="h-9 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
        {(view === 'all' || view === 'mine') && <select className={sc} value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">Tất cả trạng thái</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
        {owners.length > 1 && view !== 'mine' && <select className={sc} value={owner} onChange={e => { setOwner(e.target.value); setPage(0); }}><option value="">Tất cả người phụ trách</option>{owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1020px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Cơ hội', 'Khách hàng', 'Giai đoạn', 'Giá trị', 'XS', 'Dự kiến chốt', 'Phụ trách', 'Trạng thái'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{list.slice(page * PAGE, page * PAGE + PAGE).map(o => { const late = o.status === 'open' && o.expectedCloseDate && o.expectedCloseDate < today();
          return (<tr key={o.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2 font-medium">{o.code}</td>
            <td className="max-w-[240px] p-2"><Link href={`/opportunities/${o.id}`} className="block truncate font-semibold text-blue-700 hover:underline">{o.title}</Link></td>
            <td className="max-w-[200px] truncate p-2"><Link href={`/customers/${o.customerId}`} className="hover:underline">{o.customerName}</Link></td>
            <td className="whitespace-nowrap p-2">{o.status === 'open' ? o.stageName : '—'}</td><td className="whitespace-nowrap p-2 font-semibold">{formatVnd(o.value)}</td><td className="p-2">{o.probability}%</td>
            <td className={`whitespace-nowrap p-2 ${late ? 'font-medium text-red-600' : ''}`}>{formatDate(o.expectedCloseDate)}{late ? ' (trễ)' : ''}</td><td className="p-2">{o.ownerName}</td><td className="p-2"><StatusBadge s={o.status} /></td></tr>); })}</tbody></table>
        {!data && !err && <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p>}
        {data && list.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Chưa có cơ hội nào.</p>}</div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{list.length} cơ hội</span><span className="flex gap-2">
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Trước</button>
        <button disabled={(page + 1) * PAGE >= list.length} onClick={() => setPage(p => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Sau</button></span></div></div></div>);
}
