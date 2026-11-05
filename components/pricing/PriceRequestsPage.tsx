'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import PriceRequests from '@/components/catalog/PriceRequests';
import ChangeRequests from './ChangeRequests';

/** Hộp thư yêu cầu đổi giá: giá mặc định (Phase 01) và giá theo bảng giá / nhóm (Phase 04) */
export default function PriceRequestsPage() {
  const { profile } = useAuth(); const [view, setView] = useState<'item' | 'other'>('item');
  const tb = (k: 'item' | 'other', l: string) => <button role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`h-9 rounded-lg px-4 text-sm font-medium ${view === k ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{l}</button>;
  return (<div className="space-y-4"><div className="flex gap-2" role="tablist">{tb('item', 'Giá bán mặc định')}{tb('other', 'Bảng giá & giá theo nhóm')}</div>
    {view === 'item' ? <PriceRequests /> : <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Yêu cầu đổi giá bảng giá / nhóm</h1><ChangeRequests uid={profile?.uid} /></div>}</div>);
}
