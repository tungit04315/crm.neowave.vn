'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Pencil, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { ITEM_STATUS_LABEL, TYPE_LABEL } from '@/lib/catalog-core';
import type { CatalogStats, CategoryDto, ItemDto, ItemList as ItemListData } from '@/types/catalog';
import ImportExport from './ImportExport';
import { Denied, dateOnly, errMsg, ItemStatusBadge, money, PendingBadge, taxText, TypeBadge, useApiData } from './shared';

const sc = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs';
const PAGE = 20;
interface Filters { q: string; type: string; status: string; categoryId: string; minPrice: string; maxPrice: string }
const digits = (s: string) => s.replace(/\D/g, '').slice(0, 13);

/** PS-01: danh sách sản phẩm & dịch vụ. Tìm kiếm, lọc và phân trang đều do máy chủ thực hiện (không tải toàn bộ danh mục về trình duyệt). */
export default function ItemList({ initialCategoryId = '' }: { initialCategoryId?: string }) {
  const [f, setF] = useState<Filters>({ q: '', type: '', status: '', categoryId: initialCategoryId, minPrice: '', maxPrice: '' });
  const [dq, setDq] = useState(''); // từ khóa đã chờ ngừng gõ
  useEffect(() => { const t = setTimeout(() => setDq(f.q), 300); return () => clearTimeout(t); }, [f.q]);
  const qs = useMemo(() => { const p = new URLSearchParams({ limit: String(PAGE) }); const v = { ...f, q: dq }; (Object.keys(v) as (keyof Filters)[]).forEach(k => { if (v[k]) p.set(k, v[k]); }); return p.toString(); }, [f, dq]);

  const stats = useApiData<CatalogStats>('/api/catalog/stats'), cats = useApiData<{ items: CategoryDto[] }>('/api/catalog/categories');
  const [page, setPage] = useState<{ key: string; items: ItemDto[]; next: string | null; can?: ItemListData['can']; err?: string; denied?: boolean }>({ key: '', items: [], next: null });
  const [more, setMore] = useState(false); const [rev, setRev] = useState(0); // tăng để tải lại sau khi nhập
  useEffect(() => {
    let live = true;
    api<ItemListData>(`/api/catalog/items?${qs}`).then(r => { if (live) setPage({ key: qs, items: r.items, next: r.nextCursor, can: r.can }); })
      .catch(e => { if (live) setPage({ key: qs, items: [], next: null, err: errMsg(e, 'Không tải được danh sách.'), denied: (e as { status?: number })?.status === 403 }); });
    return () => { live = false; };
  }, [qs, rev]);
  async function loadMore() {
    if (!page.next || more) return; setMore(true);
    try { const r = await api<ItemListData>(`/api/catalog/items?${qs}&cursor=${encodeURIComponent(page.next)}`); setPage(p => ({ ...p, items: [...p.items, ...r.items], next: r.nextCursor })); }
    catch (e) { setPage(p => ({ ...p, err: errMsg(e, 'Không tải thêm được.') })); } finally { setMore(false); }
  }
  const loading = page.key !== qs, set = (k: keyof Filters, v: string) => setF(x => ({ ...x, [k]: v }));
  if (page.denied || stats.denied) return <Denied />;
  const s = stats.data, can = page.can;
  const cards: [string, number | undefined][] = [['Tổng sản phẩm', s?.products], ['Tổng dịch vụ', s?.services], ['Sản phẩm đang kinh doanh', s?.productsActive], ['Dịch vụ đang kinh doanh', s?.servicesActive], ['Nhóm danh mục', s?.categories]];
  const catOptions = (cats.data?.items ?? []).filter(c => !f.type || c.type === f.type);

  return (<div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Sản phẩm & Dịch vụ</h1><p className="text-sm text-slate-500">Danh mục thương mại dùng chung cho toàn bộ hoạt động kinh doanh.</p></div>
      <div className="flex flex-wrap items-center gap-2"><ImportExport canCreate={!!can?.create} canExport={!!can?.export} query={qs} onImported={() => { setRev(x => x + 1); stats.reload(); }} />
      {can?.create && <><Link href="/products/new?type=product" className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"><Plus size={16} />Thêm sản phẩm</Link>
        <Link href="/products/new?type=service" className="flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700"><Plus size={16} />Thêm dịch vụ</Link></>}</div></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{cards.map(([l, n]) => <div key={l} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><b className="text-2xl">{n ?? '…'}</b></div>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap gap-2"><div className="relative min-w-[240px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={f.q} onChange={e => set('q', e.target.value)} placeholder="Tìm theo mã hoặc tên (đầu từ)…" aria-label="Tìm kiếm" className="h-9 w-full rounded-lg bg-slate-100 pl-9 text-sm outline-none" /></div>
        <select className={sc} aria-label="Loại" value={f.type} onChange={e => setF(x => ({ ...x, type: e.target.value, categoryId: '' }))}><option value="">Tất cả loại</option>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className={sc} aria-label="Nhóm" value={f.categoryId} onChange={e => set('categoryId', e.target.value)}><option value="">Tất cả nhóm</option>{catOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={sc} aria-label="Trạng thái" value={f.status} onChange={e => set('status', e.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(ITEM_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input inputMode="numeric" className={`${sc} w-28`} placeholder="Giá từ" aria-label="Giá từ" value={f.minPrice} onChange={e => set('minPrice', digits(e.target.value))} />
        <input inputMode="numeric" className={`${sc} w-28`} placeholder="Giá đến" aria-label="Giá đến" value={f.maxPrice} onChange={e => set('maxPrice', digits(e.target.value))} /></div>
      {page.err && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{page.err}</div>}
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr>{['Mã', 'Tên', 'Loại', 'Nhóm', 'Đơn vị', 'Giá bán', 'Thuế', 'Trạng thái', 'Cập nhật', 'Thao tác'].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{page.items.map(i => (<tr key={i.id} className="border-b last:border-0 hover:bg-slate-50">
          <td className="p-2 font-medium">{i.code}</td>
          <td className="max-w-[260px] p-2"><Link href={`/products/${i.id}`} className="block truncate font-semibold text-blue-700 hover:underline">{i.name}</Link>{i.pendingPriceRequestId && <PendingBadge />}</td>
          <td className="p-2"><TypeBadge t={i.type} /></td><td className="p-2">{i.categoryName}</td><td className="p-2">{i.unitName}</td>
          <td className="whitespace-nowrap p-2 font-semibold">{money(i.defaultPrice)}</td><td className="max-w-[160px] truncate p-2" title={taxText(i)}>{i.taxRateId ? i.taxRateName : '—'}</td>
          <td className="p-2"><ItemStatusBadge s={i.status} /></td><td className="whitespace-nowrap p-2">{dateOnly(i.updatedAt)}</td>
          <td className="p-2"><span className="flex gap-2 text-slate-500"><Link href={`/products/${i.id}`} aria-label={`Xem ${i.code}`}><Eye size={15} /></Link>{can?.create && <Link href={`/products/${i.id}/edit`} aria-label={`Sửa ${i.code}`}><Pencil size={15} /></Link>}</span></td></tr>))}</tbody></table>
        {loading && <p className="p-6 text-center text-sm text-slate-500">Đang tải…</p>}
        {!loading && !page.err && page.items.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{Object.values(f).some(Boolean) ? 'Không có mục nào khớp bộ lọc.' : 'Chưa có sản phẩm hoặc dịch vụ nào.'}</p>}</div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>Đang hiển thị {page.items.length} mục</span>
        {page.next && !loading && <button onClick={loadMore} disabled={more} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-50">{more ? 'Đang tải…' : 'Tải thêm'}</button>}</div></div></div>);
}
