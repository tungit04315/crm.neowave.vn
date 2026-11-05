import { BarChart3, CheckSquare, Cloud, Headphones, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import Brand from './Brand';

const features = [[Users, 'Quản lý', 'khách hàng'], [TrendingUp, 'Theo dõi', 'cơ hội bán hàng'], [CheckSquare, 'Quản lý', 'công việc & dự án'], [BarChart3, 'Báo cáo', 'thống kê']] as const;
const perks = [[ShieldCheck, 'Bảo mật dữ liệu'], [Cloud, 'Linh hoạt, mở rộng'], [Headphones, 'Hỗ trợ 24/7']] as const;
const stats = [['Khách hàng', '1.248'], ['Cơ hội đang mở', '356'], ['Doanh số tháng này', '2,480 Tỷ'], ['Doanh thu ghi nhận', '1,920 Tỷ']];

function MiniDashboard() {
  return (<div className="flex h-[300px] overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl shadow-blue-900/20">
    <div className="w-[26%] bg-[#0b1f4d] p-3 text-[9px] text-slate-200">
      <b className="mb-3 block text-xs text-white">CRM</b>
      {['Tổng quan', 'Khách hàng', 'Cơ hội bán hàng', 'Báo giá', 'Đơn hàng', 'Hợp đồng', 'Dự án', 'Doanh số', 'Báo cáo', 'Cài đặt'].map((m, i) =>
        <div key={m} className={`mb-1 rounded px-2 py-1 ${i === 0 ? 'bg-blue-600 text-white' : ''}`}>{m}</div>)}</div>
    <div className="flex-1 space-y-2 bg-slate-50 p-3 text-[9px]">
      <b className="text-xs">Tổng quan</b>
      <div className="grid grid-cols-4 gap-2">{stats.map(([l, v]) => <div key={l} className="rounded bg-white p-2 shadow-sm"><div className="text-slate-500">{l}</div><b className="text-sm">{v}</b></div>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-white p-2 shadow-sm"><b>Doanh số theo tháng</b>
          <svg viewBox="0 0 120 40" className="mt-1 h-14 w-full"><polyline fill="none" stroke="#2563eb" strokeWidth="1.5" points="0,35 15,28 30,30 45,22 60,24 75,16 90,18 105,10 120,6" />
            <polyline fill="none" stroke="#10b981" strokeWidth="1.5" points="0,36 15,31 30,32 45,26 60,27 75,21 90,22 105,15 120,12" /></svg></div>
        <div className="flex items-center gap-2 rounded bg-white p-2 shadow-sm"><div className="grid h-16 w-16 place-items-center rounded-full" style={{ background: 'conic-gradient(#2563eb 0 45%,#3b9cf5 45% 70%,#93c5fd 70% 85%,#dbeafe 85%)' }}>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[8px] font-bold">2,480 Tỷ</span></div><b>Cơ cấu doanh số</b></div></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded bg-white p-2 shadow-sm"><b>Top nhân viên kinh doanh</b>{[['Nguyễn Văn An', 80], ['Trần Thị Bích', 65], ['Lê Minh Hoàng', 55]].map(([n, w]) =>
          <div key={n as string} className="mt-1 flex items-center gap-1"><span className="w-16 truncate">{n}</span><span className="h-1.5 flex-1 rounded bg-blue-100"><span className="block h-1.5 rounded bg-blue-500" style={{ width: `${w}%` }} /></span></div>)}</div>
        <div className="flex items-center gap-2 rounded bg-white p-2 shadow-sm"><div className="grid h-14 w-14 place-items-center rounded-full" style={{ background: 'conic-gradient(#14b8a6 0 68%,#3b82f6 68% 88%,#f59e0b 88% 96%,#ef4444 96%)' }}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white font-bold">68%</span></div><b>Tình trạng công việc</b></div></div>
    </div></div>);
}

export default function LoginHero() {
  return (<section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-sky-200 via-blue-50 to-white p-12 lg:flex lg:w-[54%]">
    <div className="absolute -right-24 top-20 h-[420px] w-40 rounded-t-3xl bg-gradient-to-b from-blue-300/50 to-blue-100/10" />
    <div className="relative"><Brand size="lg" />
      <h1 className="mt-10 text-[44px] font-extrabold leading-[1.15] text-[#0b1f4d]">Kết nối khách hàng<br />Kiến tạo tăng trưởng</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">Nền tảng quản trị doanh nghiệp toàn diện, giúp bạn quản lý khách hàng, tối ưu quy trình bán hàng và nâng cao hiệu suất làm việc.</p>
      <div className="mt-8 flex gap-10">{features.map(([I, a, b]) => (<div key={b} className="text-sm text-slate-700">
        <span className="mb-2 grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-blue-600"><I size={22} /></span>{a}<br />{b}</div>))}</div></div>
    <div className="relative my-6 max-w-[620px]"><MiniDashboard /></div>
    <div className="relative flex gap-12 text-sm text-slate-600">{perks.map(([I, t]) => <span key={t} className="flex items-center gap-2"><I size={20} className="text-blue-500" />{t}</span>)}</div>
  </section>);
}
