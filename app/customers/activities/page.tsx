'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listActivities } from '@/lib/activities';
import { listCustomers } from '@/lib/customers';
import { isOverdue } from '@/lib/activity-core';
import { ACTIVITY_LABEL, type Activity } from '@/types/activity';
import type { Customer } from '@/types/customer';
import ActivityForm from '@/components/activities/ActivityForm';
import ActivityTimeline from '@/components/activities/ActivityTimeline';
import { useActivityActions } from '@/components/activities/useActivityActions';

const PAGE = 30;
export default function ActivitiesPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Activity[] | null>(null); const [customers, setCustomers] = useState<Customer[]>([]); const [error, setError] = useState(false);
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [staff, setStaff] = useState(''); const [cust, setCust] = useState(''); const [range, setRange] = useState('');
  const [now, setNow] = useState(() => Date.now()); const [limit, setLimit] = useState(PAGE); const [form, setForm] = useState<{ edit?: Activity } | null>(null);
  const load = useCallback(() => { if (profile) listActivities(profile.organizationId).then(r => { setRows(r); setNow(Date.now()); }).catch(() => setError(true)); }, [profile]);
  useEffect(() => { load(); if (profile) listCustomers(profile.organizationId).then(setCustomers).catch(() => {}); }, [load, profile]);
  const { canEdit, remove } = useActivityActions(load);
  const byId = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const all = rows ?? [];
  const filtered = useMemo(() => {
    const since = range ? now - Number(range) * 86400000 : 0;
    return all.filter(a => (!type || a.type === type) && (!staff || a.performedByName === staff) && (!cust || a.customerId === cust) && a.occurredAt.toMillis() >= since &&
      (!q || [a.title, a.content, a.result, byId.get(a.customerId)?.name ?? ''].some(x => x.toLowerCase().includes(q.toLowerCase()))));
  }, [all, type, staff, cust, range, q, byId, now]);
  const week = all.filter(a => a.occurredAt.toMillis() >= now - 7 * 86400000).length;
  const overdue = all.filter(a => isOverdue(a.nextFollowUpAt?.toDate() ?? null)).length;
  const stats = [['Tổng tương tác', all.length], ['7 ngày qua', week], ['Follow-up quá hạn', overdue], ['Khách hàng được chăm sóc', new Set(all.map(a => a.customerId)).size]];
  const sc = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs';
  const staffList = [...new Set(all.map(a => a.performedByName))];

  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Lịch sử tương tác</h1>
      <p className="text-sm text-slate-500">Nhật ký giao tiếp giữa nhân viên và khách hàng.</p></div>
      <button onClick={() => setForm({})} className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Thêm tương tác</button></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{stats.map(([l, n]) => <div key={l as string} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div>
      <b className={`text-2xl ${l === 'Follow-up quá hạn' && n ? 'text-red-600' : ''}`}>{n}</b></div>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Tìm theo tiêu đề, nội dung, khách hàng…" className="h-9 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
        <select className={sc} value={type} onChange={e => { setType(e.target.value); setLimit(PAGE); }}><option value="">Tất cả loại</option>{Object.entries(ACTIVITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className={sc} value={staff} onChange={e => { setStaff(e.target.value); setLimit(PAGE); }}><option value="">Tất cả nhân viên</option>{staffList.map(s => <option key={s}>{s}</option>)}</select>
        <select className={`${sc} max-w-[200px]`} value={cust} onChange={e => { setCust(e.target.value); setLimit(PAGE); }}><option value="">Tất cả khách hàng</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={sc} value={range} onChange={e => { setRange(e.target.value); setLimit(PAGE); }}><option value="">Mọi thời gian</option><option value="7">7 ngày</option><option value="30">30 ngày</option><option value="90">90 ngày</option></select></div>
      {error && <p className="mb-3 text-sm text-red-500">Không tải được dữ liệu. Kiểm tra Firestore Rules.</p>}
      {rows === null && !error ? <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p> :
        <ActivityTimeline items={filtered.slice(0, limit)} customerName={id => { const c = byId.get(id); return c && { id: c.id, name: c.name }; }} canEdit={canEdit} onEdit={a => setForm({ edit: a })} onDelete={remove} />}
      {filtered.length > limit && <div className="mt-4 text-center"><button onClick={() => setLimit(l => l + PAGE)} className="rounded-lg border px-4 py-2 text-sm">Xem thêm ({filtered.length - limit})</button></div>}</div>
    {form && <ActivityForm customers={customers} initial={form.edit} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}</div>);
}
