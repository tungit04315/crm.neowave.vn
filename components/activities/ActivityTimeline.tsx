import Link from 'next/link';
import { Clock, Pencil, Trash2, User } from 'lucide-react';
import { groupByDay, isOverdue } from '@/lib/activity-core';
import { ACTIVITY_COLOR, ACTIVITY_LABEL, type Activity } from '@/types/activity';
import { ICONS } from './meta';

export default function ActivityTimeline({ items, customerName, canEdit, onEdit, onDelete }:
  { items: Activity[]; customerName?: (id: string) => { id: string; name: string } | undefined; canEdit: (a: Activity) => boolean; onEdit: (a: Activity) => void; onDelete: (a: Activity) => void }) {
  const groups = groupByDay(items, a => a.occurredAt.toDate());
  if (!items.length) return <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Chưa có tương tác nào.</p>;
  return (<div className="space-y-6">{groups.map(g => (<div key={g.key}>
    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</div>
    <ol className="relative space-y-4 border-l-2 border-slate-100 pl-6">{g.items.map(a => {
      const I = ICONS[a.type], color = ACTIVITY_COLOR[a.type], cust = customerName?.(a.customerId), late = isOverdue(a.nextFollowUpAt?.toDate() ?? null);
      return (<li key={a.id} className="relative">
        <span className="absolute -left-[37px] grid h-7 w-7 place-items-center rounded-full text-white ring-4 ring-white" style={{ background: color }}><I size={14} /></span>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start gap-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2">
            <b className="text-sm text-slate-900">{a.title}</b><span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: color }}>{ACTIVITY_LABEL[a.type]}</span>
            {a.result && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{a.result}</span>}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Clock size={12} />{a.occurredAt.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="flex items-center gap-1"><User size={12} />{a.performedByName}</span>
              {cust && <Link href={`/customers/${cust.id}`} className="font-medium text-blue-700 hover:underline">{cust.name}</Link>}
              {a.contactName && <span>Liên hệ: {a.contactName}</span>}<span className="text-slate-400">{a.code}</span></div></div>
            {canEdit(a) && <span className="flex gap-2 text-slate-400"><button title="Sửa" onClick={() => onEdit(a)} className="hover:text-blue-600"><Pencil size={15} /></button>
              <button title="Xóa" onClick={() => onDelete(a)} className="hover:text-red-600"><Trash2 size={15} /></button></span>}</div>
          {a.content && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.content}</p>}
          {a.nextFollowUpAt && <div className={`mt-3 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${late ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
            Follow-up: {a.nextFollowUpAt.toDate().toLocaleString('vi-VN')}{late && ' (quá hạn)'}</div>}</div></li>);
    })}</ol></div>))}</div>);
}
