'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { LOST_REASONS } from '@/lib/opportunity-core';
import type { AssignableUser } from '@/types/opportunity';
import { Modal } from './ui';

const inp = 'h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-500';
const Footer = ({ busy, label, onClose, danger }: { busy: boolean; label: string; onClose: () => void; danger?: boolean }) => (<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
  <button disabled={busy} className={`flex h-10 items-center gap-2 rounded-md px-5 text-sm font-medium text-white disabled:opacity-70 ${danger ? 'bg-red-600' : 'bg-blue-600'}`}>{busy && <Loader2 size={15} className="animate-spin" />}{label}</button></div>);

export function AssignDialog({ id, currentOwner, onClose, onDone }: { id: string; currentOwner: string; onClose: () => void; onDone: () => void }) {
  const [users, setUsers] = useState<AssignableUser[] | null>(null); const [uid, setUid] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ users: AssignableUser[] }>('/api/users/assignable').then(r => setUsers(r.users)).catch(e => setErr(e.message)); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!uid || busy) return setErr(uid ? null : 'Vui lòng chọn người phụ trách.'); setBusy(true); setErr(null);
    try { await api(`/api/opportunities/${id}/assign`, { method: 'POST', json: { ownerUid: uid, note } }); onDone(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Không phân công được.'); setBusy(false); }
  }
  return (<Modal title="Phân công người phụ trách" onClose={onClose}><form onSubmit={submit} className="space-y-3">
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <p className="text-sm text-slate-500">Hiện tại: <b>{currentOwner}</b></p>
    <select className={inp} value={uid} onChange={e => setUid(e.target.value)}><option value="">{users ? '— Chọn người phụ trách mới —' : 'Đang tải…'}</option>{users?.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}</select>
    <textarea className="min-h-[70px] w-full rounded-md border border-slate-200 p-3 text-sm" placeholder="Ghi chú bàn giao (không bắt buộc)" value={note} onChange={e => setNote(e.target.value)} />
    <Footer busy={busy} label="Phân công" onClose={onClose} /></form></Modal>);
}

export function CloseDialog({ id, result, onClose, onDone }: { id: string; result: 'won' | 'lost'; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; if (result === 'lost' && !reason) return setErr('Vui lòng chọn lý do thất bại.'); setBusy(true); setErr(null);
    try { await api(`/api/opportunities/${id}/close`, { method: 'POST', json: { result, reason, note } }); onDone(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Không cập nhật được.'); setBusy(false); }
  }
  return (<Modal title={result === 'won' ? 'Chốt thành công' : 'Đánh dấu thất bại'} onClose={onClose}><form onSubmit={submit} className="space-y-3">
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <p className="text-sm text-slate-600">{result === 'won' ? 'Cơ hội sẽ chuyển sang “Thành công” với xác suất 100%.' : 'Cơ hội sẽ chuyển sang “Thất bại” với xác suất 0%. Chỉ quản lý mới mở lại được.'}</p>
    {result === 'lost' && <select className={inp} value={reason} onChange={e => setReason(e.target.value)}><option value="">— Chọn lý do thất bại * —</option>{LOST_REASONS.map(r => <option key={r}>{r}</option>)}</select>}
    <textarea className="min-h-[70px] w-full rounded-md border border-slate-200 p-3 text-sm" placeholder="Ghi chú (không bắt buộc)" value={note} onChange={e => setNote(e.target.value)} />
    <Footer busy={busy} label={result === 'won' ? 'Xác nhận thành công' : 'Xác nhận thất bại'} onClose={onClose} danger={result === 'lost'} /></form></Modal>);
}
