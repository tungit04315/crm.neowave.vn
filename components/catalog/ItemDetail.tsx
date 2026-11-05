'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Boxes, FileText, Layers, Percent, Ruler, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { can as perm } from '@/lib/catalog-core';
import type { ItemDetail as Detail, PriceHistoryDto, PriceMode, PriceRequestDto } from '@/types/catalog';
import { Field, Section } from '@/components/ui/Info';
import Timeline from '@/components/ui/HistoryTimeline';
import { Alert } from '@/components/ui/form';
import ItemPrices from '@/components/pricing/ItemPrices';
import { DecideDialog, PriceDialog } from './PriceDialogs';
import { Denied, errMsg, ItemStatusBadge, money, PendingBadge, taxText, TypeBadge, useApiData, when } from './shared';

const META: Record<string, [string, string]> = { created: ['Tạo mới', '#2563eb'], updated: ['Cập nhật thông tin', '#64748b'], price_changed: ['Thay đổi giá', '#10b981'], price_requested: ['Gửi yêu cầu đổi giá', '#f59e0b'], price_rejected: ['Từ chối yêu cầu đổi giá', '#ef4444'], price_cancelled: ['Hủy yêu cầu đổi giá', '#94a3b8'] };
const MODE: Record<PriceMode, string> = { initial: 'Giá ban đầu', direct: 'Đổi trực tiếp', approved: 'Đã duyệt' };
const TABS = [['overview', 'Tổng quan'], ['price', 'Giá bán'], ['priceHistory', 'Lịch sử giá'], ['history', 'Lịch sử cập nhật']] as const;
type Tab = (typeof TABS)[number][0];

function PriceHistoryTable({ rows }: { rows: PriceHistoryDto[] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">Chưa có lịch sử giá.</p>;
  return (<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Thời gian', 'Giá cũ', 'Giá mới', 'Chênh lệch', 'Người thực hiện', 'Người duyệt', 'Hình thức', 'Lý do'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
    <tbody>{rows.map(r => (<tr key={r.id} className="border-b last:border-0"><td className="whitespace-nowrap p-2">{when(r.at)}</td><td className="whitespace-nowrap p-2">{r.oldPrice === null ? '—' : money(r.oldPrice)}</td><td className="whitespace-nowrap p-2 font-semibold">{money(r.newPrice)}</td>
      <td className={`whitespace-nowrap p-2 ${r.oldPrice === null ? 'text-slate-400' : r.diff > 0 ? 'text-emerald-600' : r.diff < 0 ? 'text-red-600' : ''}`}>{r.oldPrice === null ? '—' : `${r.diff > 0 ? '+' : ''}${money(r.diff)}${r.pctBp !== null ? ` (${(r.pctBp / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%)` : ''}`}</td>
      <td className="p-2">{r.changedByName}</td><td className="p-2">{r.approvedByName ?? '—'}</td><td className="p-2">{MODE[r.mode]}</td><td className="max-w-[240px] p-2 text-slate-600">{r.reason || '—'}</td></tr>))}</tbody></table></div>);
}

/** PS-04: chi tiết sản phẩm / dịch vụ */
export default function ItemDetail({ id }: { id: string }) {
  const { profile } = useAuth();
  const { data: d, err, denied, reload } = useApiData<Detail>(`/api/catalog/items/${id}`);
  const [tab, setTab] = useState<Tab>('overview'); const [dlg, setDlg] = useState<'price' | 'approve' | 'reject' | null>(null); const [msg, setMsg] = useState<string | null>(null);
  if (denied) return <Denied />;
  if (err && !d) return <div className="space-y-2"><p className="text-sm text-red-500">{err}</p><Link href="/products" className="text-sm text-blue-600">← Danh sách</Link></div>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const i = d.item, pr: PriceRequestDto | null = d.pendingRequest, actor = profile ? { uid: profile.uid, role: profile.role } : null;
  const canApprove = !!(pr && actor && perm.approvePrice(actor, pr)), mine = !!(pr && actor && pr.requestedBy === actor.uid);
  async function cancel() {
    if (!pr || !confirm('Hủy yêu cầu đổi giá này?')) return; setMsg(null);
    try { await api(`/api/catalog/price-requests/${pr.id}`, { method: 'POST', json: { decision: 'cancel' } }); reload(); } catch (e) { setMsg(errMsg(e, 'Không hủy được yêu cầu.')); }
  }
  const done = () => { setDlg(null); reload(); };
  const btn = 'flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium';
  return (<div className="space-y-4">
    <Link href="/products" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600"><ArrowLeft size={15} />Danh sách sản phẩm & dịch vụ</Link>
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold text-slate-900">{i.name}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{i.code}</span><TypeBadge t={i.type} /><span>{i.categoryName}</span></div></div>
      <div className="flex items-center gap-2">{pr && <PendingBadge />}<ItemStatusBadge s={i.status} />{d.can.edit && <Link href={`/products/${id}/edit`} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Chỉnh sửa</Link>}</div></div>
    {(err || msg) && <Alert>{msg ?? err}</Alert>}
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap px-4 py-2 text-sm ${tab === k ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>)}
      <span className="whitespace-nowrap px-4 py-2 text-sm text-slate-300" title="Cần phân hệ Bán hàng (báo giá, đơn hàng)">Lịch sử kinh doanh</span></div>
    {tab === 'overview' && <div className="space-y-4"><Section title="Thông tin chung"><div className="grid gap-3 sm:grid-cols-2">
      <Field icon={FileText} label="Mã" value={i.code} /><Field icon={Boxes} label="Loại" value={i.type === 'product' ? 'Sản phẩm' : 'Dịch vụ'} /><Field icon={Layers} label="Nhóm" value={i.categoryName} />
      <Field icon={Ruler} label="Đơn vị tính" value={i.unitName ? `${i.unitName} (${i.unitSymbol})` : ''} /><Field icon={Wallet} label="Giá bán mặc định" value={money(i.defaultPrice)} /><Field icon={Percent} label="Thuế" value={taxText(i)} /></div></Section>
      <Section title="Mô tả"><p className="mb-2 text-sm font-medium text-slate-800">{i.shortDescription}</p><p className={`whitespace-pre-wrap rounded-xl bg-slate-50/70 p-4 text-sm ${i.description ? 'text-slate-800' : 'text-slate-400'}`}>{i.description || 'Chưa có mô tả chi tiết.'}</p></Section>
      <Section title="Quản lý"><div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2"><div>Tạo bởi <b>{i.createdByName || '—'}</b> · {when(i.createdAt)}</div><div>Cập nhật bởi <b>{i.updatedByName || '—'}</b> · {when(i.updatedAt)}</div></div>
        {i.note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50/70 p-3 text-sm">{i.note}</p>}</Section></div>}
    {tab === 'price' && <div className="space-y-4"><Section title="Giá bán mặc định"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-3xl font-bold text-slate-900">{money(i.defaultPrice)}</div><div className="mt-1 text-xs text-slate-500">{taxText(i)}</div></div>
      {d.can.price !== 'none' && !pr && <button onClick={() => setDlg('price')} className={`${btn} bg-blue-600 text-white`}>{d.can.price === 'direct' ? 'Đổi giá' : 'Gửi yêu cầu đổi giá'}</button>}</div>
      {d.can.price === 'none' && <p className="mt-3 text-xs text-slate-400">Bạn chỉ có quyền xem giá.</p>}</Section>
      {pr && <Section title="Yêu cầu đổi giá đang chờ duyệt"><div className="space-y-2 text-sm"><p>{money(pr.oldPrice)} → <b>{money(pr.newPrice)}</b> · gửi bởi {pr.requestedByName} lúc {when(pr.requestedAt)}</p><p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Lý do: {pr.reason}</p>
        <div className="flex flex-wrap gap-2 pt-1">{canApprove && <><button onClick={() => setDlg('approve')} className={`${btn} bg-emerald-600 text-white`}>Duyệt</button><button onClick={() => setDlg('reject')} className={`${btn} border border-red-200 text-red-600`}>Từ chối</button></>}
          {mine && <button onClick={cancel} className={`${btn} border border-slate-200 text-slate-700`}>Hủy yêu cầu</button>}
          {!canApprove && !mine && <span className="text-xs text-slate-400">Đang chờ Giám đốc hoặc Quản trị viên duyệt.</span>}</div></div></Section>}
      <Section title="Giá theo bảng giá và nhóm khách hàng"><ItemPrices id={id} /></Section></div>}
    {tab === 'priceHistory' && <Section title="Lịch sử thay đổi giá"><PriceHistoryTable rows={d.priceHistory} /></Section>}
    {tab === 'history' && <Section title="Lịch sử cập nhật"><Timeline items={d.history} meta={META} /></Section>}
    {dlg === 'price' && d.can.price !== 'none' && <PriceDialog item={i} mode={d.can.price} onClose={() => setDlg(null)} onDone={done} />}
    {(dlg === 'approve' || dlg === 'reject') && pr && <DecideDialog req={pr} decision={dlg} onClose={() => setDlg(null)} onDone={done} />}</div>);
}
