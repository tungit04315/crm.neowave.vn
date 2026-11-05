'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { CategoryDto, ItemDto } from '@/types/catalog';
import type { DiscountKind, DiscountPolicyDto } from '@/types/pricing';
import { Alert, area, FormFooter, fmtNum, Group, inp, L, newRequestId } from '@/components/ui/form';
import { errMsg, useApiData } from '@/components/catalog/shared';
import { GroupChips, ItemPicker, useGroupList } from './shared';

const asItems = (p?: DiscountPolicyDto): ItemDto[] => (p?.itemIds ?? []).map((id, k) => { const [code, ...n] = (p!.itemNames[k] ?? id).split(' – '); return { id, code, name: n.join(' – '), defaultPrice: 0 } as ItemDto; });
/** Tạo / sửa chính sách chiết khấu */
export default function DiscountForm({ initial }: { initial?: DiscountPolicyDto }) {
  const router = useRouter(), rid = useRef(newRequestId()), { groups } = useGroupList();
  const prod = useApiData<{ items: CategoryDto[] }>('/api/catalog/categories?type=product'), svc = useApiData<{ items: CategoryDto[] }>('/api/catalog/categories?type=service'), cats = [...(prod.data?.items ?? []), ...(svc.data?.items ?? [])];
  const [name, setName] = useState(initial?.name ?? ''), [description, setDesc] = useState(initial?.description ?? ''), [kind, setKind] = useState<DiscountKind>(initial?.kind ?? 'percent');
  const [value, setValue] = useState(initial ? (initial.kind === 'percent' ? String(initial.value / 100) : String(initial.value)) : ''), [stackable, setStack] = useState(initial?.stackable ?? false), [min, setMin] = useState(initial?.minOrderValue ? String(initial.minOrderValue) : '');
  const [groupIds, setGroupIds] = useState(initial?.customerGroupIds ?? []), [items, setItems] = useState(asItems(initial)), [catIds, setCatIds] = useState(initial?.categoryIds ?? []), [startDate, setStart] = useState(initial?.startDate ?? ''), [endDate, setEnd] = useState(initial?.endDate ?? ''), [status, setStatus] = useState(initial?.status ?? 'active');
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setErr(null);
    if (!name.trim()) return setErr('Vui lòng nhập tên chính sách.'); if (startDate && endDate && endDate < startDate) return setErr('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
    let v: number;
    if (kind === 'percent') { const n = Number(value.replace(',', '.')); if (!value.trim() || !Number.isFinite(n) || n <= 0 || n > 100 || Math.round(n * 100) / 100 !== n) return setErr('Phần trăm chiết khấu phải lớn hơn 0 và tối đa 100 (tối đa 2 chữ số thập phân).'); v = Math.round(n * 100); }
    else { v = Number(value); if (!value || !(v > 0)) return setErr('Số tiền chiết khấu phải lớn hơn 0.'); }
    setBusy(true);
    const json = { name, description, kind, value: v, stackable, minOrderValue: min ? Number(min) : null, customerGroupIds: groupIds, itemIds: items.map(i => i.id), categoryIds: catIds, startDate, endDate, status };
    try {
      if (initial) { await api(`/api/catalog/discounts/${initial.id}`, { method: 'PATCH', json: { ...json, version: initial.version } }); router.push(`/products/discounts/${initial.id}`); }
      else { const r = await api<{ id: string }>('/api/catalog/discounts', { method: 'POST', json: { ...json, requestId: rid.current } }); router.push(`/products/discounts/${r.id}`); }
    } catch (x) { setErr(errMsg(x, 'Không lưu được chính sách.')); setBusy(false); }
  }
  const tgCat = (id: string) => setCatIds(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));
  return (<form onSubmit={submit} className="space-y-4" noValidate>{err && <Alert>{err}</Alert>}
    <Group title="Thông tin chung"><L t="Mã"><input className={`${inp} bg-slate-50`} value={initial?.code ?? 'Tự động'} readOnly /></L>
      <L t="Trạng thái"><select className={inp} value={status} onChange={e => setStatus(e.target.value as 'active' | 'inactive')}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></L>
      <L t="Tên chính sách *" wide><input className={inp} value={name} onChange={e => setName(e.target.value)} maxLength={150} autoFocus /></L>
      <L t="Mô tả" wide><textarea className={area} value={description} onChange={e => setDesc(e.target.value)} maxLength={500} /></L></Group>
    <Group title="Mức chiết khấu"><L t="Loại"><select className={inp} value={kind} onChange={e => { setKind(e.target.value as DiscountKind); setValue(''); }}><option value="percent">Phần trăm (%)</option><option value="amount">Số tiền (VND)</option></select></L>
      <L t={kind === 'percent' ? 'Giá trị (%) *' : 'Số tiền (VND) *'}>{kind === 'percent' ? <input inputMode="decimal" aria-label="Giá trị" className={inp} value={value} onChange={e => setValue(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))} /> : <input inputMode="numeric" aria-label="Giá trị" className={inp} value={fmtNum(value)} onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 12))} />}</L>
      <L t="Giá trị đơn hàng tối thiểu (VND)" hint="Để trống nếu không yêu cầu."><input inputMode="numeric" className={inp} value={fmtNum(min)} onChange={e => setMin(e.target.value.replace(/\D/g, '').slice(0, 13))} /></L>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={stackable} onChange={e => setStack(e.target.checked)} />Cho phép cộng dồn với chính sách khác</label>
      <p className="text-xs text-slate-400 md:col-span-2">Chính sách không cộng dồn: hệ thống chỉ chọn một chính sách có mức giảm lớn nhất. Chính sách cộng dồn được áp dụng thêm.</p></Group>
    <Group title="Hiệu lực và phạm vi"><L t="Ngày bắt đầu"><input type="date" className={inp} value={startDate} onChange={e => setStart(e.target.value)} /></L><L t="Ngày kết thúc"><input type="date" className={inp} value={endDate} onChange={e => setEnd(e.target.value)} /></L>
      <div className="md:col-span-2"><div className="mb-1 text-xs font-medium text-slate-600">Nhóm khách hàng (để trống = tất cả khách hàng)</div><GroupChips groups={groups} value={groupIds} onChange={setGroupIds} /></div>
      <div className="md:col-span-2"><div className="mb-1 text-xs font-medium text-slate-600">Nhóm sản phẩm / dịch vụ (để trống = tất cả)</div>{cats.length === 0 ? <p className="text-xs text-slate-400">Chưa có nhóm hàng nào.</p> : <div className="flex flex-wrap gap-2">{cats.map(c => <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs ${catIds.includes(c.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}><input type="checkbox" className="accent-blue-600" checked={catIds.includes(c.id)} onChange={() => tgCat(c.id)} />{c.name}</label>)}</div>}</div>
      <div className="md:col-span-2"><div className="mb-1 text-xs font-medium text-slate-600">Mặt hàng cụ thể (để trống = tất cả)</div><ItemPicker value={items} onChange={setItems} /></div></Group>
    <FormFooter busy={busy} label={initial ? 'Lưu thay đổi' : 'Tạo chính sách'} onClose={() => router.back()} /></form>);
}
