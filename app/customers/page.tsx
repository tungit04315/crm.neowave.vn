'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Pencil, Plus, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listCustomers } from '@/lib/customers';
import ImportExport from '@/components/customers/ImportExport';
import { listGroups, listMembers } from '@/lib/groups';
import type { CustomerGroup } from '@/types/group';
import { type Customer, STATUS_LABEL, TYPE_LABEL } from '@/types/customer';

const PAGE = 10;
export default function CustomersPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Customer[] | null>(null); const [error, setError] = useState(false);
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [status, setStatus] = useState('');
  const [page, setPage] = useState(0); const [sel, setSel] = useState<string[]>([]); const [ver, setVer] = useState(0);
  const [groups, setGroups] = useState<CustomerGroup[]>([]); const [memberOf, setMemberOf] = useState<Record<string, string[]>>({}); const [grp, setGrp] = useState('');
  useEffect(() => { if (profile) listCustomers(profile.organizationId).then(setRows).catch(() => setError(true)); }, [profile, ver]);
  useEffect(() => {
    if (!profile) return; const org = profile.organizationId;
    listGroups(org).then(setGroups).catch(() => {});
    listMembers(org).then(m => { const r: Record<string, string[]> = {}; m.forEach(x => { (r[x.customerId] ||= []).push(x.groupId); }); setMemberOf(r); }).catch(() => {});
  }, [profile]);

  const filtered = useMemo(() => (rows ?? []).filter(c =>
    (!type || c.type === type) && (!status || c.status === status) && (!grp || !!memberOf[c.id]?.includes(grp)) &&
    (!q || [c.name, c.code, c.phone, c.email, c.taxCode].some(x => x?.toLowerCase().includes(q.toLowerCase())))), [rows, q, type, status, grp, memberOf]);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const all = rows ?? [];
  const stats = [['Tổng khách hàng', all.length], ['Doanh nghiệp', all.filter(c => c.type === 'company').length], ['Cá nhân', all.filter(c => c.type === 'individual').length],
    ['Mới trong tháng', all.filter(c => (c.createdAt?.toMillis() ?? 0) >= monthStart).length], ['Đang hoạt động', all.filter(c => c.status === 'active').length], ['Tạm ngưng', all.filter(c => c.status === 'paused').length]];
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const sc = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs';

  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Khách hàng</h1>
      <p className="text-sm text-slate-500">Quản lý tập trung dữ liệu khách hàng của doanh nghiệp.</p></div>
      <div className="flex flex-wrap gap-2"><ImportExport customers={all} onImported={() => setVer(v => v + 1)}
        exportRows={sel.length ? all.filter(c => sel.includes(c.id)) : filtered} exportLabel={sel.length ? 'đã chọn' : 'đang lọc'}
        groupNames={id => (memberOf[id] ?? []).map(gid => groups.find(g => g.id === gid)?.name).filter(Boolean).join('; ')} /><Link href="/customers/new" className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"><Plus size={16} />Thêm khách hàng</Link></div></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{stats.map(([l, n]) => <div key={l as string} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><b className="text-2xl">{n}</b></div>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[240px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="Tìm theo tên, mã, SĐT, email, MST…" className="h-9 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
        <select className={sc} value={type} onChange={e => { setType(e.target.value); setPage(0); }}><option value="">Tất cả loại KH</option>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className={sc} value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="">Tất cả trạng thái</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className={sc} value={grp} onChange={e => { setGrp(e.target.value); setPage(0); }}><option value="">Tất cả nhóm</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      {sel.length > 0 && <div className="mb-2 text-xs text-blue-600">Đã chọn {sel.length} khách hàng</div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs">
        <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-2 w-8" />{['Mã KH', 'Khách hàng', 'Loại', 'Nhóm', 'Điện thoại', 'Email', 'Phụ trách', 'Trạng thái', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{view.map(c => (<tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
          <td className="p-2"><input type="checkbox" checked={sel.includes(c.id)} onChange={e => setSel(s => e.target.checked ? [...s, c.id] : s.filter(x => x !== c.id))} className="accent-blue-600" /></td>
          <td className="p-2 font-medium">{c.code}</td><td className="p-2"><Link href={`/customers/${c.id}`} className="font-semibold text-blue-700 hover:underline">{c.name}</Link>{c.isVip && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">VIP</span>}</td>
          <td className="p-2">{TYPE_LABEL[c.type]}</td><td className="p-2"><span className="flex flex-wrap gap-1">{(memberOf[c.id] ?? []).map(gid => groups.find(g => g.id === gid)).filter(Boolean).map(g => <span key={g!.id} className="rounded-full px-2 py-0.5 text-[10px] text-white" style={{ background: g!.color }}>{g!.name}</span>)}{!(memberOf[c.id]?.length) && '—'}</span></td><td className="p-2">{c.phone || '—'}</td><td className="p-2">{c.email || '—'}</td><td className="p-2">{c.ownerName}</td>
          <td className="p-2"><span className={`rounded-full px-2 py-0.5 ${c.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{STATUS_LABEL[c.status]}</span></td>
          <td className="p-2"><span className="flex gap-2 text-slate-500"><Link href={`/customers/${c.id}`}><Eye size={15} /></Link><Link href={`/customers/${c.id}/edit`}><Pencil size={15} /></Link></span></td></tr>))}</tbody></table>
        {rows === null && !error && <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p>}
        {error && <p className="p-6 text-center text-sm text-red-500">Không tải được dữ liệu. Kiểm tra Firestore Rules.</p>}
        {rows && filtered.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Chưa có khách hàng nào.</p>}</div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{filtered.length} khách hàng</span>
        <span className="flex gap-2"><button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Trước</button>
          <button disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(p => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Sau</button></span></div>
    </div></div>);
}
