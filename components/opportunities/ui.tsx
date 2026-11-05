'use client';
import { STATUS_LABEL, type OppStatus } from '@/lib/opportunity-core';

export const STATUS_COLOR: Record<OppStatus, string> = { open: 'bg-blue-50 text-blue-600', won: 'bg-emerald-50 text-emerald-600', lost: 'bg-red-50 text-red-600' };
export const StatusBadge = ({ s }: { s: OppStatus }) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[s]}`}>{STATUS_LABEL[s]}</span>;
export const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD theo giờ địa phương
export { Modal } from '@/components/ui/Modal'; // đã chuyển sang components/ui, giữ đường dẫn import cũ
