import type { Timestamp } from 'firebase/firestore';

export type LeadStatus = 'new' | 'contacting' | 'qualified' | 'converted' | 'lost';
export interface Lead {
  id: string; code: string; organizationId: string; name: string; contactName: string; phone: string; email: string; website: string;
  industry: string; need: string; interest: string; source: string; status: LeadStatus; note: string;
  ownerUid: string; ownerName: string; convertedCustomerId: string | null;
  createdBy: string; createdAt: Timestamp; updatedAt: Timestamp; deletedAt: Timestamp | null;
}
export type LeadInput = Pick<Lead, 'name' | 'contactName' | 'phone' | 'email' | 'website' | 'industry' | 'need' | 'interest' | 'source' | 'note'>;
export const emptyLead: LeadInput = { name: '', contactName: '', phone: '', email: '', website: '', industry: '', need: '', interest: '', source: 'Nhập thủ công', note: '' };
export const LEAD_STATUS: Record<LeadStatus, string> = { new: 'Mới', contacting: 'Đang liên hệ', qualified: 'Đã xác minh', converted: 'Đã chuyển đổi', lost: 'Không tiềm năng' };
export const LEAD_COLOR: Record<LeadStatus, string> = { new: 'bg-blue-50 text-blue-600', contacting: 'bg-amber-50 text-amber-600', qualified: 'bg-emerald-50 text-emerald-600', converted: 'bg-violet-50 text-violet-600', lost: 'bg-slate-100 text-slate-500' };

export interface Contact {
  id: string; organizationId: string; customerId: string; name: string; position: string; department: string; phone: string; email: string;
  role: string; isPrimary: boolean; note: string; createdAt: Timestamp; deletedAt: Timestamp | null;
}
export const CONTACT_ROLES = ['Người đại diện', 'Người ra quyết định', 'Phụ trách mua hàng', 'Phụ trách tài chính', 'Phụ trách kỹ thuật', 'Liên hệ thông thường'];
