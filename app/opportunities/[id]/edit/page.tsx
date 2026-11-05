'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import OpportunityForm from '@/components/opportunities/OpportunityForm';
import type { OpportunityDetail } from '@/types/opportunity';

export default function EditOpportunity() {
  const { id } = useParams<{ id: string }>(); const [d, setD] = useState<OpportunityDetail | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<OpportunityDetail>(`/api/opportunities/${id}`).then(setD).catch(e => setErr(e instanceof ApiError ? e.message : 'Không tải được cơ hội.')); }, [id]);
  if (err) return <p className="text-sm text-red-500">{err}</p>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!d.can.edit) return <p className="text-sm text-slate-500">Bạn không thể chỉnh sửa cơ hội này (đã đóng hoặc không đủ quyền).</p>;
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Chỉnh sửa {d.opportunity.code}</h1><OpportunityForm initial={d.opportunity} /></div>;
}
