'use client';
import { useState } from 'react';
import { ChevronDown, Download, FileUp, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadCsv, downloadXlsx, readMatrix, stamp } from '@/lib/customer-io';
import { exportMatrix, importTemplate, parseImportRows, type ImportRefs, type ImportRow } from '@/lib/catalog-io-core';
import type { CategoryDto, ItemDto, TaxRateDto, UnitDto } from '@/types/catalog';
import { Modal } from '@/components/ui/Modal';
import { Alert, newRequestId } from '@/components/ui/form';
import { errMsg } from './shared';

const badge = { valid: 'bg-emerald-50 text-emerald-600', error: 'bg-red-50 text-red-600', dup: 'bg-amber-50 text-amber-600' } as const;
const label = { valid: 'Hợp lệ', error: 'Lỗi', dup: 'Trùng' } as const;
const btn = 'flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50';
const BATCH = 50;

/** Nhập / xuất sản phẩm & dịch vụ. Xuất lấy dữ liệu qua máy chủ (có kiểm tra quyền); nhập gửi từng lô 50 dòng qua đường tạo mới. */
export default function ImportExport({ canCreate, canExport, query, onImported }: { canCreate: boolean; canExport: boolean; query: string; onImported: () => void }) {
  const [menu, setMenu] = useState(false); const [open, setOpen] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [exporting, setExporting] = useState(false);
  const [file, setFile] = useState(''); const [rows, setRows] = useState<ImportRow[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(0); const [result, setResult] = useState<{ created: number; failed: { line: number; error: string }[] } | null>(null);
  const [rid] = useState(newRequestId); // mỗi lần mở hộp thoại là một "phiên" nhập; nhập lại cùng tệp trong phiên này không tạo bản sao
  const valid = rows?.filter(r => r.status === 'valid') ?? [];
  const reset = () => { setFile(''); setRows(null); setErr(null); setResult(null); setDone(0); };

  async function pickFile(f?: File) {
    if (!f) return; reset(); setFile(f.name);
    try {
      const [m, cats, units, taxes] = await Promise.all([readMatrix(f), api<{ items: CategoryDto[] }>('/api/catalog/categories'), api<{ items: UnitDto[] }>('/api/catalog/units'), api<{ items: TaxRateDto[] }>('/api/catalog/tax-rates')]);
      const refs: ImportRefs = { categories: cats.items.filter(c => c.status === 'active'), units: units.items.filter(u => u.status === 'active'), taxRates: taxes.items.filter(t => t.status === 'active') };
      const r = parseImportRows(m, refs); if (r.error) setErr(r.error); else setRows(r.rows);
    } catch (e) { setErr(errMsg(e, (e as Error).message || 'Không đọc được tệp.')); }
  }
  async function run() {
    if (!valid.length || busy) return; setBusy(true); setDone(0); let created = 0; const failed: { line: number; error: string }[] = [];
    try {
      for (let i = 0; i < valid.length; i += BATCH) {
        const chunk = valid.slice(i, i + BATCH);
        const r = await api<{ results: { index: number; ok: boolean; error?: string }[] }>('/api/catalog/items/import', { method: 'POST', json: { rows: chunk.map(x => ({ ...x.data, requestId: `${rid}-${x.line}` })) } });
        for (const x of r.results) { if (x.ok) created++; else failed.push({ line: chunk[x.index].line, error: x.error ?? 'Không lưu được.' }); }
        setDone(Math.min(i + BATCH, valid.length));
      }
    } catch (e) { setErr(errMsg(e, 'Đang nhập thì bị gián đoạn. Có thể nhập lại: các dòng đã lưu sẽ không bị tạo trùng.')); }
    finally { setResult({ created, failed }); setBusy(false); if (created) onImported(); }
  }
  async function exp(fmt: 'xlsx' | 'csv') {
    setMenu(false); setMsg(null); setExporting(true);
    try {
      const r = await api<{ items: ItemDto[]; truncated: boolean }>(`/api/catalog/items/export?${query}`); const m = exportMatrix(r.items), name = `san-pham-dich-vu-${stamp()}.${fmt}`;
      if (!r.items.length) return setMsg('Không có dữ liệu để xuất theo bộ lọc hiện tại.');
      if (fmt === 'xlsx') await downloadXlsx(m, name); else downloadCsv(m, name);
      if (r.truncated) setMsg('Chỉ xuất được 5.000 dòng đầu. Hãy thu hẹp bộ lọc để xuất phần còn lại.');
    } catch (e) { setMsg(errMsg(e, 'Không xuất được tệp. Hãy thử định dạng CSV.')); } finally { setExporting(false); }
  }
  return (<>
    {canCreate && <button onClick={() => { reset(); setOpen(true); }} className={btn}><FileUp size={15} />Nhập Excel</button>}
    {canExport && <div className="relative"><button onClick={() => setMenu(m => !m)} disabled={exporting} className={btn}>{exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}Xuất dữ liệu<ChevronDown size={14} /></button>
      {menu && <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border bg-white py-1 text-sm shadow-lg"><div className="px-3 py-1 text-[11px] text-slate-400">Xuất theo bộ lọc hiện tại</div>
        <button onClick={() => exp('xlsx')} className="block w-full px-3 py-2 text-left hover:bg-slate-50">Excel (.xlsx)</button><button onClick={() => exp('csv')} className="block w-full px-3 py-2 text-left hover:bg-slate-50">CSV (.csv)</button></div>}</div>}
    {msg && <div className="basis-full"><Alert>{msg}</Alert></div>}
    {open && <Modal wide title="Nhập sản phẩm & dịch vụ từ Excel / CSV" onClose={() => !busy && setOpen(false)}>
      {result ? <div className="space-y-3 text-sm">{err && <Alert>{err}</Alert>}<p className="rounded-md bg-emerald-50 p-3 text-emerald-700">Đã nhập thành công <b>{result.created}</b> dòng.</p>
        {result.failed.length > 0 && <div className="rounded-md bg-red-50 p-3 text-red-600"><p>{result.failed.length} dòng không lưu được:</p><ul className="mt-1 list-disc pl-5 text-xs">{result.failed.slice(0, 20).map(f => <li key={f.line}>Dòng {f.line}: {f.error}</li>)}</ul></div>}
        <button onClick={() => setOpen(false)} className="h-9 rounded-md bg-blue-600 px-4 text-white">Đóng</button></div>
      : !rows ? <div className="space-y-3 text-sm">
        <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-200 p-8 text-center hover:border-blue-300"><input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          <FileUp className="mx-auto mb-2 text-slate-400" />Chọn tệp .xlsx hoặc .csv (tối đa 2.000 dòng){file && <div className="mt-2 text-blue-600">{file}</div>}</label>
        <p className="text-slate-500">Chưa có tệp mẫu? Tải: <button onClick={() => downloadXlsx(importTemplate(), 'mau-nhap-san-pham-dich-vu.xlsx')} className="text-blue-600 underline">Excel</button> · <button onClick={() => downloadCsv(importTemplate(), 'mau-nhap-san-pham-dich-vu.csv')} className="text-blue-600 underline">CSV</button><br />
          Cột bắt buộc: Loại, Tên, Nhóm, Đơn vị tính. Nhóm, đơn vị tính và thuế phải trùng tên với danh mục đã tạo (hệ thống không tự tạo mới). Mã được tự sinh.</p>
        {err && <p role="alert" className="rounded-md bg-red-50 p-3 text-red-600">{err}</p>}</div>
      : <div className="space-y-3 text-sm">{err && <Alert>{err}</Alert>}
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-3 py-1">{file}: {rows.length} dòng</span>{(['valid', 'dup', 'error'] as const).map(s => <span key={s} className={`rounded-full px-3 py-1 ${badge[s]}`}>{label[s]}: {rows.filter(r => r.status === s).length}</span>)}</div>
        <div className="max-h-72 overflow-auto rounded-lg border"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr>{['Dòng', 'Kết quả', 'Tên', 'Ghi chú'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 200).map(r => <tr key={r.line} className="border-t"><td className="p-2">{r.line}</td><td className="p-2"><span className={`rounded-full px-2 py-0.5 ${badge[r.status]}`}>{label[r.status]}</span></td><td className="p-2">{r.label || '—'}</td><td className="p-2 text-slate-500">{r.messages.join(' ')}</td></tr>)}</tbody></table></div>
        {rows.length > 200 && <p className="text-xs text-slate-400">Hiển thị 200 dòng đầu; toàn bộ dòng hợp lệ vẫn được nhập.</p>}
        <div className="flex justify-end gap-2"><button onClick={reset} disabled={busy} className="h-9 rounded-md border px-4">Chọn tệp khác</button>
          <button onClick={run} disabled={!valid.length || busy} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />}{busy ? `Đang nhập ${done}/${valid.length}…` : `Nhập ${valid.length} dòng hợp lệ`}</button></div></div>}
    </Modal>}
  </>);
}
