'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createCustomer, findDuplicate, updateCustomer } from '@/lib/customers';
import { type CustomerInput, emptyCustomer, SIZES, SOURCES, STATUS_LABEL, POTENTIAL_LABEL } from '@/types/customer';

const inp = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const F = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) =>
  <label className={`block text-xs font-medium text-slate-600 ${wide ? 'md:col-span-2' : ''}`}>{label}<div className="mt-1">{children}</div></label>;

export default function CustomerForm({ id, initial }: { id?: string; initial?: CustomerInput }) {
  const { profile } = useAuth(); const router = useRouter();
  const [v, setV] = useState<CustomerInput>(initial ?? emptyCustomer);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof CustomerInput>(k: K, val: CustomerInput[K]) => setV(s => ({ ...s, [k]: val }));
  const t = (k: 'name' | 'companyName' | 'taxCode' | 'website' | 'phone' | 'email' | 'address' | 'province' | 'district' | 'representative' | 'industry' | 'groupName' | 'note') =>
    ({ className: inp, value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value) });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy || !profile) return;
    const x = { ...v, name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), taxCode: v.taxCode.trim() };
    if (!x.name) return setErr('Vui lòng nhập tên khách hàng.');
    if (!x.phone && !x.email) return setErr('Cần có số điện thoại hoặc email.');
    if (x.email && !/^\S+@\S+\.\S+$/.test(x.email)) return setErr('Email không hợp lệ.');
    if (x.phone && !/^[0-9+\s.-]{8,15}$/.test(x.phone)) return setErr('Số điện thoại không hợp lệ.');
    if (x.taxCode && !/^\d{10,13}$/.test(x.taxCode.replace(/[\s-]/g, ''))) return setErr('Mã số thuế phải gồm từ 10 đến 13 chữ số.');
    setBusy(true); setErr(null);
    try {
      const dup = await findDuplicate(profile.organizationId, x, id);
      if (dup) { setErr(`Nghi trùng với khách hàng ${dup.code} – ${dup.name} (trùng MST/SĐT/email).`); return; }
      if (id) { await updateCustomer(profile, id, x); router.replace(`/customers/${id}`); }
      else router.replace(`/customers/${await createCustomer(profile, x)}`);
    } catch { setErr('Không lưu được dữ liệu. Vui lòng kiểm tra quyền hoặc kết nối.'); } finally { setBusy(false); }
  }
  return (<form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" noValidate>
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    <div className="grid gap-4 md:grid-cols-2">
      <F label="Loại khách hàng"><select className={inp} value={v.type} onChange={e => set('type', e.target.value as CustomerInput['type'])}><option value="company">Doanh nghiệp</option><option value="individual">Cá nhân</option></select></F>
      <F label="Tên khách hàng *"><input {...t('name')} /></F>
      {v.type === 'company' && <><F label="Tên công ty"><input {...t('companyName')} /></F><F label="Mã số thuế"><input {...t('taxCode')} /></F>
        <F label="Website"><input {...t('website')} /></F><F label="Người đại diện"><input {...t('representative')} /></F>
        <F label="Ngành nghề"><input {...t('industry')} /></F>
        <F label="Quy mô"><select className={inp} value={v.size} onChange={e => set('size', e.target.value)}><option value="">—</option>{SIZES.map(s => <option key={s}>{s}</option>)}</select></F></>}
      <F label="Số điện thoại"><input {...t('phone')} /></F><F label="Email"><input {...t('email')} /></F>
      <F label="Địa chỉ" wide><input {...t('address')} /></F>
      <F label="Tỉnh / Thành phố"><input {...t('province')} /></F><F label="Quận / Huyện"><input {...t('district')} /></F>
            <F label="Nguồn khách hàng"><select className={inp} value={v.source} onChange={e => set('source', e.target.value)}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></F>
      <F label="Trạng thái"><select className={inp} value={v.status} onChange={e => set('status', e.target.value as CustomerInput['status'])}>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
      <F label="Mức độ tiềm năng"><select className={inp} value={v.potential} onChange={e => set('potential', e.target.value as CustomerInput['potential'])}>{Object.entries(POTENTIAL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
      <F label="Ghi chú nội bộ" wide><input {...t('note')} /></F>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isVip} onChange={e => set('isVip', e.target.checked)} className="accent-blue-600" />Khách hàng VIP</label>
    </div>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => router.back()} className="h-10 rounded-md border border-slate-200 px-4 text-sm">Hủy</button>
      <button disabled={busy} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-70">
        {busy && <Loader2 size={16} className="animate-spin" />}{id ? 'Lưu thay đổi' : 'Tạo khách hàng'}</button></div>
  </form>);
}
