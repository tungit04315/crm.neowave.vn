import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Lead, LeadInput, LeadStatus } from '@/types/lead';
import type { CustomerInput } from '@/types/customer';
import { emptyCustomer } from '@/types/customer';
import type { UserProfile } from '@/types/user';

export async function listLeads(org: string): Promise<Lead[]> {
  const s = await getDocs(query(collection(db, 'leads'), where('organizationId', '==', org)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }) as Lead).filter(l => !l.deletedAt)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}
export async function getLead(id: string, org: string): Promise<Lead | null> {
  const s = await getDoc(doc(db, 'leads', id));
  if (!s.exists()) return null;
  const l = { id: s.id, ...s.data() } as Lead;
  return l.organizationId === org && !l.deletedAt ? l : null;
}
export async function findLeadDuplicate(org: string, v: LeadInput): Promise<Lead | null> {
  for (const f of ['phone', 'email'] as const) {
    if (!v[f]) continue;
    const s = await getDocs(query(collection(db, 'leads'), where('organizationId', '==', org), where(f, '==', v[f])));
    const hit = s.docs.map(d => ({ id: d.id, ...d.data() }) as Lead).find(l => !l.deletedAt);
    if (hit) return hit;
  }
  return null;
}
export async function createLead(p: UserProfile, v: LeadInput): Promise<string> {
  const ref = doc(collection(db, 'leads')), counter = doc(db, 'counters', `${p.organizationId}_lead`);
  await runTransaction(db, async tx => {
    const n = ((await tx.get(counter)).data()?.value ?? 0) + 1;
    tx.set(counter, { value: n });
    tx.set(ref, { ...v, code: `LD${String(n).padStart(5, '0')}`, organizationId: p.organizationId, status: 'new', ownerUid: p.uid, ownerName: p.displayName,
      convertedCustomerId: null, createdBy: p.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedAt: null });
  });
  return ref.id;
}
export const setLeadStatus = (id: string, status: LeadStatus) => updateDoc(doc(db, 'leads', id), { status, updatedAt: serverTimestamp() });

export const leadToCustomerInput = (l: Lead): CustomerInput => ({ ...emptyCustomer, name: l.name, companyName: l.name, phone: l.phone, email: l.email,
  website: l.website, industry: l.industry, source: l.source, note: l.need });

/** Chuyển đổi Lead: tạo khách hàng (hoặc liên kết KH có sẵn) + người liên hệ, giữ lại Lead để truy vết. */
export async function convertLead(p: UserProfile, lead: Lead, existingId?: string): Promise<string> {
  let addContact = !!lead.contactName;
  if (existingId && addContact) { // không tạo trùng người liên hệ trong cùng khách hàng
    const cs = await getDocs(query(collection(db, 'contacts'), where('customerId', '==', existingId)));
    addContact = !cs.docs.some(d => { const c = d.data(); return !c.deletedAt && c.name === lead.contactName && ((lead.phone && c.phone === lead.phone) || (lead.email && c.email === lead.email) || (!lead.phone && !lead.email)); });
  }
  const leadRef = doc(db, 'leads', lead.id), counter = doc(db, 'counters', `${p.organizationId}_customer`);
  const custRef = existingId ? doc(db, 'customers', existingId) : doc(collection(db, 'customers'));
  return runTransaction(db, async tx => {
    const ls = await tx.get(leadRef);
    if (!ls.exists() || ls.data().status === 'converted') throw new Error('converted');
    let n = 0;
    if (existingId) { const c = await tx.get(custRef); if (!c.exists() || c.data().organizationId !== p.organizationId) throw new Error('nocustomer'); }
    else n = ((await tx.get(counter)).data()?.value ?? 0) + 1;
    if (!existingId) {
      tx.set(counter, { value: n });
      tx.set(custRef, { ...leadToCustomerInput(lead), code: `KH${String(n).padStart(5, '0')}`, organizationId: p.organizationId, ownerUid: lead.ownerUid, ownerName: lead.ownerName,
        createdBy: p.uid, updatedBy: p.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedAt: null });
    }
    if (addContact) tx.set(doc(collection(db, 'contacts')), { organizationId: p.organizationId, customerId: custRef.id, name: lead.contactName, position: '', department: '',
      phone: lead.phone, email: lead.email, role: 'Liên hệ thông thường', isPrimary: !existingId, note: '', createdBy: p.uid, createdAt: serverTimestamp(), deletedAt: null });
    tx.update(leadRef, { status: 'converted', convertedCustomerId: custRef.id, convertedBy: p.uid, convertedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return custRef.id;
  });
}
