import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Contact } from '@/types/lead';
import type { UserProfile } from '@/types/user';

export async function listContacts(customerId: string, org: string): Promise<Contact[]> {
  const s = await getDocs(query(collection(db, 'contacts'), where('customerId', '==', customerId), where('organizationId', '==', org)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }) as Contact).filter(c => !c.deletedAt).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}
export type ContactInput = Pick<Contact, 'name' | 'position' | 'department' | 'phone' | 'email' | 'role' | 'note'>;
export async function addContact(p: UserProfile, customerId: string, v: ContactInput, first: boolean) {
  await addDoc(collection(db, 'contacts'), { ...v, organizationId: p.organizationId, customerId, isPrimary: first, createdBy: p.uid, createdAt: serverTimestamp(), deletedAt: null });
}
export async function setPrimary(all: Contact[], id: string) {
  const b = writeBatch(db);
  all.forEach(c => b.update(doc(db, 'contacts', c.id), { isPrimary: c.id === id }));
  await b.commit();
}
export const removeContact = (id: string) => updateDoc(doc(db, 'contacts', id), { deletedAt: serverTimestamp() });
