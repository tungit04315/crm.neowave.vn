'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/care-core';
import { MESSAGE_LABEL, type HistoryDto, type MessageDto, type MessageType } from '@/types/care';

const TYPE_LABEL: Record<string, string> = { created: 'Tạo yêu cầu', updated: 'Cập nhật thông tin', claimed: 'Nhận xử lý', assigned: 'Phân công', transferred: 'Chuyển phòng', status: 'Đổi trạng thái', reopened: 'Mở lại yêu cầu' };

/** Lịch sử thay đổi (mới nhất ở trên). Chỉ đọc: không có thao tác sửa hay xóa. */
export function HistoryTimeline({ items }: { items: HistoryDto[] }) {
  if (!items.length) return <p className="p-4 text-center text-sm text-slate-500">Chưa có lịch sử.</p>;
  return (<ol className="space-y-4 border-l border-slate-200 pl-5">{items.map(h => (<li key={h.id} className="relative">
    <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-white" />
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm"><b>{TYPE_LABEL[h.type] ?? h.type}</b><span className="text-xs text-slate-500">{h.actorName} · {formatDateTime(h.at)}</span></div>
    {h.changes.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{h.changes.map((c, i) => <li key={i}><span className="text-slate-500">{c.label}:</span> {c.from !== '—' && <><s className="text-slate-400">{c.from}</s> → </>}<b>{c.to}</b></li>)}</ul>}
    {h.note && <p className="mt-1 rounded-md bg-slate-50 p-2 text-xs text-slate-600">{h.note}</p>}</li>))}</ol>);
}

/** Trao đổi: “Phản hồi khách hàng” (ghi nhận phản hồi đầu tiên cho SLA) và “Ghi chú nội bộ”. Tin nhắn không sửa/xóa được. */
export function MessagePanel({ id, messages, canReply, canNote, onSent }: { id: string; messages: MessageDto[]; canReply: boolean; canNote: boolean; onSent: () => void }) {
  const [pick, setPick] = useState<MessageType>('reply'); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const type: MessageType = pick === 'reply' && !canReply ? 'internal' : pick === 'internal' && !canNote ? 'reply' : pick;
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!text.trim()) return setErr('Vui lòng nhập nội dung.');
    setBusy(true); setErr(null);
    try { await api(`/api/care/tickets/${id}/messages`, { method: 'POST', json: { type, content: text } }); setText(''); onSent(); }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Không gửi được nội dung.'); } finally { setBusy(false); }
  }
  return (<div className="space-y-4">
    {messages.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Chưa có trao đổi nào.</p>}
    <ul className="space-y-3">{messages.map(m => (<li key={m.id} className={`rounded-xl border p-3 text-sm ${m.type === 'reply' ? 'border-blue-100 bg-blue-50' : 'border-amber-100 bg-amber-50'}`}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs"><b>{m.authorName}</b><span className={m.type === 'reply' ? 'text-blue-600' : 'text-amber-700'}>{MESSAGE_LABEL[m.type]}</span><span className="text-slate-500">{formatDateTime(m.at)}</span></div>
      <p className="whitespace-pre-wrap break-words text-slate-800">{m.content}</p></li>))}</ul>
    {(canReply || canNote) && <form onSubmit={send} className="space-y-2 rounded-xl border border-slate-200 p-3">
      {err && <div role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-600">{err}</div>}
      {canReply && canNote && <div className="flex gap-2 text-xs">{(['reply', 'internal'] as const).map(k => <button type="button" key={k} onClick={() => setPick(k)} className={`rounded-full px-3 py-1 font-medium ${type === k ? (k === 'reply' ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white') : 'bg-slate-100 text-slate-600'}`}>{MESSAGE_LABEL[k]}</button>)}</div>}
      <textarea value={text} maxLength={4000} onChange={e => setText(e.target.value)} className="min-h-[90px] w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"
        placeholder={type === 'reply' ? 'Nội dung phản hồi gửi khách hàng…' : 'Ghi chú nội bộ (khách hàng không thấy)…'} />
      <div className="flex items-center justify-between text-xs text-slate-500"><span>{type === 'reply' ? 'Lần phản hồi đầu tiên sẽ được tính vào SLA.' : 'Chỉ nhân viên xử lý nhìn thấy.'}</span>
        <button disabled={busy} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-70">{busy && <Loader2 size={14} className="animate-spin" />}Gửi</button></div></form>}
    {!canReply && !canNote && messages.length > 0 && <p className="text-center text-xs text-slate-500">Yêu cầu đã đóng: không thể trao đổi thêm.</p>}
  </div>);
}
