'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Factory, Layers, Percent, Target, User, Wallet, Building2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatVnd } from '@/lib/opportunity-core';
import type { OpportunityDetail } from '@/types/opportunity';
import { Field, Section } from '@/components/ui/Info';
import { StatusBadge } from '@/components/opportunities/ui';
import HistoryTimeline from '@/components/opportunities/HistoryTimeline';
import { AssignDialog, CloseDialog } from '@/components/opportunities/Dialogs';

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const [d, setD] = useState<OpportunityDetail | null>(null); const [err, setErr] = useState<string | null>(null); const [fatal, setFatal] = useState(false);
  const [dlg, setDlg] = useState<'assign' | 'won' | 'lost' | null>(null);
  const load = useCallback(() => api<OpportunityDetail>(`/api/opportunities/${id}`).then(r => { setD(r); setErr(null); }).catch(e => { setFatal(true); setErr(e instanceof ApiError ? e.message : 'Không tải được cơ hội.'); }), [id]);
  useEffect(() => { load(); }, [load]);
  if (fatal) return <div className="space-y-2"><p className="text-sm text-red-500">{err}</p><Link href="/opportunities" className="text-sm text-blue-600">← Danh sách cơ hội</Link></div>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const o = d.opportunity, can = d.can;
  async function act(path: string, method: string, ask: string, after?: () => void) {
    if (!confirm(ask)) return; setErr(null);
    try { await api(path, { method }); after ? after() : await load(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Thao tác không thành công.'); }
  }
  const btn = 'flex h-10 w-full items-center justify-center rounded-lg px-4 text-sm font-medium transition';
  return (<div className="space-y-4">
    <Link href="/opportunities" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600"><ArrowLeft size={15} />Danh sách cơ hội</Link>
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold text-slate-900">{o.title}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{o.code}</span><span>Phụ trách: {o.ownerName}</span></div></div><StatusBadge s={o.status} /></div>
    {err && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <div className="grid gap-4 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2">
      <Section title="Thông tin cơ hội"><div className="grid gap-3 sm:grid-cols-2">
        <Field icon={Building2} label="Khách hàng" value={`${o.customerCode ? o.customerCode + ' – ' : ''}${o.customerName}`} href={`/customers/${o.customerId}`} />
        <Field icon={Wallet} label="Giá trị dự kiến" value={formatVnd(o.value)} /><Field icon={Percent} label="Xác suất thành công" value={`${o.probability}%`} />
        <Field icon={CalendarDays} label="Ngày dự kiến chốt" value={o.expectedCloseDate ? formatDate(o.expectedCloseDate) : ''} /><Field icon={Factory} label="Nguồn" value={o.source} />
        <Field icon={User} label="Người phụ trách" value={o.ownerName} /><Field icon={Layers} label="Giai đoạn" value={o.stageName} />
        {o.status === 'lost' && <div className="sm:col-span-2"><Field icon={Target} label="Lý do thất bại" value={o.lostReason} /></div>}</div></Section>
      <Section title="Mô tả"><p className={`whitespace-pre-wrap rounded-xl bg-slate-50/70 p-4 text-sm ${o.description ? 'text-slate-800' : 'text-slate-400'}`}>{o.description || 'Chưa có mô tả.'}</p></Section>
      <Section title="Lịch sử thay đổi"><HistoryTimeline items={d.history} /></Section></div>
      <div className="space-y-4"><Section title="Thao tác"><div className="space-y-2">
        {can.close && <><button onClick={() => setDlg('won')} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Chốt thành công</button>
          <button onClick={() => setDlg('lost')} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>Đánh dấu thất bại</button></>}
        {can.edit && <Link href={`/opportunities/${id}/edit`} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Chỉnh sửa</Link>}
        {can.assign && <button onClick={() => setDlg('assign')} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Phân công người phụ trách</button>}
        {can.reopen && <button onClick={() => act(`/api/opportunities/${id}/reopen`, 'POST', 'Mở lại cơ hội này?')} className={`${btn} border border-amber-200 text-amber-700 hover:bg-amber-50`}>Mở lại cơ hội</button>}
        {can.remove && <button onClick={() => act(`/api/opportunities/${id}`, 'DELETE', `Xóa cơ hội ${o.code}?`, () => router.replace('/opportunities'))} className={`${btn} text-red-600 hover:bg-red-50`}>Xóa cơ hội</button>}
        {!Object.values(can).some(Boolean) && <p className="text-xs text-slate-400">Bạn chỉ có quyền xem cơ hội này.</p>}</div></Section></div></div>
    {dlg === 'assign' && <AssignDialog id={id} currentOwner={o.ownerName} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load(); }} />}
    {(dlg === 'won' || dlg === 'lost') && <CloseDialog id={id} result={dlg} onClose={() => setDlg(null)} onDone={() => { setDlg(null); load(); }} />}</div>);
}
