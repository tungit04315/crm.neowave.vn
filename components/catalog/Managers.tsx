'use client';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPercentBp } from '@/lib/catalog-core';
import { GROUP_COLORS } from '@/types/group';
import type { ActiveStatus, CatalogType, CategoryDto, TaxRateDto, UnitDto } from '@/types/catalog';
import { Modal } from '@/components/ui/Modal';
import { Alert, area, FormFooter, inp, L, newRequestId } from '@/components/ui/form';
import { Denied, errMsg, UseStatusBadge, useApiData } from './shared';

const StatusSelect = ({ v, set }: { v: ActiveStatus; set: (s: ActiveStatus) => void }) => <select className={inp} value={v} onChange={e => set(e.target.value as ActiveStatus)}><option value="active">Đang sử dụng</option><option value="inactive">Ngừng sử dụng</option></select>;
function Shell({ title, sub, canEdit, addLabel, onAdd, search, setSearch, children }: { title: string; sub: string; canEdit: boolean; addLabel: string; onAdd: () => void; search: string; setSearch: (s: string) => void; children: React.ReactNode }) {
  return (<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">{title}</h1><p className="text-sm text-slate-500">{sub}</p></div>
    {canEdit && <button onClick={onAdd} className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />{addLabel}</button>}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="relative mb-3 max-w-sm"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm…" aria-label="Tìm kiếm" className="h-9 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>{children}</div></div>);
}
const Empty = ({ loading, n, text }: { loading: boolean; n: number; text: string }) => loading ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> : n === 0 ? <p className="p-6 text-center text-sm text-slate-500">{text}</p> : null;
const Actions = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => <span className="flex gap-3 text-slate-500"><button onClick={onEdit} aria-label="Sửa"><Pencil size={15} /></button><button onClick={onDelete} aria-label="Xóa" className="hover:text-red-600"><Trash2 size={15} /></button></span>;

/** Khung thao tác chung: gọi API ghi rồi tải lại, hiển thị lỗi */
function useMutate(reload: () => void) {
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, fallback: string) => { setErr(null); try { await fn(); reload(); return true; } catch (e) { setErr(errMsg(e, fallback)); return false; } };
  return { err, setErr, run };
}

// ---------------- Nhóm sản phẩm / dịch vụ (PS-05, PS-06) ----------------
export function CategoryManager({ type }: { type: CatalogType }) {
  const { data, err: loadErr, denied, loading, reload } = useApiData<{ items: CategoryDto[]; can: { edit: boolean } }>(`/api/catalog/categories?type=${type}`);
  const { err, setErr, run } = useMutate(reload); const [q, setQ] = useState(''); const [form, setForm] = useState<{ edit?: CategoryDto } | null>(null);
  const label = type === 'product' ? 'sản phẩm' : 'dịch vụ';
  const rows = useMemo(() => (data?.items ?? []).filter(c => !q || `${c.code} ${c.name} ${c.description}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  if (denied) return <Denied />;
  const del = (c: CategoryDto) => { if (confirm(`Xóa nhóm “${c.name}”?`)) run(() => api(`/api/catalog/categories/${c.id}`, { method: 'DELETE' }), 'Không xóa được nhóm.'); };
  return (<Shell title={`Nhóm ${label}`} sub={`Phân loại ${label} để quản lý danh mục và bảng giá.`} canEdit={!!data?.can.edit} addLabel="Thêm nhóm" onAdd={() => { setErr(null); setForm({}); }} search={q} setSearch={setQ}>
    {(err || loadErr) && <div className="mb-3"><Alert>{err ?? loadErr}</Alert></div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Tên nhóm', 'Mô tả', `Số ${label}`, 'Trạng thái', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map(c => (<tr key={c.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2 font-medium">{c.code}</td>
        <td className="p-2"><span className="inline-flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name}</span></td><td className="max-w-[260px] truncate p-2 text-slate-600">{c.description || '—'}</td>
        <td className="p-2"><Link href={`/products?categoryId=${c.id}`} className="text-blue-700 hover:underline">{c.itemCount}</Link></td><td className="p-2"><UseStatusBadge s={c.status} /></td>
        <td className="p-2">{data?.can.edit && <Actions onEdit={() => { setErr(null); setForm({ edit: c }); }} onDelete={() => del(c)} />}</td></tr>))}</tbody></table>
      <Empty loading={loading && !data} n={rows.length} text={q ? 'Không có nhóm nào khớp.' : `Chưa có nhóm ${label} nào.`} /></div>
    {form && <CategoryForm type={type} edit={form.edit} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}</Shell>);
}
function CategoryForm({ type, edit, onClose, onSaved }: { type: CatalogType; edit?: CategoryDto; onClose: () => void; onSaved: () => void }) {
  const rid = useRef(newRequestId()); const [name, setName] = useState(edit?.name ?? ''); const [description, setDesc] = useState(edit?.description ?? ''); const [color, setColor] = useState(edit?.color ?? GROUP_COLORS[0]); const [status, setStatus] = useState<ActiveStatus>(edit?.status ?? 'active');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; if (!name.trim()) return setErr('Vui lòng nhập tên nhóm.'); setBusy(true); setErr(null);
    try { if (edit) await api(`/api/catalog/categories/${edit.id}`, { method: 'PATCH', json: { name, description, color, status, version: edit.version } }); else await api('/api/catalog/categories', { method: 'POST', json: { type, name, description, color, status, requestId: rid.current } }); onSaved(); }
    catch (x) { setErr(errMsg(x, 'Không lưu được nhóm.')); setBusy(false); }
  }
  return (<Modal title={edit ? `Sửa nhóm ${edit.code}` : 'Thêm nhóm'} onClose={onClose}><form onSubmit={submit} className="space-y-3" noValidate>{err && <Alert>{err}</Alert>}
    <L t="Tên nhóm *"><input className={inp} value={name} onChange={e => setName(e.target.value)} maxLength={100} autoFocus /></L><L t="Mô tả"><textarea className={area} value={description} onChange={e => setDesc(e.target.value)} maxLength={500} /></L>
    <div><div className="mb-1 text-xs font-medium text-slate-600">Màu nhận diện</div><div className="flex gap-2">{[...new Set([color, ...GROUP_COLORS])].map(c => <button type="button" key={c} aria-label={`Màu ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full ring-offset-2 ${color === c ? 'ring-2 ring-slate-700' : ''}`} style={{ background: c }} />)}</div></div>
    <L t="Trạng thái"><StatusSelect v={status} set={setStatus} /></L><FormFooter busy={busy} label={edit ? 'Lưu thay đổi' : 'Thêm nhóm'} onClose={onClose} /></form></Modal>);
}

// ---------------- Đơn vị tính (PS-07) ----------------
export function UnitManager() {
  const { data, err: loadErr, denied, loading, reload } = useApiData<{ items: UnitDto[]; can: { edit: boolean } }>('/api/catalog/units');
  const { err, setErr, run } = useMutate(reload); const [q, setQ] = useState(''); const [form, setForm] = useState<{ edit?: UnitDto } | null>(null);
  const rows = useMemo(() => (data?.items ?? []).filter(u => !q || `${u.code} ${u.name} ${u.symbol}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  if (denied) return <Denied />;
  const del = (u: UnitDto) => { if (confirm(`Xóa đơn vị “${u.name}”?`)) run(() => api(`/api/catalog/units/${u.id}`, { method: 'DELETE' }), 'Không xóa được đơn vị.'); };
  return (<Shell title="Đơn vị tính" sub="Danh sách đơn vị dùng chung cho sản phẩm, dịch vụ, báo giá và đơn hàng." canEdit={!!data?.can.edit} addLabel="Thêm đơn vị" onAdd={() => { setErr(null); setForm({}); }} search={q} setSearch={setQ}>
    {(err || loadErr) && <div className="mb-3"><Alert>{err ?? loadErr}</Alert></div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Tên đơn vị', 'Ký hiệu', 'Mô tả', 'Đang dùng', 'Trạng thái', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map(u => (<tr key={u.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2 font-medium">{u.code}</td><td className="p-2 font-semibold">{u.name}</td><td className="p-2">{u.symbol}</td><td className="max-w-[240px] truncate p-2 text-slate-600">{u.description || '—'}</td>
        <td className="p-2">{u.itemCount}</td><td className="p-2"><UseStatusBadge s={u.status} /></td><td className="p-2">{data?.can.edit && <Actions onEdit={() => { setErr(null); setForm({ edit: u }); }} onDelete={() => del(u)} />}</td></tr>))}</tbody></table>
      <Empty loading={loading && !data} n={rows.length} text={q ? 'Không có đơn vị nào khớp.' : 'Chưa có đơn vị tính nào. Hãy thêm các đơn vị doanh nghiệp sử dụng (ví dụ: Cái, Bộ, Tháng).'} /></div>
    {form && <UnitForm edit={form.edit} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}</Shell>);
}
function UnitForm({ edit, onClose, onSaved }: { edit?: UnitDto; onClose: () => void; onSaved: () => void }) {
  const rid = useRef(newRequestId()); const [name, setName] = useState(edit?.name ?? ''); const [symbol, setSymbol] = useState(edit?.symbol ?? ''); const [description, setDesc] = useState(edit?.description ?? ''); const [status, setStatus] = useState<ActiveStatus>(edit?.status ?? 'active');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; if (!name.trim()) return setErr('Vui lòng nhập tên đơn vị.'); if (!symbol.trim()) return setErr('Vui lòng nhập ký hiệu.'); setBusy(true); setErr(null);
    try { if (edit) await api(`/api/catalog/units/${edit.id}`, { method: 'PATCH', json: { name, symbol, description, status, version: edit.version } }); else await api('/api/catalog/units', { method: 'POST', json: { name, symbol, description, status, requestId: rid.current } }); onSaved(); }
    catch (x) { setErr(errMsg(x, 'Không lưu được đơn vị.')); setBusy(false); }
  }
  return (<Modal title={edit ? `Sửa đơn vị ${edit.code}` : 'Thêm đơn vị tính'} onClose={onClose}><form onSubmit={submit} className="space-y-3" noValidate>{err && <Alert>{err}</Alert>}
    <L t="Tên đơn vị *"><input className={inp} value={name} onChange={e => setName(e.target.value)} maxLength={50} autoFocus /></L><L t="Ký hiệu *" hint="Duy nhất trong tổ chức."><input className={inp} value={symbol} onChange={e => setSymbol(e.target.value)} maxLength={12} /></L>
    <L t="Mô tả"><input className={inp} value={description} onChange={e => setDesc(e.target.value)} maxLength={200} /></L><L t="Trạng thái"><StatusSelect v={status} set={setStatus} /></L>
    <FormFooter busy={busy} label={edit ? 'Lưu thay đổi' : 'Thêm đơn vị'} onClose={onClose} /></form></Modal>);
}

// ---------------- Thuế suất ----------------
export function TaxManager() {
  const { data, err: loadErr, denied, loading, reload } = useApiData<{ items: TaxRateDto[]; can: { edit: boolean } }>('/api/catalog/tax-rates');
  const [q, setQ] = useState(''); const [form, setForm] = useState<{ edit?: TaxRateDto } | null>(null);
  const rows = useMemo(() => (data?.items ?? []).filter(t => !q || `${t.code} ${t.name}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  if (denied) return <Denied />;
  return (<Shell title="Thuế suất" sub="Các mức thuế áp dụng cho sản phẩm và dịch vụ. Hệ thống không có mức thuế mặc định; do doanh nghiệp tự khai báo." canEdit={!!data?.can.edit} addLabel="Thêm thuế suất" onAdd={() => setForm({})} search={q} setSearch={setQ}>
    {loadErr && <div className="mb-3"><Alert>{loadErr}</Alert></div>}
    <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Tên', 'Thuế suất', 'Trạng thái', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map(t => (<tr key={t.id} className="border-b last:border-0 hover:bg-slate-50"><td className="p-2 font-medium">{t.code}</td><td className="p-2 font-semibold">{t.name}</td><td className="p-2">{formatPercentBp(t.rateBp)}</td><td className="p-2"><UseStatusBadge s={t.status} /></td>
        <td className="p-2">{data?.can.edit && <button onClick={() => setForm({ edit: t })} aria-label="Sửa" className="text-slate-500"><Pencil size={15} /></button>}</td></tr>))}</tbody></table>
      <Empty loading={loading && !data} n={rows.length} text={q ? 'Không có mức thuế nào khớp.' : 'Chưa có mức thuế nào. Hãy thêm các mức thuế mà doanh nghiệp áp dụng.'} /></div>
    {form && <TaxForm edit={form.edit} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}</Shell>);
}
function TaxForm({ edit, onClose, onSaved }: { edit?: TaxRateDto; onClose: () => void; onSaved: () => void }) {
  const rid = useRef(newRequestId()); const [name, setName] = useState(edit?.name ?? ''); const [pct, setPct] = useState(edit ? String(edit.rateBp / 100) : ''); const [status, setStatus] = useState<ActiveStatus>(edit?.status ?? 'active');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; const p = Number(pct.replace(',', '.'));
    if (!name.trim()) return setErr('Vui lòng nhập tên thuế.'); if (pct.trim() === '' || !Number.isFinite(p)) return setErr('Vui lòng nhập thuế suất (%).'); setBusy(true); setErr(null);
    try { if (edit) await api(`/api/catalog/tax-rates/${edit.id}`, { method: 'PATCH', json: { name, ratePercent: p, status, version: edit.version } }); else await api('/api/catalog/tax-rates', { method: 'POST', json: { name, ratePercent: p, status, requestId: rid.current } }); onSaved(); }
    catch (x) { setErr(errMsg(x, 'Không lưu được thuế suất.')); setBusy(false); }
  }
  return (<Modal title={edit ? `Sửa thuế ${edit.code}` : 'Thêm thuế suất'} onClose={onClose}><form onSubmit={submit} className="space-y-3" noValidate>{err && <Alert>{err}</Alert>}
    <L t="Tên thuế *"><input className={inp} value={name} onChange={e => setName(e.target.value)} maxLength={100} autoFocus /></L><L t="Thuế suất (%) *" hint="Từ 0 đến 100, tối đa 2 chữ số thập phân."><input inputMode="decimal" className={inp} value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))} /></L>
    <L t="Trạng thái"><StatusSelect v={status} set={setStatus} /></L><FormFooter busy={busy} label={edit ? 'Lưu thay đổi' : 'Thêm thuế suất'} onClose={onClose} /></form></Modal>);
}
