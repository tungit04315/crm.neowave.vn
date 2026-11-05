import type { Change, OppStatus } from '@/lib/opportunity-core';

/** Dữ liệu cơ hội trả về từ API (thời gian dạng chuỗi ISO) */
export interface OpportunityDto {
  id: string; code: string; title: string; description: string; customerId: string; customerCode: string; customerName: string;
  value: number; probability: number; expectedCloseDate: string | null; source: string; stageId: string; stageName: string; stageReached: string[]; stageEnteredAt: string | null; status: OppStatus; lostReason: string; closedAt: string | null;
  ownerUid: string; ownerName: string; departmentId: string | null; version: number; createdAt: string; updatedAt: string;
}
export interface HistoryDto { id: string; type: string; changes: Change[]; note: string; actorName: string; at: string }
export interface OpportunityFlags { edit: boolean; close: boolean; assign: boolean; reopen: boolean; remove: boolean }
export interface OpportunityDetail { opportunity: OpportunityDto; history: HistoryDto[]; can: OpportunityFlags }
export interface AssignableUser { uid: string; displayName: string; role: string; departmentId: string | null }
