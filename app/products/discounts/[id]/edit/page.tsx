'use client';
import { useParams } from 'next/navigation';
import DiscountForm from '@/components/pricing/DiscountForm';
import { Denied, useApiData } from '@/components/catalog/shared';
import type { DiscountPolicyDto } from '@/types/pricing';

export default function Page() {
  const { id } = useParams<{ id: string }>(); const { data: d, err, denied } = useApiData<{ policy: DiscountPolicyDto; can: { edit: boolean } }>(`/api/catalog/discounts/${id}`);
  if (denied) return <Denied />;
  if (err && !d) return <p className="text-sm text-red-500">{err}</p>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!d.can.edit) return <Denied message="Bạn không có quyền chỉnh sửa chính sách chiết khấu." />;
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Chỉnh sửa {d.policy.code}</h1><DiscountForm initial={d.policy} /></div>;
}
