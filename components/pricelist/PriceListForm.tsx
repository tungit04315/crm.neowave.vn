'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { listGroups } from '@/lib/groups';
import { LIST_TYPE_LABEL } from '@/lib/price-list-core';
import type { PriceListDto, PriceListType } from '@/types/price-list';
import type { CustomerGroup } from '@/types/group';
import type { ActiveStatus } from '@/types/catalog';
import { Alert, area, FormFooter, Group, inp, L, newRequestId } from '@/components/ui/form';
import { errMsg } from '@/components/catalog/shared';

/** Tạo / sửa bảng giá. Giá của từng mặt hàng được thiết lập ở trang chi tiết sau khi lưu. */
export default function PriceListForm({ initial }: { initial?: PriceListDto }) {
  const router = useRouter(), { profile } = useAuth(), rid = useRef(newRequestId());
  const [name, setName] = useState(initial?.name ?? ''), [type, setType] = useState<PriceListType>(initial?.type ?? 'standard'), [description, setDesc] = useState(initial?.description ?? ''), [scopeNote, setScope] = useState(initial?.scopeNote ?? '');
  const [startDate, setStart] = useState(initial?.startDate ?? ''), [endDate, setEnd] = useState(initial?.endDate ?? ''), [groupIds, setGroupIds] = useState<string[]>(initial?.customerGroupIds ?? []), [status, setStatus] = useState<ActiveStatus>(initial?.status ?? 'active');
  const [groups, setGroups] = useState<CustomerGroup[] | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const org = profile?.organizationId;
  useEffect(() => { if (org) listGroups(org).then(setGroups).catch(() => setGroups([])); }, [org]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setErr(null);
    if (!name.trim()) return setErr('Vui lòng nhập tên bảng giá.'); if (startDate && endDate && endDate < startDate) return setErr('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
    setBusy(true);
    const json = { name, type, description, scopeNote, startDate, endDate, customerGroupIds: groupIds, status };
    try {
      if (initial) { await api(`/api/catalog/price-lists/${initial.id}`, { method: 'PATCH', json: { ...json, version: initial.version } }); router.push(`/products/price-lists/${initial.id}`); }
      else { const r = await api<{ id: string }>('/api/catalog/price-lists', { method: 'POST', json: { ...json, requestId: rid.current } }); router.push(`/products/price-lists/${r.id}`); }
    } catch (x) { setErr(errMsg(x, 'Không lưu được bảng giá.')); setBusy(false); }
  }
  const toggle = (id: string) => setGroupIds(g => (g.includes(id) ? g.filter(x => x !== id) : [...g, id]));
  return (<form onSubmit={submit} className="space-y-4" noValidate>{err && <Alert>{err}</Alert>}
    <Group title="Thông tin chung"><div className="grid gap-3 md:grid-cols-2">
      <L t="Mã"><input className={`${inp} bg-slate-50`} value={initial?.code ?? 'Tự động'} readOnly /></L><L t="Tiền tệ"><input className={`${inp} bg-slate-50`} value="VND" readOnly /></L>
      <L t="Tên bảng giá *" wide><input className={inp} value={name} onChange={e => setName(e.target.value)} maxLength={150} autoFocus /></L>
      <L t="Loại bảng giá"><select className={inp} value={type} onChange={e => setType(e.target.value as PriceListType)}>{Object.entries(LIST_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></L>
      <L t="Trạng thái"><select className={inp} value={status} onChange={e => setStatus(e.target.value as ActiveStatus)}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></L>
      <L t="Mô tả" wide><textarea className={area} value={description} onChange={e => setDesc(e.target.value)} maxLength={500} /></L></div></Group>
    <Group title="Hiệu lực và phạm vi"><div className="grid gap-3 md:grid-cols-2">
      <L t="Ngày bắt đầu" hint="Để trống nếu có hiệu lực ngay."><input type="date" className={inp} value={startDate} onChange={e => setStart(e.target.value)} /></L>
      <L t="Ngày kết thúc" hint="Để trống nếu không giới hạn."><input type="date" className={inp} value={endDate} onChange={e => setEnd(e.target.value)} /></L>
      <L t="Phạm vi áp dụng" wide hint="Ví dụ: khu vực, kênh bán hàng, đối tượng."><input className={inp} value={scopeNote} onChange={e => setScope(e.target.value)} maxLength={200} /></L>
      <div className="md:col-span-2"><div className="mb-1 text-xs font-medium text-slate-600">Nhóm khách hàng áp dụng</div>
        {groups === null ? <p className="text-xs text-slate-400">Đang tải nhóm…</p> : groups.length === 0 ? <p className="text-xs text-slate-400">Chưa có nhóm khách hàng nào.</p>
          : <div className="flex flex-wrap gap-2">{groups.map(g => <label key={g.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs ${groupIds.includes(g.id) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
            <input type="checkbox" className="accent-blue-600" checked={groupIds.includes(g.id)} onChange={() => toggle(g.id)} />{g.name}</label>)}</div>}
        <p className="mt-1 text-xs text-slate-400">Để trống nếu bảng giá không giới hạn theo nhóm. Quy tắc chọn giá khi khách thuộc nhiều nhóm sẽ thiết lập ở bước giá theo nhóm.</p></div></div></Group>
    <FormFooter busy={busy} label={initial ? 'Lưu thay đổi' : 'Tạo bảng giá'} onClose={() => router.back()} /></form>);
}
