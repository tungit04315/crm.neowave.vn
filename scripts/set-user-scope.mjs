// Gán phòng ban / chi nhánh cho người dùng (cần cho phạm vi dữ liệu của Trưởng phòng và Sales).
// Dùng: node scripts/set-user-scope.mjs <email> <departmentId> [branchId]
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
const [email, departmentId, branchId = null] = process.argv.slice(2);
if (!email || !departmentId) { console.error('Dùng: node scripts/set-user-scope.mjs <email> <departmentId> [branchId]'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./service-account.json', 'utf8'))) });
const u = await admin.auth().getUserByEmail(email);
await admin.firestore().doc(`users/${u.uid}`).update({ departmentId, branchId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
console.log(`Đã gán departmentId=${departmentId} branchId=${branchId} cho ${email}`);
process.exit(0);
