'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { Role } from '@/types/user';

export function AuthLoading() {
  return <div className="grid min-h-screen place-items-center bg-slate-50">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>;
}

export default function AuthGuard({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { status, profile } = useAuth();
  const router = useRouter();
  useEffect(() => { if (status === 'unauthenticated') router.replace('/login'); }, [status, router]);
  if (status !== 'authenticated' || !profile) return <AuthLoading />;
  if (roles && !roles.includes(profile.role))
    return <div className="grid min-h-screen place-items-center text-center"><div>
      <h1 className="text-2xl font-bold">Không có quyền truy cập</h1>
      <p className="mt-2 text-slate-500">Vui lòng liên hệ quản trị viên để được cấp quyền.</p></div></div>;
  return <>{children}</>;
}
