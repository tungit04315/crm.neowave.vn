'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { TicketDetail } from '@/types/care';
import TicketForm from './TicketForm';

export default function TicketEditView() {
  const { id } = useParams<{ id: string }>(); const [d, setD] = useState<TicketDetail | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<TicketDetail>(`/api/care/tickets/${id}`).then(setD).catch(e => setErr(e instanceof ApiError ? e.message : 'Không tải được yêu cầu hỗ trợ.')); }, [id]);
  if (err) return <p role="alert" className="text-sm text-red-500">{err}</p>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!d.can.edit) return <p className="text-sm text-slate-500">Bạn không thể chỉnh sửa yêu cầu này (đã đóng hoặc không phải người phụ trách). <Link href={`/care/tickets/${id}`} className="text-blue-600 underline">Quay lại</Link></p>;
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Chỉnh sửa {d.ticket.code}</h1><TicketForm initial={d.ticket} canSetPriority={d.can.setPriority} /></div>;
}
