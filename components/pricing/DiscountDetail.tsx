'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import type { DiscountHistoryDto, DiscountPolicyDto } from '@/types/pricing';
import { Field, Section } from '@/components/ui/Info';
import Timeline from '@/components/ui/HistoryTimeline';
import { Alert } from '@/components/ui/form';
import { Denied, errMsg, money, useApiData } from '@/components/catalog/shared';
import { period, StateBadge } from '@/components/pricelist/shared';
import { discountText } from './shared';

const META: Record<string, [string, string]> = { created: ['Tạo mới', '#2563eb'], updated: ['Cập nhật', '#64748b'], status_changed: ['Đổi trạng thái', '#f59e0b'] };
export default function DiscountDetail({ id }: { id: string }) {
  const { data: d, err, denied, reload } = useApiData<{ policy: DiscountPolicyDto; can: { edit: boolean } }>(`/api/catalog/discounts/${id}`);
  const h = useApiData<{ items: DiscountHistoryDto[] }>(`/api/catalog/discounts/${id}/history`);
  const [msg, setMsg] = useState<string | null>(null), [busy, setBusy] = useState(false);
  if (denied) return <Denied />;
  if (err && !d) return <div className="space-y-2"><p className="text-sm text-red-500">{err}</p><Link href="/products/discounts" className="text-sm text-blue-600">← Danh sách</Link></div>;
  if (!d) return <p className="text-sm text-slate-500">Đang tải…</p>;
  const p = d.policy, list = (a: string[]) => (a.length ? a.join(', ') : 'Tất cả');
  async function toggle() { if (busy) return; setBusy(true); setMsg(null); try { await api(`/api/catalog/discounts/${id}/status`, { method: 'POST', json: { status: p.status === 'active' ? 'inactive' : 'active', version: p.version } }); } catch (e) { setMsg(errMsg(e, 'Không đổi được trạng thái.')); } finally { setBusy(false); reload(); h.reload(); } }
  return (<div className="space-y-4"><Link href="/products/discounts" className="flex items-center gap-1 text-sm text-slate-500"><ArrowLeft size={14} />Chính sách chiết khấu</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">{p.name}</h1><div className="mt-1 flex items-center gap-2 text-sm text-slate-500">{p.code}<StateBadge s={p.state} /></div></div>
      {d.can.edit && <div className="flex gap-2"><button disabled={busy} onClick={toggle} className="h-9 rounded-lg border border-slate-200 px-4 text-sm">{p.status === 'active' ? 'Ngừng hoạt động' : 'Kích hoạt'}</button><Link href={`/products/discounts/${id}/edit`} className="flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white">Sửa</Link></div>}</div>
    {msg && <Alert>{msg}</Alert>}
    <Section title="Nội dung chính sách"><div className="grid gap-3 sm:grid-cols-2"><Field label="Mức chiết khấu" value={discountText(p)} /><Field label="Cộng dồn" value={p.stackable ? 'Cho phép' : 'Không'} /><Field label="Giá trị đơn tối thiểu" value={p.minOrderValue ? money(p.minOrderValue) : 'Không yêu cầu'} /><Field label="Thời gian hiệu lực" value={period(p.startDate, p.endDate)} />
      <Field label="Nhóm khách hàng" value={list(p.customerGroupNames)} /><Field label="Nhóm sản phẩm / dịch vụ" value={list(p.categoryNames)} /><Field label="Mặt hàng" value={list(p.itemNames)} /><Field label="Người tạo" value={p.createdByName} />{p.description && <Field label="Mô tả" value={p.description} />}</div></Section>
    <Section title="Lịch sử cập nhật"><Timeline meta={META} items={(h.data?.items ?? []).map(x => ({ id: x.id, type: x.type, at: x.at, actorName: x.actorName, changes: x.changes, note: '' }))} /></Section></div>);
}
