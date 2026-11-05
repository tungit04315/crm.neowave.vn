'use client';
import type { ListState } from '@/types/price-list';
import { LIST_STATE_LABEL } from '@/lib/price-list-core';

const pill = 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium';
const COLOR: Record<ListState, string> = { current: 'bg-emerald-50 text-emerald-600', upcoming: 'bg-blue-50 text-blue-600', expired: 'bg-amber-50 text-amber-700', inactive: 'bg-slate-100 text-slate-500' };
export const StateBadge = ({ s }: { s: ListState }) => <span className={`${pill} ${COLOR[s]}`}>{LIST_STATE_LABEL[s]}</span>;
/** YYYY-MM-DD → dd/mm/yyyy */
export const dmy = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
export const period = (a: string | null, b: string | null) => (!a && !b ? 'Không giới hạn' : `${a ? dmy(a) : '…'} → ${b ? dmy(b) : '…'}`);
