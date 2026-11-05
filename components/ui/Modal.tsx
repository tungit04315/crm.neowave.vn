'use client';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Hộp thoại dùng chung (chuyển từ components/opportunities/ui.tsx) */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}><div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
    <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Đóng"><X size={18} /></button></div>{children}</div></div>);
}
