import { collection, deleteDoc, doc, getDocs, getDoc, query, runTransaction, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { CustomerGroup, GroupInput, GroupMember } from '@/types/group';
import type { UserProfile } from '@/types/user';

export async function listGroups(org: string): Promise<CustomerGroup[]> {
  const s = await getDocs(query(collection(db, 'customerGroups'), where('organizationId', '==', org)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }) as CustomerGroup).filter(g => !g.deletedAt).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
export async function getGroup(id: string, org: string): Promise<CustomerGroup | null> {
  const s = await getDoc(doc(db, 'customerGroups', id));
  if (!s.exists()) return null;
  const g = { id: s.id, ...s.data() } as CustomerGroup;
  return g.organizationId === org && !g.deletedAt ? g : null;
}
export async function createGroup(p: UserProfile, v: GroupInput) {
  const ref = doc(collection(db, 'customerGroups')), counter = doc(db, 'counters', `${p.organizationId}_group`);
  await runTransaction(db, async tx => {
    const n = ((await tx.get(counter)).data()?.value ?? 0) + 1;
    tx.set(counter, { value: n });
    tx.set(ref, { ...v, code: `NH${String(n).padStart(3, '0')}`, organizationId: p.organizationId, createdBy: p.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedAt: null });
  });
}
export const updateGroup = (id: string, v: GroupInput) => updateDoc(doc(db, 'customerGroups', id), { ...v, updatedAt: serverTimestamp() });

/** Chỉ xóa mềm khi nhóm không còn khách hàng */
export async function deleteGroup(id: string, org: string): Promise<'ok' | 'not-empty'> {
  const m = await listGroupMembers(id, org);
  if (m.length) return 'not-empty';
  await updateDoc(doc(db, 'customerGroups', id), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return 'ok';
}
const members = (q: ReturnType<typeof where>[]) => getDocs(query(collection(db, 'customerGroupMembers'), ...q)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }) as GroupMember));
export const listMembers = (org: string) => members([where('organizationId', '==', org)]);
export const listGroupMembers = (groupId: string, org: string) => members([where('groupId', '==', groupId), where('organizationId', '==', org)]);
export const listCustomerMembers = (customerId: string, org: string) => members([where('customerId', '==', customerId), where('organizationId', '==', org)]);

export async function addMembers(p: UserProfile, groupId: string, customerIds: string[]) {
  for (let i = 0; i < customerIds.length; i += 400) {
    const b = writeBatch(db);
    customerIds.slice(i, i + 400).forEach(cid => b.set(doc(db, 'customerGroupMembers', `${groupId}_${cid}`), // id cố định: không thể thêm trùng
      { organizationId: p.organizationId, groupId, customerId: cid, addedBy: p.uid, addedAt: serverTimestamp() }));
    await b.commit();
  }
}
export const removeMember = (groupId: string, customerId: string) => deleteDoc(doc(db, 'customerGroupMembers', `${groupId}_${customerId}`));
