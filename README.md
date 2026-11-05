# Module Sales (Phase 01 + Phase 02) — GÓI ĐẦY ĐỦ
Gói này đã gộp sẵn Phase 01 và Phase 02. Chỉ cần giải nén và chép đè vào crm-app, KHÔNG cần chép thêm gói Phase 01.

1. npm install firebase-admin
2. Chép app/, components/, lib/, types/, scripts/ vào crm-app (ghi đè file cùng tên).
3. Điền FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY vào .env.local (mẫu: .env.local.append).
4. Dán firestore.rules → Publish.
5. Sửa 2 dòng formatter trong components/dashboard/Charts.tsx (xem hướng dẫn Phase 01) nếu muốn chạy `next build`.
6. Gán phòng ban: node scripts/set-user-scope.mjs <email> <departmentId>
7. rm -rf .next && npm run dev
