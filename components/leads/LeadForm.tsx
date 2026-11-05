'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createLead, findLeadDuplicate } from '@/lib/leads';
import { emptyLead, type LeadInput } from '@/types/lead';
import { SOURCES } from '@/types/customer';

const inp = 'h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export default function LeadForm() {
  const { profile } = useAuth(); const router = useRouter();
  const [v, setV] = useState<LeadInput>(emptyLead); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const f = (k: keyof LeadInput, ph: string) => <input className={inp} placeholder={ph} value={v[k]} onChange={e => setV({ ...v, [k]: e.target.value })} />;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || !profile) return;
    const x = { ...v, name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim() };
    if (!x.name) return setErr('Vui lòng nhập tên khách hàng / doanh nghiệp.');
    if (!x.phone && !x.email) return setErr('Cần có số điện thoại hoặc email.');
    if (x.email && !/^\S+@\S+\.\S+$/.test(x.email)) return setErr('Email không hợp lệ.');
    setBusy(true); setErr(null);
    try {
      const dup = await findLeadDuplicate(profile.organizationId, x);
      if (dup) { setErr(`Lead đã tồn tại: ${dup.code} – ${dup.name}.`); return; }
      router.replace(`/leads/${await createLead(profile, x)}`);
    } catch { setErr('Không lưu được Lead. Vui lòng kiểm tra quyền hoặc kết nối.'); } finally { setBusy(false); }
  }
  return (<form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <div className="grid gap-4 md:grid-cols-2">{f('name', 'Tên khách hàng / doanh nghiệp *')}{f('contactName', 'Người liên hệ')}{f('phone', 'Số điện thoại')}{f('email', 'Email')}
      {f('website', 'Website')}{f('industry', 'Ngành nghề')}{f('interest', 'Sản phẩm / dịch vụ quan tâm')}
      <select className={inp} value={v.source} onChange={e => setV({ ...v, source: e.target.value })}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select>
      <textarea className="min-h-[80px] rounded-md border border-slate-200 p-3 text-sm md:col-span-2" placeholder="Nhu cầu của khách hàng" value={v.need} onChange={e => setV({ ...v, need: e.target.value })} /></div>
    <div className="flex justify-end gap-2"><button type="button" onClick={() => router.back()} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
      <button disabled={busy} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white disabled:opacity-70">{busy && <Loader2 size={16} className="animate-spin" />}Tiếp nhận Lead</button></div></form>);
}
