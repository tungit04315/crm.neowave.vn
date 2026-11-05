'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { downloadXlsx, stamp } from '@/lib/customer-io';
import { formatPercentBp } from '@/lib/catalog-core';
import type { PriceLogDto, PriceLogMode, PriceLogPage } from '@/types/pricing';
import { Alert } from '@/components/ui/form';
import { Denied, errMsg, money, when } from '@/components/catalog/shared';
import { sel } from './shared';

const KIND = { default: 'Giá mặc định', priceList: 'Bảng giá', groupPrice: 'Giá theo nhóm' };
const MODE: Record<PriceLogMode, string> = { initial: 'Giá ban đầu', direct: 'Đổi trực tiếp', approved: 'Đã duyệt', added: 'Thêm mới', changed: 'Thay đổi' };
const pct = (r: PriceLogDto) => (r.pctBp === null ? '—' : `${r.pctBp > 0 ? '+' : ''}${formatPercentBp(r.pctBp)}`);
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('vi-VN')} ₫`;
const f0 = { kind: '', mode: '', q: '', from: '', to: '' };

/** Lịch sử thay đổi giá tổng hợp: mọi nguồn giá, có lọc, so sánh giá cũ / mới, người thực hiện, người duyệt, lý do */
export default function PriceHistory() {
  const [f, setF] = useState(f0), [dq, setDq] = useState(''), [rows, setRows] = useState<PriceLogDto[]>([]), [next, setNext] = useState<string | null>(null), [loading, setLoading] = useState(true), [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null), [denied, setDenied] = useState(false), [canExport, setCanExport] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDq(f.q), 300); return () => clearTimeout(t); }, [f.q]);
  const qs = (extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ kind: f.kind, mode: f.mode, q: dq, from: f.from, to: f.to, ...extra }).filter(([, v]) => v)).toString();
  const bad = !!f.from && !!f.to && f.to < f.from;
  useEffect(() => {
    if (bad) return; let live = true;
    api<PriceLogPage>(`/api/catalog/price-history?${qs({ limit: '50' })}`).then(r => { if (live) { setRows(r.items); setNext(r.nextCursor); setCanExport(r.can.export); setErr(null); setLoading(false); } })
      .catch(e => { if (live) { setDenied(e instanceof ApiError && e.status === 403); setErr(errMsg(e, 'Không tải được lịch sử giá.')); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.kind, f.mode, dq, f.from, f.to]);
  const set = (p: Partial<typeof f0>) => { setLoading(true); setF(x => ({ ...x, ...p })); };
  async function loadMore() { if (!next || more) return; setMore(true); try { const r = await api<PriceLogPage>(`/api/catalog/price-history?${qs({ limit: '50', cursor: next })}`); setRows(x => [...x, ...r.items]); setNext(r.nextCursor); } catch (e) { setErr(errMsg(e, 'Không tải thêm được.')); } finally { setMore(false); } }
  async function exportXlsx() {
    if (busy) return; setBusy(true); setErr(null);
    try {
      const r = await api<{ items: PriceLogDto[]; truncated: boolean }>(`/api/catalog/price-history/export?${qs()}`);
      await downloadXlsx([['Thời gian', 'Nguồn giá', 'Phạm vi', 'Mã', 'Tên', 'Giá cũ', 'Giá mới', 'Chênh lệch', '%', 'Hình thức', 'Người thực hiện', 'Người duyệt', 'Lý do'], ...r.items.map(x => [when(x.at), KIND[x.kind], x.scopeName, x.itemCode, x.itemName, x.oldPrice === null ? '' : String(x.oldPrice), String(x.newPrice), String(x.diff), x.pctBp === null ? '' : String(x.pctBp / 100), MODE[x.mode], x.changedByName, x.approvedByName ?? '', x.reason])], `lich-su-gia-${stamp()}.xlsx`);
      if (r.truncated) setErr('Chỉ xuất được tối đa 5.000 dòng đầu (mới nhất). Hãy thu hẹp bộ lọc để xuất phần còn lại.');
    } catch (e) { setErr(errMsg(e, 'Không xuất được tệp.')); } finally { setBusy(false); }
  }
  if (denied) return <Denied />;
  return (<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Lịch sử thay đổi giá</h1><p className="text-sm text-slate-500">Mọi thay đổi giá mặc định, bảng giá và giá theo nhóm, mới nhất trước. Chỉ có dữ liệu từ khi hệ thống bắt đầu ghi nhật ký giá.</p></div>
    {canExport && <button disabled={busy || bad} onClick={exportXlsx} className="flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 disabled:opacity-50"><Download size={15} />Xuất Excel</button>}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center gap-2"><input value={f.q} onChange={e => set({ q: e.target.value })} placeholder="Tìm theo mã, tên, bảng giá, lý do, người thực hiện…" aria-label="Tìm trong lịch sử giá" className="h-9 min-w-[240px] flex-1 rounded-lg bg-slate-100 px-3 text-sm outline-none" />
      <select aria-label="Nguồn giá" value={f.kind} onChange={e => set({ kind: e.target.value })} className={sel}><option value="">Tất cả nguồn giá</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Hình thức" value={f.mode} onChange={e => set({ mode: e.target.value })} className={sel}><option value="">Tất cả hình thức</option>{Object.entries(MODE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <label className="flex items-center gap-1 text-xs text-slate-500">Từ<input type="date" aria-label="Từ ngày" value={f.from} onChange={e => set({ from: e.target.value })} className={sel} /></label><label className="flex items-center gap-1 text-xs text-slate-500">đến<input type="date" aria-label="Đến ngày" value={f.to} onChange={e => set({ to: e.target.value })} className={sel} /></label>
      {(f.kind || f.mode || f.q || f.from || f.to) && <button onClick={() => set(f0)} className="h-9 rounded-lg px-3 text-xs text-blue-600">Xóa bộ lọc</button>}</div>
      {bad && <div className="mb-3"><Alert>Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.</Alert></div>}{err && <div className="mb-3"><Alert>{err}</Alert></div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Thời gian', 'Nguồn giá', 'Mặt hàng', 'Giá cũ', 'Giá mới', 'Chênh lệch', 'Hình thức', 'Người thực hiện', 'Người duyệt', 'Lý do'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => (<tr key={r.id} className="border-b align-top last:border-0 hover:bg-slate-50"><td className="p-2 whitespace-nowrap">{when(r.at)}</td><td className="p-2">{KIND[r.kind]}{r.kind !== 'default' && <div className="text-slate-400">{r.scopeName}</div>}</td><td className="p-2"><span className="font-medium">{r.itemCode}</span> {r.itemName}</td>
          <td className="p-2">{r.oldPrice === null ? '—' : money(r.oldPrice)}</td><td className="p-2 font-semibold">{money(r.newPrice)}</td><td className={`p-2 whitespace-nowrap ${r.diff > 0 ? 'text-emerald-600' : r.diff < 0 ? 'text-red-600' : ''}`}>{r.oldPrice === null ? '—' : `${signed(r.diff)} (${pct(r)})`}</td>
          <td className="p-2">{MODE[r.mode]}</td><td className="p-2">{r.changedByName}</td><td className="p-2">{r.approvedByName ?? '—'}</td><td className="max-w-[220px] p-2 text-slate-600">{r.reason || '—'}</td></tr>))}</tbody></table>
        {loading ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : rows.length === 0 && !bad && <p className="p-6 text-center text-sm text-slate-500">{next ? 'Chưa thấy kết quả trong phần đã quét. Bấm “Tìm tiếp” để quét thêm.' : 'Không có thay đổi giá nào khớp bộ lọc.'}</p>}</div>
      {next && !loading && <div className="pt-3 text-center"><button onClick={loadMore} disabled={more} className="h-9 rounded-lg border px-4 text-sm">{more ? 'Đang tải…' : rows.length ? 'Tải thêm' : 'Tìm tiếp'}</button></div>}</div></div>);
}
