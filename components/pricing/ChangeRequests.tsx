'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { ChangeRequestStatus, PriceChangeRequestDto } from '@/types/pricing';
import { Modal } from '@/components/ui/Modal';
import { Alert, area, FormFooter } from '@/components/ui/form';
import { Denied, errMsg, money, useApiData, when } from '@/components/catalog/shared';

const TABS: [ChangeRequestStatus, string][] = [['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối'], ['cancelled', 'Đã hủy']];
const STATUS: Record<ChangeRequestStatus, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', cancelled: 'Đã hủy' };
const KIND = { priceList: 'Bảng giá', groupPrice: 'Giá theo nhóm' };

/** Yêu cầu đổi giá bảng giá / giá theo nhóm: người duyệt thấy tất cả, người gửi chỉ thấy của mình */
export default function ChangeRequests({ uid }: { uid: string | undefined }) {
  const [tab, setTab] = useState<ChangeRequestStatus>('pending'), [dlg, setDlg] = useState<{ r: PriceChangeRequestDto; decision: 'approve' | 'reject' } | null>(null), [msg, setMsg] = useState<string | null>(null), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const { data, err, denied, loading, reload } = useApiData<{ items: PriceChangeRequestDto[]; can: { approve: boolean } }>(`/api/catalog/price-change-requests?status=${tab}`);
  if (denied) return <Denied />;
  async function decide(r: PriceChangeRequestDto, decision: 'approve' | 'reject' | 'cancel', n = '') {
    if (busy) return; setBusy(true); setMsg(null);
    try { await api(`/api/catalog/price-change-requests/${r.id}`, { method: 'POST', json: { decision, note: n } }); setDlg(null); setNote(''); } catch (e) { setMsg(errMsg(e, 'Không xử lý được yêu cầu.')); setDlg(null); } finally { setBusy(false); reload(); }
  }
  const rows = data?.items ?? [];
  return (<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="mb-3 text-sm text-slate-500">{data?.can.approve ? 'Duyệt hoặc từ chối yêu cầu đổi giá bảng giá / giá theo nhóm. Khi duyệt, giá được áp dụng ngay.' : 'Các yêu cầu đổi giá bảng giá / giá theo nhóm bạn đã gửi.'}</p>
    <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); }} className={`whitespace-nowrap px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-500'}`}>{l}</button>)}</div>
    {(msg || err) && <div className="mb-3"><Alert>{msg ?? err}</Alert></div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Loại', 'Phạm vi', 'Mặt hàng', 'Giá cũ', 'Giá mới', 'Lý do', 'Người gửi', 'Trạng thái', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => (<tr key={r.id} className="border-b last:border-0 align-top"><td className="p-2">{KIND[r.kind]}</td><td className="p-2">{r.targetName}</td><td className="p-2"><span className="font-medium">{r.itemCode}</span> {r.itemName}</td><td className="p-2">{r.oldPrice === null ? '—' : money(r.oldPrice)}</td><td className="p-2 font-semibold">{money(r.newPrice)}</td>
        <td className="max-w-[220px] p-2 text-slate-600">{r.reason}{r.decisionNote && <div className="mt-1 text-slate-400">Ghi chú: {r.decisionNote}</div>}</td><td className="p-2">{r.requestedByName}<div className="text-slate-400">{when(r.requestedAt)}</div></td><td className="p-2">{STATUS[r.status]}{r.decidedByName && <div className="text-slate-400">{r.decidedByName}</div>}</td>
        <td className="p-2">{r.status === 'pending' && <span className="flex flex-wrap gap-2">{data?.can.approve && r.requestedBy !== uid && <><button disabled={busy} onClick={() => setDlg({ r, decision: 'approve' })} aria-label={`Duyệt ${r.itemCode}`} className="rounded-md bg-emerald-600 px-2 py-1 text-white">Duyệt</button><button disabled={busy} onClick={() => setDlg({ r, decision: 'reject' })} aria-label={`Từ chối ${r.itemCode}`} className="rounded-md border border-red-200 px-2 py-1 text-red-600">Từ chối</button></>}
          {r.requestedBy === uid && <button disabled={busy} onClick={() => confirm(`Hủy yêu cầu đổi giá cho ${r.itemCode}?`) && decide(r, 'cancel')} aria-label={`Hủy ${r.itemCode}`} className="rounded-md border px-2 py-1">Hủy</button>}</span>}</td></tr>))}</tbody></table>
      {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Không có yêu cầu nào.</p>}</div>
    {dlg && <Modal title={dlg.decision === 'approve' ? 'Duyệt yêu cầu đổi giá' : 'Từ chối yêu cầu đổi giá'} onClose={() => !busy && setDlg(null)}><form onSubmit={e => { e.preventDefault(); decide(dlg.r, dlg.decision, note); }} className="space-y-3">
      <p className="text-sm">{dlg.r.itemCode} – {dlg.r.targetName}: {dlg.r.oldPrice === null ? 'thêm giá' : money(dlg.r.oldPrice)} → <b>{money(dlg.r.newPrice)}</b></p>
      <textarea aria-label="Ghi chú" className={area} value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Ghi chú (tuỳ chọn)" /><FormFooter busy={busy} label={dlg.decision === 'approve' ? 'Duyệt và áp dụng giá' : 'Từ chối'} danger={dlg.decision === 'reject'} onClose={() => setDlg(null)} /></form></Modal>}</div>);
}
