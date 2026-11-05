import type { ComponentType, ReactNode } from 'react';

export function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (<section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
    <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>{children}</section>);
}

/** Ô thông tin: nhãn nhỏ phía trên, giá trị bên dưới; có thể kèm icon và liên kết */
export function Field({ label, value, icon: Icon, href }: { label: string; value?: string; icon?: ComponentType<{ size?: number }>; href?: string }) {
  const empty = !value;
  return (<div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
    {Icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><Icon size={17} /></span>}
    <div className="min-w-0"><div className="text-xs text-slate-500">{label}</div>
      {empty ? <div className="mt-0.5 text-sm text-slate-400">Chưa cập nhật</div>
        : href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="mt-0.5 block break-words text-sm font-medium text-blue-700 hover:underline">{value}</a>
        : <div className="mt-0.5 break-words text-sm font-medium text-slate-900">{value}</div>}</div></div>);
}
