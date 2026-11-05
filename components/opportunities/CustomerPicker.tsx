'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { listCustomers } from '@/lib/customers';
import type { Customer } from '@/types/customer';

/** Chỉ cho CHỌN khách hàng có sẵn (không tạo mới tại đây) để không phát sinh khách hàng trùng. */
export default function CustomerPicker({ value, onChange, fallbackLabel }: { value: string; onChange: (id: string) => void; fallbackLabel?: string }) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Customer[] | null>(null); const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [err, setErr] = useState(false);
  useEffect(() => { if (profile) listCustomers(profile.organizationId).then(setRows).catch(() => setErr(true)); }, [profile]);
  const sel = rows?.find(c => c.id === value);
  const list = useMemo(() => (rows ?? []).filter(c => !q || [c.name, c.code, c.phone, c.taxCode].some(x => x?.toLowerCase().includes(q.toLowerCase()))).slice(0, 8), [rows, q]);
  if (value && !open) return (<div className="flex h-10 items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 text-sm">
    <span className="truncate">{sel ? `${sel.code} – ${sel.name}` : fallbackLabel ?? value}</span><button type="button" onClick={() => setOpen(true)} className="text-xs text-blue-600">Đổi</button></div>);
  return (<div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" />
    <input autoFocus={open} value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm khách hàng theo tên, mã, SĐT, MST…" className="h-10 w-full rounded-md border border-slate-200 pl-9 text-sm outline-none focus:border-blue-500" />
    <div className="mt-1 max-h-56 overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow-sm">
      {err && <p className="p-3 text-red-500">Không tải được danh sách khách hàng.</p>}
      {!rows && !err && <p className="p-3 text-slate-500">Đang tải…</p>}
      {list.map(c => <button type="button" key={c.id} onClick={() => { onChange(c.id); setOpen(false); setQ(''); }} className="flex w-full items-center gap-2 border-b p-2 text-left last:border-0 hover:bg-slate-50">
        <b className="text-xs">{c.code}</b><span className="flex-1 truncate">{c.name}</span><span className="text-xs text-slate-400">{c.phone}</span></button>)}
      {rows && !list.length && <p className="p-3 text-slate-500">Không tìm thấy. <Link href="/customers/new" className="text-blue-600 underline">Thêm khách hàng mới</Link> (hệ thống sẽ kiểm tra trùng).</p>}</div></div>);
}
