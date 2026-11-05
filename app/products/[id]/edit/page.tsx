'use client';
import { useParams } from 'next/navigation';
import ItemForm from '@/components/catalog/ItemForm';
import { Denied, useApiData } from '@/components/catalog/shared';
import type { ItemDetail } from '@/types/catalog';

export default function EditItem() {
  const { id } = useParams<{ id: string }>(); const { data: d, err, denied } = useApiData<ItemDetail>(`/api/catalog/items/${id}`);
  if (denied) return <Denied />;
  if (err && !d) return <p className="text-sm text-red-500">{err}</p>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!d.can.edit) return <Denied message="Bạn không có quyền chỉnh sửa sản phẩm / dịch vụ." />;
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Chỉnh sửa {d.item.code}</h1><ItemForm initial={d.item} /></div>;
}
