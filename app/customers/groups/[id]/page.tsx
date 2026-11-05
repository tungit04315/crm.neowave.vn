'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listCustomers } from '@/lib/customers';
import { addMembers, getGroup, listGroupMembers, removeMember } from '@/lib/groups';
import type { Customer } from '@/types/customer';
import type { CustomerGroup } from '@/types/group';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>(); const { profile } = useAuth();
  const [g, setG] = useState<CustomerGroup | null | undefined>(undefined); const [customers, setCustomers] = useState<Customer[]>([]); const [ids, setIds] = useState<string[]>([]);
  const [q, setQ] = useState(''); const [pick, setPick] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!profile) return;
    try { const org = profile.organizationId; const [gr, cs, ms] = await Promise.all([getGroup(id, org), listCustomers(org), listGroupMembers(id, org)]);
      setG(gr); setCustomers(cs); setIds(ms.map(m => m.customerId)); } catch { setG(null); }
  }, [id, profile]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu khi mount; load() bất đồng bộ và còn được gọi lại sau khi ghi
  useEffect(() => { load(); }, [load]);
  const inGroup = useMemo(() => customers.filter(c => ids.includes(c.id)), [customers, ids]);
  const candidates = useMemo(() => customers.filter(c => !ids.includes(c.id) && (!q || [c.name, c.code, c.phone, c.email].some(x => x?.toLowerCase().includes(q.toLowerCase())))).slice(0, 50), [customers, ids, q]);
  if (g === undefined) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const admin = profile?.role === 'super_admin'; // chỉ Quản trị viên được đổi nhóm của khách (khớp firestore.rules)
  if (!g || !profile) return <p className="text-sm text-slate-500">Không tìm thấy nhóm hoặc bạn không có quyền xem.</p>;
  async function add() {
    if (!pick.length || busy || !profile) return; setBusy(true); setErr(null);
    try { await addMembers(profile, id, pick); setPick([]); await load(); } catch { setErr('Không thêm được khách hàng vào nhóm.'); } finally { setBusy(false); }
  }
  return (<div className="space-y-4">
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><i className="h-4 w-4 rounded-full" style={{ background: g.color }} />
      <div className="flex-1"><h1 className="text-xl font-bold">{g.name}</h1><p className="text-xs text-slate-500">{g.code} · {inGroup.length} khách hàng{g.description ? ` · ${g.description}` : ''}</p></div>
      <Link href="/customers/groups" className="text-sm text-blue-600">← Danh sách nhóm</Link></div>
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><b className="text-sm">Khách hàng trong nhóm</b>
        <table className="mt-3 w-full text-xs"><tbody>{inGroup.map(c => (<tr key={c.id} className="border-b last:border-0"><td className="p-2 font-medium">{c.code}</td>
          <td className="p-2"><Link href={`/customers/${c.id}`} className="text-blue-700 hover:underline">{c.name}</Link></td><td className="p-2">{c.phone || '—'}</td>
          <td className="p-2">{admin && <button title="Gỡ khỏi nhóm" onClick={async () => { await removeMember(id, c.id); load(); }} className="text-slate-500"><X size={15} /></button>}</td></tr>))}</tbody></table>
        {inGroup.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Nhóm chưa có khách hàng.</p>}</div>
      {!admin && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">Chỉ Quản trị viên được thêm hoặc gỡ khách hàng khỏi nhóm.</p>}
      {admin && <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><b className="text-sm">Thêm khách hàng vào nhóm</b>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm khách hàng…" className="mt-3 h-9 w-full rounded-lg bg-slate-100 px-3 text-sm outline-none" />
        <div className="mt-2 max-h-72 overflow-y-auto">{candidates.map(c => (<label key={c.id} className="flex cursor-pointer items-center gap-2 border-b p-2 text-xs last:border-0 hover:bg-slate-50">
          <input type="checkbox" checked={pick.includes(c.id)} onChange={e => setPick(p => e.target.checked ? [...p, c.id] : p.filter(x => x !== c.id))} className="accent-blue-600" />
          <span className="font-medium">{c.code}</span><span className="flex-1 truncate">{c.name}</span><span className="text-slate-400">{c.phone}</span></label>))}
          {candidates.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Không có khách hàng phù hợp.</p>}</div>
        <button onClick={add} disabled={!pick.length || busy} className="mt-3 flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}Thêm {pick.length || ''} khách hàng đã chọn</button></div>}</div></div>);
}
