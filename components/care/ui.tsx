'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatWorkingDuration } from '@/lib/care-core';
import {
  PRIORITY_COLOR, PRIORITY_LABEL, SLA_COLOR, TICKET_STATUS_COLOR, TICKET_STATUS_LABEL,
  type CareMeta, type SlaPart, type TicketPriority, type TicketStatus,
} from '@/types/care';

export const PriorityBadge = ({ p }: { p: TicketPriority }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLOR[p]}`}>{PRIORITY_LABEL[p]}</span>;
export const TicketStatusBadge = ({ s }: { s: TicketStatus }) => <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TICKET_STATUS_COLOR[s]}`}>{TICKET_STATUS_LABEL[s]}</span>;

/** Văn bản đồng hồ SLA, tính theo GIỜ LÀM VIỆC tại thời điểm tải dữ liệu (tải lại trang để cập nhật) */
export function slaText(p: SlaPart): string {
  if (p.state === 'met') return 'Đạt';
  if (p.state === 'missed') return 'Trễ hạn';
  if (p.state === 'paused') return p.remainingMs === null ? 'Tạm dừng' : `Tạm dừng · còn ${formatWorkingDuration(Math.max(0, p.remainingMs))}`;
  if (p.remainingMs === null) return '—';
  return p.remainingMs < 0 ? `Quá ${formatWorkingDuration(-p.remainingMs)}` : `Còn ${formatWorkingDuration(p.remainingMs)}`;
}
export const SlaLine = ({ label, p }: { label: string; p: SlaPart }) => <div className={`whitespace-nowrap ${SLA_COLOR[p.state]}`}><span className="text-slate-400">{label}: </span>{slaText(p)}</div>;

// Mỗi lần mở trang tải lại (không cache cấp module) để quyền của người dùng trước không bị giữ lại khi đổi tài khoản
export function useCareMeta() {
  const [meta, setMeta] = useState<CareMeta | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let on = true; api<CareMeta>('/api/care/meta').then(m => on && setMeta(m)).catch(e => on && setErr(e instanceof Error ? e.message : 'Không tải được dữ liệu cấu hình.')); return () => { on = false; }; }, []);
  return { meta, err };
}
export const inp = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export const sel = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs';
