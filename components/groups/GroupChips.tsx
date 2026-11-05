'use client';
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { addMembers, listCustomerMembers, listGroups, removeMember } from '@/lib/groups';
import type { CustomerGroup } from '@/types/group';

export default function GroupChips({ customerId, org }: { customerId: string; org: string }) {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<CustomerGroup[]>([]); const [ids, setIds] = useState<string[]>([]); const [err, setErr] = useState(false);
  const load = useCallback(async () => {
    try { const [g, m] = await Promise.all([listGroups(org), listCustomerMembers(customerId, org)]); setGroups(g); setIds(m.map(x => x.groupId)); }
    catch { setErr(true); }
  }, [customerId, org]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu khi mount; load() bất đồng bộ và còn được gọi lại sau khi ghi
  useEffect(() => { load(); }, [load]);
  const admin = profile?.role === 'super_admin'; // chỉ Quản trị viên được đổi nhóm của khách (khớp firestore.rules)
  const mine = groups.filter(g => ids.includes(g.id)), rest = groups.filter(g => !ids.includes(g.id) && g.status === 'active');
  if (err) return <span className="text-slate-400">Không tải được nhóm</span>;
  return (<span className="flex flex-wrap items-center gap-2">
    {mine.length === 0 && <span className="text-slate-400">Chưa thuộc nhóm nào</span>}
    {mine.map(g => <span key={g.id} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white" style={{ background: g.color }}>{g.name}
      {admin && <button aria-label={`Gỡ khỏi ${g.name}`} onClick={async () => { await removeMember(g.id, customerId); load(); }}><X size={12} /></button>}</span>)}
    {admin && rest.length > 0 && <select value="" onChange={async e => { if (e.target.value && profile) { await addMembers(profile, e.target.value, [customerId]); load(); } }} className="h-7 rounded border border-slate-200 px-2 text-xs">
      <option value="">+ Thêm vào nhóm</option>{rest.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}</span>);
}
