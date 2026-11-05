'use client';
import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createActivity, updateActivity } from '@/lib/activities';
import { fromInputValue, toInputValue, validateActivity } from '@/lib/activity-core';
import { listContacts } from '@/lib/contacts';
import { ACTIVITY_LABEL, type Activity, type ActivityType } from '@/types/activity';
import type { Contact } from '@/types/lead';

const inp = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export interface CustomerOption { id: string; code: string; name: string }

export default function ActivityForm({ customers, fixedCustomerId, initial, onClose, onSaved }:
  { customers: CustomerOption[]; fixedCustomerId?: string; initial?: Activity; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [customerId, setCustomerId] = useState(initial?.customerId ?? fixedCustomerId ?? '');
  const [fetched, setFetched] = useState<Contact[]>([]); const [contactId, setContactId] = useState(initial?.contactId ?? '');
  const [type, setType] = useState<ActivityType>(initial?.type ?? 'call'); const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? ''); const [result, setResult] = useState(initial?.result ?? '');
  const [at, setAt] = useState(toInputValue(initial?.occurredAt.toDate() ?? new Date())); const [next, setNext] = useState(initial?.nextFollowUpAt ? toInputValue(initial.nextFollowUpAt.toDate()) : '');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const locked = !!initial || !!fixedCustomerId;

  const contacts = customerId && profile ? fetched : []; // chưa chọn khách hàng thì không có người liên hệ
  useEffect(() => { if (!customerId || !profile) return; listContacts(customerId, profile.organizationId).then(setFetched).catch(() => setFetched([])); }, [customerId, profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || !profile) return;
    const v = { customerId, title, content, occurredAt: fromInputValue(at), nextFollowUpAt: fromInputValue(next) };
    const m = validateActivity(v); if (m) return setErr(m);
    const c = contacts.find(x => x.id === contactId);
    const input = { customerId, contactId: c?.id ?? null, contactName: c?.name ?? '', type, title, content, result, occurredAt: v.occurredAt!, nextFollowUpAt: v.nextFollowUpAt };
    setBusy(true); setErr(null);
    try { initial ? await updateActivity(initial.id, input) : await createActivity(profile, input); onSaved(); }
    catch { setErr('Không lưu được tương tác. Vui lòng kiểm tra quyền hoặc kết nối.'); } finally { setBusy(false); }
  }
  return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={submit} noValidate className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{initial ? `Sửa tương tác ${initial.code}` : 'Thêm tương tác'}</h2><button type="button" onClick={onClose} aria-label="Đóng"><X size={18} /></button></div>
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-medium text-slate-600 md:col-span-2">Khách hàng *<select disabled={locked} className={`${inp} mt-1`} value={customerId} onChange={e => { setCustomerId(e.target.value); setContactId(''); }}>
        <option value="">— Chọn khách hàng —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">Loại tương tác<select className={`${inp} mt-1`} value={type} onChange={e => setType(e.target.value as ActivityType)}>
        {Object.entries(ACTIVITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">Người liên hệ<select className={`${inp} mt-1`} value={contactId} onChange={e => setContactId(e.target.value)} disabled={!contacts.length}>
        <option value="">{contacts.length ? '— Không chọn —' : 'Chưa có người liên hệ'}</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600 md:col-span-2">Tiêu đề *<input className={`${inp} mt-1`} value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Gọi tư vấn gói website" /></label>
      <label className="text-xs font-medium text-slate-600 md:col-span-2">Nội dung<textarea className="mt-1 min-h-[90px] w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" value={content} onChange={e => setContent(e.target.value)} /></label>
      <label className="text-xs font-medium text-slate-600">Thời gian thực hiện *<input type="datetime-local" className={`${inp} mt-1`} value={at} onChange={e => setAt(e.target.value)} /></label>
      <label className="text-xs font-medium text-slate-600">Kết quả<input list="results" className={`${inp} mt-1`} value={result} onChange={e => setResult(e.target.value)} placeholder="VD: Cần theo dõi" />
        <datalist id="results">{['Thành công', 'Cần theo dõi', 'Không liên lạc được', 'Từ chối', 'Hẹn lại'].map(r => <option key={r} value={r} />)}</datalist></label>
      <label className="text-xs font-medium text-slate-600 md:col-span-2">Lịch follow-up tiếp theo (không bắt buộc)<input type="datetime-local" className={`${inp} mt-1`} value={next} onChange={e => setNext(e.target.value)} /></label></div>
    <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
      <button disabled={busy} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white disabled:opacity-70">{busy && <Loader2 size={15} className="animate-spin" />}{initial ? 'Lưu thay đổi' : 'Lưu tương tác'}</button></div></form></div>);
}
