'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Alert } from '@/components/ui/form';
import { Denied, errMsg } from '@/components/catalog/shared';
import { useGroupList } from './shared';

/** Số ưu tiên nhóm khách hàng: khi khách thuộc nhiều nhóm cùng có giá riêng, nhóm có số cao hơn được dùng. Chỉ Quản trị viên được sửa. */
export default function GroupPriorities() {
  const { groups, canEditPriority, denied, err, reload } = useGroupList();
  const [draft, setDraft] = useState<Record<string, string>>({}), [busy, setBusy] = useState<string | null>(null), [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  if (denied) return <Denied />;
  async function save(id: string, current: number) {
    const v = draft[id]; if (v === undefined || busy) return; const n = Number(v);
    if (!/^\d+$/.test(v) || n > 1000) return setMsg({ ok: false, t: 'Số ưu tiên phải là số nguyên từ 0 đến 1000.' });
    if (n === current) { setDraft(d => { const x = { ...d }; delete x[id]; return x; }); return; }
    setBusy(id); setMsg(null);
    try { await api('/api/catalog/group-priorities', { method: 'PUT', json: { groupId: id, priority: n } }); setDraft(d => { const x = { ...d }; delete x[id]; return x; }); setMsg({ ok: true, t: 'Đã lưu số ưu tiên.' }); reload(); } catch (e) { setMsg({ ok: false, t: errMsg(e, 'Không lưu được số ưu tiên.') }); } finally { setBusy(null); }
  }
  return (<div className="space-y-4"><div><h1 className="text-2xl font-bold text-slate-900">Ưu tiên nhóm khách hàng</h1><p className="text-sm text-slate-500">Khi một khách hàng thuộc nhiều nhóm cùng có giá riêng cho một mặt hàng, hệ thống dùng giá của nhóm có số ưu tiên cao hơn; nếu bằng nhau thì dùng giá thấp hơn.</p></div>
    {(err || msg) && (err || !msg?.ok ? <Alert>{err ?? msg?.t}</Alert> : <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{msg?.t}</p>)}
    {!canEditPriority && groups && <p className="text-xs text-slate-500">Chỉ Quản trị viên được thay đổi số ưu tiên.</p>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Nhóm khách hàng', 'Số mặt hàng có giá riêng', 'Số ưu tiên (0–1000)', ''].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{(groups ?? []).map(g => { const v = draft[g.groupId] ?? String(g.priority); return (<tr key={g.groupId} className="border-b last:border-0"><td className="p-2 font-medium">{g.groupName}</td><td className="p-2">{g.priceCount}</td>
        <td className="p-2">{canEditPriority ? <input aria-label={`Ưu tiên ${g.groupName}`} inputMode="numeric" value={v} onChange={e => setDraft(d => ({ ...d, [g.groupId]: e.target.value.replace(/\D/g, '').slice(0, 4) }))} className="h-8 w-24 rounded-md border border-slate-200 px-2 text-right text-sm" /> : g.priority}</td>
        <td className="p-2">{canEditPriority && draft[g.groupId] !== undefined && <button disabled={busy !== null} onClick={() => save(g.groupId, g.priority)} aria-label={`Lưu ${g.groupName}`} className="flex h-8 items-center gap-1 rounded-md bg-blue-600 px-3 text-white disabled:opacity-60">{busy === g.groupId && <Loader2 size={13} className="animate-spin" />}Lưu</button>}</td></tr>); })}</tbody></table>
      {groups === null ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : groups.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Chưa có nhóm khách hàng nào.</p>}</div></div></div>);
}
