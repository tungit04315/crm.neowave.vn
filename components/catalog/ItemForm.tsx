'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ITEM_STATUS_LABEL, TYPE_LABEL } from '@/lib/catalog-core';
import type { CategoryDto, CatalogType, ItemDto, TaxRateDto, UnitDto } from '@/types/catalog';
import { Alert, area, fmtNum, FormFooter, Group, inp, L, newRequestId } from '@/components/ui/form';
import { Denied, errMsg, money, useApiData } from './shared';

/** PS-02 / PS-03: thêm hoặc sửa sản phẩm / dịch vụ. Giá chỉ nhập khi tạo; sau đó đổi giá qua quy trình đổi giá. */
export default function ItemForm({ type, initial }: { type?: CatalogType; initial?: ItemDto }) {
  const router = useRouter(), t = initial?.type ?? type ?? 'product';
  const requestId = useRef(newRequestId()); // giữ nguyên khi gửi lại → máy chủ không tạo bản ghi thứ hai
  const cats = useApiData<{ items: CategoryDto[]; can: { edit: boolean } }>(`/api/catalog/categories?type=${t}`), units = useApiData<{ items: UnitDto[] }>('/api/catalog/units'), taxes = useApiData<{ items: TaxRateDto[] }>('/api/catalog/tax-rates');
  const [name, setName] = useState(initial?.name ?? ''); const [categoryId, setCategoryId] = useState(initial?.categoryId ?? ''); const [unitId, setUnitId] = useState(initial?.unitId ?? '');
  const [shortDescription, setShort] = useState(initial?.shortDescription ?? ''); const [description, setDesc] = useState(initial?.description ?? ''); const [taxRateId, setTax] = useState(initial?.taxRateId ?? '');
  const [includes, setIncludes] = useState(initial?.priceIncludesTax ?? false); const [price, setPrice] = useState('0'); const [status, setStatus] = useState(initial?.status ?? 'active'); const [note, setNote] = useState(initial?.note ?? '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  if (cats.denied || units.denied) return <Denied />;
  if (cats.data && !cats.data.can.edit) return <Denied message="Bạn chỉ có quyền xem danh mục sản phẩm & dịch vụ." />;

  const catOpts = (cats.data?.items ?? []).filter(c => c.status === 'active' || c.id === initial?.categoryId), unitOpts = (units.data?.items ?? []).filter(u => u.status === 'active' || u.id === initial?.unitId);
  const taxOpts = (taxes.data?.items ?? []).filter(x => x.status === 'active' || x.id === initial?.taxRateId);
  const ready = !!cats.data && !!units.data;
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!name.trim()) return setErr('Vui lòng nhập tên.'); if (!categoryId) return setErr('Vui lòng chọn nhóm.'); if (!unitId) return setErr('Vui lòng chọn đơn vị tính.');
    setBusy(true); setErr(null);
    const data = { name, categoryId, unitId, shortDescription, description, taxRateId: taxRateId || null, priceIncludesTax: includes, status, note };
    try {
      if (initial) { await api(`/api/catalog/items/${initial.id}`, { method: 'PATCH', json: { ...data, version: initial.version } }); router.replace(`/products/${initial.id}`); }
      else { const r = await api<{ id: string }>('/api/catalog/items', { method: 'POST', json: { ...data, type: t, defaultPrice: Number(price || 0), requestId: requestId.current } }); router.replace(`/products/${r.id}`); }
    } catch (x) { setErr(errMsg(x, 'Không lưu được.')); setBusy(false); }
  }
  return (<form onSubmit={submit} noValidate className="space-y-4">
    {(err || cats.err || units.err) && <Alert>{err ?? cats.err ?? units.err}</Alert>}
    <Group title="Thông tin định danh"><L t="Loại"><input className={`${inp} bg-slate-50`} value={TYPE_LABEL[t]} readOnly /></L>
      <L t="Mã" hint={initial ? undefined : 'Mã được hệ thống tự sinh khi lưu.'}><input className={`${inp} bg-slate-50`} value={initial?.code ?? 'Tự động'} readOnly /></L>
      <L t={`Tên ${t === 'product' ? 'sản phẩm' : 'dịch vụ'} *`} wide><input className={inp} value={name} onChange={e => setName(e.target.value)} maxLength={200} autoFocus /></L>
      <L t={`Nhóm ${t === 'product' ? 'sản phẩm' : 'dịch vụ'} *`}><select className={inp} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">{ready ? '— Chọn nhóm —' : 'Đang tải…'}</option>{catOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {ready && !catOpts.length && <span className="mt-1 block text-amber-600">Chưa có nhóm. <Link href={t === 'product' ? '/products/product-groups' : '/products/service-groups'} className="underline">Tạo nhóm trước</Link>.</span>}</L>
      <L t="Trạng thái"><select className={inp} value={status} onChange={e => setStatus(e.target.value as 'active' | 'inactive')}>{Object.entries(ITEM_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></L></Group>
    <Group title="Mô tả"><L t="Mô tả ngắn" wide><input className={inp} value={shortDescription} onChange={e => setShort(e.target.value)} maxLength={300} /></L>
      <L t="Mô tả chi tiết" wide><textarea className={area} value={description} onChange={e => setDesc(e.target.value)} maxLength={5000} /></L></Group>
    <Group title="Thông tin thương mại"><L t="Đơn vị tính *"><select className={inp} value={unitId} onChange={e => setUnitId(e.target.value)}><option value="">{ready ? '— Chọn đơn vị —' : 'Đang tải…'}</option>{unitOpts.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}</select>
        {ready && !unitOpts.length && <span className="mt-1 block text-amber-600">Chưa có đơn vị. <Link href="/products/units" className="underline">Tạo đơn vị trước</Link>.</span>}</L>
      {initial ? <L t="Giá bán mặc định" hint="Muốn đổi giá, dùng nút “Đổi giá” ở trang chi tiết để có lịch sử và phê duyệt."><input className={`${inp} bg-slate-50`} value={money(initial.defaultPrice)} readOnly /></L>
        : <L t="Giá bán mặc định (VND)" hint="Giá ban đầu. Các lần đổi sau sẽ được ghi lịch sử và có thể cần phê duyệt."><input inputMode="numeric" className={inp} value={fmtNum(price)} onChange={e => setPrice(e.target.value.replace(/\D/g, '').slice(0, 13))} /></L>}
      <L t="Thuế áp dụng"><select className={inp} value={taxRateId} onChange={e => setTax(e.target.value)}><option value="">Không áp dụng</option>{taxOpts.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {taxes.data && !taxes.data.items.length && <span className="mt-1 block text-slate-400">Chưa có mức thuế nào được khai báo.</span>}</L>
      <L t="Chế độ giá"><label className="flex h-10 items-center gap-2 text-sm font-normal text-slate-700"><input type="checkbox" checked={includes} onChange={e => setIncludes(e.target.checked)} className="accent-blue-600" />Giá bán đã bao gồm thuế</label></L></Group>
    <Group title="Quản lý"><L t="Ghi chú nội bộ" wide><textarea className={area} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} /></L></Group>
    <FormFooter busy={busy} label={initial ? 'Lưu thay đổi' : `Tạo ${t === 'product' ? 'sản phẩm' : 'dịch vụ'}`} onClose={() => router.back()} /></form>);
}
