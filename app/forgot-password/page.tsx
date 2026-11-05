'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail } from 'lucide-react';
import { toMessage, useAuth } from '@/contexts/AuthContext';
import Brand from '@/components/auth/Brand';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false); const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Email không hợp lệ.'); return; }
    setBusy(true); setError(null);
    try { await resetPassword(email); setDone(true); } catch (err) { setError(toMessage(err)); } finally { setBusy(false); }
  }
  return (<main className="grid min-h-screen place-items-center bg-slate-50 p-6">
    <div className="w-full max-w-[460px] rounded-2xl border border-slate-100 bg-white p-8 shadow-lg">
      <div className="flex justify-center"><Brand /></div>
      <h1 className="mt-6 text-center text-2xl font-semibold text-[#0b1f4d]">Quên mật khẩu</h1>
      {done ? <p className="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-700">Nếu email tồn tại trong hệ thống, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.</p> : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <p className="text-center text-sm text-slate-500">Nhập email tài khoản để nhận liên kết đặt lại mật khẩu.</p>
          {error && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          <div className="relative"><Mail size={18} className="absolute left-4 top-3.5 text-slate-500" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
              className="h-[46px] w-full rounded-md border border-slate-200 pl-11 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
          <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-blue-600 font-medium text-white hover:bg-blue-700 disabled:opacity-70">
            {busy && <Loader2 size={18} className="animate-spin" />}Gửi liên kết đặt lại</button></form>)}
      <Link href="/login" className="mt-6 block text-center text-sm font-medium text-blue-600 hover:underline">← Quay lại đăng nhập</Link>
    </div></main>);
}
