'use client';
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPercentBp } from '@/lib/catalog-core';
import type { ItemDto, ItemList } from '@/types/catalog';
import type { DiscountPolicyDto, GroupPriorityDto, PriceSource } from '@/types/pricing';
import { errMsg, money, useApiData } from '@/components/catalog/shared';

export const SOURCE_LABEL: Record<PriceSource, string> = { group: 'Giá theo nhóm', priceList: 'Bảng giá', default: 'Giá mặc định' };
export const discountText = (p: Pick<DiscountPolicyDto, 'kind' | 'value'>) => (p.kind === 'percent' ? formatPercentBp(p.value) : money(p.value));
/** Danh sách nhóm khách hàng lấy qua API (không đọc Firestore trực tiếp từ trình duyệt). */
export function useGroupList() {
  const r = useApiData<{ items: GroupPriorityDto[]; can: { editPriority: boolean } }>('/api/catalog/group-priorities');
  return { groups: r.data?.items ?? null, canEditPriority: !!r.data?.can.editPriority, denied: r.denied, err: r.err, reload: r.reload };
}
export function GroupChips({ groups, value, onChange }: { groups: { groupId: string; groupName: string }[] | null; value: string[]; onChange: (v: string[]) => void }) {
  if (groups === null) return <p className="text-xs text-slate-400">Đang tải nhóm…</p>;
  if (!groups.length) return <p className="text-xs text-slate-400">Chưa có nhóm khách hàng nào.</p>;
  const tg = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return <div className="flex flex-wrap gap-2">{groups.map(g => <label key={g.groupId} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs ${value.includes(g.groupId) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
    <input type="checkbox" className="accent-blue-600" checked={value.includes(g.groupId)} onChange={() => tg(g.groupId)} />{g.groupName}</label>)}</div>;
}
/** Chọn một hoặc nhiều mặt hàng (đang kinh doanh) bằng cách tìm theo mã / tên. */
export function ItemPicker({ value, onChange, single }: { value: ItemDto[]; onChange: (v: ItemDto[]) => void; single?: boolean }) {
  const [q, setQ] = useState(''), [dq, setDq] = useState(''), [found, setFound] = useState<ItemDto[]>([]), [loading, setLoading] = useState(true), [err, setErr] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let live = true;
    api<ItemList>(`/api/catalog/items?status=active&limit=20${dq ? `&q=${encodeURIComponent(dq)}` : ''}`).then(r => { if (live) { setFound(r.items); setLoading(false); setErr(null); } }).catch(e => { if (live) { setErr(errMsg(e, 'Không tìm được mặt hàng.')); setLoading(false); } });
    return () => { live = false; };
  }, [dq]);
  const has = (id: string) => value.some(v => v.id === id);
  const tg = (i: ItemDto) => onChange(has(i.id) ? value.filter(v => v.id !== i.id) : single ? [i] : [...value, i]);
  return (<div className="space-y-2">
    {value.length > 0 && <div className="flex flex-wrap gap-1.5">{value.map(v => <span key={v.id} className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700">{v.code} – {v.name}<button type="button" aria-label={`Bỏ ${v.code}`} onClick={() => onChange(value.filter(x => x.id !== v.id))}><X size={12} /></button></span>)}</div>}
    <div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo mã hoặc tên (đầu từ)…" aria-label="Tìm mặt hàng" className="h-10 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
    {err && <p className="text-xs text-red-500">{err}</p>}
    <div className="max-h-48 overflow-auto rounded-lg border">{found.map(i => (<label key={i.id} className="flex cursor-pointer items-center gap-2 border-b p-2 text-xs last:border-0 hover:bg-slate-50"><input type={single ? 'radio' : 'checkbox'} className="accent-blue-600" checked={has(i.id)} onChange={() => tg(i)} />
      <span className="w-20 font-medium">{i.code}</span><span className="flex-1 truncate">{i.name}</span><span className="text-slate-400">{money(i.defaultPrice)}</span></label>))}
      {loading ? <p className="p-3 text-center text-sm text-slate-500">Đang tìm…</p> : found.length === 0 && <p className="p-3 text-center text-sm text-slate-500">Không có mặt hàng phù hợp.</p>}</div></div>);
}
export const sel = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs';
export const dateLabel = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
