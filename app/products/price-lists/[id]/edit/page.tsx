'use client';
import { useParams } from 'next/navigation';
import PriceListForm from '@/components/pricelist/PriceListForm';
import { Denied, useApiData } from '@/components/catalog/shared';
import type { PriceListDetail } from '@/types/price-list';

export default function EditPriceList() {
  const { id } = useParams<{ id: string }>(); const { data: d, err, denied } = useApiData<PriceListDetail>(`/api/catalog/price-lists/${id}`);
  if (denied) return <Denied />;
  if (err && !d) return <p className="text-sm text-red-500">{err}</p>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!d.can.edit) return <Denied message="Bạn không có quyền chỉnh sửa bảng giá." />;
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Chỉnh sửa {d.list.code}</h1><PriceListForm initial={d.list} /></div>;
}
