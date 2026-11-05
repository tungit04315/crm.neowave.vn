'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/opportunities/ui';
import { api, ApiError } from '@/lib/api';
import { PRIORITIES, PRIORITY_LABEL, type BulkRes, type StaffDto, type TicketPriority } from '@/types/care';
import { inp } from './ui';

/** Thao tác hàng loạt: máy chủ kiểm tra từng phiếu (quyền, trạng thái) và báo kết quả riêng cho từng phiếu */
export function BulkDialog({ ids, codes, mode, staff, onClose, onDone }: {
  ids: string[]; codes: Record<string, string>; mode: 'assign' | 'priority'; staff: StaffDto[]; onClose: () => void; onDone: () => void;
}) {
  const [assignee, setAssignee] = useState(''); const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [res, setRes] = useState<BulkRes | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (mode === 'assign' && !assignee) return setErr('Vui lòng chọn người phụ trách.');
    if (mode === 'priority' && !priority) return setErr('Vui lòng chọn mức độ ưu tiên.');
    setBusy(true); setErr(null);
    try { setRes(await api<BulkRes>('/api/care/tickets/bulk', { method: 'POST', json: { ids, action: mode, assigneeUid: assignee || undefined, priority: priority || undefined } })); }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Không thực hiện được thao tác.'); } finally { setBusy(false); }
  }
  const title = mode === 'assign' ? `Phân công ${ids.length} yêu cầu` : `Đổi mức độ ưu tiên ${ids.length} yêu cầu`;
  if (res) {
    const bad = res.results.filter(r => !r.ok);
    return (<Modal title="Kết quả thao tác" onClose={onDone}><div className="space-y-3 text-sm">
      <p>Thành công: <b className="text-emerald-600">{res.succeeded}</b> · Không thực hiện được: <b className={res.failed ? 'text-red-600' : ''}>{res.failed}</b></p>
      {bad.length > 0 && <ul className="max-h-48 space-y-1 overflow-auto rounded-md bg-red-50 p-3 text-xs text-red-700">{bad.map(r => <li key={r.id}><b>{codes[r.id] ?? r.id}</b>: {r.error}</li>)}</ul>}
      <div className="flex justify-end"><button onClick={onDone} className="h-10 rounded-md bg-blue-600 px-5 text-sm font-medium text-white">Đóng</button></div></div></Modal>);
  }
  return (<Modal title={title} onClose={onClose}><form onSubmit={submit} className="space-y-3">
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    {mode === 'assign'
      ? <select className={inp} value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">— Chọn người phụ trách —</option>{staff.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}</select>
      : <select className={inp} value={priority} onChange={e => setPriority(e.target.value as TicketPriority)}><option value="">— Chọn mức độ ưu tiên —</option>{PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>}
    <p className="text-xs text-slate-500">Hệ thống kiểm tra từng yêu cầu; yêu cầu không hợp lệ (đã giải quyết / đóng, ngoài phạm vi, người nhận không thuộc phòng xử lý…) sẽ được bỏ qua và liệt kê lại.</p>
    <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
      <button disabled={busy} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white disabled:opacity-70">{busy && <Loader2 size={15} className="animate-spin" />}Áp dụng</button></div></form></Modal>);
}
