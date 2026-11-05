'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatPercentBp, formatVnd, ITEM_STATUS_LABEL, TYPE_LABEL, USE_STATUS_LABEL } from '@/lib/catalog-core';
import type { ActiveStatus, CatalogType, ItemDto } from '@/types/catalog';

export const errMsg = (e: unknown, fallback = 'Có lỗi xảy ra. Vui lòng thử lại.') => (e instanceof ApiError ? e.message : fallback);

/** Tải dữ liệu từ API. Giữ dữ liệu cũ trong lúc tải lại; `reload()` gọi lại sau khi ghi. 403 → denied (chưa được cấp quyền). */
export function useApiData<T>(path: string | null) {
  const [ver, setVer] = useState(0);
  const key = `${path}|${ver}`;
  const [st, setSt] = useState<{ key: string; data?: T; err?: string; denied?: boolean }>({ key: '' });
  useEffect(() => {
    if (!path) return; let live = true;
    api<T>(path).then(d => { if (live) setSt({ key, data: d }); })
      .catch(e => { if (live) setSt(s => ({ key, data: s.data, err: errMsg(e, 'Không tải được dữ liệu.'), denied: e instanceof ApiError && e.status === 403 })); });
    return () => { live = false; };
  }, [path, key]);
  const reload = useCallback(() => setVer(v => v + 1), []);
  return { data: st.data, err: st.key === key ? st.err : undefined, denied: st.key === key && !!st.denied, loading: !!path && st.key !== key, reload };
}

export function Denied({ message }: { message?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><h2 className="text-lg font-bold text-slate-900">Không có quyền truy cập</h2>
    <p className="mt-1 text-sm text-slate-500">{message ?? 'Vai trò của bạn chưa được cấp quyền xem phân hệ Sản phẩm & Dịch vụ. Vui lòng liên hệ quản trị viên.'}</p></div>;
}
const pill = 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium';
export const TypeBadge = ({ t }: { t: CatalogType }) => <span className={`${pill} ${t === 'product' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>{TYPE_LABEL[t]}</span>;
export const ItemStatusBadge = ({ s }: { s: ActiveStatus }) => <span className={`${pill} ${s === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{ITEM_STATUS_LABEL[s]}</span>;
export const UseStatusBadge = ({ s }: { s: ActiveStatus }) => <span className={`${pill} ${s === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{USE_STATUS_LABEL[s]}</span>;
export const PendingBadge = () => <span className={`${pill} bg-amber-50 text-amber-700`}>Chờ duyệt giá</span>;
export const taxText = (i: Pick<ItemDto, 'taxRateId' | 'taxRateName' | 'taxRateBp' | 'priceIncludesTax'>) =>
  i.taxRateId ? `${i.taxRateName}${i.taxRateBp !== null ? ` (${formatPercentBp(i.taxRateBp)})` : ''} · ${i.priceIncludesTax ? 'giá đã gồm thuế' : 'giá chưa gồm thuế'}` : 'Không áp dụng';
export const money = formatVnd;
export const when = (iso: string) => (iso ? new Date(iso).toLocaleString('vi-VN') : '');
export const dateOnly = (iso: string) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');
