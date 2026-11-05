export interface TimelineItem { id: string; type: string; changes: { field: string; label: string; from: string; to: string }[]; note: string; actorName: string; at: string }

/** Dòng thời gian lịch sử dùng chung. `meta` ánh xạ loại sự kiện → [nhãn, màu]. */
export default function Timeline({ items, meta, empty = 'Chưa có lịch sử.' }: { items: TimelineItem[]; meta: Record<string, [string, string]>; empty?: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (<ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">{items.map(h => { const [label, color] = meta[h.type] ?? [h.type, '#64748b'];
    return (<li key={h.id} className="relative"><span className="absolute -left-[27px] h-3 w-3 rounded-full ring-4 ring-white" style={{ background: color }} />
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      <div className="text-xs text-slate-500">{h.actorName} · {h.at ? new Date(h.at).toLocaleString('vi-VN') : ''}</div>
      {h.changes.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{h.changes.map(c => <li key={c.field}><span className="text-slate-500">{c.label}:</span> {c.from} <span className="text-slate-400">→</span> <b>{c.to}</b></li>)}</ul>}
      {h.note && <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{h.note}</p>}</li>); })}</ol>);
}
