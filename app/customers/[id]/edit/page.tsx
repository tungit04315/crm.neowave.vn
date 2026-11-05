'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getCustomer } from '@/lib/customers';
import CustomerForm from '@/components/customers/CustomerForm';
import type { Customer } from '@/types/customer';

export default function EditCustomer() {
  const { id } = useParams<{ id: string }>(); const { profile } = useAuth();
  const [c, setC] = useState<Customer | null | undefined>(undefined);
  useEffect(() => { if (profile) getCustomer(id, profile.organizationId).then(setC).catch(() => setC(null)); }, [id, profile]);
  if (c === undefined) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!c) return <p className="text-sm text-slate-500">Không tìm thấy khách hàng.</p>;
  const { id: _i, code, organizationId, createdBy, updatedBy, createdAt, updatedAt, deletedAt, ownerUid, ownerName, ...input } = c;
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Chỉnh sửa {code}</h1><CustomerForm id={id} initial={input} /></div>;
}
