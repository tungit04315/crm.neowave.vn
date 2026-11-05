import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Customer, CustomerInput } from '@/types/customer';
import type { UserProfile } from '@/types/user';

const col = () => collection(db, 'customers');

export async function listCustomers(org: string): Promise<Customer[]> {
  const snap = await getDocs(query(col(), where('organizationId', '==', org)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Customer).filter(c => !c.deletedAt)
    .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
}

export async function getCustomer(id: string, org: string): Promise<Customer | null> {
  const s = await getDoc(doc(db, 'customers', id));
  if (!s.exists()) return null;
  const c = { id: s.id, ...s.data() } as Customer;
  return c.organizationId === org && !c.deletedAt ? c : null;
}

/** Trả về khách hàng đã tồn tại (trùng MST / SĐT / email) hoặc null */
export async function findDuplicate(org: string, v: CustomerInput, excludeId?: string): Promise<Customer | null> {
  for (const f of ['taxCode', 'phone', 'email'] as const) {
    const val = v[f].trim().toLowerCase();
    if (!val) continue;
    const snap = await getDocs(query(col(), where('organizationId', '==', org), where(f, '==', v[f].trim())));
    const hit = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Customer).find(c => !c.deletedAt && c.id !== excludeId);
    if (hit) return hit;
  }
  return null;
}

export async function createCustomer(p: UserProfile, v: CustomerInput): Promise<string> {
  const ref = doc(col()); const counter = doc(db, 'counters', `${p.organizationId}_customer`);
  await runTransaction(db, async tx => {
    const n = ((await tx.get(counter)).data()?.value ?? 0) + 1; // mã tự sinh, không trùng
    tx.set(counter, { value: n });
    tx.set(ref, { ...v, code: `KH${String(n).padStart(5, '0')}`, organizationId: p.organizationId,
      ownerUid: p.uid, ownerName: p.displayName, createdBy: p.uid, updatedBy: p.uid,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedAt: null });
  });
  return ref.id;
}

export const updateCustomer = (p: UserProfile, id: string, v: CustomerInput) =>
  updateDoc(doc(db, 'customers', id), { ...v, updatedBy: p.uid, updatedAt: serverTimestamp() });

export const softDeleteCustomer = (p: UserProfile, id: string) =>
  updateDoc(doc(db, 'customers', id), { deletedAt: serverTimestamp(), updatedBy: p.uid, updatedAt: serverTimestamp() });
