// Kiểu dữ liệu & nhãn của phân hệ Chăm sóc khách hàng (Support Ticket).
// KHÔNG import Firebase: dùng chung cho server (API), client (giao diện) và kiểm thử độc lập. Thời gian ở API là chuỗi ISO.

export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TicketStatus = 'new' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type MessageType = 'reply' | 'internal';
export type SlaState = 'ok' | 'warning' | 'breached' | 'paused' | 'met' | 'missed';

export const PRIORITIES: TicketPriority[] = ['urgent', 'high', 'medium', 'low'];
export const STATUSES: TicketStatus[] = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed'];

export const PRIORITY_LABEL: Record<TicketPriority, string> = { urgent: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Mới', in_progress: 'Đang xử lý', waiting_customer: 'Chờ khách phản hồi', resolved: 'Đã giải quyết', closed: 'Đã đóng',
};
export const MESSAGE_LABEL: Record<MessageType, string> = { reply: 'Phản hồi khách hàng', internal: 'Ghi chú nội bộ' };
export const SLA_LABEL: Record<SlaState, string> = {
  ok: 'Trong hạn', warning: 'Sắp quá hạn', breached: 'Quá hạn', paused: 'Tạm dừng', met: 'Đạt', missed: 'Không đạt',
};
export const PRIORITY_COLOR: Record<TicketPriority, string> = {
  urgent: 'bg-red-50 text-red-600', high: 'bg-orange-50 text-orange-600', medium: 'bg-blue-50 text-blue-600', low: 'bg-slate-100 text-slate-500',
};
export const TICKET_STATUS_COLOR: Record<TicketStatus, string> = {
  new: 'bg-blue-50 text-blue-600', in_progress: 'bg-amber-50 text-amber-600', waiting_customer: 'bg-violet-50 text-violet-600',
  resolved: 'bg-emerald-50 text-emerald-600', closed: 'bg-slate-100 text-slate-500',
};
export const SLA_COLOR: Record<SlaState, string> = {
  ok: 'text-emerald-600', warning: 'text-amber-600', breached: 'text-red-600', paused: 'text-violet-600', met: 'text-emerald-600', missed: 'text-red-600',
};

/** Các chế độ xem của màn hình danh sách (tương ứng menu 9.1.1 – 9.1.5) */
export type TicketView = 'all' | 'new' | 'in-progress' | 'waiting' | 'resolved';
export const VIEW_STATUS: Record<TicketView, TicketStatus[] | null> = {
  all: null, new: ['new'], 'in-progress': ['in_progress'], waiting: ['waiting_customer'], resolved: ['resolved', 'closed'],
};

export interface Change { field: string; label: string; from: string; to: string }

/** Dữ liệu gốc: phòng ban và danh mục (mỗi tài liệu có organizationId) */
export interface DepartmentDto { id: string; name: string }
export interface CategoryDto { id: string; name: string }

export interface SlaPart { state: SlaState; dueAt: string | null; remainingMs: number | null }
export interface SlaInfo { response: SlaPart; resolve: SlaPart }

export interface TicketDto {
  id: string; code: string; title: string; description: string; priority: TicketPriority; status: TicketStatus;
  categoryId: string; categoryName: string; departmentId: string | null; departmentName: string;
  customerId: string; customerCode: string; customerName: string;
  contactId: string | null; contactName: string; contactPhone: string; contactEmail: string;
  contractId: string | null; projectId: string | null; taskId: string | null;
  assigneeUid: string | null; assigneeName: string; receivedByName: string;
  waitingReason: string; resolution: string; resolvedByName: string; reopenCount: number;
  receivedAt: string; firstResponseDueAt: string; resolveDueAt: string; firstRespondedAt: string | null;
  resolvedAt: string | null; closedAt: string | null; waitingSince: string | null; lastActivityAt: string;
  version: number; updatedAt: string; sla: SlaInfo;
}
export interface MessageDto { id: string; type: MessageType; content: string; authorName: string; at: string }
export interface HistoryDto { id: string; type: string; changes: Change[]; note: string; actorName: string; at: string }
export interface TicketFlags {
  edit: boolean; setPriority: boolean; claim: boolean; assign: boolean; transfer: boolean;
  start: boolean; wait: boolean; resolve: boolean; close: boolean; reopen: boolean; reply: boolean; note: boolean;
}
export interface TicketDetail { ticket: TicketDto; messages: MessageDto[]; history: HistoryDto[]; can: TicketFlags }
export interface StaffDto { uid: string; displayName: string; role: string; departmentId: string | null }
export interface TicketStats { total: number; new: number; inProgress: number; waiting: number; resolved: number; breached: number; breachedCapped: boolean }

/** Hình dạng phản hồi của GET /api/care/meta */
export interface CareMeta {
  departments: DepartmentDto[]; categories: CategoryDto[]; slaTargets: Record<TicketPriority, { first: number; resolve: number }>;
  scope: { kind: 'company' } | { kind: 'department'; departmentId: string };
  me: { uid: string; role: string; departmentId: string | null }; can: { create: boolean; bulk: boolean; export: boolean };
}
/** Hình dạng phản hồi của GET /api/care/tickets */
export interface TicketListRes { items: TicketDto[]; nextCursor: string | null; partial: boolean; can: { create: boolean; bulk: boolean; export: boolean } }
export interface BulkRes { results: { id: string; ok: boolean; error?: string }[]; succeeded: number; failed: number }
