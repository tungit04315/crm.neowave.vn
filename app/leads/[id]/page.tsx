'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Check, Factory, Globe, Loader2, Mail, Megaphone, Package, Phone, Target, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { findDuplicate } from '@/lib/customers';
import { convertLead, getLead, leadToCustomerInput, setLeadStatus } from '@/lib/leads';
import { LEAD_COLOR, LEAD_STATUS, type Lead, type LeadStatus } from '@/types/lead';
import type { Customer } from '@/types/customer';
import { Field, Section } from '@/components/ui/Info';

const STEPS: LeadStatus[] = ['new', 'contacting', 'qualified', 'converted'];
const fmt = (t?: { toDate: () => Date } | null) => (t ? t.toDate().toLocaleString('vi-VN') : '');
const web = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

function Stepper({ status }: { status: LeadStatus }) {
  const idx = STEPS.indexOf(status), all = status === 'converted';
  return (<ol className="flex items-start">{STEPS.map((s, i) => {
    const done = all || idx > i, cur = !all && idx === i;
    return (<li key={s} className="flex flex-1 items-start last:flex-none">
      <span className="flex flex-col items-center gap-1.5">
        <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${done ? 'bg-emerald-500 text-white' : cur ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-100 text-slate-400'}`}>
          {done ? <Check size={16} /> : i + 1}</span>
        <span className={`whitespace-nowrap text-[11px] ${cur ? 'font-semibold text-blue-700' : 'text-slate-500'}`}>{LEAD_STATUS[s]}</span></span>
      {i < STEPS.length - 1 && <span className={`mx-2 mt-4 h-0.5 flex-1 rounded ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}</li>);
  })}</ol>);
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>(); const { profile } = useAuth(); const router = useRouter();
  const [lead, setLead] = useState<Lead | null | undefined>(undefined);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [dup, setDup] = useState<Customer | null>(null);
  const load = () => profile && getLead(id, profile.organizationId).then(setLead).catch(() => setLead(null));
  useEffect(() => { load(); }, [id, profile]); // eslint-disable-line react-hooks/exhaustive-deps
  if (lead === undefined) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (!lead || !profile) return <p className="text-sm text-slate-500">Không tìm thấy Lead hoặc bạn không có quyền xem.</p>;

  async function status(s: LeadStatus) { setErr(null); try { await setLeadStatus(id, s); await load(); } catch { setErr('Không cập nhật được trạng thái.'); } }
  async function convert(existingId?: string) {
    if (busy || !lead || !profile) return; setBusy(true); setErr(null);
    try {
      if (!existingId) { const d = await findDuplicate(profile.organizationId, leadToCustomerInput(lead)); if (d) { setDup(d); return; } }
      router.replace(`/customers/${await convertLead(profile, lead, existingId)}`);
    } catch (e) { setErr((e as Error).message === 'converted' ? 'Lead này đã được chuyển đổi.' : 'Chuyển đổi không thành công. Dữ liệu chưa bị thay đổi.'); } finally { setBusy(false); }
  }
  const done = lead.status === 'converted', lost = lead.status === 'lost';
  const initials = lead.name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
  const btn = 'flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition';

  return (<div className="space-y-4">
    <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600"><ArrowLeft size={15} />Danh sách Lead</Link>

    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-bold text-white shadow-md shadow-blue-200">{initials}</span>
        <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold text-slate-900">{lead.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{lead.code}</span><span>Phụ trách: {lead.ownerName}</span></div></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${LEAD_COLOR[lead.status]}`}>{LEAD_STATUS[lead.status]}</span></div>
      <div className="mt-6 px-1 sm:px-6">{lost ? <p className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-500">Lead đã được đánh dấu không tiềm năng.</p> : <Stepper status={lead.status} />}</div></div>

    {err && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    {dup && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Khách hàng <b>{dup.code} – {dup.name}</b> đã tồn tại (trùng MST/SĐT/email). Hệ thống không tạo trùng.
      <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => convert(dup.id)} disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-white">Liên kết Lead với khách hàng này</button>
        <button onClick={() => setDup(null)} className="rounded-lg border border-amber-300 bg-white px-3 py-2">Hủy</button></div></div>}

    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Section title="Thông tin liên hệ"><div className="grid gap-3 sm:grid-cols-2">
          <Field icon={User} label="Người liên hệ" value={lead.contactName} />
          <Field icon={Phone} label="Điện thoại" value={lead.phone} href={lead.phone ? `tel:${lead.phone.replace(/\s/g, '')}` : undefined} />
          <Field icon={Mail} label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} />
          <Field icon={Globe} label="Website" value={lead.website} href={lead.website ? web(lead.website) : undefined} /></div></Section>
        <Section title="Thông tin kinh doanh"><div className="grid gap-3 sm:grid-cols-2">
          <Field icon={Factory} label="Ngành nghề" value={lead.industry} />
          <Field icon={Megaphone} label="Nguồn Lead" value={lead.source} />
          <div className="sm:col-span-2"><Field icon={Package} label="Sản phẩm / dịch vụ quan tâm" value={lead.interest} /></div></div></Section>
        <Section title="Nhu cầu của khách hàng"><p className={`whitespace-pre-wrap rounded-xl bg-slate-50/70 p-4 text-sm ${lead.need ? 'text-slate-800' : 'text-slate-400'}`}>{lead.need || 'Chưa ghi nhận nhu cầu.'}</p></Section></div>

      <div className="space-y-4">
        <Section title="Thao tác"><div className="space-y-2">
          {done ? <Link href={`/customers/${lead.convertedCustomerId}`} className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>Xem khách hàng đã tạo</Link> : <>
            {lead.status === 'qualified' && <button onClick={() => convert()} disabled={busy} className={`${btn} bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-70`}>
              {busy && <Loader2 size={15} className="animate-spin" />}Chuyển đổi thành khách hàng</button>}
            {lead.status === 'new' && <button onClick={() => status('contacting')} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Bắt đầu liên hệ</button>}
            {lead.status === 'contacting' && <button onClick={() => status('qualified')} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Xác minh nhu cầu</button>}
            {lost && <button onClick={() => status('new')} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Mở lại Lead</button>}
            {!lost && <button onClick={() => confirm('Đánh dấu Lead không tiềm năng?') && status('lost')} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>Không tiềm năng</button>}</>}
          {lead.status === 'new' || lead.status === 'contacting' ? <p className="pt-1 text-[11px] text-slate-400">Chuyển đổi chỉ khả dụng khi Lead đã được xác minh nhu cầu.</p> : null}</div></Section>
        <Section title="Thông tin hệ thống"><div className="space-y-3">
          <Field icon={Target} label="Mã Lead" value={lead.code} />
          <Field icon={CalendarDays} label="Ngày tiếp nhận" value={fmt(lead.createdAt)} />
          <Field icon={CalendarDays} label="Cập nhật gần nhất" value={fmt(lead.updatedAt)} /></div></Section></div></div></div>);
}
