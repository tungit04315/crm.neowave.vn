'use client';
import { useState } from 'react';
import { Header, Sidebar } from '@/components/dashboard/Shell';
import AuthGuard from '@/components/auth/AuthGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f1f5fb]">
        <Sidebar collapsed={collapsed} open={open} onClose={() => setOpen(false)} />
        <div className={`transition-all ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[216px]'}`}>
          <Header onToggle={() => (window.innerWidth < 1024 ? setOpen(o => !o) : setCollapsed(c => !c))} />
          <main className="p-4">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
