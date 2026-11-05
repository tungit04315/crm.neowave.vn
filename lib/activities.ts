import { collection, doc, getDocs, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Activity, ActivityInput } from '@/types/activity';
import type { UserProfile } from '@/types/user';

const sortDesc = (a: Activity, b: Activity) => (b.occurredAt?.toMillis() ?? 0) - (a.occurredAt?.toMillis() ?? 0);
const read = async (cons: ReturnType<typeof where>[]) =>
  (await getDocs(query(collection(db, 'activities'), ...cons))).docs.map(d => ({ id: d.id, ...d.data() }) as Activity).filter(a => !a.deletedAt).sort(sortDesc);
export const listActivities = (org: string) => read([where('organizationId', '==', org)]);
export const listCustomerActivities = (customerId: string, org: string) => read([where('customerId', '==', customerId), where('organizationId', '==', org)]);

const fields = (v: ActivityInput) => ({ contactId: v.contactId, contactName: v.contactName, type: v.type, title: v.title.trim(), content: v.content.trim(), result: v.result.trim(),
  occurredAt: Timestamp.fromDate(v.occurredAt), nextFollowUpAt: v.nextFollowUpAt ? Timestamp.fromDate(v.nextFollowUpAt) : null });

export async function createActivity(p: UserProfile, v: ActivityInput) {
  const ref = doc(collection(db, 'activities')), counter = doc(db, 'counters', `${p.organizationId}_activity`);
  await runTransaction(db, async tx => {
    const n = ((await tx.get(counter)).data()?.value ?? 0) + 1;
    tx.set(counter, { value: n });
    tx.set(ref, { ...fields(v), customerId: v.customerId, code: `HD${String(n).padStart(5, '0')}`, organizationId: p.organizationId, performedByName: p.displayName,
      createdBy: p.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedAt: null });
  });
}
export const updateActivity = (id: string, v: ActivityInput) => updateDoc(doc(db, 'activities', id), { ...fields(v), updatedAt: serverTimestamp() });
export const deleteActivity = (id: string) => updateDoc(doc(db, 'activities', id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
