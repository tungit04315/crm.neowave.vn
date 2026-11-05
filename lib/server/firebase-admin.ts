import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpError } from './errors';

// Chạy ở Next.js API Route (không dùng Cloud Functions, không cần gói Blaze). Khóa dịch vụ chỉ đọc từ biến môi trường phía server.
function app() {
  if (getApps().length) return getApps()[0];
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: key } = process.env;
  if (!projectId || !clientEmail || !key) throw new HttpError(500, 'config', 'Máy chủ chưa được cấu hình Firebase Admin.');
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey: key.replace(/\\n/g, '\n') }) });
}
export const adminDb = () => getFirestore(app());
export const adminAuth = () => getAuth(app());
