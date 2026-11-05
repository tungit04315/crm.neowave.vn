'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Pencil, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/care-core';
import type { TicketDetail, TicketStatus } from '@/types/care';
import { AssignDialog, ReopenDialog, StatusDialog, TransferDialog } from './TicketDialogs';
import { HistoryTimeline, MessagePanel } from './Timeline';
import { PriorityBadge, SlaLine, TicketStatusBadge } from './ui';

type Dlg = { k: 'assign' } | { k: 'transfer' } | { k: 'reopen' } | { k: 'status'; to: Exclude<TicketStatus, 'new'> } | null;
const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="flex justify-between gap-3 py-1.5 text-sm"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="min-w-0 text-right font-medium text-slate-800">{children}</dd></div>;
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</h2>{children}</section>;
const btn = 'h-9 rounded-lg px-3 text-sm font-medium disabled:opacity-60';

export default function TicketDetailView() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<TicketDetail | null>(null); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<Dlg>(null); const [tab, setTab] = useState<'chat' | 'history'>('chat'); const [claiming, setClaiming] = useState(false); const [actErr, setActErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setD(await api<TicketDetail>(`/api/care/tickets/${id}`)); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Không tải được yêu cầu hỗ trợ.'); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function claim() {
    if (claiming) return; setClaiming(true); setActErr(null);
    try { await api(`/api/care/tickets/${id}/claim`, { method: 'POST', json: {} }); await load(); }
    catch (e) { setActErr(e instanceof ApiError ? e.message : 'Không nhận xử lý được.'); } finally { setClaiming(false); }
  }
  const done = () => { setDlg(null); load(); };

  if (err && !d) return <div className="space-y-3"><Link href="/care/tickets" className="inline-flex items-center gap-1 text-sm text-blue-600"><ArrowLeft size={15} />Danh sách yêu cầu</Link><p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</p></div>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const { ticket: t, can, messages, history } = d; const unassigned = t.status === 'new' && !t.assigneeUid;

  return (<div className="space-y-4">
    <Link href="/care/tickets" className="inline-flex items-center gap-1 text-sm text-blue-600"><ArrowLeft size={15} />Danh sách yêu cầu</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-slate-500">{t.code}</b><TicketStatusBadge s={t.status} /><PriorityBadge p={t.priority} />{t.reopenCount > 0 && <span className="text-xs text-slate-500">Đã mở lại {t.reopenCount} lần</span>}</div>
      <h1 className="mt-1 break-words text-2xl font-bold text-slate-900">{t.title}</h1></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={load} aria-label="Tải lại" title="Tải lại (cập nhật đồng hồ SLA)" className={`${btn} border border-slate-200 bg-white px-3 text-slate-600`}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        {can.edit && <Link href={`/care/tickets/${t.id}/edit`} className={`${btn} flex items-center gap-1.5 border border-slate-200 bg-white text-slate-700`}><Pencil size={14} />Sửa</Link>}
        {can.assign && <button onClick={() => setDlg({ k: 'assign' })} className={`${btn} border border-slate-200 bg-white text-slate-700`}>Phân công</button>}
        {can.transfer && <button onClick={() => setDlg({ k: 'transfer' })} className={`${btn} border border-slate-200 bg-white text-slate-700`}>Chuyển phòng</button>}
        {can.start && <button onClick={() => setDlg({ k: 'status', to: 'in_progress' })} className={`${btn} bg-blue-600 text-white`}>{t.status === 'new' ? 'Bắt đầu xử lý' : 'Tiếp tục xử lý'}</button>}
        {can.wait && <button onClick={() => setDlg({ k: 'status', to: 'waiting_customer' })} className={`${btn} bg-violet-600 text-white`}>Chờ khách phản hồi</button>}
        {can.resolve && <button onClick={() => setDlg({ k: 'status', to: 'resolved' })} className={`${btn} bg-emerald-600 text-white`}>Đã giải quyết</button>}
        {can.close && <button onClick={() => setDlg({ k: 'status', to: 'closed' })} className={`${btn} bg-slate-700 text-white`}>Đóng yêu cầu</button>}
        {can.reopen && <button onClick={() => setDlg({ k: 'reopen' })} className={`${btn} bg-amber-500 text-white`}>Mở lại</button>}</div></div>

    {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</p>}
    {actErr && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{actErr}</p>}
    {unassigned && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800"><span><b>Yêu cầu chưa có người phụ trách.</b> {can.claim ? 'Bạn có thể nhận xử lý ngay.' : can.assign ? 'Hãy phân công nhân viên.' : ''}</span>
      {can.claim && <button onClick={claim} disabled={claiming} className="flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-medium text-white disabled:opacity-70">{claiming && <Loader2 size={14} className="animate-spin" />}Nhận xử lý</button>}</div>}

    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title="Mô tả yêu cầu"><p className="whitespace-pre-wrap break-words text-sm text-slate-800">{t.description || <span className="text-slate-400">Không có mô tả.</span>}</p></Card>
        {t.status === 'waiting_customer' && t.waitingReason && <Card title="Đang chờ khách hàng"><p className="whitespace-pre-wrap break-words text-sm text-violet-800">{t.waitingReason}</p><p className="mt-1 text-xs text-slate-500">Từ {formatDateTime(t.waitingSince)} · đồng hồ giải quyết đang tạm dừng</p></Card>}
        {(t.status === 'resolved' || t.status === 'closed') && <Card title="Kết quả xử lý"><p className="whitespace-pre-wrap break-words text-sm text-slate-800">{t.resolution || '—'}</p><p className="mt-1 text-xs text-slate-500">{t.resolvedByName && `${t.resolvedByName} · `}{formatDateTime(t.resolvedAt)}{t.closedAt && ` · đóng lúc ${formatDateTime(t.closedAt)}`}</p></Card>}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex gap-2 border-b border-slate-100 pb-2 text-sm">{([['chat', `Trao đổi (${messages.length})`], ['history', `Lịch sử (${history.length})`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 font-medium ${tab === k ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>{l}</button>)}</div>
          {tab === 'chat' ? <MessagePanel id={t.id} messages={messages} canReply={can.reply} canNote={can.note} onSent={load} /> : <HistoryTimeline items={history} />}</section></div>

      <div className="space-y-4">
        <Card title="Thời hạn SLA (giờ làm việc)">
          <div className="space-y-3 text-sm">
            <div><SlaLine label="Phản hồi đầu tiên" p={t.sla.response} /><p className="text-xs text-slate-500">Hạn {formatDateTime(t.firstResponseDueAt)}{t.firstRespondedAt && ` · đã phản hồi ${formatDateTime(t.firstRespondedAt)}`}</p></div>
            <div><SlaLine label="Giải quyết" p={t.sla.resolve} /><p className="text-xs text-slate-500">Hạn {formatDateTime(t.resolveDueAt)}{t.resolvedAt && ` · hoàn thành ${formatDateTime(t.resolvedAt)}`}</p></div></div></Card>
        <Card title="Thông tin xử lý"><dl className="divide-y divide-slate-100">
          <Row k="Người phụ trách">{t.assigneeName || <span className="text-amber-600">Chưa phân công</span>}</Row>
          <Row k="Phòng xử lý">{t.departmentName || '—'}</Row><Row k="Danh mục">{t.categoryName}</Row>
          <Row k="Tiếp nhận bởi">{t.receivedByName || '—'}</Row><Row k="Ngày tiếp nhận">{formatDateTime(t.receivedAt)}</Row><Row k="Cập nhật gần nhất">{formatDateTime(t.lastActivityAt)}</Row></dl></Card>
        <Card title="Khách hàng"><dl className="divide-y divide-slate-100">
          <Row k="Khách hàng"><Link href={`/customers/${t.customerId}`} className="text-blue-700 hover:underline">{t.customerCode} – {t.customerName}</Link></Row>
          <Row k="Người liên hệ">{t.contactName || '—'}</Row>{t.contactPhone && <Row k="Điện thoại">{t.contactPhone}</Row>}{t.contactEmail && <Row k="Email"><span className="break-all">{t.contactEmail}</span></Row>}</dl></Card></div></div>

    {dlg?.k === 'assign' && <AssignDialog t={t} onClose={() => setDlg(null)} onDone={done} />}
    {dlg?.k === 'transfer' && <TransferDialog t={t} onClose={() => setDlg(null)} onDone={done} />}
    {dlg?.k === 'reopen' && <ReopenDialog id={t.id} onClose={() => setDlg(null)} onDone={done} />}
    {dlg?.k === 'status' && <StatusDialog id={t.id} from={t.status} to={dlg.to} onClose={() => setDlg(null)} onDone={done} />}
  </div>);
}
