import { adminAuth, adminDb } from './firebase-admin';
import { HttpError } from './errors';

export interface Ctx { uid: string; name: string; role: string; orgId: string; departmentId: string | null; branchId: string | null }
const ROLES = ['super_admin', 'director', 'manager', 'sales', 'operations', 'accountant', 'customer_service'];

/** Xác minh ID Token Firebase, rồi nạp hồ sơ `users/{uid}` từ Firestore. Không tin bất kỳ thông tin quyền nào do trình duyệt gửi lên. */
export async function authenticate(req: Request): Promise<Ctx> {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'unauthenticated', 'Vui lòng đăng nhập.');
  const au = adminAuth(); // lỗi cấu hình phải báo đúng là lỗi cấu hình (500), không được nhầm với token sai
  let uid: string;
  try { uid = (await au.verifyIdToken(token)).uid; }
  catch { throw new HttpError(401, 'invalid-token', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'); }
  const snap = await adminDb().doc(`users/${uid}`).get();
  const u = snap.data();
  if (!u) throw new HttpError(403, 'no-profile', 'Không tìm thấy hồ sơ người dùng.');
  if (u.status !== 'active') throw new HttpError(403, 'inactive', 'Tài khoản chưa được kích hoạt hoặc đã bị khóa.');
  if (!u.organizationId || !ROLES.includes(u.role)) throw new HttpError(403, 'bad-profile', 'Hồ sơ người dùng không hợp lệ.');
  return { uid, name: u.displayName || u.email || uid, role: u.role, orgId: u.organizationId, departmentId: u.departmentId ?? null, branchId: u.branchId ?? null };
}
