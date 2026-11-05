'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { MANAGER_ROLES, OPP_SOURCES } from '@/lib/opportunity-core';
import type { AssignableUser, OpportunityDto } from '@/types/opportunity';
import CustomerPicker from './CustomerPicker';

const inp = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-0000`);
const fmt = (n: string) => (n ? Number(n).toLocaleString('vi-VN') : '');
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => <fieldset className="rounded-xl border border-slate-100 p-4"><legend className="px-2 text-xs font-semibold uppercase text-slate-500">{title}</legend><div className="grid gap-3 md:grid-cols-2">{children}</div></fieldset>;
const L = ({ t, children, wide }: { t: string; children: React.ReactNode; wide?: boolean }) => <label className={`block text-xs font-medium text-slate-600 ${wide ? 'md:col-span-2' : ''}`}>{t}<div className="mt-1">{children}</div></label>;

export default function OpportunityForm({ initial, defaultCustomerId }: { initial?: OpportunityDto; defaultCustomerId?: string }) {
  const { profile } = useAuth(); const router = useRouter();
  const requestId = useRef(newId()); // giữ nguyên khi gửi lại → máy chủ không tạo bản ghi thứ hai
  const [title, setTitle] = useState(initial?.title ?? ''); const [customerId, setCustomerId] = useState(initial?.customerId ?? defaultCustomerId ?? '');
  const [description, setDescription] = useState(initial?.description ?? ''); const [value, setValue] = useState(String(initial?.value ?? ''));
  const [probability, setProbability] = useState(initial?.probability ?? 20); const [date, setDate] = useState(initial?.expectedCloseDate ?? '');
  const [source, setSource] = useState(initial?.source ?? 'Nhập thủ công'); const [ownerUid, setOwnerUid] = useState('');
  const [owners, setOwners] = useState<AssignableUser[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!initial && profile && MANAGER_ROLES.includes(profile.role)) api<{ users: AssignableUser[] }>('/api/users/assignable').then(r => setOwners(r.users)).catch(() => {}); }, [initial, profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!title.trim()) return setErr('Vui lòng nhập tên cơ hội.');
    if (!customerId) return setErr('Vui lòng chọn khách hàng.');
    setBusy(true); setErr(null);
    const data = { title, customerId, description, value: Number(value || 0), probability, expectedCloseDate: date || null, source };
    try {
      if (initial) { await api(`/api/opportunities/${initial.id}`, { method: 'PATCH', json: { ...data, version: initial.version } }); router.replace(`/opportunities/${initial.id}`); }
      else { const r = await api<{ id: string }>('/api/opportunities', { method: 'POST', json: { ...data, requestId: requestId.current, ownerUid: ownerUid || undefined } }); router.replace(`/opportunities/${r.id}`); }
    } catch (x) { setErr(x instanceof ApiError ? x.message : 'Không lưu được cơ hội.'); setBusy(false); }
  }
  return (<form onSubmit={submit} noValidate className="space-y-4">
    {err && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <Group title="Thông tin chung"><L t="Tên cơ hội *" wide><input className={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Thiết kế website cho Công ty ABC" /></L>
      <L t="Khách hàng *" wide><CustomerPicker value={customerId} onChange={setCustomerId} fallbackLabel={initial ? `${initial.customerCode} – ${initial.customerName}` : undefined} /></L>
      <L t="Mô tả" wide><textarea className="min-h-[80px] w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" value={description} onChange={e => setDescription(e.target.value)} /></L></Group>
    <Group title="Giá trị & thời gian"><L t="Giá trị dự kiến (VND)"><input inputMode="numeric" className={inp} value={fmt(value)} onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="0" /></L>
      <L t={`Xác suất thành công: ${probability}%`}><input type="range" min={0} max={100} step={5} value={probability} onChange={e => setProbability(Number(e.target.value))} className="mt-2 w-full accent-blue-600" /></L>
      <L t="Ngày dự kiến chốt"><input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} /></L>
      <L t="Nguồn"><select className={inp} value={source} onChange={e => setSource(e.target.value)}>{[...new Set([source, ...OPP_SOURCES])].map(s => <option key={s}>{s}</option>)}</select></L></Group>
    {!initial && owners.length > 1 && <Group title="Phân công"><L t="Người phụ trách" wide><select className={inp} value={ownerUid} onChange={e => setOwnerUid(e.target.value)}>
      <option value="">Tôi ({profile?.displayName})</option>{owners.filter(u => u.uid !== profile?.uid).map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}</select></L></Group>}
    <div className="flex justify-end gap-2"><button type="button" onClick={() => router.back()} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
      <button disabled={busy} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white disabled:opacity-70">{busy && <Loader2 size={15} className="animate-spin" />}{initial ? 'Lưu thay đổi' : 'Tạo cơ hội'}</button></div></form>);
}
