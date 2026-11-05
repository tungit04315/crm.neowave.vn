'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Alert, area, FormFooter, fmtNum, inp, L } from '@/components/ui/form';
import { errMsg, money } from '@/components/catalog/shared';

/** Quản lý (không được sửa trực tiếp) gửi yêu cầu đổi giá một mặt hàng trong bảng giá hoặc giá theo nhóm */
export default function RequestChangeDialog({ kind, targetId, targetName, itemId, itemLabel, current, onClose, onDone }: {
  kind: 'priceList' | 'groupPrice'; targetId: string; targetName: string; itemId: string; itemLabel: string; current: number | null; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [price, setPrice] = useState(current === null ? '' : String(current)), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; if (!price) return setErr('Vui lòng nhập giá mới.'); if (Number(price) === current) return setErr('Giá mới trùng với giá hiện tại.'); if (!reason.trim()) return setErr('Vui lòng nhập lý do đổi giá.');
    setBusy(true); setErr(null);
    try { await api('/api/catalog/price-change-requests', { method: 'POST', json: { kind, targetId, itemId, price: Number(price), reason } }); onDone('Đã gửi yêu cầu đổi giá, chờ Giám đốc hoặc Quản trị viên duyệt.'); } catch (x) { setErr(errMsg(x, 'Không gửi được yêu cầu.')); setBusy(false); }
  }
  return (<Modal title="Xin đổi giá" onClose={() => !busy && onClose()}><form onSubmit={submit} className="space-y-3" noValidate>{err && <Alert>{err}</Alert>}
    <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{itemLabel} · {targetName}<br />Giá hiện tại: <b>{current === null ? 'chưa có' : money(current)}</b></p>
    <L t="Giá mới (VND) *"><input autoFocus inputMode="numeric" aria-label="Giá mới" className={inp} value={fmtNum(price)} onChange={e => setPrice(e.target.value.replace(/\D/g, '').slice(0, 13))} /></L>
    <L t="Lý do *"><textarea aria-label="Lý do" className={area} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></L>
    <FormFooter busy={busy} label="Gửi yêu cầu" onClose={onClose} /></form></Modal>);
}
