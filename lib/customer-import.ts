import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { CustomerInput } from '@/types/customer';
import type { UserProfile } from '@/types/user';

/** Ghi theo lô 200 dòng; mỗi lô là 1 transaction nên mã KH liên tục, không trùng và lô lỗi không để lại dữ liệu dở. */
export async function importCustomers(p: UserProfile, rows: CustomerInput[], onProgress: (done: number) => void) {
  const counter = doc(db, 'counters', `${p.organizationId}_customer`); let created = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    try {
      await runTransaction(db, async tx => {
        const n = (await tx.get(counter)).data()?.value ?? 0;
        tx.set(counter, { value: n + chunk.length });
        chunk.forEach((v, j) => tx.set(doc(collection(db, 'customers')), { ...v, code: `KH${String(n + j + 1).padStart(5, '0')}`, organizationId: p.organizationId,
          ownerUid: p.uid, ownerName: p.displayName, createdBy: p.uid, updatedBy: p.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedAt: null }));
      });
      created += chunk.length;
    } catch { failed += chunk.length; }
    onProgress(Math.min(i + 200, rows.length));
  }
  return { created, failed };
}
