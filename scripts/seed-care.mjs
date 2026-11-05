// Tạo dữ liệu gốc cho phân hệ CSKH: phòng ban (departments) và danh mục yêu cầu (supportCategories).
// ID cố định nên chạy lại nhiều lần không tạo trùng; chỉ ghi đè các trường dưới đây.
// Dùng: node scripts/seed-care.mjs [organizationId=org_1]   (cần service-account.json ở thư mục gốc, KHÔNG commit)
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';

const organizationId = process.argv[2] ?? 'org_1';
const DEPARTMENTS = [
  { id: 'CSKH', name: 'Chăm sóc khách hàng' },
  { id: 'KINHDOANH', name: 'Kinh doanh' },
];
const CATEGORIES = [
  { id: 'ky-thuat', name: 'Hỗ trợ kỹ thuật' },
  { id: 'su-dung', name: 'Tư vấn sử dụng' },
  { id: 'bao-hanh', name: 'Bảo hành' },
  { id: 'thanh-toan', name: 'Thanh toán – chi phí' },
  { id: 'hop-dong', name: 'Hợp đồng' },
  { id: 'khac', name: 'Khác' },
];

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./service-account.json', 'utf8'))) });
const db = admin.firestore(), now = admin.firestore.FieldValue.serverTimestamp();
const batch = db.batch();
DEPARTMENTS.forEach((d, i) => batch.set(db.doc(`departments/${d.id}`), { organizationId, name: d.name, status: 'active', order: i + 1, updatedAt: now }, { merge: true }));
CATEGORIES.forEach((c, i) => batch.set(db.doc(`supportCategories/${c.id}`), { organizationId, name: c.name, status: 'active', order: i + 1, updatedAt: now }, { merge: true }));
await batch.commit();
console.log(`Đã tạo/cập nhật ${DEPARTMENTS.length} phòng ban và ${CATEGORIES.length} danh mục cho ${organizationId}.`);
process.exit(0);
