'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import CustomerOpportunities from '@/components/opportunities/CustomerOpportunities';
import CustomerActivities from '@/components/activities/CustomerActivities';
import { Field } from '@/components/ui/Info';
import GroupChips from '@/components/groups/GroupChips';
import { useParams, useRouter } from 'next/navigation';
import ContactsTab from '@/components/customers/ContactsTab';
import { useAuth } from '@/contexts/AuthContext';
import { getCustomer, softDeleteCustomer } from '@/lib/customers';
import { type Customer, POTENTIAL_LABEL, STATUS_LABEL, TYPE_LABEL } from '@/types/customer';

const TABS = ['Tổng quan', 'Thông tin chi tiết', 'Người liên hệ', 'Lịch sử tương tác', 'Cơ hội bán hàng', 'Báo giá & đơn hàng', 'Hợp đồng', 'Thanh toán & công nợ', 'Công việc & dự án', 'Tài liệu', 'Ghi chú'];
const Row = ({ l, v }: { l: string; v?: string }) => <Field label={l} value={v} />;

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const { profile } = useAuth();
  const [c, setC] = useState<Customer | null | undefined>(undefined); const [tab, setTab] = useState(0);
  useEffect(() => { if (profile) getCustomer(id, profile.organizationId).then(setC).catch(() => setC(null)); }, [id, profile]);
  if (c === undefined) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!c || !profile) return <p className="text-sm text-slate-500">Không tìm thấy khách hàng hoặc bạn không có quyền xem.</p>;
  async function remove() {
    if (!confirm(`Xóa khách hàng ${c!.name}? Dữ liệu được xóa mềm.`)) return;
    await softDeleteCustomer(profile!, id); router.replace('/customers');
  }
  const fmt = (t?: { toDate: () => Date } | null) => t ? t.toDate().toLocaleString('vi-VN') : '';
  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">{c.name.split(' ').slice(-2).map(w => w[0]).join('')}</span>
      <div className="min-w-0 flex-1"><h1 className="text-xl font-bold">{c.name}{c.isVip && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-700">VIP</span>}</h1>
        <p className="text-xs text-slate-500">{c.code} · {TYPE_LABEL[c.type]} · {STATUS_LABEL[c.status]} · Phụ trách: {c.ownerName}</p></div>
      <Link href={`/customers/${id}/edit`} className="h-9 rounded-md bg-blue-600 px-4 text-sm leading-9 text-white">Chỉnh sửa</Link>
      <button onClick={remove} className="h-9 rounded-md border border-red-200 px-4 text-sm text-red-600">Xóa</button></div>
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">{TABS.map((t, i) => (
      <button key={t} onClick={() => setTab(i)} className={`whitespace-nowrap px-3 py-2 text-sm ${tab === i ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-500'}`}>{t}</button>))}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {tab === 0 && <div className="grid gap-3 md:grid-cols-2"><Row l="Điện thoại" v={c.phone} /><Row l="Email" v={c.email} /><Row l="Địa chỉ" v={[c.address, c.district, c.province].filter(Boolean).join(', ')} />
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 md:col-span-2"><div className="mb-1 text-xs text-slate-500">Nhóm khách hàng</div><div className="text-sm"><GroupChips customerId={id} org={profile.organizationId} /></div></div><Row l="Ngành nghề" v={c.industry} /><Row l="Website" v={c.website} /><Row l="Mức độ tiềm năng" v={POTENTIAL_LABEL[c.potential]} /></div>}
      {tab === 1 && <div className="grid gap-3 md:grid-cols-2"><Row l="Tên công ty" v={c.companyName} /><Row l="Mã số thuế" v={c.taxCode} /><Row l="Người đại diện" v={c.representative} /><Row l="Quy mô" v={c.size} />
        <Row l="Nguồn khách hàng" v={c.source} /><Row l="Ghi chú nội bộ" v={c.note} /><Row l="Ngày tạo" v={fmt(c.createdAt)} /><Row l="Cập nhật gần nhất" v={fmt(c.updatedAt)} /></div>}
      {tab === 2 && <ContactsTab customerId={id} org={profile.organizationId} />}
      {tab === 3 && <CustomerActivities customerId={id} org={profile.organizationId} customerLabel={{ code: c.code, name: c.name }} />}
      {tab === 4 && <CustomerOpportunities customerId={id} />}
      {tab > 4 && <p className="text-sm text-slate-500">Tab “{TABS[tab]}” sẽ được triển khai ở bước sau{[4, 5, 6, 7, 8].includes(tab) ? ' (dữ liệu lấy từ phân hệ chuyên trách)' : ''}.</p>}
    </div></div>);
}
