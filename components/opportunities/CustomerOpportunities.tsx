'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatVnd } from '@/lib/opportunity-core';
import type { OpportunityDto } from '@/types/opportunity';
import { StatusBadge } from './ui';

/** Tab "Cơ hội bán hàng" trong hồ sơ khách hàng — dữ liệu lấy từ API (đã lọc theo phạm vi quyền của người xem) */
export default function CustomerOpportunities({ customerId }: { customerId: string }) {
  const [d, setD] = useState<{ items: OpportunityDto[]; can: { create: boolean } } | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<NonNullable<typeof d>>(`/api/opportunities?customerId=${encodeURIComponent(customerId)}`).then(setD).catch(e => setErr(e instanceof ApiError ? e.message : 'Không tải được cơ hội.')); }, [customerId]);
  return (<div className="space-y-3"><div className="flex items-center justify-between"><b className="text-sm">Cơ hội bán hàng{d ? ` (${d.items.length})` : ''}</b>
    {d?.can.create && <Link href={`/opportunities/new?customerId=${customerId}`} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white">+ Tạo cơ hội</Link>}</div>
    {err && <p className="text-sm text-slate-500">{err}</p>}{!d && !err && <p className="text-sm text-slate-500">Đang tải…</p>}
    {d && !d.items.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Khách hàng chưa có cơ hội bán hàng (trong phạm vi bạn được xem).</p>}
    {d && d.items.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Cơ hội', 'Giá trị', 'Dự kiến chốt', 'Phụ trách', 'Trạng thái'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
      <tbody>{d.items.map(o => <tr key={o.id} className="border-b last:border-0"><td className="p-2 font-medium">{o.code}</td><td className="p-2"><Link href={`/opportunities/${o.id}`} className="font-semibold text-blue-700 hover:underline">{o.title}</Link></td>
        <td className="p-2">{formatVnd(o.value)}</td><td className="p-2">{formatDate(o.expectedCloseDate)}</td><td className="p-2">{o.ownerName}</td><td className="p-2"><StatusBadge s={o.status} /></td></tr>)}</tbody></table></div>}</div>);
}
