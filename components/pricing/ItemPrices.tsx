'use client';
import Link from 'next/link';
import type { ItemPricesDto } from '@/types/pricing';
import { Alert } from '@/components/ui/form';
import { money, useApiData } from '@/components/catalog/shared';
import { period, StateBadge } from '@/components/pricelist/shared';

/** So sánh giá của một mặt hàng: giá mặc định, các bảng giá và giá theo nhóm khách hàng */
export default function ItemPrices({ id }: { id: string }) {
  const { data, err, denied } = useApiData<ItemPricesDto>(`/api/catalog/items/${id}/prices`);
  if (denied) return <p className="text-sm text-slate-400">Bạn không có quyền xem giá theo bảng giá và nhóm khách hàng.</p>;
  if (err && !data) return <Alert>{err}</Alert>;
  if (!data) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const th = 'p-2 font-medium';
  return (<div className="space-y-4 text-xs"><div><h3 className="mb-1 font-semibold text-slate-700">Giá theo nhóm khách hàng</h3>
    {data.groupPrices.length === 0 ? <p className="text-slate-400">Chưa có giá theo nhóm cho mặt hàng này.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px]"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Nhóm', 'Giá', 'Chênh lệch so với mặc định', 'Ưu tiên', 'Hiệu lực', 'Trạng thái'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>{data.groupPrices.map(g => <tr key={g.id} className="border-b last:border-0"><td className="p-2">{g.groupName}</td><td className="p-2 font-semibold">{money(g.price)}</td><td className="p-2">{diff(g.price, data.defaultPrice)}</td><td className="p-2">{g.priority}</td><td className="p-2 whitespace-nowrap">{period(g.startDate, g.endDate)}</td><td className="p-2"><StateBadge s={g.state} /></td></tr>)}</tbody></table></div>}</div>
    <div><h3 className="mb-1 font-semibold text-slate-700">Giá theo bảng giá</h3>
      {data.lists.length === 0 ? <p className="text-slate-400">Mặt hàng chưa nằm trong bảng giá nào.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px]"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Bảng giá', 'Phạm vi', 'Giá', 'Chênh lệch so với mặc định', 'Trạng thái'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{data.lists.map(l => <tr key={l.id} className="border-b last:border-0"><td className="p-2"><Link href={`/products/price-lists/${l.id}`} className="text-blue-700 hover:underline">{l.code} – {l.name}</Link></td><td className="p-2">{l.customerGroupNames.join(', ') || 'Chung'}</td><td className="p-2 font-semibold">{money(l.price)}</td><td className="p-2">{diff(l.price, data.defaultPrice)}</td><td className="p-2"><StateBadge s={l.state} /></td></tr>)}</tbody></table></div>}</div>
    <p className="text-slate-400">Thứ tự áp dụng: giá theo nhóm → bảng giá → giá mặc định ({money(data.defaultPrice)}).</p></div>);
}
const diff = (p: number, base: number) => (base === 0 ? '—' : `${p === base ? '0' : `${p > base ? '+' : ''}${(((p - base) / base) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}`}%`);
