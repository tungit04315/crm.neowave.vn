import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Ic } from './Shell';
import { stats, activities, employees, customers, alerts, schedule } from '@/lib/dashboard-data';

export function Card({ title, right, children, className = '' }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>{right}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
const More = ({ t = 'Xem tất cả' }: { t?: string }) => <button className="text-[11px] font-medium text-blue-600 hover:underline">{t} →</button>;
const Avatar = ({ name }: { name: string }) => <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700">{name.split(' ').slice(-2).map(w => w[0]).join('')}</span>;

export function StatCard({ s }: { s: (typeof stats)[number] }) {
  const down = 'down' in s && s.down;
  const Arrow = down ? ArrowDown : ArrowUp;
  return (<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: s.color + '22', color: s.color }}><Ic n={s.icon} size={20} /></span>
      <span className="text-[13px] text-slate-700">{s.label}</span></div>
    <div className="mt-3 flex items-baseline gap-2"><b className="text-[26px] leading-none text-slate-900">{s.value}</b>
      <span className={`flex items-center text-xs font-semibold ${down ? 'text-red-500' : 'text-emerald-500'}`}><Arrow size={12} />{s.growth}%</span></div>
    <p className="mt-3 text-xs text-slate-500">{s.sub}</p></div>);
}

export function RecentActivities() {
  return (<Card title="Hoạt động gần đây" right={<More />} className="h-full"><ul className="space-y-4">{activities.map(a => (
    <li key={a.text} className="flex gap-3"><Avatar name={a.who} /><div className="min-w-0 flex-1 text-xs"><b className="block">{a.who}</b>
      <span className="text-slate-500">{a.text}</span></div><span className="whitespace-nowrap text-[10px] text-slate-400">{a.time}</span></li>))}</ul></Card>);
}

export function TopSalesEmployees() {
  return (<Card title="Top 5 nhân viên kinh doanh" right={<More t="Xem chi tiết" />}><div className="h-full overflow-x-auto"><table className="h-full w-full min-w-[420px] text-xs">
    <thead className="bg-slate-50 text-left text-slate-500"><tr>{['#', 'Nhân viên', 'Doanh số', 'Mục tiêu', 'Tỷ lệ'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
    <tbody>{employees.map((e, i) => (<tr key={e.name} className="border-b last:border-0">
      <td className="p-2">{i + 1}</td><td className="p-2"><span className="flex items-center gap-2"><Avatar name={e.name} />{e.name}</span></td>
      <td className="p-2 font-semibold">{e.sales}</td><td className="p-2 text-slate-500">{e.target}</td>
      <td className="p-2"><span className="flex items-center gap-2"><b>{e.pct}%</b><span className="h-2 w-16 rounded bg-slate-100"><span className="block h-2 rounded bg-emerald-500" style={{ width: `${e.pct}%` }} /></span></span></td></tr>))}</tbody></table></div></Card>);
}

export function TopCustomers() {
  return (<Card title="Top 5 khách hàng theo giá trị hợp đồng" right={<More t="Xem chi tiết" />}><div className="h-full overflow-x-auto"><table className="h-full w-full min-w-[360px] text-xs">
    <thead className="bg-slate-50 text-left text-slate-500"><tr>{['#', 'Khách hàng', 'Giá trị hợp đồng', 'Số hợp đồng'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
    <tbody>{customers.map((c, i) => (<tr key={c.name} className="border-b last:border-0"><td className="p-2">{i + 1}</td>
      <td className="p-2"><span className="flex items-center gap-2"><Ic n="Building2" size={16} className="text-blue-600" />{c.name}</span></td>
      <td className="p-2 font-semibold">{c.value}</td><td className="p-2">{c.contracts}</td></tr>))}</tbody></table></div></Card>);
}

export function ImportantAlerts() {
  return (<Card title="Cảnh báo quan trọng" right={<More />}><ul className="flex h-full flex-col justify-between gap-3">{alerts.map(a => (
    <li key={a.text} className="flex items-center gap-3 text-xs"><Ic n="AlertCircle" size={18} style={{ color: a.color }} /><span className="flex-1">{a.text}</span>
      <b className="grid h-5 w-5 place-items-center rounded-full text-[10px]" style={{ background: a.color + '22', color: a.color }}>{a.n}</b></li>))}</ul></Card>);
}

export function UpcomingTasks() {
  return (<Card title="Lịch công việc sắp tới" right={<More />}><ul className="flex h-full flex-col justify-between gap-3">{schedule.map(s => (
    <li key={s.time} className="flex items-center gap-3 text-xs"><b className="w-10">{s.time}</b><Ic n="CalendarClock" size={16} className="text-blue-600" />
      <span className="flex-1">{s.text}</span><span className="hidden text-slate-500 sm:block">{s.owner}</span></li>))}</ul></Card>);
}
