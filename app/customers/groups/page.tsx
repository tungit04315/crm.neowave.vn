'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createGroup, deleteGroup, listGroups, listMembers, updateGroup } from '@/lib/groups';
import { GROUP_COLORS, type CustomerGroup, type GroupInput } from '@/types/group';

const empty: GroupInput = { name: '', description: '', color: GROUP_COLORS[0], status: 'active' };
const inp = 'h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500';
export default function GroupsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<CustomerGroup[] | null>(null); const [count, setCount] = useState<Record<string, number>>({});
  const [q, setQ] = useState(''); const [form, setForm] = useState<{ id?: string; v: GroupInput } | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!profile) return;
    try { const [g, m] = await Promise.all([listGroups(profile.organizationId), listMembers(profile.organizationId)]);
      const c: Record<string, number> = {}; m.forEach(x => { c[x.groupId] = (c[x.groupId] ?? 0) + 1; }); setRows(g); setCount(c); }
    catch { setErr('Không tải được dữ liệu. Kiểm tra Firestore Rules.'); setRows([]); }
  }, [profile]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu khi mount; load() bất đồng bộ và còn được gọi lại sau khi ghi
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form || !profile || busy) return;
    const v = { ...form.v, name: form.v.name.trim() };
    if (!v.name) return setErr('Vui lòng nhập tên nhóm.');
    if (rows?.some(g => g.id !== form.id && g.name.toLowerCase() === v.name.toLowerCase())) return setErr('Tên nhóm đã tồn tại.');
    setBusy(true); setErr(null);
    try { form.id ? await updateGroup(form.id, v) : await createGroup(profile, v); setForm(null); await load(); }
    catch { setErr('Không lưu được nhóm.'); } finally { setBusy(false); }
  }
  async function remove(g: CustomerGroup) {
    if (!profile || !confirm(`Xóa nhóm “${g.name}”?`)) return;
    try { if (await deleteGroup(g.id, profile.organizationId) === 'not-empty') setErr(`Nhóm “${g.name}” còn khách hàng. Hãy gỡ hết khách hàng trước khi xóa.`); else { setErr(null); await load(); } }
    catch { setErr('Không xóa được nhóm.'); }
  }
  const list = (rows ?? []).filter(g => !q || [g.name, g.code].some(x => x.toLowerCase().includes(q.toLowerCase())));
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Nhóm khách hàng</h1>
      <p className="text-sm text-slate-500">Phân loại khách hàng theo đặc điểm chung để chăm sóc và phân tích.</p></div>
      <button onClick={() => { setForm({ v: empty }); setErr(null); }} className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Tạo nhóm</button></div>
    <div className="grid grid-cols-3 gap-3">{[['Tổng số nhóm', rows?.length ?? 0], ['Đang hoạt động', (rows ?? []).filter(g => g.status === 'active').length], ['Lượt gán khách hàng', total]].map(([l, n]) =>
      <div key={l as string} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><b className="text-2xl">{n}</b></div>)}</div>
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    {form && <form onSubmit={save} noValidate className="grid gap-3 rounded-xl border border-blue-200 bg-white p-5 shadow-sm md:grid-cols-2">
      <input className={inp} placeholder="Tên nhóm *" value={form.v.name} onChange={e => setForm({ ...form, v: { ...form.v, name: e.target.value } })} />
      <select className={inp} value={form.v.status} onChange={e => setForm({ ...form, v: { ...form.v, status: e.target.value as GroupInput['status'] } })}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng sử dụng</option></select>
      <input className={`${inp} md:col-span-2`} placeholder="Mô tả" value={form.v.description} onChange={e => setForm({ ...form, v: { ...form.v, description: e.target.value } })} />
      <div className="flex items-center gap-2 text-xs text-slate-500">Màu nhận diện:{GROUP_COLORS.map(c => <button type="button" key={c} aria-label={c} onClick={() => setForm({ ...form, v: { ...form.v, color: c } })}
        className={`h-6 w-6 rounded-full ${form.v.color === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`} style={{ background: c }} />)}</div>
      <div className="flex justify-end gap-2"><button type="button" onClick={() => setForm(null)} className="h-9 rounded-md border px-4 text-sm">Hủy</button>
        <button disabled={busy} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm text-white disabled:opacity-70">{busy && <Loader2 size={14} className="animate-spin" />}{form.id ? 'Lưu' : 'Tạo nhóm'}</button></div></form>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên hoặc mã nhóm…" className="mb-3 h-9 w-full max-w-md rounded-lg bg-slate-100 px-3 text-sm outline-none" />
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-xs">
        <thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã nhóm', 'Tên nhóm', 'Mô tả', 'Số khách hàng', 'Trạng thái', 'Ngày tạo', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{list.map(g => (<tr key={g.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2 font-medium">{g.code}</td>
          <td className="p-2"><Link href={`/customers/groups/${g.id}`} className="flex items-center gap-2 font-semibold text-blue-700 hover:underline"><i className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />{g.name}</Link></td>
          <td className="max-w-[220px] truncate p-2">{g.description || '—'}</td><td className="p-2">{count[g.id] ?? 0}</td>
          <td className="p-2"><span className={`rounded-full px-2 py-0.5 ${g.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{g.status === 'active' ? 'Đang hoạt động' : 'Ngừng sử dụng'}</span></td>
          <td className="p-2">{g.createdAt?.toDate().toLocaleDateString('vi-VN')}</td>
          <td className="p-2"><span className="flex gap-2 text-slate-500"><button title="Sửa" onClick={() => { setForm({ id: g.id, v: { name: g.name, description: g.description, color: g.color, status: g.status } }); setErr(null); }}><Pencil size={15} /></button>
            <button title="Xóa" onClick={() => remove(g)}><Trash2 size={15} /></button></span></td></tr>))}</tbody></table>
        {rows === null && <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p>}
        {rows && list.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Chưa có nhóm khách hàng nào.</p>}</div></div></div>);
}
