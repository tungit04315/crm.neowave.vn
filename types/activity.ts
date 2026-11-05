import type { Timestamp } from 'firebase/firestore';

export type ActivityType = 'call' | 'meeting' | 'visit' | 'email' | 'message' | 'consult' | 'care' | 'note' | 'other';
export const ACTIVITY_LABEL: Record<ActivityType, string> = { call: 'Cuộc gọi', meeting: 'Cuộc họp', visit: 'Gặp trực tiếp', email: 'Email', message: 'Tin nhắn', consult: 'Tư vấn', care: 'Chăm sóc', note: 'Ghi chú', other: 'Khác' };
export const ACTIVITY_COLOR: Record<ActivityType, string> = { call: '#2563eb', meeting: '#8b5cf6', visit: '#10b981', email: '#f59e0b', message: '#06b6d4', consult: '#6366f1', care: '#f43f5e', note: '#64748b', other: '#94a3b8' };

export interface Activity {
  id: string; code: string; organizationId: string; customerId: string; contactId: string | null; contactName: string;
  type: ActivityType; title: string; content: string; result: string; occurredAt: Timestamp; nextFollowUpAt: Timestamp | null;
  performedByName: string; createdBy: string; createdAt: Timestamp; updatedAt: Timestamp; deletedAt: Timestamp | null;
}
export interface ActivityInput {
  customerId: string; contactId: string | null; contactName: string; type: ActivityType; title: string; content: string; result: string;
  occurredAt: Date; nextFollowUpAt: Date | null;
}
