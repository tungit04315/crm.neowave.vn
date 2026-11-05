'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import CustomerPicker from '@/components/opportunities/CustomerPicker';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, initialDues } from '@/lib/care-core';
import { listContacts } from '@/lib/contacts';
import type { Contact } from '@/types/lead';
import { PRIORITIES, PRIORITY_LABEL, type TicketDto, type TicketPriority } from '@/types/care';
import { inp, useCareMeta } from './ui';

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-0000`);
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => <fieldset className="rounded-xl border border-slate-100 p-4"><legend className="px-2 text-xs font-semibold uppercase text-slate-500">{title}</legend><div className="grid gap-3 md:grid-cols-2">{children}</div></fieldset>;
const L = ({ t, children, wide }: { t: string; children: React.ReactNode; wide?: boolean }) => <label className={`block text-xs font-medium text-slate-600 ${wide ? 'md:col-span-2' : ''}`}>{t}<div className="mt-1">{children}</div></label>;
const when = (ms: number) => formatDateTime(new Date(ms).toISOString());

/** Tạo mới (mặc định) hoặc sửa (truyền `initial`). `canSetPriority` chỉ áp dụng khi sửa: đổi ưu tiên là quyền của trưởng nhóm trở lên. */
export default function TicketForm({ initial, canSetPriority = true }: { initial?: TicketDto; canSetPriority?: boolean }) {
  const { profile } = useAuth(); const router = useRouter(); const { meta, err: metaErr } = useCareMeta();
  const requestId = useRef(newId()); // giữ nguyên khi gửi lại → máy chủ không tạo phiếu thứ hai
  const [title, setTitle] = useState(initial?.title ?? ''); const [description, setDescription] = useState(initial?.description ?? '');
  const [customerId, setCustomerId] = useState(initial?.customerId ?? ''); const [contactId, setContactId] = useState(initial?.contactId ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? ''); const [priority, setPriority] = useState<TicketPriority>(initial?.priority ?? 'medium');
  const [departmentId, setDepartmentId] = useState(''); const [loaded, setLoaded] = useState<{ cid: string; list: Contact[] }>({ cid: '', list: [] });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId || !profile) return;
    let on = true; listContacts(customerId, profile.organizationId).then(r => on && setLoaded({ cid: customerId, list: r })).catch(() => on && setLoaded({ cid: customerId, list: [] }));
    return () => { on = false; };
  }, [customerId, profile]);
  const contacts = loaded.cid === customerId ? loaded.list : []; // danh sách của khách hàng đang chọn (tránh hiển thị nhầm người liên hệ của khách cũ)
  const dues = useMemo(() => (initial ? null : initialDues(Date.now(), priority)), [initial, priority]);
  const needDept = !initial && meta?.scope.kind === 'company';

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!title.trim()) return setErr('Vui lòng nhập tiêu đề yêu cầu.');
    if (!customerId) return setErr('Vui lòng chọn khách hàng.');
    if (!categoryId) return setErr('Vui lòng chọn danh mục yêu cầu.');
    if (needDept && !departmentId) return setErr('Vui lòng chọn phòng ban tiếp nhận.');
    setBusy(true); setErr(null);
    const data = { title, description, customerId, contactId: contactId || null, categoryId, priority };
    try {
      if (initial) { await api(`/api/care/tickets/${initial.id}`, { method: 'PATCH', json: { ...data, version: initial.version } }); router.replace(`/care/tickets/${initial.id}`); }
      else { const r = await api<{ id: string }>('/api/care/tickets', { method: 'POST', json: { ...data, requestId: requestId.current, departmentId: departmentId || undefined } }); router.replace(`/care/tickets/${r.id}`); }
    } catch (x) { setErr(x instanceof ApiError ? x.message : 'Không lưu được yêu cầu.'); setBusy(false); }
  }

  if (metaErr) return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{metaErr}</p>;
  if (!meta) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!initial && !meta.can.create) return <p className="text-sm text-slate-500">Bạn không có quyền tạo yêu cầu hỗ trợ.</p>;
  return (<form onSubmit={submit} noValidate className="space-y-4">
    {err && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <Group title="Thông tin yêu cầu">
      <L t="Tiêu đề *" wide><input className={inp} value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="VD: Không đăng nhập được vào hệ thống" /></L>
      <L t="Danh mục *"><select className={inp} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">— Chọn danh mục —</option>
        {meta.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}{initial && !meta.categories.some(c => c.id === initial.categoryId) && <option value={initial.categoryId}>{initial.categoryName}</option>}</select></L>
      <L t="Mức độ ưu tiên"><select className={inp} value={priority} disabled={!!initial && !canSetPriority} onChange={e => setPriority(e.target.value as TicketPriority)}>{PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></L>
      {needDept && <L t="Phòng ban tiếp nhận *" wide><select className={inp} value={departmentId} onChange={e => setDepartmentId(e.target.value)}><option value="">— Chọn phòng ban —</option>{meta.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></L>}
      <L t="Mô tả chi tiết" wide><textarea className="min-h-[110px] w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} /></L></Group>
    <Group title="Khách hàng">
      <L t="Khách hàng *" wide><CustomerPicker value={customerId} onChange={id => { setCustomerId(id); setContactId(''); }} fallbackLabel={initial ? `${initial.customerCode} – ${initial.customerName}` : undefined} /></L>
      <L t="Người liên hệ" wide><select className={inp} value={contactId} disabled={!customerId} onChange={e => setContactId(e.target.value)}><option value="">{customerId ? '— Không chọn —' : 'Chọn khách hàng trước'}</option>
        {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.isPrimary ? ' (liên hệ chính)' : ''}{c.phone ? ` – ${c.phone}` : ''}</option>)}
        {initial?.contactId && !contacts.some(c => c.id === initial.contactId) && customerId === initial.customerId && <option value={initial.contactId}>{initial.contactName}</option>}</select></L></Group>
    {dues && <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">Hạn phản hồi dự kiến: <b>{when(dues.firstResponseDueAt)}</b> · Hạn giải quyết dự kiến: <b>{when(dues.resolveDueAt)}</b>.
      <span className="block text-blue-600">Tính theo giờ làm việc (08:00–17:30, thứ Hai đến thứ Sáu) cho mức “{PRIORITY_LABEL[priority]}”.</span></p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={() => router.back()} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
      <button disabled={busy} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white disabled:opacity-70">{busy && <Loader2 size={15} className="animate-spin" />}{initial ? 'Lưu thay đổi' : 'Tạo yêu cầu'}</button></div></form>);
}
