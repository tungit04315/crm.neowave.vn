'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listLeads } from '@/lib/leads';
import { LEAD_COLOR, LEAD_STATUS, type Lead } from '@/types/lead';

const PAGE = 10;
export default function LeadsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Lead[] | null>(null); const [error, setError] = useState(false);
  const [q, setQ] = useState(''); const [st, setSt] = useState(''); const [page, setPage] = useState(0);
  useEffect(() => { if (profile) listLeads(profile.organizationId).then(setRows).catch(() => setError(true)); }, [profile]);
  const all = rows ?? [];
  const list = useMemo(() => all.filter(l => (!st || l.status === st) && (!q || [l.name, l.code, l.contactName, l.phone, l.email].some(x => x?.toLowerCase().includes(q.toLowerCase())))), [all, q, st]);
  const conv = all.filter(l => l.status === 'converted').length;
  const stats = [['Tổng Lead', all.length], ['Lead mới', all.filter(l => l.status === 'new').length], ['Đang liên hệ', all.filter(l => l.status === 'contacting').length],
    ['Đã chuyển đổi', conv], ['Tỷ lệ chuyển đổi', `${all.length ? Math.round(conv * 100 / all.length) : 0}%`]];
  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Khách hàng tiềm năng (Lead)</h1>
      <p className="text-sm text-slate-500">Tiếp nhận, theo dõi và chuyển đổi Lead thành khách hàng.</p></div>
      <div className="flex gap-2"><Link href="/customers" className="flex h-9 items-center rounded-lg border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700">Danh sách khách hàng</Link>
        <Link href="/leads/new" className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Tiếp nhận Lead</Link></div></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{stats.map(([l, n]) => <div key={l as string} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><b className="text-2xl">{n}</b></div>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[240px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Tìm theo tên, mã, người liên hệ, SĐT, email…" className="h-9 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
        <select className="h-9 rounded-lg border border-slate-200 px-3 text-xs" value={st} onChange={e => { setSt(e.target.value); setPage(0); }}><option value="">Tất cả trạng thái</option>{Object.entries(LEAD_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs">
        <thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã Lead', 'Khách hàng', 'Người liên hệ', 'Điện thoại', 'Email', 'Nguồn', 'Nhu cầu', 'Phụ trách', 'Trạng thái', 'Ngày tạo'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{list.slice(page * PAGE, page * PAGE + PAGE).map(l => (<tr key={l.id} className="border-b last:border-0 hover:bg-slate-50">
          <td className="p-2 font-medium">{l.code}</td><td className="p-2"><Link href={`/leads/${l.id}`} className="font-semibold text-blue-700 hover:underline">{l.name}</Link></td>
          <td className="p-2">{l.contactName || '—'}</td><td className="p-2">{l.phone || '—'}</td><td className="p-2">{l.email || '—'}</td><td className="p-2">{l.source}</td>
          <td className="max-w-[160px] truncate p-2">{l.need || '—'}</td><td className="p-2">{l.ownerName}</td>
          <td className="p-2"><span className={`rounded-full px-2 py-0.5 ${LEAD_COLOR[l.status]}`}>{LEAD_STATUS[l.status]}</span></td>
          <td className="p-2">{l.createdAt?.toDate().toLocaleDateString('vi-VN')}</td></tr>))}</tbody></table>
        {rows === null && !error && <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p>}
        {error && <p className="p-6 text-center text-sm text-red-500">Không tải được dữ liệu. Kiểm tra Firestore Rules.</p>}
        {rows && list.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Chưa có Lead nào.</p>}</div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{list.length} Lead</span><span className="flex gap-2">
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Trước</button>
        <button disabled={(page + 1) * PAGE >= list.length} onClick={() => setPage(p => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Sau</button></span></div></div></div>);
}
