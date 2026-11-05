'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { priceDelta } from '@/lib/catalog-core';
import type { ItemDto, PriceRequestDto } from '@/types/catalog';
import { Modal } from '@/components/ui/Modal';
import { Alert, area, fmtNum, FormFooter, inp, L } from '@/components/ui/form';
import { errMsg, money } from './shared';

/** Đổi giá: người có quyền đổi trực tiếp → áp dụng ngay; người chỉ có quyền gửi yêu cầu → chờ duyệt. */
export function PriceDialog({ item, mode, onClose, onDone }: { item: ItemDto; mode: 'direct' | 'request'; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const next = value === '' ? null : Number(value), d = next === null ? null : priceDelta(item.defaultPrice, next);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (next === null) return setErr('Vui lòng nhập giá mới.'); if (next === item.defaultPrice) return setErr('Giá mới trùng với giá hiện tại.'); if (!reason.trim()) return setErr('Vui lòng nhập lý do thay đổi giá.');
    setBusy(true); setErr(null);
    try { await api(`/api/catalog/items/${item.id}/price`, { method: 'POST', json: { newPrice: next, expectedPrice: item.defaultPrice, reason } }); onDone(); }
    catch (x) { setErr(errMsg(x, 'Không đổi được giá.')); setBusy(false); }
  }
  return (<Modal title={mode === 'direct' ? 'Thay đổi giá bán' : 'Gửi yêu cầu đổi giá'} onClose={onClose}><form onSubmit={submit} className="space-y-3" noValidate>
    {err && <Alert>{err}</Alert>}
    <p className="text-sm text-slate-600">{item.code} – {item.name}<br />Giá hiện tại: <b>{money(item.defaultPrice)}</b></p>
    {mode === 'request' && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">Giá chỉ thay đổi sau khi Giám đốc hoặc Quản trị viên duyệt yêu cầu này.</p>}
    <L t="Giá mới (VND) *"><input inputMode="numeric" autoFocus className={inp} value={fmtNum(value)} onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 13))} placeholder="0" /></L>
    {d && <p className={`text-xs ${d.diff > 0 ? 'text-emerald-600' : d.diff < 0 ? 'text-red-600' : 'text-slate-500'}`}>Chênh lệch: {d.diff > 0 ? '+' : ''}{money(d.diff)}{d.pctBp !== null && ` (${d.pctBp > 0 ? '+' : ''}${(d.pctBp / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%)`}</p>}
    <L t="Lý do thay đổi *"><textarea className={area} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></L>
    <FormFooter busy={busy} label={mode === 'direct' ? 'Cập nhật giá' : 'Gửi yêu cầu'} onClose={onClose} /></form></Modal>);
}

/** Duyệt hoặc từ chối yêu cầu đổi giá, kèm ghi chú */
export function DecideDialog({ req, decision, onClose, onDone }: { req: PriceRequestDto; decision: 'approve' | 'reject'; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setErr(null);
    try { await api(`/api/catalog/price-requests/${req.id}`, { method: 'POST', json: { decision, note } }); onDone(); }
    catch (x) { setErr(errMsg(x, 'Không xử lý được yêu cầu.')); setBusy(false); }
  }
  return (<Modal title={decision === 'approve' ? 'Duyệt yêu cầu đổi giá' : 'Từ chối yêu cầu đổi giá'} onClose={onClose}><form onSubmit={submit} className="space-y-3">
    {err && <Alert>{err}</Alert>}
    <p className="text-sm text-slate-600">{req.itemCode} – {req.itemName}<br />{money(req.oldPrice)} → <b>{money(req.newPrice)}</b><br /><span className="text-slate-500">Người gửi: {req.requestedByName}</span></p>
    <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Lý do: {req.reason}</p>
    <textarea className={area} placeholder="Ghi chú (không bắt buộc)" value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
    <FormFooter busy={busy} label={decision === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'} onClose={onClose} danger={decision === 'reject'} /></form></Modal>);
}
