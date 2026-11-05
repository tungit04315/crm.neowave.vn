import type { Timestamp } from 'firebase/firestore';

export type CustomerType = 'company' | 'individual';
export type CustomerStatus = 'active' | 'paused';
export interface Customer {
  id: string; code: string; organizationId: string;
  type: CustomerType; name: string; companyName: string; taxCode: string; website: string;
  phone: string; email: string; address: string; province: string; district: string; representative: string;
  industry: string; size: string; groupName: string; source: string;
  status: CustomerStatus; potential: 'low' | 'medium' | 'high'; isVip: boolean;
  ownerUid: string; ownerName: string; note: string;
  createdBy: string; updatedBy: string; createdAt: Timestamp; updatedAt: Timestamp; deletedAt: Timestamp | null;
}
export type CustomerInput = Omit<Customer, 'id' | 'code' | 'organizationId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'ownerUid' | 'ownerName'>;

export const TYPE_LABEL: Record<CustomerType, string> = { company: 'Doanh nghiệp', individual: 'Cá nhân' };
export const STATUS_LABEL: Record<CustomerStatus, string> = { active: 'Đang hoạt động', paused: 'Tạm ngưng' };
export const POTENTIAL_LABEL = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' } as const;
export const SOURCES = ['Website', 'Google', 'Facebook', 'Zalo', 'Giới thiệu', 'Khách hàng cũ', 'Đối tác', 'Sự kiện', 'Nhập thủ công', 'Khác'];
export const SIZES = ['Doanh nghiệp lớn', 'Doanh nghiệp vừa', 'Doanh nghiệp nhỏ', 'Cá nhân'];
export const emptyCustomer: CustomerInput = {
  type: 'company', name: '', companyName: '', taxCode: '', website: '', phone: '', email: '', address: '', province: '', district: '',
  representative: '', industry: '', size: '', groupName: '', source: 'Nhập thủ công', status: 'active', potential: 'medium', isVip: false, note: '',
};
