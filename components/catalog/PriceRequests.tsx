'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { can as perm, priceDelta } from '@/lib/catalog-core';
import type { PriceRequestDto, PriceRequestStatus } from '@/types/catalog';
import { Alert } from '@/components/ui/form';
import { DecideDialog } from './PriceDialogs';
import { Denied, errMsg, money, useApiData, when } from './shared';

const TABS: [PriceRequestStatus, string][] = [['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối'], ['cancelled', 'Đã hủy']];
const STATUS: Record<PriceRequestStatus, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', cancelled: 'Đã hủy' };

/** Hộp thư yêu cầu đổi giá: người duyệt thấy toàn bộ, người gửi chỉ thấy yêu cầu của mình */
export default function PriceRequests() {
  const { profile } = useAuth(); const [tab, setTab] = useState<PriceRequestStatus>('pending');
  const { data, err, denied, loading, reload } = useApiData<{ items: PriceRequestDto[]; can: { approve: boolean } }>(`/api/catalog/price-requests?status=${tab}`);
  const [dlg, setDlg] = useState<{ req: PriceRequestDto; decision: 'approve' | 'reject' } | null>(null); const [msg, setMsg] = useState<string | null>(null);
  if (denied) return <Denied />;
  const actor = profile ? { uid: profile.uid, role: profile.role } : null;
  async function cancel(r: PriceRequestDto) {
    if (!confirm(`Hủy yêu cầu đổi giá cho ${r.itemCode}?`)) return; setMsg(null);
    try { await api(`/api/catalog/price-requests/${r.id}`, { method: 'POST', json: { decision: 'cancel' } }); reload(); } catch (e) { setMsg(errMsg(e, 'Không hủy được yêu cầu.')); reload(); }
  }
  const rows = data?.items ?? [];
  return (<div className="space-y-4"><div><h1 className="text-2xl font-bold text-slate-900">Yêu cầu đổi giá</h1><p className="text-sm text-slate-500">{data?.can.approve ? 'Duyệt hoặc từ chối yêu cầu thay đổi giá bán.' : 'Các yêu cầu đổi giá do bạn gửi.'}</p></div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null); }} className={`whitespace-nowrap px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>)}</div>
      {(msg || err) && <div className="mb-3"><Alert>{msg ?? err}</Alert></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Sản phẩm / dịch vụ', 'Giá cũ', 'Giá mới', 'Chênh lệch', 'Người gửi', 'Thời gian gửi', 'Lý do', tab === 'pending' ? 'Thao tác' : 'Xử lý bởi'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => { const d = priceDelta(r.oldPrice, r.newPrice), mine = actor?.uid === r.requestedBy;
          return (<tr key={r.id} className="border-b align-top last:border-0 hover:bg-slate-50">
            <td className="p-2"><Link href={`/products/${r.itemId}`} className="font-semibold text-blue-700 hover:underline">{r.itemName}</Link><div className="text-slate-500">{r.itemCode}</div></td>
            <td className="p-2">{money(r.oldPrice)}</td><td className="p-2 font-semibold">{money(r.newPrice)}</td>
            <td className={`p-2 ${d.diff > 0 ? 'text-emerald-600' : d.diff < 0 ? 'text-red-600' : ''}`}>{d.diff > 0 ? '+' : ''}{money(d.diff)}{d.pctBp !== null && <div>({d.pctBp > 0 ? '+' : ''}{(d.pctBp / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%)</div>}</td>
            <td className="p-2">{r.requestedByName}</td><td className="p-2">{when(r.requestedAt)}</td><td className="max-w-[220px] p-2 text-slate-600">{r.reason}{r.decisionNote && <div className="mt-1 text-slate-400">Ghi chú duyệt: {r.decisionNote}</div>}</td>
            <td className="p-2">{r.status === 'pending'
              ? <span className="flex flex-wrap gap-2">{actor && perm.approvePrice(actor, r) && <><button onClick={() => setDlg({ req: r, decision: 'approve' })} className="rounded-md bg-emerald-600 px-3 py-1 text-white">Duyệt</button><button onClick={() => setDlg({ req: r, decision: 'reject' })} className="rounded-md border border-red-200 px-3 py-1 text-red-600">Từ chối</button></>}
                {mine && <button onClick={() => cancel(r)} className="rounded-md border border-slate-200 px-3 py-1 text-slate-600">Hủy yêu cầu</button>}</span>
              : <span>{STATUS[r.status]}{r.decidedByName && <> · {r.decidedByName}</>}{r.decidedAt && <div className="text-slate-400">{when(r.decidedAt)}</div>}</span>}</td></tr>); })}</tbody></table>
        {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Không có yêu cầu nào.</p>}</div></div>
    {dlg && <DecideDialog req={dlg.req} decision={dlg.decision} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reload(); }} />}</div>);
}
