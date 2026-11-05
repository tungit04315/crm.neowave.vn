'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { STAGE_COLORS, type PipelineConfig, type StageInput } from '@/lib/pipeline-core';

type Row = StageInput & { key: string };
const mkKey = () => Math.random().toString(36).slice(2);
const toRows = (c: PipelineConfig): Row[] => c.stages.map(s => ({ ...s, key: s.id }));
const inp = 'h-9 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50';

export default function StageSettings() {
  const [cfg, setCfg] = useState<PipelineConfig | null>(null); const [rows, setRows] = useState<Row[]>([]); const [canEdit, setCanEdit] = useState(false);
  const [allowSkip, setAllowSkip] = useState(true); const [backNote, setBackNote] = useState(true);
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const apply = (c: PipelineConfig) => { setCfg(c); setRows(toRows(c)); setAllowSkip(c.allowSkip); setBackNote(c.backwardRequiresNote); };
  const load = useCallback(() => api<{ config: PipelineConfig; can: { edit: boolean } }>('/api/sales/stages').then(r => { apply(r.config); setCanEdit(r.can.edit); }).catch(e => setErr(e instanceof ApiError ? e.message : 'Không tải được cấu hình.')), []);
  useEffect(() => { load(); }, [load]);
  const upd = (k: string, p: Partial<Row>) => { setOk(false); setRows(rs => rs.map(r => (r.key === k ? { ...r, ...p } : r))); };
  const swap = (i: number, j: number) => { setOk(false); setRows(rs => { const x = [...rs]; [x[i], x[j]] = [x[j], x[i]]; return x; }); };

  async function save() {
    if (busy || !cfg) return; setBusy(true); setErr(null); setOk(false);
    try {
      const r = await api<{ config: PipelineConfig }>('/api/sales/stages', { method: 'PUT', json: { stages: rows.map(({ key, ...s }) => s), allowSkip, backwardRequiresNote: backNote, version: cfg.version } });
      apply(r.config); setOk(true);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Không lưu được cấu hình.'); if (e instanceof ApiError && e.code === 'conflict') load(); } finally { setBusy(false); }
  }
  return (<div className="space-y-4">
    <div><h1 className="text-2xl font-bold text-slate-900">Cấu hình giai đoạn bán hàng</h1><p className="text-sm text-slate-500">Thứ tự từ trên xuống là thứ tự các cột trên Pipeline. Xác suất mặc định được áp dụng khi cơ hội chuyển vào giai đoạn.</p></div>
    {!canEdit && cfg && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Bạn chỉ có quyền xem. Chỉ Giám đốc hoặc Quản trị viên mới được thay đổi cấu hình.</p>}
    {err && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</div>}{ok && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Đã lưu cấu hình giai đoạn.</div>}
    {!cfg && !err && <p className="text-sm text-slate-500">Đang tải…</p>}
    {cfg && <><div className="space-y-3">{rows.map((r, i) => <div key={r.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white" style={{ background: r.color }}>{i + 1}</span>
      <input aria-label="Tên giai đoạn" disabled={!canEdit} value={r.name} maxLength={40} onChange={e => upd(r.key, { name: e.target.value })} className={`${inp} min-w-[180px] flex-1`} />
      <label className="flex items-center gap-1 text-xs text-slate-500">Xác suất<input aria-label="Xác suất mặc định" type="number" min={0} max={100} disabled={!canEdit} value={r.probability} onChange={e => upd(r.key, { probability: Math.round(Number(e.target.value)) })} className={`${inp} w-20`} />%</label>
      <span className="flex gap-1">{STAGE_COLORS.map(c => <button key={c} type="button" disabled={!canEdit} aria-label={`Màu ${c}`} onClick={() => upd(r.key, { color: c })} className={`h-5 w-5 rounded-full ${r.color === c ? 'ring-2 ring-offset-1 ring-blue-500' : ''}`} style={{ background: c }} />)}</span>
      {canEdit && <span className="ml-auto flex gap-1 text-slate-500"><button disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label="Lên" className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={16} /></button>
        <button disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)} aria-label="Xuống" className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={16} /></button>
        <button disabled={rows.length <= 2} onClick={() => { setOk(false); setRows(rs => rs.filter(x => x.key !== r.key)); }} aria-label="Xóa giai đoạn" className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 size={16} /></button></span>}</div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600"><span className="font-medium text-slate-500">Điều kiện để vào giai đoạn:</span>
        {([['requireValue', 'Có giá trị dự kiến > 0'], ['requireCloseDate', 'Có ngày dự kiến chốt'], ['requireDescription', 'Có mô tả']] as const).map(([k, l]) => <label key={k} className="flex items-center gap-1.5">
          <input type="checkbox" disabled={!canEdit} checked={r[k]} onChange={e => upd(r.key, { [k]: e.target.checked })} className="accent-blue-600" />{l}</label>)}</div></div>)}</div>
      {canEdit && rows.length < 12 && <button onClick={() => { setOk(false); setRows(rs => [...rs, { key: mkKey(), name: '', color: STAGE_COLORS[rs.length % STAGE_COLORS.length], probability: 50, requireValue: false, requireCloseDate: false, requireDescription: false }]); }}
        className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"><Plus size={15} />Thêm giai đoạn</button>}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"><b className="text-xs uppercase text-slate-500">Quy tắc chuyển giai đoạn</b>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={!canEdit} checked={allowSkip} onChange={e => { setAllowSkip(e.target.checked); setOk(false); }} className="accent-blue-600" />Cho phép bỏ qua giai đoạn (nhảy cóc)</label>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={!canEdit} checked={backNote} onChange={e => { setBackNote(e.target.checked); setOk(false); }} className="accent-blue-600" />Quay lại giai đoạn trước phải ghi chú lý do</label></div>
      {canEdit && <div className="flex items-center justify-end gap-3"><span className="text-xs text-slate-400">Phiên bản cấu hình: {cfg.version}</span>
        <button onClick={save} disabled={busy} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white disabled:opacity-70">{busy && <Loader2 size={15} className="animate-spin" />}Lưu cấu hình</button></div>}</>}</div>);
}
