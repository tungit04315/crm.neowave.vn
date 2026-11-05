'use client';
import { useEffect, useMemo, useState } from 'react';
import { FileUp, Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadCsv, downloadXlsx, readMatrix } from '@/lib/customer-io';
import { adjustPrice, parsePriceMatrix, PRICE_IMPORT_TEMPLATE, type PriceImportRow } from '@/lib/price-list-core';
import type { ItemDto, ItemList } from '@/types/catalog';
import type { PriceListRowDto, UpsertResult } from '@/types/price-list';
import { Modal } from '@/components/ui/Modal';
import { Alert, area, FormFooter, fmtNum, inp, L } from '@/components/ui/form';
import { errMsg, money } from '@/components/catalog/shared';

type Row = { itemId?: string; code?: string; price: number; expectedPrice?: number };
/** Gửi theo lô 100 dòng, gộp kết quả theo thứ tự dòng gửi */
export async function sendPrices(listId: string, rows: Row[], extra: { mode?: 'add' | 'set'; reason?: string }, onProgress?: (done: number) => void): Promise<UpsertResult[]> {
  const out: UpsertResult[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const r = await api<{ results: UpsertResult[] }>(`/api/catalog/price-lists/${listId}/items`, { method: 'POST', json: { rows: rows.slice(i, i + 100), ...extra } });
    out.push(...r.results.map(x => ({ ...x, index: x.index + i }))); onProgress?.(Math.min(i + 100, rows.length));
  }
  return out;
}
const tally = (r: UpsertResult[]) => ({ added: r.filter(x => x.result === 'added').length, updated: r.filter(x => x.result === 'updated').length, unchanged: r.filter(x => x.result === 'unchanged').length, errors: r.filter(x => x.result === 'error') });
function Summary({ r, label, onClose }: { r: UpsertResult[]; label: (i: number) => string; onClose: () => void }) {
  const t = tally(r);
  return (<div className="space-y-3 text-sm"><p className="rounded-md bg-emerald-50 p-3 text-emerald-700">Thêm mới <b>{t.added}</b> · Cập nhật <b>{t.updated}</b> · Không đổi <b>{t.unchanged}</b></p>
    {t.errors.length > 0 && <div className="rounded-md bg-red-50 p-3 text-red-600"><p>{t.errors.length} dòng không lưu được:</p><ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">{t.errors.slice(0, 50).map(e => <li key={e.index}>{label(e.index)}: {e.error}</li>)}</ul></div>}
    <button onClick={onClose} className="h-9 rounded-md bg-blue-600 px-4 text-white">Đóng</button></div>);
}

/** Thêm sản phẩm / dịch vụ vào bảng giá (chế độ "chỉ thêm": không bao giờ ghi đè giá đang có) */
export function AddItemsDialog({ listId, onClose, onDone }: { listId: string; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState(''), [dq, setDq] = useState(''), [found, setFound] = useState<ItemDto[]>([]), [loading, setLoading] = useState(true), [pick, setPick] = useState<Record<string, string>>({}), [picked, setPicked] = useState<Record<string, ItemDto>>({});
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [result, setResult] = useState<UpsertResult[] | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let live = true;
    api<ItemList>(`/api/catalog/items?status=active&limit=20${dq ? `&q=${encodeURIComponent(dq)}` : ''}`).then(r => { if (live) { setFound(r.items); setLoading(false); setErr(null); } }).catch(e => { if (live) { setErr(errMsg(e, 'Không tìm được mặt hàng.')); setLoading(false); } });
    return () => { live = false; };
  }, [dq]);
  const ids = Object.keys(pick);
  const toggle = (i: ItemDto) => { setPick(p => { const n = { ...p }; if (i.id in n) delete n[i.id]; else n[i.id] = String(i.defaultPrice); return n; }); setPicked(p => ({ ...p, [i.id]: i })); };
  async function submit() {
    if (!ids.length || busy) return; setBusy(true); setErr(null);
    try { const r = await sendPrices(listId, ids.map(id => ({ itemId: id, price: Number(pick[id] || 0) })), { mode: 'add' }); setResult(r); onDone(); } catch (e) { setErr(errMsg(e, 'Không thêm được mặt hàng.')); } finally { setBusy(false); }
  }
  if (result) return <Modal wide title="Kết quả thêm mặt hàng" onClose={onClose}><Summary r={result} label={i => picked[ids[i]]?.code ?? `Dòng ${i + 1}`} onClose={onClose} /></Modal>;
  return (<Modal wide title="Thêm sản phẩm / dịch vụ vào bảng giá" onClose={() => !busy && onClose()}><div className="space-y-3">{err && <Alert>{err}</Alert>}
    <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo mã hoặc tên (đầu từ)…" aria-label="Tìm mặt hàng" className="h-10 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
    <div className="max-h-64 overflow-auto rounded-lg border">{found.map(i => (<label key={i.id} className="flex cursor-pointer items-center gap-2 border-b p-2 text-xs last:border-0 hover:bg-slate-50"><input type="checkbox" className="accent-blue-600" checked={i.id in pick} onChange={() => toggle(i)} />
      <span className="w-20 font-medium">{i.code}</span><span className="flex-1 truncate">{i.name}</span><span className="text-slate-400">{money(i.defaultPrice)}</span></label>))}
      {loading ? <p className="p-4 text-center text-sm text-slate-500">Đang tìm…</p> : found.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Không có mặt hàng phù hợp.</p>}</div>
    {ids.length > 0 && <div><div className="mb-1 text-xs font-medium text-slate-600">Giá trong bảng giá ({ids.length} mặt hàng đã chọn — mặc định là giá bán mặc định)</div>
      <div className="max-h-44 space-y-1 overflow-auto">{ids.map(id => <div key={id} className="flex items-center gap-2 text-xs"><span className="w-20 font-medium">{picked[id]?.code}</span><span className="flex-1 truncate">{picked[id]?.name}</span>
        <input aria-label={`Giá ${picked[id]?.code}`} inputMode="numeric" value={fmtNum(pick[id])} onChange={e => setPick(p => ({ ...p, [id]: e.target.value.replace(/\D/g, '').slice(0, 13) }))} className="h-8 w-32 rounded-md border border-slate-200 px-2 text-right text-sm" /></div>)}</div></div>}
    <p className="text-xs text-slate-400">Mặt hàng đã có trong bảng giá sẽ bị bỏ qua, giá hiện có không bị ghi đè.</p>
    <div className="flex justify-end gap-2"><button onClick={onClose} disabled={busy} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
      <button onClick={submit} disabled={!ids.length || busy} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}Thêm {ids.length || ''} mặt hàng</button></div></div></Modal>);
}

/** Điều chỉnh giá hàng loạt theo phần trăm cho các dòng đã chọn */
export function AdjustDialog({ listId, rows, onClose, onDone }: { listId: string; rows: PriceListRowDto[]; onClose: () => void; onDone: () => void }) {
  const [pct, setPct] = useState(''), [step, setStep] = useState('1'), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [result, setResult] = useState<UpsertResult[] | null>(null);
  const bp = useMemo(() => { const n = Number(pct.replace(',', '.')); return pct.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= 1000 && Math.round(n * 100) / 100 === n ? Math.round(n * 100) : null; }, [pct]);
  const next = (r: PriceListRowDto) => (bp === null ? r.price : adjustPrice(r.price, bp, Number(step)));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; if (bp === null || bp === 0) return setErr('Nhập phần trăm khác 0 (từ -1000% đến 1000%, tối đa 2 chữ số thập phân).'); setBusy(true); setErr(null);
    try { setResult(await sendPrices(listId, rows.map(r => ({ itemId: r.itemId, price: next(r), expectedPrice: r.price })), { reason: reason.trim() || `Điều chỉnh ${pct}%` })); onDone(); } catch (x) { setErr(errMsg(x, 'Không cập nhật được giá.')); } finally { setBusy(false); }
  }
  if (result) return <Modal title="Kết quả điều chỉnh giá" onClose={onClose}><Summary r={result} label={i => rows[i]?.code ?? `Dòng ${i + 1}`} onClose={onClose} /></Modal>;
  return (<Modal title={`Điều chỉnh giá ${rows.length} mặt hàng`} onClose={() => !busy && onClose()}><form onSubmit={submit} className="space-y-3" noValidate>{err && <Alert>{err}</Alert>}
    <L t="Tăng / giảm (%) *" hint="Ví dụ: 10 để tăng 10%, -5 để giảm 5%."><input autoFocus inputMode="decimal" className={inp} value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.,-]/g, '').slice(0, 8))} /></L>
    <L t="Làm tròn đến"><select className={inp} value={step} onChange={e => setStep(e.target.value)}><option value="1">1 đồng</option><option value="100">100 đồng</option><option value="1000">1.000 đồng</option></select></L>
    <L t="Lý do"><textarea className={area} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></L>
    <div className="max-h-40 overflow-auto rounded-lg border text-xs"><table className="w-full"><tbody>{rows.slice(0, 20).map(r => <tr key={r.itemId} className="border-b last:border-0"><td className="p-2 font-medium">{r.code}</td><td className="p-2">{money(r.price)}</td><td className="p-2">→</td><td className="p-2 font-semibold">{money(next(r))}</td></tr>)}</tbody></table>{rows.length > 20 && <p className="p-2 text-slate-400">… và {rows.length - 20} mặt hàng khác</p>}</div>
    <FormFooter busy={busy} label="Áp dụng" onClose={onClose} /></form></Modal>);
}

/** Nhập giá từ Excel / CSV (cột Mã, Giá): thêm mặt hàng chưa có và cập nhật giá mặt hàng đã có */
export function ImportPricesDialog({ listId, onClose, onDone }: { listId: string; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState(''), [rows, setRows] = useState<PriceImportRow[] | null>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [done, setDone] = useState(0), [result, setResult] = useState<UpsertResult[] | null>(null);
  const valid = rows?.filter(r => !r.error) ?? [];
  async function pick(f?: File) { if (!f) return; setFile(f.name); setErr(null); setRows(null); try { const r = parsePriceMatrix(await readMatrix(f)); if (r.error) setErr(r.error); else setRows(r.rows); } catch (e) { setErr((e as Error).message || 'Không đọc được tệp.'); } }
  async function run() {
    if (!valid.length || busy) return; setBusy(true); setErr(null);
    try { setResult(await sendPrices(listId, valid.map(r => ({ code: r.code, price: r.price! })), { reason: 'Nhập giá từ tệp' }, setDone)); onDone(); } catch (e) { setErr(errMsg(e, 'Đang nhập thì bị gián đoạn. Có thể nhập lại: giá đã lưu sẽ hiển thị là "không đổi".')); } finally { setBusy(false); }
  }
  if (result) return <Modal wide title="Kết quả nhập giá" onClose={onClose}><Summary r={result} label={i => valid[i]?.code ?? `Dòng ${i + 1}`} onClose={onClose} /></Modal>;
  return (<Modal wide title="Nhập giá từ Excel / CSV" onClose={() => !busy && onClose()}><div className="space-y-3 text-sm">{err && <Alert>{err}</Alert>}
    {!rows ? <><label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-200 p-8 text-center hover:border-blue-300"><input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} /><FileUp className="mx-auto mb-2 text-slate-400" />Chọn tệp .xlsx hoặc .csv (cột Mã và Giá){file && <div className="mt-2 text-blue-600">{file}</div>}</label>
      <p className="text-slate-500">Tải tệp mẫu: <button onClick={() => downloadXlsx(PRICE_IMPORT_TEMPLATE, 'mau-nhap-gia.xlsx')} className="text-blue-600 underline">Excel</button> · <button onClick={() => downloadCsv(PRICE_IMPORT_TEMPLATE, 'mau-nhap-gia.csv')} className="text-blue-600 underline">CSV</button>. Mặt hàng chưa có trong bảng giá sẽ được thêm; mặt hàng đã có sẽ được cập nhật giá.</p></>
      : <><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-3 py-1">{file}: {rows.length} dòng</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">Hợp lệ: {valid.length}</span><span className="rounded-full bg-red-50 px-3 py-1 text-red-600">Lỗi: {rows.length - valid.length}</span></div>
        <div className="max-h-60 overflow-auto rounded-lg border"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr>{['Dòng', 'Mã', 'Giá', 'Kết quả'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 200).map(r => <tr key={r.line} className="border-t"><td className="p-2">{r.line}</td><td className="p-2">{r.code}</td><td className="p-2">{r.price === null ? '—' : money(r.price)}</td><td className={`p-2 ${r.error ? 'text-red-600' : 'text-emerald-600'}`}>{r.error ?? 'Hợp lệ'}</td></tr>)}</tbody></table></div>
        <div className="flex justify-end gap-2"><button onClick={() => { setRows(null); setFile(''); }} disabled={busy} className="h-9 rounded-md border px-4">Chọn tệp khác</button>
          <button onClick={run} disabled={!valid.length || busy} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}{busy ? `Đang nhập ${done}/${valid.length}…` : `Nhập ${valid.length} dòng hợp lệ`}</button></div></>}</div></Modal>);
}
