'use client';
import { useState } from 'react';
import { stats } from '@/lib/dashboard-data';
import { StatCard, RecentActivities, TopSalesEmployees, TopCustomers, ImportantAlerts, UpcomingTasks } from '@/components/dashboard/Panels';
import { RevenueChart, ServiceChart, TaskChart, FunnelChart } from '@/components/dashboard/Charts';

const sel = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600';
export default function Page() {
  const [range, setRange] = useState('01/04/2025 - 30/04/2025');
  const [branch, setBranch] = useState(''); const [dept, setDept] = useState('');
  return (<div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900">Dashboard – Trung tâm điều hành</h1>
        <p className="text-sm text-slate-500">Tổng quan tình hình hoạt động kinh doanh của doanh nghiệp.</p></div>
      <div className="flex flex-wrap gap-2">
        <select className={sel} value={range} onChange={e => setRange(e.target.value)}>
          <option>01/04/2025 - 30/04/2025</option><option>01/03/2025 - 31/03/2025</option><option>01/01/2025 - 31/12/2025</option></select>
        <select className={sel} value={branch} onChange={e => setBranch(e.target.value)}><option value="">Tất cả chi nhánh</option><option>Hà Nội</option><option>TP.HCM</option></select>
        <select className={sel} value={dept} onChange={e => setDept(e.target.value)}><option value="">Tất cả phòng ban</option><option>Kinh doanh</option><option>Marketing</option></select>
      </div></div>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">{stats.map(s => <StatCard key={s.key} s={s} />)}</div>
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-5"><RevenueChart /></div>
      <div className="xl:col-span-4"><ServiceChart /></div>
      <div className="xl:col-span-3 xl:row-span-2"><RecentActivities /></div>
      <div className="xl:col-span-5"><TopSalesEmployees /></div>
      <div className="xl:col-span-4"><TopCustomers /></div>
    </div>
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-3"><TaskChart /></div>
      <div className="xl:col-span-3"><FunnelChart /></div>
      <div className="xl:col-span-3"><ImportantAlerts /></div>
      <div className="xl:col-span-3"><UpcomingTasks /></div>
    </div></div>);
}
