'use client';
import { useMemo } from 'react';
import { compactVnd, formatVnd } from '@/lib/opportunity-core';
import { forecast, funnel } from '@/lib/pipeline-core';
import { usePipelineData } from './usePipelineData';

const Card = ({ l, v, s }: { l: string; v: string; s?: string }) => <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><b className="text-xl">{v}</b>{s && <div className="text-xs text-slate-500">{s}</div>}</div>;

export default function ForecastView() {
  const { items, config, error } = usePipelineData();
  const f = useMemo(() => (items ? forecast(items) : null), [items]);
  const fn = useMemo(() => (items && config ? funnel(items, config.stages) : null), [items, config]);
  const maxW = Math.max(1, ...(f?.buckets.map(b => b.value) ?? [1])), maxR = Math.max(1, ...(fn?.stages.map(s => s.reached) ?? [1]));
  return (<div className="space-y-4">
    <div><h1 className="text-2xl font-bold text-slate-900">Dự báo & phân tích chuyển đổi</h1><p className="text-sm text-slate-500">Tính trên các cơ hội trong phạm vi dữ liệu của bạn.</p></div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}{!items && !error && <p className="text-sm text-slate-500">Đang tải…</p>}
    {f && <><div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card l="Dự báo có trọng số" v={compactVnd(f.totals.weighted)} s={`${f.totals.openCount} cơ hội đang mở`} /><Card l="Cam kết (xác suất ≥ 80%)" v={compactVnd(f.totals.commitValue)} s={`${f.totals.commitCount} cơ hội`} />
      <Card l="Tối đa (toàn bộ đang mở)" v={compactVnd(f.totals.openValue)} /><Card l="Thành công trong tháng" v={compactVnd(f.wonThisMonth.value)} s={`${f.wonThisMonth.count} cơ hội`} /></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-4 text-sm font-semibold">Dự báo theo thời điểm dự kiến chốt</h3>
        <div className="space-y-3">{f.buckets.map(b => <div key={b.key} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-xs"><span className={b.key === 'overdue' ? 'font-medium text-red-600' : ''}>{b.label}</span>
          <div className="relative h-5 rounded bg-slate-100"><div className="absolute inset-y-0 left-0 rounded bg-blue-200" style={{ width: `${(b.value / maxW) * 100}%` }} /><div className="absolute inset-y-0 left-0 rounded bg-blue-600" style={{ width: `${(b.weighted / maxW) * 100}%` }} /></div>
          <span className="text-right text-slate-600">{b.count} CH · {formatVnd(b.value)} · <b className="text-blue-700">{compactVnd(b.weighted)}</b></span></div>)}</div>
        <p className="mt-3 text-xs text-slate-400">Thanh đậm: giá trị có trọng số theo xác suất. Thanh nhạt: tổng giá trị.</p></section></>}
    {fn && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-4 text-sm font-semibold">Phễu chuyển đổi theo giai đoạn</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Card l="Tổng cơ hội" v={String(fn.total)} /><Card l="Tỷ lệ thắng" v={`${fn.winRate}%`} s={`${fn.won} thắng · ${fn.lost} thua`} /><Card l="Chu kỳ bán trung bình" v={fn.avgCycleDays === null ? '—' : `${fn.avgCycleDays} ngày`} /><Card l="Đang mở" v={String(fn.stages.reduce((s, r) => s + r.current, 0))} /></div>
      <div className="mt-5 space-y-3">{fn.stages.map(r => <div key={r.stage.id} className="grid grid-cols-[140px_1fr_150px] items-center gap-3 text-xs"><span className="truncate font-medium">{r.stage.name}</span>
        <div className="h-6 rounded bg-slate-100"><div className="flex h-6 items-center rounded px-2 text-white" style={{ width: `${Math.max(4, (r.reached / maxR) * 100)}%`, background: r.stage.color }}>{r.reached}</div></div>
        <span className="text-slate-600">{r.conversionFromPrev === null ? 'Giai đoạn đầu' : `${r.conversionFromPrev}% từ giai đoạn trước`} · đang ở đây: {r.current}</span></div>)}</div>
      <p className="mt-3 text-xs text-slate-400">“Đã chạm tới” tính theo lịch sử chuyển giai đoạn. Cơ hội tạo trước Phase 02 chưa có lịch sử nên chỉ được tính vào giai đoạn hiện tại.</p>
      {fn.lostReasons.length > 0 && <div className="mt-5"><h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Lý do thất bại</h4><ul className="space-y-1 text-sm">{fn.lostReasons.map(r => <li key={r.reason} className="flex justify-between border-b py-1 last:border-0"><span>{r.reason}</span><b>{r.count}</b></li>)}</ul></div>}</section>}</div>);
}
