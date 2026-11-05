'use client';
import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { monthly, services, taskStatus, funnel } from '@/lib/dashboard-data';
import { Card } from './Panels';

const series = [
  { k: 'signed', name: 'Doanh số ký mới', color: '#3b82f6' },
  { k: 'recognized', name: 'Doanh thu ghi nhận', color: '#10b981' },
  { k: 'collected', name: 'Doanh thu thực thu', color: '#6366f1' },
] as const;

export function RevenueChart() {
  const [hidden, setHidden] = useState<string[]>([]);
  const on = (k: string) => !hidden.includes(k);
  return (
    <Card title="Doanh số theo tháng" right={
      <div className="flex flex-wrap gap-3 text-[11px]">{series.map(s => (
        <button key={s.k} onClick={() => setHidden(h => on(s.k) ? [...h, s.k] : h.filter(x => x !== s.k))}
          className={`flex items-center gap-1 ${on(s.k) ? '' : 'opacity-40'}`}>
          <i className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</button>))}</div>}>
      <div className="h-[220px]"><ResponsiveContainer>
        <ComposedChart data={monthly}>
          <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#93c5fd" /><stop offset="1" stopColor="#dbeafe" /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v} tỷ`} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v, n) => [`${v} tỷ`, String(n)]} />
          {on('signed') && <Bar dataKey="signed" name="Doanh số ký mới" fill="url(#g)" stroke="#3b82f6" radius={[2, 2, 0, 0]} barSize={14} />}
          {on('recognized') && <Line dataKey="recognized" name="Doanh thu ghi nhận" stroke="#10b981" strokeWidth={2} dot={false} />}
          {on('collected') && <Line dataKey="collected" name="Doanh thu thực thu" stroke="#6366f1" strokeWidth={2} dot={false} />}
        </ComposedChart></ResponsiveContainer></div>
    </Card>);
}

export function ServiceChart() {
  return (
    <Card title="Cơ cấu doanh số theo dịch vụ">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-[190px] w-[190px] shrink-0">
          <ResponsiveContainer><PieChart><Pie data={services} dataKey="pct" innerRadius={52} outerRadius={90} stroke="#fff">
            {services.map(s => <Cell key={s.name} fill={s.color} />)}</Pie><Tooltip formatter={(v) => `${v}%`} /></PieChart></ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><b className="text-lg">2,8 tỷ</b>
            <div className="text-[9px] text-slate-400">Doanh số tháng này</div></div></div>
        </div>
        <ul className="min-w-[200px] flex-1 space-y-3 text-xs">{services.map(s => (
          <li key={s.name} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="flex-1">{s.name}</span><b>{s.pct}%</b><span className="w-16 text-right text-slate-500">{s.value}</span></li>))}</ul>
      </div>
    </Card>);
}

export function TaskChart() {
  return (
    <Card title="Tình trạng công việc">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative h-[130px] w-[130px]">
          <ResponsiveContainer><PieChart><Pie data={taskStatus} dataKey="pct" innerRadius={42} outerRadius={62} stroke="#fff">
            {taskStatus.map(s => <Cell key={s.name} fill={s.color} />)}</Pie></PieChart></ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center text-center"><div><b className="text-lg">68%</b><div className="text-[9px] text-slate-400">Hoàn thành</div></div></div>
        </div>
        <ul className="flex-1 space-y-2 text-xs">{taskStatus.map(s => (
          <li key={s.name} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="flex-1">{s.name}</span><b>{s.pct}%</b><span className="w-8 text-right text-slate-500">{s.count}</span></li>))}</ul>
      </div>
    </Card>);
}

export function FunnelChart() {
  return (
    <Card title="Tỷ lệ chuyển đổi cơ hội theo giai đoạn">
      <div className="flex h-[190px] items-end gap-3">{funnel.map(f => (
        <div key={f.stage} className="flex flex-1 flex-col items-center justify-end text-[10px]">
          <span className="mb-1 text-slate-600">{f.pct}%</span>
          <div className="w-full rounded-t" style={{ height: `${f.pct * 1.1}px`, background: f.color }} />
          <b className="mt-1 text-center">{f.stage}</b><span className="text-slate-400">{f.count}</span></div>))}</div>
    </Card>);
}
