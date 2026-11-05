'use client';
import { useState } from 'react';
import { ChevronDown, Download, FileUp, Loader2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { exportMatrix, parseRows, type ParsedRow } from '@/lib/customer-io-core';
import { downloadCsv, downloadXlsx, readMatrix, stamp, templateMatrix } from '@/lib/customer-io';
import { importCustomers } from '@/lib/customer-import';
import type { Customer } from '@/types/customer';

const EXPORT_ROLES = ['super_admin', 'director', 'manager']; // ẩn nút xuất với role khác (kiểm soát ở giao diện)
const badge = { valid: 'bg-emerald-50 text-emerald-600', error: 'bg-red-50 text-red-600', dup: 'bg-amber-50 text-amber-600' } as const;
const label = { valid: 'Hợp lệ', error: 'Lỗi', dup: 'Trùng' } as const;

export default function ImportExport({ customers, exportRows, exportLabel, groupNames, onImported }:
  { customers: Customer[]; exportRows: Customer[]; exportLabel: string; groupNames: (id: string) => string; onImported: () => void }) {
  const { profile } = useAuth();
  const [menu, setMenu] = useState(false); const [open, setOpen] = useState(false);
  const [file, setFile] = useState(''); const [rows, setRows] = useState<ParsedRow[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(0); const [result, setResult] = useState<{ created: number; failed: number } | null>(null);
  const valid = rows?.filter(r => r.status === 'valid') ?? [];
  const reset = () => { setFile(''); setRows(null); setErr(null); setResult(null); setDone(0); };

  async function pickFile(f?: File) {
    if (!f) return; reset(); setFile(f.name);
    try { const m = await readMatrix(f); const r = parseRows(m, customers); if (r.error) setErr(r.error); else setRows(r.rows); }
    catch (e) { setErr((e as Error).message || 'Không đọc được tệp.'); }
  }
  async function run() {
    if (!profile || !valid.length || busy) return; setBusy(true);
    try { setResult(await importCustomers(profile, valid.map(r => r.data!), setDone)); onImported(); } finally { setBusy(false); }
  }
  const exp = async (fmt: 'xlsx' | 'csv') => {
    setMenu(false); const m = exportMatrix(exportRows, groupNames); const name = `khach-hang-${stamp()}.${fmt}`;
    try { fmt === 'xlsx' ? await downloadXlsx(m, name) : downloadCsv(m, name); } catch { alert('Không xuất được tệp. Hãy thử định dạng CSV.'); }
  };
  const btn = 'flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50';
  return (<>
    <button onClick={() => { reset(); setOpen(true); }} className={btn}><FileUp size={15} />Nhập Excel</button>
    {profile && EXPORT_ROLES.includes(profile.role) && <div className="relative">
      <button onClick={() => setMenu(m => !m)} className={btn}><Download size={15} />Xuất dữ liệu<ChevronDown size={14} /></button>
      {menu && <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border bg-white py-1 text-sm shadow-lg">
        <div className="px-3 py-1 text-[11px] text-slate-400">Xuất {exportRows.length} KH ({exportLabel})</div>
        <button disabled={!exportRows.length} onClick={() => exp('xlsx')} className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40">Excel (.xlsx)</button>
        <button disabled={!exportRows.length} onClick={() => exp('csv')} className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40">CSV (.csv)</button></div>}</div>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Nhập khách hàng từ Excel / CSV</h2><button onClick={() => !busy && setOpen(false)} aria-label="Đóng"><X size={18} /></button></div>
      {result ? <div className="space-y-3 text-sm"><p className="rounded-md bg-emerald-50 p-3 text-emerald-700">Đã nhập thành công <b>{result.created}</b> khách hàng.</p>
          {result.failed > 0 && <p className="rounded-md bg-red-50 p-3 text-red-600">{result.failed} dòng không lưu được (kiểm tra quyền hoặc kết nối). Bạn có thể nhập lại; hệ thống sẽ bỏ qua các dòng đã có.</p>}
          <button onClick={() => setOpen(false)} className="h-9 rounded-md bg-blue-600 px-4 text-white">Đóng</button></div> : <>
        {!rows && <div className="space-y-3 text-sm">
          <label className="block cursor-pointer rounded-lg border-2 border-dashed border-slate-200 p-8 text-center hover:border-blue-300">
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
            <FileUp className="mx-auto mb-2 text-slate-400" />Chọn tệp .xlsx hoặc .csv (tối đa 5MB, 2000 dòng){file && <div className="mt-2 text-blue-600">{file}</div>}</label>
          <p className="text-slate-500">Chưa có file mẫu? Tải: <button onClick={() => downloadXlsx(templateMatrix(), 'mau-nhap-khach-hang.xlsx')} className="text-blue-600 underline">Excel</button> · <button onClick={() => downloadCsv(templateMatrix(), 'mau-nhap-khach-hang.csv')} className="text-blue-600 underline">CSV</button>.
            Cột bắt buộc: Tên khách hàng, và Số điện thoại hoặc Email. Dòng trùng MST/SĐT/email với khách hàng đã có hoặc trùng trong file sẽ bị bỏ qua.</p>
          {err && <p role="alert" className="rounded-md bg-red-50 p-3 text-red-600">{err}</p>}</div>}
        {rows && <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-3 py-1">{file}: {rows.length} dòng</span>
            {(['valid', 'dup', 'error'] as const).map(s => <span key={s} className={`rounded-full px-3 py-1 ${badge[s]}`}>{label[s]}: {rows.filter(r => r.status === s).length}</span>)}</div>
          <div className="max-h-72 overflow-auto rounded-lg border"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr>{['Dòng', 'Kết quả', 'Khách hàng', 'SĐT', 'Ghi chú'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 200).map(r => <tr key={r.line} className="border-t"><td className="p-2">{r.line}</td><td className="p-2"><span className={`rounded-full px-2 py-0.5 ${badge[r.status]}`}>{label[r.status]}</span></td>
              <td className="p-2">{r.data?.name ?? '—'}</td><td className="p-2">{r.data?.phone ?? ''}</td><td className="p-2 text-slate-500">{r.messages.join('; ')}</td></tr>)}</tbody></table></div>
          {rows.length > 200 && <p className="text-xs text-slate-400">Hiển thị 200 dòng đầu; toàn bộ dòng hợp lệ vẫn được nhập.</p>}
          <div className="flex justify-end gap-2"><button onClick={reset} disabled={busy} className="h-9 rounded-md border px-4">Chọn tệp khác</button>
            <button onClick={run} disabled={!valid.length || busy} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-white disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />}{busy ? `Đang nhập ${done}/${valid.length}…` : `Nhập ${valid.length} khách hàng hợp lệ`}</button></div></div>}</>}
    </div></div>}
  </>);
}
