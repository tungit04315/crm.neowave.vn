'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Download, FileUp, Percent, Plus, Power, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { downloadCsv, downloadXlsx, stamp } from '@/lib/customer-io';
import { exportPriceListMatrix, LIST_TYPE_LABEL } from '@/lib/price-list-core';
import { priceDelta } from '@/lib/catalog-core';
import type { PriceListDetail as Detail, PriceListHistoryDto, PriceListRowDto, PriceListRows } from '@/types/price-list';
import { Field, Section } from '@/components/ui/Info';
import Timeline from '@/components/ui/HistoryTimeline';
import { Alert, fmtNum, newRequestId } from '@/components/ui/form';
import { Denied, errMsg, ItemStatusBadge, money, useApiData, when } from '@/components/catalog/shared';
import RequestChangeDialog from '@/components/pricing/RequestChange';
import { AddItemsDialog, AdjustDialog, ImportPricesDialog, sendPrices } from './RowDialogs';
import { dmy, period, StateBadge } from './shared';

type Tab = 'info' | 'rows' | 'history';
const TABS: [Tab, string][] = [['info', 'Thông tin'], ['rows', 'Danh sách giá'], ['history', 'Lịch sử']];
const META: Record<string, [string, string]> = { created: ['Tạo bảng giá', '#2563eb'], updated: ['Cập nhật thông tin', '#64748b'], status_changed: ['Đổi trạng thái', '#7c3aed'], item_added: ['Thêm mặt hàng', '#10b981'], item_removed: ['Xóa mặt hàng', '#ef4444'], price_changed: ['Thay đổi giá', '#f59e0b'], duplicated: ['Nhân bản', '#0ea5e9'], deleted: ['Xóa', '#ef4444'] };
const btn = 'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium disabled:opacity-50';

/** Chi tiết bảng giá (10.2.1-F): thông tin chung, danh sách giá, lịch sử thay đổi */
export default function PriceListDetail({ id }: { id: string }) {
  const router = useRouter(); const { profile } = useAuth(), canRequest = profile?.role === 'manager'; const [reqRow, setReqRow] = useState<PriceListRowDto | null>(null); const { data: d, err, denied, reload } = useApiData<Detail>(`/api/catalog/price-lists/${id}`);
  const [tab, setTab] = useState<Tab>('rows'); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [rev, setRev] = useState(0);
  const [dlg, setDlg] = useState<'add' | 'adjust' | 'import' | null>(null);
  // danh sách giá (phân trang con trỏ, tải lại khi `rev` đổi)
  const [rows, setRows] = useState<{ key: number; items: PriceListRowDto[]; next: string | null; err?: string } | null>(null); const [more, setMore] = useState(false);
  useEffect(() => {
    let live = true;
    api<PriceListRows>(`/api/catalog/price-lists/${id}/items?limit=50`).then(r => { if (live) setRows({ key: rev, items: r.rows, next: r.nextCursor }); }).catch(e => { if (live) setRows(p => ({ key: rev, items: p?.items ?? [], next: null, err: errMsg(e, 'Không tải được danh sách giá.') })); });
    return () => { live = false; };
  }, [id, rev]);
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string[]>([]); const [edit, setEdit] = useState<{ id: string; v: string } | null>(null);
  const shown = useMemo(() => (rows?.items ?? []).filter(r => !q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const changed = useCallback(() => { setRev(x => x + 1); reload(); setSel([]); }, [reload]);
  if (denied) return <Denied />;
  if (err && !d) return <div className="space-y-2"><p className="text-sm text-red-500">{err}</p><Link href="/products/price-lists" className="text-sm text-blue-600">← Danh sách bảng giá</Link></div>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const { list: l, can } = d, loading = !rows || rows.key !== rev;
  async function act(fn: () => Promise<unknown>, fallback: string) { if (busy) return; setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg(errMsg(e, fallback)); reload(); } finally { setBusy(false); } }
  const toggle = () => act(async () => { await api(`/api/catalog/price-lists/${id}/status`, { method: 'POST', json: { status: l.status === 'active' ? 'inactive' : 'active', version: l.version } }); reload(); }, 'Không đổi được trạng thái.');
  const dup = () => confirm(`Nhân bản “${l.name}” kèm ${l.itemCount} mặt hàng?`) && act(async () => { const r = await api<{ id: string }>(`/api/catalog/price-lists/${id}/duplicate`, { method: 'POST', json: { requestId: newRequestId() } }); router.push(`/products/price-lists/${r.id}`); }, 'Không nhân bản được.');
  const del = () => confirm(`Xóa bảng giá “${l.name}”?`) && act(async () => { await api(`/api/catalog/price-lists/${id}`, { method: 'DELETE', json: { version: l.version } }); router.push('/products/price-lists'); }, 'Không xóa được bảng giá.');
  const exp = (fmt: 'xlsx' | 'csv') => act(async () => {
    const r = await api<{ rows: PriceListRowDto[]; truncated: boolean }>(`/api/catalog/price-lists/${id}/export`), m = exportPriceListMatrix(r.rows), name = `${l.code}-${stamp()}.${fmt}`;
    if (fmt === 'xlsx') await downloadXlsx(m, name); else downloadCsv(m, name); if (r.truncated) setMsg('Chỉ xuất được 5.000 dòng đầu.');
  }, 'Không xuất được tệp.');
  async function loadMore() { if (!rows?.next || more) return; setMore(true); try { const r = await api<PriceListRows>(`/api/catalog/price-lists/${id}/items?limit=50&cursor=${encodeURIComponent(rows.next)}`); setRows(p => p && ({ ...p, items: [...p.items, ...r.rows], next: r.nextCursor })); } catch (e) { setMsg(errMsg(e, 'Không tải thêm được.')); } finally { setMore(false); } }
  async function savePrice(r: PriceListRowDto) {
    if (!edit) return; const price = Number(edit.v); setEdit(null); if (!Number.isFinite(price) || price === r.price) return;
    await act(async () => { const [x] = await sendPrices(id, [{ itemId: r.itemId, price, expectedPrice: r.price }], {}); if (x.result === 'error') throw new Error(x.error); changed(); }, 'Không lưu được giá.');
  }
  async function removeSel() {
    if (!sel.length || !confirm(`Xóa ${sel.length} mặt hàng khỏi bảng giá?`)) return;
    await act(async () => { for (let i = 0; i < sel.length; i += 100) await api(`/api/catalog/price-lists/${id}/items`, { method: 'DELETE', json: { itemIds: sel.slice(i, i + 100) } }); changed(); }, 'Không xóa được mặt hàng.');
  }
  const picked = (rows?.items ?? []).filter(r => sel.includes(r.itemId)), allOn = shown.length > 0 && shown.every(r => sel.includes(r.itemId));
  return (<div className="space-y-4"><Link href="/products/price-lists" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} />Danh sách bảng giá</Link>
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">{l.name}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="rounded-md bg-slate-100 px-2 py-0.5">{l.code}</span><span>{LIST_TYPE_LABEL[l.type]}</span><StateBadge s={l.state} /><span>{period(l.startDate, l.endDate)}</span></div></div>
      <div className="flex flex-wrap gap-2">{can.edit && <><Link href={`/products/price-lists/${id}/edit`} className={`${btn} border border-slate-200 text-slate-700`}>Chỉnh sửa</Link><button disabled={busy} onClick={dup} className={`${btn} border border-slate-200 text-slate-700`}><Copy size={14} />Nhân bản</button>
        <button disabled={busy} onClick={toggle} className={`${btn} border border-slate-200 text-slate-700`}><Power size={14} />{l.status === 'active' ? 'Ngừng hoạt động' : 'Kích hoạt'}</button>{l.status === 'inactive' && <button disabled={busy} onClick={del} className={`${btn} border border-red-200 text-red-600`}><Trash2 size={14} />Xóa</button>}</>}
        {can.export && <><button disabled={busy} onClick={() => exp('xlsx')} className={`${btn} border border-blue-200 text-blue-700`}><Download size={14} />Xuất Excel</button><button disabled={busy} onClick={() => exp('csv')} className={`${btn} border border-blue-200 text-blue-700`}>CSV</button></>}</div></div></div>
    {msg && <Alert>{msg}</Alert>}
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">{TABS.map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>{t}</button>)}</div>
    {tab === 'info' && <Section title="Thông tin chung"><div className="grid gap-4 md:grid-cols-2"><Field label="Mã bảng giá" value={l.code} /><Field label="Tên bảng giá" value={l.name} /><Field label="Loại" value={LIST_TYPE_LABEL[l.type]} /><Field label="Phạm vi áp dụng" value={l.scopeNote || '—'} />
      <Field label="Ngày bắt đầu" value={dmy(l.startDate) || 'Không giới hạn'} /><Field label="Ngày kết thúc" value={dmy(l.endDate) || 'Không giới hạn'} /><Field label="Nhóm khách hàng áp dụng" value={l.customerGroupNames.join(', ') || 'Tất cả'} /><Field label="Tiền tệ" value="VND" />
      <Field label="Số mặt hàng" value={String(l.itemCount)} /><Field label="Người tạo" value={l.createdByName} /><Field label="Ngày tạo" value={when(l.createdAt)} /><Field label="Cập nhật" value={when(l.updatedAt)} /><div className="md:col-span-2"><Field label="Mô tả" value={l.description || '—'} /></div></div></Section>}
    {tab === 'rows' && <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center gap-2">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Lọc theo mã hoặc tên…" aria-label="Lọc mặt hàng" className="h-9 min-w-[200px] flex-1 rounded-lg bg-slate-100 px-3 text-sm outline-none" />
      {can.edit && <><button onClick={() => setDlg('add')} className={`${btn} bg-blue-600 text-white`}><Plus size={15} />Thêm mặt hàng</button><button onClick={() => setDlg('import')} className={`${btn} border border-blue-200 text-blue-700`}><FileUp size={15} />Nhập giá Excel</button>
        <button disabled={!sel.length} onClick={() => setDlg('adjust')} className={`${btn} border border-slate-200 text-slate-700`}><Percent size={14} />Điều chỉnh giá ({sel.length})</button><button disabled={!sel.length || busy} onClick={removeSel} className={`${btn} border border-red-200 text-red-600`}><Trash2 size={14} />Xóa khỏi bảng giá</button></>}</div>
      {rows?.err && <div className="mb-3"><Alert>{rows.err}</Alert></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{can.edit && <th className="w-8 p-2"><input type="checkbox" aria-label="Chọn tất cả" className="accent-blue-600" checked={allOn} onChange={e => setSel(e.target.checked ? [...new Set([...sel, ...shown.map(r => r.itemId)])] : sel.filter(x => !shown.some(r => r.itemId === x)))} /></th>}
        {['Mã', 'Tên', 'Nhóm', 'Đơn vị', 'Giá mặc định', 'Giá trong bảng giá', 'Chênh lệch', 'Thuế', 'Trạng thái'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{shown.map(r => { const dl = priceDelta(r.defaultPrice, r.price), editing = edit?.id === r.itemId; return (<tr key={r.itemId} className="border-b last:border-0 hover:bg-slate-50">
          {can.edit && <td className="p-2"><input type="checkbox" aria-label={`Chọn ${r.code}`} className="accent-blue-600" checked={sel.includes(r.itemId)} onChange={e => setSel(s => e.target.checked ? [...s, r.itemId] : s.filter(x => x !== r.itemId))} /></td>}
          <td className="p-2 font-medium">{r.code}</td><td className="p-2"><Link href={`/products/${r.itemId}`} className="text-blue-700 hover:underline">{r.name}</Link></td><td className="p-2">{r.categoryName}</td><td className="p-2">{r.unitName}</td><td className="p-2">{money(r.defaultPrice)}</td>
          <td className="p-2 font-semibold">{editing ? <input autoFocus aria-label={`Giá ${r.code}`} inputMode="numeric" value={fmtNum(edit.v)} onChange={e => setEdit({ id: r.itemId, v: e.target.value.replace(/\D/g, '').slice(0, 13) })} onBlur={() => savePrice(r)} onKeyDown={e => { if (e.key === 'Enter') savePrice(r); if (e.key === 'Escape') setEdit(null); }} className="h-8 w-32 rounded-md border border-blue-400 px-2 text-right text-sm" />
            : can.edit ? <button onClick={() => setEdit({ id: r.itemId, v: String(r.price) })} title="Bấm để sửa giá" className="rounded px-1 hover:bg-blue-50">{money(r.price)}</button> : canRequest ? <span className="flex items-center gap-2">{money(r.price)}<button onClick={() => setReqRow(r)} aria-label={`Xin đổi giá ${r.code}`} className="text-xs font-normal text-blue-600 hover:underline">Xin đổi giá</button></span> : money(r.price)}</td>
          <td className={`p-2 ${dl.diff > 0 ? 'text-emerald-600' : dl.diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>{dl.diff === 0 ? '—' : `${dl.diff > 0 ? '+' : ''}${money(dl.diff)}`}</td><td className="p-2">{r.taxText || '—'}</td><td className="p-2"><ItemStatusBadge s={r.itemStatus} /></td></tr>); })}</tbody></table>
        {loading ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : shown.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{rows?.items.length ? 'Không có mặt hàng nào khớp.' : 'Bảng giá chưa có mặt hàng nào.'}</p>}</div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>Đang hiển thị {shown.length}/{l.itemCount} mặt hàng</span>{rows?.next && <button onClick={loadMore} disabled={more} className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-700">{more ? 'Đang tải…' : 'Tải thêm'}</button>}</div></div>}
    {tab === 'history' && <History id={id} rev={rev} />}
    {dlg === 'add' && <AddItemsDialog listId={id} onClose={() => setDlg(null)} onDone={changed} />}
    {dlg === 'adjust' && <AdjustDialog listId={id} rows={picked} onClose={() => setDlg(null)} onDone={changed} />}
    {dlg === 'import' && <ImportPricesDialog listId={id} onClose={() => setDlg(null)} onDone={changed} />}
    {reqRow && <RequestChangeDialog kind="priceList" targetId={id} targetName={`${l.code} – ${l.name}`} itemId={reqRow.itemId} itemLabel={`${reqRow.code} – ${reqRow.name}`} current={reqRow.price} onClose={() => setReqRow(null)} onDone={m => { setReqRow(null); setMsg(m); }} />}</div>);
}

function History({ id, rev }: { id: string; rev: number }) {
  const { data, err, loading } = useApiData<{ items: PriceListHistoryDto[] }>(`/api/catalog/price-lists/${id}/history?r=${rev}`); const [f, setF] = useState<'all' | 'price'>('all');
  const items = (data?.items ?? []).filter(h => f === 'all' || ['price_changed', 'item_added', 'item_removed'].includes(h.type));
  return (<Section title="Lịch sử thay đổi"><div className="mb-3 flex gap-2 text-xs">{([['all', 'Tất cả'], ['price', 'Giá và mặt hàng']] as const).map(([k, t]) => <button key={k} onClick={() => setF(k)} aria-pressed={f === k} className={`rounded-full px-3 py-1 ${f === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</button>)}</div>
    {err && <Alert>{err}</Alert>}{loading && !data && <p className="text-sm text-slate-500">Đang tải…</p>}
    <Timeline meta={META} empty="Chưa có lịch sử." items={items.map(h => ({ id: h.id, type: h.type, at: h.at, actorName: h.actorName, note: [h.itemCode && `${h.itemCode} – ${h.itemName ?? ''}`, h.type === 'price_changed' && `${money(h.oldPrice ?? 0)} → ${money(h.newPrice ?? 0)}`, h.type === 'item_added' && `Giá ${money(h.newPrice ?? 0)}`, h.reason, h.note].filter(Boolean).join(' · '), changes: h.changes.map(c => ({ field: c.field, label: c.label, from: c.from, to: c.to })) }))} /></Section>);
}
