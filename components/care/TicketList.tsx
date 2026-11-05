'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Plus, RefreshCw, Search } from 'lucide-react';
import { today } from '@/components/opportunities/ui';
import { api, ApiError, download } from '@/lib/api';
import { formatDateTime } from '@/lib/care-core';
import { PRIORITIES, PRIORITY_LABEL, STATUSES, TICKET_STATUS_LABEL, VIEW_STATUS, type StaffDto, type TicketListRes, type TicketStats, type TicketView } from '@/types/care';
import { BulkDialog } from './Dialogs';
import { PriorityBadge, SlaLine, TicketStatusBadge, sel, useCareMeta } from './ui';

const TITLE: Record<TicketView, [string, string]> = {
  all: ['Tất cả yêu cầu hỗ trợ', 'Toàn bộ yêu cầu hỗ trợ trong phạm vi dữ liệu của bạn.'],
  new: ['Yêu cầu mới', 'Yêu cầu vừa tiếp nhận, chưa bắt đầu xử lý. Hãy phân công để không bỏ sót.'],
  'in-progress': ['Yêu cầu đang xử lý', 'Các yêu cầu đã được tiếp nhận và đang được giải quyết.'],
  waiting: ['Yêu cầu chờ phản hồi', 'Đã phản hồi khách hàng, đang chờ khách cung cấp thêm thông tin hoặc xác nhận. Đồng hồ giải quyết đang tạm dừng.'],
  resolved: ['Yêu cầu đã giải quyết', 'Các yêu cầu đã có kết quả xử lý (gồm cả yêu cầu đã đóng).'],
};
const PAGE = 20;
const EMPTY = { q: '', status: '', priority: '', categoryId: '', assigneeUid: '', departmentId: '', sla: '', from: '', to: '' };
type F = typeof EMPTY;

export default function TicketList({ view }: { view: TicketView }) {
  const { meta } = useCareMeta();
  const [f, setF] = useState<F>(EMPTY); const [qInput, setQInput] = useState('');
  const [data, setData] = useState<TicketListRes | null>(null); const [err, setErr] = useState<{ message: string; denied: boolean } | null>(null); const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TicketStats | null>(null); const [staff, setStaff] = useState<StaffDto[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set()); const [bulk, setBulk] = useState<'assign' | 'priority' | null>(null); const [exporting, setExporting] = useState(false);
  const req = useRef(0);

  // Chuỗi truy vấn đại diện cho bộ lọc hiện tại; khi nó đổi, phân trang tự quay về trang đầu (không cần effect đặt lại)
  const sig = useMemo(() => { const sp = new URLSearchParams({ view, limit: String(PAGE) }); (Object.entries(f) as [string, string][]).forEach(([k, v]) => v && sp.set(k, v)); return sp.toString(); }, [view, f]);
  const [pg, setPg] = useState({ sig, page: 0, cursors: [''] });
  const cur = pg.sig === sig ? pg : { sig, page: 0, cursors: [''] };
  const cursor = cur.cursors[cur.page];

  useEffect(() => { const t = setTimeout(() => setF(x => (x.q === qInput.trim() ? x : { ...x, q: qInput.trim() })), 400); return () => clearTimeout(t); }, [qInput]);
  useEffect(() => { api<{ users: StaffDto[] }>('/api/care/staff').then(r => setStaff(r.users)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    const id = ++req.current; setLoading(true); setErr(null);
    const sp = new URLSearchParams(sig); if (cursor) sp.set('cursor', cursor);
    try { const r = await api<TicketListRes>(`/api/care/tickets?${sp}`); if (id !== req.current) return; setData(r); setPicked(new Set()); }
    catch (e) { if (id !== req.current) return; setErr({ message: e instanceof ApiError ? e.message : 'Không tải được dữ liệu.', denied: e instanceof ApiError && e.status === 403 }); }
    finally { if (id === req.current) setLoading(false); }
  }, [sig, cursor]);
  useEffect(() => { load(); }, [load]);

  const loadStats = useCallback(() => {
    const sp = new URLSearchParams(); if (f.departmentId) sp.set('departmentId', f.departmentId);
    api<TicketStats>(`/api/care/tickets/stats?${sp}`).then(setStats).catch(() => setStats(null));
  }, [f.departmentId]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const rows = data?.items ?? [], canBulk = !!meta?.can.bulk;
  const statusOpts = view === 'all' ? STATUSES : view === 'resolved' ? VIEW_STATUS.resolved ?? [] : [];
  const active = (Object.entries(f) as [string, string][]).some(([, v]) => v);
  const set = (p: Partial<F>) => setF(x => ({ ...x, ...p }));
  const codes = useMemo(() => Object.fromEntries(rows.map(r => [r.id, r.code])), [rows]);
  const allChecked = rows.length > 0 && rows.every(r => picked.has(r.id));
  const cards: [string, string, boolean?][] = stats ? [['Tổng yêu cầu', String(stats.total)], ['Yêu cầu mới', String(stats.new)], ['Đang xử lý', String(stats.inProgress)], ['Chờ phản hồi', String(stats.waiting)], ['Đã giải quyết', String(stats.resolved)], ['Quá hạn SLA', `${stats.breached}${stats.breachedCapped ? '+' : ''}`, stats.breached > 0]] : [];

  async function exportCsv() { setExporting(true); try { await download(`/api/care/tickets/export?${sig}`, `yeu-cau-ho-tro-${today()}.csv`); } catch (e) { alert(e instanceof ApiError ? e.message : 'Không xuất được dữ liệu.'); } finally { setExporting(false); } }
  const refresh = () => { load(); loadStats(); };

  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">{TITLE[view][0]}</h1><p className="max-w-2xl text-sm text-slate-500">{TITLE[view][1]}</p></div>
      <div className="flex gap-2">
        <button onClick={refresh} aria-label="Tải lại" title="Tải lại (cập nhật đồng hồ SLA)" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        {meta?.can.export && <button onClick={exportCsv} disabled={exporting} className="flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 disabled:opacity-60"><Download size={15} />Xuất CSV</button>}
        {meta?.can.create && <Link href="/care/tickets/create" className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Tạo yêu cầu</Link>}</div></div>

    {cards.length > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{cards.map(([l, v, bad]) => <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><b className={`text-2xl ${bad ? 'text-red-600' : ''}`}>{v}</b></div>)}</div>}
    {err && <div role="alert" className={`rounded-xl p-3 text-sm ${err.denied ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-600'}`}>{err.denied ? <><b>Không có quyền truy cập.</b> {err.message}</> : err.message}</div>}
    {data?.partial && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">Hệ thống đã quét 500 yêu cầu nhưng chưa tìm đủ kết quả phù hợp bộ lọc. Bấm “Sau” để tiếp tục tìm, hoặc thu hẹp khoảng ngày.</p>}

    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Tìm theo mã yêu cầu, tiêu đề, khách hàng…" className="h-9 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
        {statusOpts.length > 1 && <select className={sel} value={f.status} onChange={e => set({ status: e.target.value })} aria-label="Trạng thái"><option value="">Tất cả trạng thái</option>{statusOpts.map(s => <option key={s} value={s}>{TICKET_STATUS_LABEL[s]}</option>)}</select>}
        <select className={sel} value={f.priority} onChange={e => set({ priority: e.target.value })} aria-label="Mức độ"><option value="">Mọi mức độ</option>{PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
        <select className={sel} value={f.categoryId} onChange={e => set({ categoryId: e.target.value })} aria-label="Danh mục"><option value="">Mọi danh mục</option>{meta?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={sel} value={f.assigneeUid} onChange={e => set({ assigneeUid: e.target.value })} aria-label="Nhân viên"><option value="">Mọi nhân viên</option><option value="none">Chưa phân công</option>{staff.map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}</select>
        {meta?.scope.kind === 'company' && meta.departments.length > 1 && <select className={sel} value={f.departmentId} onChange={e => set({ departmentId: e.target.value })} aria-label="Phòng ban"><option value="">Mọi phòng ban</option>{meta.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
        <select className={sel} value={f.sla} onChange={e => set({ sla: e.target.value })} aria-label="Tình trạng SLA"><option value="">Mọi tình trạng SLA</option><option value="ok">Trong hạn</option><option value="warning">Sắp quá hạn</option><option value="breached">Quá hạn</option></select>
        <label className="flex items-center gap-1 text-xs text-slate-500">Từ<input type="date" className={sel} value={f.from} max={f.to || undefined} onChange={e => set({ from: e.target.value })} /></label>
        <label className="flex items-center gap-1 text-xs text-slate-500">đến<input type="date" className={sel} value={f.to} min={f.from || undefined} onChange={e => set({ to: e.target.value })} /></label>
        {active && <button onClick={() => { setF(EMPTY); setQInput(''); }} className="h-9 rounded-lg px-3 text-xs text-blue-600 hover:underline">Xóa bộ lọc</button>}</div>

      {canBulk && picked.size > 0 && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 p-2 text-xs"><b>Đã chọn {picked.size} yêu cầu</b>
        <button onClick={() => setBulk('assign')} className="rounded-md bg-white px-3 py-1.5 font-medium text-blue-700 shadow-sm">Phân công</button>
        <button onClick={() => setBulk('priority')} className="rounded-md bg-white px-3 py-1.5 font-medium text-blue-700 shadow-sm">Đổi mức độ ưu tiên</button>
        <button onClick={() => setPicked(new Set())} className="ml-auto text-slate-500 hover:underline">Bỏ chọn</button></div>}

      <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>
        {canBulk && <th className="w-8 p-2"><input type="checkbox" aria-label="Chọn tất cả" checked={allChecked} onChange={e => setPicked(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} /></th>}
        {['Mã yêu cầu', 'Tiêu đề', 'Khách hàng', 'Loại yêu cầu', 'Mức độ', 'Nhân viên', 'Trạng thái', 'SLA', 'Ngày tiếp nhận', 'Cập nhật', ''].map(h => <th key={h || 'x'} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(t => (<tr key={t.id} className="border-b align-top last:border-0 hover:bg-slate-50">
          {canBulk && <td className="p-2"><input type="checkbox" aria-label={`Chọn ${t.code}`} checked={picked.has(t.id)} onChange={e => setPicked(s => { const n = new Set(s); e.target.checked ? n.add(t.id) : n.delete(t.id); return n; })} /></td>}
          <td className="whitespace-nowrap p-2 font-medium">{t.code}</td>
          <td className="max-w-[260px] p-2"><Link href={`/care/tickets/${t.id}`} className="block truncate font-semibold text-blue-700 hover:underline">{t.title}</Link></td>
          <td className="max-w-[180px] truncate p-2"><Link href={`/customers/${t.customerId}`} className="hover:underline">{t.customerName}</Link></td>
          <td className="max-w-[140px] truncate p-2">{t.categoryName}</td>
          <td className="p-2"><PriorityBadge p={t.priority} /></td>
          <td className="max-w-[140px] truncate p-2">{t.assigneeName || <span className={t.status === 'new' ? 'font-medium text-amber-600' : 'text-slate-400'}>Chưa phân công</span>}</td>
          <td className="p-2"><TicketStatusBadge s={t.status} /></td>
          <td className="p-2"><SlaLine label="GQ" p={t.sla.resolve} />{t.sla.response.state !== 'met' && <SlaLine label="PH" p={t.sla.response} />}</td>
          <td className="whitespace-nowrap p-2">{formatDateTime(t.receivedAt)}</td><td className="whitespace-nowrap p-2 text-slate-500">{formatDateTime(t.lastActivityAt)}</td>
          <td className="p-2"><Link href={`/care/tickets/${t.id}`} className="font-medium text-blue-600 hover:underline">Xem</Link></td></tr>))}</tbody></table>
        {loading && !data && <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p>}
        {data && !loading && rows.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{active ? 'Không có yêu cầu nào phù hợp bộ lọc.' : 'Chưa có yêu cầu hỗ trợ nào.'}</p>}</div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>Trang {cur.page + 1} · {rows.length} yêu cầu{loading && data ? ' · đang tải…' : ''}</span><span className="flex gap-2">
        <button disabled={cur.page === 0 || loading} onClick={() => setPg({ ...cur, page: cur.page - 1 })} className="rounded border px-3 py-1 disabled:opacity-40">Trước</button>
        <button disabled={!data?.nextCursor || loading} onClick={() => data?.nextCursor && setPg({ sig, page: cur.page + 1, cursors: [...cur.cursors.slice(0, cur.page + 1), data.nextCursor] })} className="rounded border px-3 py-1 disabled:opacity-40">Sau</button></span></div></div>

    {bulk && <BulkDialog ids={[...picked]} codes={codes} mode={bulk} staff={staff} onClose={() => setBulk(null)} onDone={() => { setBulk(null); refresh(); }} />}
  </div>);
}
