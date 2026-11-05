import type { Timestamp } from 'firebase/firestore';

export type Role = 'super_admin' | 'director' | 'manager' | 'sales' | 'operations' | 'accountant' | 'customer_service';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface UserProfile {
  uid: string; email: string; displayName: string;
  phoneNumber: string | null; avatarUrl: string | null;
  role: Role; organizationId: string; branchId: string | null; departmentId: string | null; position: string | null;
  status: UserStatus; authProvider: 'password' | 'google';
  lastLoginAt: Timestamp | null; createdAt: Timestamp; updatedAt: Timestamp;
}
