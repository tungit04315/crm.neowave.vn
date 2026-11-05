'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Info, LayoutGrid, List as ListIcon, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { can as perm, compactVnd, formatDate, formatVnd } from '@/lib/opportunity-core';
import { boardColumns, matchPeriod, PERIOD_LABEL, requirementText, type Period, type Stage } from '@/lib/pipeline-core';
import type { OpportunityDto } from '@/types/opportunity';
import { CloseDialog } from '@/components/opportunities/Dialogs';
import { Modal, StatusBadge, today } from '@/components/opportunities/ui';
import { usePipelineData } from './usePipelineData';

const daysIn = (o: OpportunityDto) => Math.max(0, Math.floor((Date.now() - new Date(o.stageEnteredAt ?? o.createdAt).getTime()) / 86400000));
const initials = (n: string) => n.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
const sc = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs';

export default function PipelineBoard() {
  const { profile } = useAuth(); const { items, config, can, truncated, error, setError, load, patch } = usePipelineData();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [q, setQ] = useState(''); const [owner, setOwner] = useState(''); const [dept, setDept] = useState(''); const [period, setPeriod] = useState<Period>('all');
  const [dragId, setDragId] = useState<string | null>(null); const [hover, setHover] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [needNote, setNeedNote] = useState<{ o: OpportunityDto; stageId: string } | null>(null); const [note, setNote] = useState('');
  const [closing, setClosing] = useState<{ id: string; result: 'won' | 'lost' } | null>(null); const [probEdit, setProbEdit] = useState<{ id: string; v: number } | null>(null);

  const actor = useMemo(() => (profile ? { uid: profile.uid, role: profile.role, departmentId: profile.departmentId ?? null } : null), [profile]);
  const canMove = (o: OpportunityDto) => !!actor && perm.edit(actor, { ownerUid: o.ownerUid, departmentId: o.departmentId, status: o.status }); // máy chủ vẫn kiểm tra lại
  const all = items ?? [];
  const owners = useMemo(() => [...new Map(all.map(o => [o.ownerUid, o.ownerName])).entries()], [all]);
  const depts = useMemo(() => [...new Set(all.map(o => o.departmentId ?? ''))], [all]);
  const filtered = useMemo(() => all.filter(o => (!owner || o.ownerUid === owner) && (!dept || (o.departmentId ?? '') === (dept === '__none' ? '' : dept)) && matchPeriod(o.expectedCloseDate, o.status, period) &&
    (!q || [o.title, o.code, o.customerName].some(x => x.toLowerCase().includes(q.toLowerCase())))), [all, owner, dept, period, q]);
  const board = useMemo(() => (config ? boardColumns(filtered, config.stages) : null), [filtered, config]);
  const sum = (k: 'count' | 'value' | 'weighted') => board ? board.columns.reduce((s, c) => s + c[k], 0) : 0;

  async function move(o: OpportunityDto, stageId: string, why?: string) {
    if (!config || (o.status === 'open' && o.stageId === stageId)) return;
    const st = config.stages.find(s => s.id === stageId); if (!st) return;
    patch({ ...o, stageId, stageName: st.name, probability: st.probability }); // cập nhật ngay trên giao diện, hoàn tác nếu máy chủ từ chối
    try {
      const r = await api<{ opportunity: OpportunityDto }>(`/api/opportunities/${o.id}/stage`, { method: 'POST', json: { stageId, note: why, version: o.version } });
      patch(r.opportunity); setNotice(`Đã chuyển “${o.title}” sang “${st.name}” (xác suất ${st.probability}%)`); setError(null);
    } catch (e) {
      patch(o);
      if (e instanceof ApiError && e.code === 'needs-note') { setNote(''); setNeedNote({ o, stageId }); }
      else if (e instanceof ApiError && e.code === 'conflict') { setError(e.message); load(); }
      else setError(e instanceof ApiError ? e.message : 'Không chuyển được giai đoạn.');
    }
  }
  function drop(key: string) {
    const o = all.find(i => i.id === dragId); setDragId(null); setHover(null); if (!o) return;
    if (o.status !== 'open') return setError('Cơ hội đã đóng. Chỉ quản lý mới mở lại được tại trang chi tiết.');
    if (!canMove(o)) return setError('Bạn không có quyền chuyển cơ hội này.');
    if (key === 'won' || key === 'lost') return setClosing({ id: o.id, result: key });
    move(o, key);
  }
  async function saveProb() {
    if (!probEdit) return; const o = all.find(i => i.id === probEdit.id); if (!o) return;
    try { const r = await api<{ opportunity: OpportunityDto }>(`/api/opportunities/${o.id}/probability`, { method: 'POST', json: { probability: probEdit.v, version: o.version } }); patch(r.opportunity); setProbEdit(null); setNotice('Đã cập nhật xác suất.'); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Không cập nhật được xác suất.'); if (e instanceof ApiError && e.code === 'conflict') load(); }
  }
  const stageSelect = (o: OpportunityDto, stages: Stage[]) => (<select value={o.status === 'open' ? o.stageId : ''} aria-label="Chuyển giai đoạn" className="h-7 w-full rounded border border-slate-200 bg-white px-1 text-[11px]"
    onChange={e => { const v = e.target.value; if (v === 'won' || v === 'lost') setClosing({ id: o.id, result: v }); else if (v) move(o, v); }}>
    {o.status !== 'open' && <option value="">{o.stageName}</option>}{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="won">→ Chốt thành công</option><option value="lost">→ Đánh dấu thất bại</option></select>);

  function Card({ o, stages }: { o: OpportunityDto; stages: Stage[] }) {
    const movable = o.status === 'open' && canMove(o), late = o.status === 'open' && o.expectedCloseDate && o.expectedCloseDate < today(), pe = probEdit?.id === o.id;
    return (<div draggable={movable} onDragStart={e => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move'; setDragId(o.id); }} onDragEnd={() => { setDragId(null); setHover(null); }}
      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === o.id ? 'opacity-40' : ''}`}>
      <Link href={`/opportunities/${o.id}`} className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-blue-700">{o.title}</Link>
      <div className="mt-0.5 truncate text-xs text-slate-500">{o.customerName}</div>
      <div className="mt-2 flex items-center justify-between"><b className="text-sm">{compactVnd(o.value)}</b>
        {o.status === 'open' ? <button disabled={!movable} onClick={() => setProbEdit(pe ? null : { id: o.id, v: o.probability })} title={movable ? 'Chỉnh xác suất' : undefined} className={`rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ${movable ? 'hover:bg-blue-100' : ''}`}>{o.probability}%</button> : <StatusBadge s={o.status} />}</div>
      {pe && probEdit && <div className="mt-2 rounded-lg bg-slate-50 p-2"><input type="range" min={0} max={100} step={5} value={probEdit.v} onChange={e => setProbEdit({ id: o.id, v: Number(e.target.value) })} className="w-full accent-blue-600" aria-label="Xác suất" />
        <div className="flex items-center justify-between text-xs"><b>{probEdit.v}%</b><span className="flex gap-1"><button onClick={() => setProbEdit(null)} className="rounded border px-2 py-0.5">Hủy</button><button onClick={saveProb} className="rounded bg-blue-600 px-2 py-0.5 text-white">Lưu</button></span></div></div>}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600" title={o.ownerName}>{initials(o.ownerName)}</span>
        <span className={late ? 'font-medium text-red-600' : ''}>{o.expectedCloseDate ? formatDate(o.expectedCloseDate) : 'Chưa có ngày'}</span>{o.status === 'open' && <span className="ml-auto">{daysIn(o)} ngày</span>}</div>
      {movable && <div className="mt-2">{stageSelect(o, stages)}</div>}</div>);
  }

  const col = (key: string, title: string, color: string, count: number, value: number, weighted: number | null, cards: OpportunityDto[], hint?: string, more?: string) => (
    <div key={key} onDragEnter={() => dragId && setHover(key)} onDragOver={e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }} onDrop={e => { e.preventDefault(); drop(key); }}
      className={`flex w-[280px] shrink-0 flex-col rounded-xl border bg-slate-50/80 ${hover === key ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      <div className="rounded-t-xl border-b border-slate-200 bg-white p-3" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center gap-2"><b className="flex-1 truncate text-sm">{title}</b>{hint && <span title={`Điều kiện vào giai đoạn: ${hint}`} className="text-slate-400"><Info size={14} /></span>}<span className="rounded-full bg-slate-100 px-2 text-xs font-semibold">{count}</span></div>
        <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{compactVnd(value)}</span>{weighted !== null && <span title="Giá trị có trọng số theo xác suất">DB: {compactVnd(weighted)}</span>}</div></div>
      <div className="max-h-[calc(100vh-340px)] min-h-[120px] space-y-2 overflow-y-auto p-2">{cards.slice(0, 15).map(o => <Card key={o.id} o={o} stages={config!.stages} />)}
        {!cards.length && <p className="py-6 text-center text-xs text-slate-400">Kéo thả cơ hội vào đây</p>}
        {more && cards.length > 15 && <Link href={more} className="block py-1 text-center text-xs text-blue-600">Xem tất cả ({cards.length})</Link>}</div></div>);

  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Sales Pipeline</h1><p className="text-sm text-slate-500">Kéo thả cơ hội giữa các giai đoạn bán hàng. Kanban và Danh sách dùng chung một nguồn dữ liệu.</p></div>
      <div className="flex gap-2"><div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        {([['kanban', 'Kanban', LayoutGrid], ['list', 'Danh sách', ListIcon]] as const).map(([k, l, I]) => <button key={k} onClick={() => setView(k)} className={`flex items-center gap-1.5 px-3 py-2 ${view === k ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><I size={14} />{l}</button>)}</div>
        {can.create && <Link href="/opportunities/new" className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Tạo cơ hội</Link>}</div></div>
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm cơ hội, khách hàng…" className="h-9 min-w-[200px] flex-1 rounded-lg bg-slate-100 px-3 text-sm outline-none" />
      <select className={sc} value={owner} onChange={e => setOwner(e.target.value)}><option value="">Tất cả nhân viên</option>{owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      {depts.length > 1 && <select className={sc} value={dept} onChange={e => setDept(e.target.value)}><option value="">Tất cả phòng ban</option>{depts.map(d => <option key={d || '__none'} value={d || '__none'}>{d || 'Không thuộc phòng ban'}</option>)}</select>}
      <select className={sc} value={period} onChange={e => setPeriod(e.target.value as Period)}>{Object.entries(PERIOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
    {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-600"><span>{error}</span><button onClick={() => setError(null)} aria-label="Đóng">✕</button></div>}
    {notice && !error && <div role="status" className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Đóng">✕</button></div>}
    {truncated && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">Chỉ hiển thị 1.000 cơ hội mới nhất trong phạm vi của bạn.</p>}
    {board && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Đang mở', String(sum('count'))], ['Giá trị đang mở', compactVnd(sum('value'))], ['Dự báo (có trọng số)', compactVnd(sum('weighted'))], ['Đã thành công', `${board.won.count} · ${compactVnd(board.won.value)}`]].map(([l, v]) =>
      <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><b className="text-xl">{v}</b></div>)}</div>}
    {!items && !error && <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p>}
    {board && config && view === 'kanban' && <div className="flex gap-3 overflow-x-auto pb-3">
      {board.columns.map(c => col(c.key, c.stage!.name, c.stage!.color, c.count, c.value, c.weighted, c.items, requirementText(c.stage!)))}
      {col('won', 'Thành công', '#10b981', board.won.count, board.won.value, null, board.won.items, undefined, '/opportunities/won')}
      {col('lost', 'Thất bại', '#ef4444', board.lost.count, board.lost.value, null, board.lost.items, undefined, '/opportunities/lost')}</div>}
    {board && config && view === 'list' && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><table className="w-full min-w-[980px] text-xs">
      <thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Cơ hội', 'Khách hàng', 'Giai đoạn', 'Giá trị', 'XS', 'Dự kiến chốt', 'Phụ trách', 'Trạng thái'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{filtered.map(o => <tr key={o.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2 font-medium">{o.code}</td><td className="max-w-[220px] p-2"><Link href={`/opportunities/${o.id}`} className="block truncate font-semibold text-blue-700 hover:underline">{o.title}</Link></td>
        <td className="max-w-[180px] truncate p-2">{o.customerName}</td><td className="w-44 p-2">{o.status === 'open' && canMove(o) ? stageSelect(o, config.stages) : o.stageName}</td>
        <td className="whitespace-nowrap p-2 font-semibold">{formatVnd(o.value)}</td><td className="p-2">{o.probability}%</td><td className="p-2">{formatDate(o.expectedCloseDate)}</td><td className="p-2">{o.ownerName}</td><td className="p-2"><StatusBadge s={o.status} /></td></tr>)}</tbody></table>
      {!filtered.length && <p className="p-6 text-center text-sm text-slate-500">Không có cơ hội phù hợp bộ lọc.</p>}<p className="mt-3 text-xs text-slate-500">{filtered.length} cơ hội</p></div>}
    {needNote && <Modal title="Quay lại giai đoạn trước" onClose={() => setNeedNote(null)}><div className="space-y-3"><p className="text-sm text-slate-600">Chuyển “{needNote.o.title}” về giai đoạn trước cần ghi chú lý do.</p>
      <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} className="min-h-[80px] w-full rounded-md border border-slate-200 p-3 text-sm" placeholder="Lý do quay lại giai đoạn trước *" />
      <div className="flex justify-end gap-2"><button onClick={() => setNeedNote(null)} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
        <button disabled={!note.trim()} onClick={() => { const n = needNote; setNeedNote(null); move(n.o, n.stageId, note.trim()); }} className="h-10 rounded-md bg-blue-600 px-5 text-sm text-white disabled:opacity-50">Xác nhận</button></div></div></Modal>}
    {closing && <CloseDialog id={closing.id} result={closing.result} onClose={() => setClosing(null)} onDone={() => { setClosing(null); load(); }} />}</div>);
}
