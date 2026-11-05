// Tạo người dùng: tài khoản Firebase Auth + hồ sơ users/{uid} (cùng cấu trúc với hồ sơ super_admin hiện có).
// Dùng:  NEW_USER_PASSWORD='mật-khẩu-tạm' node scripts/create-user.mjs <email> "<Họ tên>" <role> [departmentId] ["Chức danh"]
//   role: super_admin | director | manager | sales | operations | accountant | customer_service
//   Mật khẩu chỉ truyền qua biến môi trường (không ghi vào lịch sử lệnh dạng tham số, không in ra màn hình).
//   ORG_ID: mã tổ chức (mặc định org_1).  Cần service-account.json ở thư mục gốc (KHÔNG commit).
// Nếu email đã có trong Firebase Auth: giữ nguyên mật khẩu, chỉ ghi/cập nhật hồ sơ.
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';

const ROLES = ['super_admin', 'director', 'manager', 'sales', 'operations', 'accountant', 'customer_service'];
const [email, displayName, role, departmentId = null, position = null] = process.argv.slice(2);
const password = process.env.NEW_USER_PASSWORD, organizationId = process.env.ORG_ID ?? 'org_1';
if (!email || !displayName || !ROLES.includes(role)) {
  console.error(`Dùng: NEW_USER_PASSWORD='...' node scripts/create-user.mjs <email> "<Họ tên>" <role> [departmentId] ["Chức danh"]\nrole hợp lệ: ${ROLES.join(', ')}`);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./service-account.json', 'utf8'))) });
const auth = admin.auth(), db = admin.firestore(), now = admin.firestore.FieldValue.serverTimestamp();

let user, created = false;
try { user = await auth.getUserByEmail(email); }
catch (e) {
  if (e.code !== 'auth/user-not-found') throw e;
  if (!password || password.length < 8) { console.error('Thiếu NEW_USER_PASSWORD (tối thiểu 8 ký tự) để tạo tài khoản mới.'); process.exit(1); }
  user = await auth.createUser({ email, password, displayName, emailVerified: false }); created = true;
}
const ref = db.doc(`users/${user.uid}`), exists = (await ref.get()).exists;
await ref.set({
  uid: user.uid, email, displayName, role, organizationId, departmentId, branchId: null, position,
  phoneNumber: null, avatarUrl: null, status: 'active', authProvider: 'password', updatedAt: now,
  ...(exists ? {} : { createdAt: now, lastLoginAt: null }),
}, { merge: true });
console.log(`${created ? 'Đã tạo tài khoản' : 'Tài khoản đã tồn tại (giữ nguyên mật khẩu), đã cập nhật hồ sơ'}: ${email} · role=${role} · departmentId=${departmentId ?? 'null'} · org=${organizationId}`);
process.exit(0);
