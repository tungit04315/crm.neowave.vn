'use client';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/** Thành phần biểu mẫu dùng chung (trước đây được định nghĩa lặp ở từng component) */
export const inp = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export const area = 'min-h-[80px] w-full rounded-md border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export const newRequestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-0000`);
/** Chuỗi số → hiển thị có dấu phân cách nghìn */
export const fmtNum = (n: string) => (n ? Number(n).toLocaleString('vi-VN') : '');
export const Group = ({ title, children }: { title: string; children: ReactNode }) => <fieldset className="rounded-xl border border-slate-100 p-4"><legend className="px-2 text-xs font-semibold uppercase text-slate-500">{title}</legend><div className="grid gap-3 md:grid-cols-2">{children}</div></fieldset>;
export const L = ({ t, children, wide, hint }: { t: string; children: ReactNode; wide?: boolean; hint?: string }) => <label className={`block text-xs font-medium text-slate-600 ${wide ? 'md:col-span-2' : ''}`}>{t}<div className="mt-1">{children}</div>{hint && <span className="mt-1 block font-normal text-slate-400">{hint}</span>}</label>;
export const Alert = ({ children }: { children: ReactNode }) => <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{children}</div>;
export const FormFooter = ({ busy, label, onClose, danger }: { busy: boolean; label: string; onClose: () => void; danger?: boolean }) => (<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="h-10 rounded-md border border-slate-200 px-4 text-sm">Hủy</button>
  <button disabled={busy} className={`flex h-10 items-center gap-2 rounded-md px-5 text-sm font-medium text-white disabled:opacity-70 ${danger ? 'bg-red-600' : 'bg-blue-600'}`}>{busy && <Loader2 size={15} className="animate-spin" />}{label}</button></div>);
