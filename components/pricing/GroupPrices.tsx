'use client';
import { useMemo, useState } from 'react';
import { History, Loader2, Pencil, Percent, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { adjustPrice } from '@/lib/price-list-core';
import type { ItemDto } from '@/types/catalog';
import type { UpsertResult } from '@/types/price-list';
import type { GroupPriceDto, GroupPriceHistoryDto } from '@/types/pricing';
import { Modal } from '@/components/ui/Modal';
import Timeline from '@/components/ui/HistoryTimeline';
import { Alert, area, FormFooter, fmtNum, inp, L } from '@/components/ui/form';
import { Denied, errMsg, money, useApiData } from '@/components/catalog/shared';
import { period, StateBadge } from '@/components/pricelist/shared';
import RequestChangeDialog from './RequestChange';
import { ItemPicker, sel, useGroupList } from './shared';

type Page = { items: GroupPriceDto[]; nextCursor: string | null; can: { edit: boolean; editPriority: boolean } };
const META: Record<string, [string, string]> = { created: ['Thêm giá theo nhóm', '#2563eb'], price_changed: ['Thay đổi giá', '#10b981'], updated: ['Cập nhật', '#64748b'] };

/** Giá theo nhóm khách hàng: lọc, thêm, sửa, điều chỉnh hàng loạt, xem lịch sử */
export default function GroupPrices() {
  const { groups } = useGroupList(), { profile } = useAuth(), canRequest = profile?.role === 'manager', [reqRow, setReqRow] = useState<GroupPriceDto | null>(null);
  const [groupId, setGroupId] = useState(''), [status, setStatus] = useState(''), [q, setQ] = useState(''), [more, setMore] = useState<GroupPriceDto[]>([]), [cursor, setCursor] = useState<string | null | undefined>(undefined), [loadingMore, setLoadingMore] = useState(false);
  const qs = `?limit=100${groupId ? `&groupId=${groupId}` : ''}${status ? `&status=${status}` : ''}`;
  const { data, err, denied, loading, reload } = useApiData<Page>(`/api/catalog/group-prices${qs}`);
  const [dlg, setDlg] = useState<'add' | 'adjust' | null>(null), [edit, setEdit] = useState<GroupPriceDto | null>(null), [hist, setHist] = useState<GroupPriceDto | null>(null), [pick, setPick] = useState<Set<string>>(new Set()), [msg, setMsg] = useState<string | null>(null);
  const all = useMemo(() => [...(data?.items ?? []), ...more], [data, more]);
  const next = cursor === undefined ? data?.nextCursor ?? null : cursor;
  const rows = useMemo(() => all.filter(r => !q || `${r.itemCode} ${r.itemName}`.toLowerCase().includes(q.toLowerCase())), [all, q]);
  const refresh = () => { setMore([]); setCursor(undefined); setPick(new Set()); reload(); };
  const filt = (fn: () => void) => { fn(); setMore([]); setCursor(undefined); setPick(new Set()); };
  if (denied) return <Denied />;
  async function loadMore() {
    if (!next || loadingMore) return; setLoadingMore(true);
    try { const r = await api<Page>(`/api/catalog/group-prices${qs}&cursor=${encodeURIComponent(next)}`); setMore(m => [...m, ...r.items]); setCursor(r.nextCursor); } catch (e) { setMsg(errMsg(e, 'Không tải thêm được.')); } finally { setLoadingMore(false); }
  }
  const sel1 = rows.filter(r => pick.has(r.id)), can = data?.can.edit;
  return (<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Giá theo nhóm khách hàng</h1><p className="text-sm text-slate-500">Giá riêng của từng mặt hàng cho từng nhóm khách hàng; được ưu tiên hơn bảng giá.</p></div>
    {can && <div className="flex gap-2"><button disabled={!sel1.length} onClick={() => setDlg('adjust')} className="flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 disabled:opacity-40"><Percent size={15} />Điều chỉnh giá ({sel1.length})</button>
      <button onClick={() => setDlg('add')} className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Thêm giá theo nhóm</button></div>}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Lọc theo mã hoặc tên mặt hàng…" aria-label="Lọc mặt hàng" className="h-9 min-w-[220px] flex-1 rounded-lg bg-slate-100 px-3 text-sm outline-none" />
        <select aria-label="Lọc nhóm" value={groupId} onChange={e => filt(() => setGroupId(e.target.value))} className={sel}><option value="">Tất cả nhóm</option>{groups?.map(g => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select>
        <select aria-label="Lọc trạng thái" value={status} onChange={e => filt(() => setStatus(e.target.value))} className={sel}><option value="">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></div>
      {(msg || err) && <div className="mb-3"><Alert>{msg ?? err}</Alert></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="w-8 p-2">{can && <input type="checkbox" aria-label="Chọn tất cả" className="accent-blue-600" checked={rows.length > 0 && rows.every(r => pick.has(r.id))} onChange={e => setPick(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} />}</th>
        {['Mặt hàng', 'Nhóm khách hàng', 'Giá theo nhóm', 'Giá mặc định', 'Thời gian hiệu lực', 'Trạng thái', 'Cập nhật', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => (<tr key={r.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2">{can && <input type="checkbox" aria-label={`Chọn ${r.itemCode} ${r.groupName}`} className="accent-blue-600" checked={pick.has(r.id)} onChange={e => setPick(p => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />}</td>
          <td className="p-2"><span className="font-medium">{r.itemCode}</span> <span className="text-slate-600">{r.itemName}</span></td><td className="p-2">{r.groupName}</td><td className="p-2 font-semibold">{money(r.price)}</td><td className="p-2 text-slate-500">{money(r.defaultPrice)}</td>
          <td className="p-2 whitespace-nowrap">{period(r.startDate, r.endDate)}</td><td className="p-2"><StateBadge s={r.state} /></td><td className="p-2 text-slate-500">{r.updatedByName}</td>
          <td className="p-2"><span className="flex gap-3">{!can && canRequest && <button aria-label={`Xin đổi giá ${r.itemCode} ${r.groupName}`} title="Xin đổi giá" onClick={() => setReqRow(r)} className="text-xs text-blue-600 hover:underline">Xin đổi giá</button>}{can && <button aria-label={`Sửa ${r.itemCode} ${r.groupName}`} onClick={() => setEdit(r)} className="text-slate-500 hover:text-blue-600"><Pencil size={15} /></button>}<button aria-label={`Lịch sử ${r.itemCode} ${r.groupName}`} onClick={() => setHist(r)} className="text-slate-500 hover:text-blue-600"><History size={15} /></button></span></td></tr>))}</tbody></table>
        {loading && !data ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{all.length ? 'Không có dòng nào khớp bộ lọc.' : 'Chưa có giá theo nhóm nào.'}</p>}</div>
      {next && <div className="pt-3 text-center"><button onClick={loadMore} disabled={loadingMore} className="h-9 rounded-lg border px-4 text-sm">{loadingMore ? 'Đang tải…' : 'Tải thêm'}</button></div>}</div>
    {dlg === 'add' && <AddDialog groups={groups ?? []} defaultGroup={groupId} onClose={() => setDlg(null)} onDone={refresh} />}
    {dlg === 'adjust' && <AdjustDialog rows={sel1} onClose={() => setDlg(null)} onDone={refresh} />}
    {edit && <EditDialog row={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); refresh(); }} />}
    {reqRow && <RequestChangeDialog kind="groupPrice" targetId={reqRow.groupId} targetName={reqRow.groupName} itemId={reqRow.itemId} itemLabel={`${reqRow.itemCode} – ${reqRow.itemName}`} current={reqRow.price} onClose={() => setReqRow(null)} onDone={m => { setReqRow(null); setMsg(m); }} />}
    {hist && <HistoryDialog row={hist} onClose={() => setHist(null)} />}</div>);
}

const fail = (r: UpsertResult[]) => r.filter(x => x.result === 'error');
function Summary({ r, label, onClose }: { r: UpsertResult[]; label: (i: number) => string; onClose: () => void }) {
  const c = (k: string) => r.filter(x => x.result === k).length, e = fail(r);
  return (<div className="space-y-3 text-sm"><p className="rounded-md bg-emerald-50 p-3 text-emerald-700">Thêm mới <b>{c('added')}</b> · Cập nhật <b>{c('updated')}</b> · Không đổi <b>{c('unchanged')}</b></p>
    {e.length > 0 && <div className="rounded-md bg-red-50 p-3 text-red-600"><p>{e.length} dòng không lưu được:</p><ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">{e.map(x => <li key={x.index}>{label(x.index)}: {x.error}</li>)}</ul></div>}
    <button onClick={onClose} className="h-9 rounded-md bg-blue-600 px-4 text-white">Đóng</button></div>);
}
async function send(groupId: string, rows: { itemId: string; price: number }[], extra: Record<string, unknown>) {
  const out: UpsertResult[] = [];
  for (let i = 0; i < rows.length; i += 100) { const r = await api<{ results: UpsertResult[] }>('/api/catalog/group-prices', { method: 'POST', json: { groupId, rows: rows.slice(i, i + 100), ...extra } }); out.push(...r.results.map(x => ({ ...x, index: x.index + i }))); }
  return out;
}

function AddDialog({ groups, defaultGroup, onClose, onDone }: { groups: { groupId: string; groupName: string }[]; defaultGroup: string; onClose: () => void; onDone: () => void }) {
  const [groupId, setGroupId] = useState(defaultGroup), [items, setItems] = useState<ItemDto[]>([]), [prices, setPrices] = useState<Record<string, string>>({}), [startDate, setStart] = useState(''), [endDate, setEnd] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [result, setResult] = useState<UpsertResult[] | null>(null);
  const pick = (v: ItemDto[]) => { setItems(v); setPrices(p => Object.fromEntries(v.map(i => [i.id, p[i.id] ?? String(i.defaultPrice)]))); };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; if (!groupId) return setErr('Vui lòng chọn nhóm khách hàng.'); if (!items.length) return setErr('Vui lòng chọn ít nhất một mặt hàng.'); if (startDate && endDate && endDate < startDate) return setErr('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
    setBusy(true); setErr(null);
    try { setResult(await send(groupId, items.map(i => ({ itemId: i.id, price: Number(prices[i.id] || 0) })), { mode: 'add', startDate, endDate, reason })); onDone(); } catch (x) { setErr(errMsg(x, 'Không lưu được giá theo nhóm.')); } finally { setBusy(false); }
  }
  if (result) return <Modal wide title="Kết quả thêm giá theo nhóm" onClose={onClose}><Summary r={result} label={i => items[i]?.code ?? `Dòng ${i + 1}`} onClose={onClose} /></Modal>;
  return (<Modal wide title="Thêm giá theo nhóm khách hàng" onClose={() => !busy && onClose()}><form onSubmit={submit} className="space-y-3" noValidate>{err && <Alert>{err}</Alert>}
    <L t="Nhóm khách hàng *"><select className={inp} value={groupId} onChange={e => setGroupId(e.target.value)}><option value="">— Chọn nhóm —</option>{groups.map(g => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}</select></L>
    <div><div className="mb-1 text-xs font-medium text-slate-600">Sản phẩm / dịch vụ *</div><ItemPicker value={items} onChange={pick} /></div>
    {items.length > 0 && <div className="max-h-40 space-y-1 overflow-auto">{items.map(i => <div key={i.id} className="flex items-center gap-2 text-xs"><span className="w-20 font-medium">{i.code}</span><span className="flex-1 truncate">{i.name}</span>
      <input aria-label={`Giá ${i.code}`} inputMode="numeric" value={fmtNum(prices[i.id] ?? '')} onChange={e => setPrices(p => ({ ...p, [i.id]: e.target.value.replace(/\D/g, '').slice(0, 13) }))} className="h-8 w-32 rounded-md border border-slate-200 px-2 text-right text-sm" /></div>)}</div>}
    <div className="grid grid-cols-2 gap-3"><L t="Ngày bắt đầu"><input type="date" className={inp} value={startDate} onChange={e => setStart(e.target.value)} /></L><L t="Ngày kết thúc"><input type="date" className={inp} value={endDate} onChange={e => setEnd(e.target.value)} /></L></div>
    <L t="Lý do"><textarea className={area} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></L>
    <p className="text-xs text-slate-400">Mặt hàng đã có giá cho nhóm này sẽ bị bỏ qua, giá hiện có không bị ghi đè.</p>
    <FormFooter busy={busy} label={`Thêm ${items.length || ''} mặt hàng`} onClose={onClose} /></form></Modal>);
}

function AdjustDialog({ rows, onClose, onDone }: { rows: GroupPriceDto[]; onClose: () => void; onDone: () => void }) {
  const [pct, setPct] = useState(''), [step, setStep] = useState('1'), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [result, setResult] = useState<UpsertResult[][] | null>(null);
  const bp = useMemo(() => { const n = Number(pct.replace(',', '.')); return pct.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= 1000 && Math.round(n * 100) / 100 === n ? Math.round(n * 100) : null; }, [pct]);
  const nxt = (r: GroupPriceDto) => (bp === null ? r.price : adjustPrice(r.price, bp, Number(step)));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; if (bp === null || bp === 0) return setErr('Nhập phần trăm khác 0 (từ -1000% đến 1000%, tối đa 2 chữ số thập phân).'); setBusy(true); setErr(null);
    try {
      const by: Record<string, GroupPriceDto[]> = {}; rows.forEach(r => (by[r.groupId] ||= []).push(r));
      // Điều chỉnh giữ nguyên ngày hiệu lực của dòng hiện có: gửi theo từng nhóm, chế độ "đặt giá"
      setResult(await Promise.all(Object.entries(by).map(([g, rs]) => send(g, rs.map(r => ({ itemId: r.itemId, price: nxt(r) })), { mode: 'set', reason: reason.trim() || `Điều chỉnh ${pct}%` })))); onDone();
    } catch (x) { setErr(errMsg(x, 'Không cập nhật được giá.')); } finally { setBusy(false); }
  }
  if (result) { const flat = result.flat(); return <Modal title="Kết quả điều chỉnh giá" onClose={onClose}><Summary r={flat.map((x, i) => ({ ...x, index: i }))} label={i => `Dòng ${i + 1}`} onClose={onClose} /></Modal>; }
  return (<Modal title={`Điều chỉnh giá ${rows.length} dòng`} onClose={() => !busy && onClose()}><form onSubmit={submit} className="space-y-3" noValidate>{err && <Alert>{err}</Alert>}
    <L t="Tăng / giảm (%) *" hint="Ví dụ: 10 để tăng 10%, -5 để giảm 5%."><input autoFocus inputMode="decimal" className={inp} value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.,-]/g, '').slice(0, 8))} /></L>
    <L t="Làm tròn đến"><select className={inp} value={step} onChange={e => setStep(e.target.value)}><option value="1">1 đồng</option><option value="100">100 đồng</option><option value="1000">1.000 đồng</option></select></L>
    <L t="Lý do"><textarea className={area} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></L>
    <div className="max-h-40 overflow-auto rounded-lg border text-xs"><table className="w-full"><tbody>{rows.slice(0, 20).map(r => <tr key={r.id} className="border-b last:border-0"><td className="p-2 font-medium">{r.itemCode}</td><td className="p-2">{r.groupName}</td><td className="p-2">{money(r.price)}</td><td className="p-2">→</td><td className="p-2 font-semibold">{money(nxt(r))}</td></tr>)}</tbody></table>{rows.length > 20 && <p className="p-2 text-slate-400">… và {rows.length - 20} dòng khác</p>}</div>
    <FormFooter busy={busy} label="Áp dụng" onClose={onClose} /></form></Modal>);
}

function EditDialog({ row, onClose, onDone }: { row: GroupPriceDto; onClose: () => void; onDone: () => void }) {
  const [price, setPrice] = useState(String(row.price)), [startDate, setStart] = useState(row.startDate ?? ''), [endDate, setEnd] = useState(row.endDate ?? ''), [status, setStatus] = useState(row.status), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; if (startDate && endDate && endDate < startDate) return setErr('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.'); setBusy(true); setErr(null);
    try { await api(`/api/catalog/group-prices/${row.id}`, { method: 'PATCH', json: { price: Number(price || 0), startDate, endDate, status, reason, version: row.version } }); onDone(); } catch (x) { setErr(errMsg(x, 'Không lưu được.')); setBusy(false); }
  }
  return (<Modal title={`Sửa giá: ${row.itemCode} – ${row.groupName}`} onClose={() => !busy && onClose()}><form onSubmit={submit} className="space-y-3" noValidate>{err && <Alert>{err}</Alert>}
    <L t="Giá theo nhóm (VND) *"><input autoFocus inputMode="numeric" className={inp} value={fmtNum(price)} onChange={e => setPrice(e.target.value.replace(/\D/g, '').slice(0, 13))} /></L>
    <div className="grid grid-cols-2 gap-3"><L t="Ngày bắt đầu"><input type="date" className={inp} value={startDate} onChange={e => setStart(e.target.value)} /></L><L t="Ngày kết thúc"><input type="date" className={inp} value={endDate} onChange={e => setEnd(e.target.value)} /></L></div>
    <L t="Trạng thái"><select className={inp} value={status} onChange={e => setStatus(e.target.value as 'active' | 'inactive')}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></L>
    <L t="Lý do"><textarea className={area} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></L>
    <FormFooter busy={busy} label="Lưu" onClose={onClose} /></form></Modal>);
}

function HistoryDialog({ row, onClose }: { row: GroupPriceDto; onClose: () => void }) {
  const { data, err } = useApiData<{ items: GroupPriceHistoryDto[] }>(`/api/catalog/group-prices/${row.id}/history`);
  return (<Modal wide title={`Lịch sử: ${row.itemCode} – ${row.groupName}`} onClose={onClose}>{err && <Alert>{err}</Alert>}{!data && !err ? <p className="text-sm text-slate-500"><Loader2 className="inline animate-spin" size={14} /> Đang tải…</p>
    : <Timeline meta={META} items={(data?.items ?? []).map(h => ({ id: h.id, type: h.type, at: h.at, actorName: h.actorName, changes: h.changes, note: [h.type !== 'updated' && h.newPrice !== null && (h.oldPrice !== null ? `${money(h.oldPrice)} → ${money(h.newPrice)}` : `Giá ${money(h.newPrice)}`), h.reason].filter(Boolean).join(' · ') }))} />}</Modal>);
}
