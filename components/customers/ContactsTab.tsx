'use client';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Star, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { addContact, type ContactInput, listContacts, removeContact, setPrimary } from '@/lib/contacts';
import { CONTACT_ROLES, type Contact } from '@/types/lead';

const inp = 'h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500';
const empty: ContactInput = { name: '', position: '', department: '', phone: '', email: '', role: CONTACT_ROLES[5], note: '' };

export default function ContactsTab({ customerId, org }: { customerId: string; org: string }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Contact[] | null>(null); const [open, setOpen] = useState(false);
  const [v, setV] = useState(empty); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => listContacts(customerId, org).then(setRows).catch(() => setErr('Không tải được người liên hệ.')), [customerId, org]);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy || !profile || !rows) return;
    const x = { ...v, name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim() };
    if (!x.name) return setErr('Vui lòng nhập họ tên.');
    if (x.email && !/^\S+@\S+\.\S+$/.test(x.email)) return setErr('Email không hợp lệ.');
    if (rows.some(c => c.name.toLowerCase() === x.name.toLowerCase() && ((x.phone && c.phone === x.phone) || (x.email && c.email === x.email))))
      return setErr('Người liên hệ này đã tồn tại trong khách hàng.');
    setBusy(true); setErr(null);
    try { await addContact(profile, customerId, x, rows.length === 0); setV(empty); setOpen(false); await load(); }
    catch { setErr('Không lưu được người liên hệ.'); } finally { setBusy(false); }
  }
  return (<div className="space-y-3">
    <div className="flex justify-between"><b className="text-sm">Danh sách người liên hệ</b>
      <button onClick={() => setOpen(o => !o)} className="h-8 rounded-md bg-blue-600 px-3 text-xs text-white">{open ? 'Đóng' : '+ Thêm người liên hệ'}</button></div>
    {err && <div className="rounded-md bg-red-50 p-2 text-xs text-red-600">{err}</div>}
    {open && <form onSubmit={save} className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-3" noValidate>
      <input className={inp} placeholder="Họ và tên *" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />
      <input className={inp} placeholder="Chức vụ" value={v.position} onChange={e => setV({ ...v, position: e.target.value })} />
      <input className={inp} placeholder="Phòng ban" value={v.department} onChange={e => setV({ ...v, department: e.target.value })} />
      <input className={inp} placeholder="Điện thoại" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} />
      <input className={inp} placeholder="Email" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} />
      <select className={inp} value={v.role} onChange={e => setV({ ...v, role: e.target.value })}>{CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}</select>
      <button disabled={busy} className="flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 text-sm text-white md:col-span-3 disabled:opacity-70">{busy && <Loader2 size={14} className="animate-spin" />}Lưu</button></form>}
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs">
      <thead className="bg-slate-50 text-left text-slate-500"><tr>{['Họ tên', 'Chức vụ', 'Vai trò', 'Điện thoại', 'Email', ''].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows?.map(c => (<tr key={c.id} className="border-b last:border-0"><td className="p-2 font-semibold">{c.name}{c.isPrimary && <span className="ml-1 rounded bg-blue-50 px-1 text-[10px] text-blue-600">Chính</span>}</td>
        <td className="p-2">{c.position || '—'}</td><td className="p-2">{c.role}</td><td className="p-2">{c.phone || '—'}</td><td className="p-2">{c.email || '—'}</td>
        <td className="p-2"><span className="flex gap-2 text-slate-500">
          {!c.isPrimary && <button title="Đặt làm liên hệ chính" onClick={async () => { await setPrimary(rows, c.id); load(); }}><Star size={15} /></button>}
          <button title="Xóa" onClick={async () => { if (confirm(`Xóa ${c.name}?`)) { await removeContact(c.id); load(); } }}><Trash2 size={15} /></button></span></td></tr>))}</tbody></table>
      {rows === null && <p className="p-4 text-center text-sm text-slate-500">Đang tải…</p>}
      {rows?.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Chưa có người liên hệ.</p>}</div></div>);
}
