import type { Timestamp } from 'firebase/firestore';

export interface CustomerGroup {
  id: string; code: string; organizationId: string; name: string; description: string; color: string;
  status: 'active' | 'inactive'; createdBy: string; createdAt: Timestamp; updatedAt: Timestamp; deletedAt: Timestamp | null;
}
export type GroupInput = Pick<CustomerGroup, 'name' | 'description' | 'color' | 'status'>;
export interface GroupMember { id: string; organizationId: string; groupId: string; customerId: string; addedBy: string; addedAt: Timestamp }
export const GROUP_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b'];
