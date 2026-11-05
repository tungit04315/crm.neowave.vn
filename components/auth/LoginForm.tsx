'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { toMessage, useAuth } from '@/contexts/AuthContext';
import Brand from './Brand';

const Google = () => (<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>);

export default function LoginForm() {
  const { status, authError, loginWithEmail, loginWithGoogle, clearError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [show, setShow] = useState(false); const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (status === 'authenticated') router.replace('/dashboard'); }, [status, router]);
  const shownError = error ?? authError;
  const disabled = busy !== null || status === 'loading';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    if (!email || !password) { setError('Vui lòng nhập email và mật khẩu.'); return; }
    setError(null); setBusy('email');
    try { await loginWithEmail(email, password, remember); } catch (err) { setError(toMessage(err)); } finally { setBusy(null); }
  }
  async function google() {
    if (disabled) return;
    setError(null); setBusy('google');
    try { await loginWithGoogle(remember); } catch (err) { setError(toMessage(err)); } finally { setBusy(null); }
  }
  const input = 'h-[46px] w-full rounded-md border border-slate-200 bg-white pl-11 pr-11 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  return (<section className="relative flex flex-1 items-center justify-center overflow-hidden bg-white p-6">
    <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-50" /><div className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-blue-50" />
    <div className="relative w-full max-w-[500px] rounded-2xl border border-slate-100 bg-white p-8 shadow-[0_10px_40px_rgba(30,64,175,0.08)] sm:p-10">
      <div className="flex justify-center"><Brand /></div>
      <h2 className="mt-8 text-center text-2xl font-semibold text-[#0b1f4d]">Đăng nhập hệ thống</h2>
      <p className="mt-2 text-center text-sm text-slate-500">Vui lòng nhập tài khoản và mật khẩu để tiếp tục.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {shownError && <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600"><AlertCircle size={16} className="mt-0.5 shrink-0" />{shownError}</div>}
        <div className="relative"><User size={18} className="absolute left-4 top-3.5 text-slate-500" />
          <input className={input} type="email" autoComplete="username" placeholder="Tài khoản" value={email}
            onChange={e => { setEmail(e.target.value); setError(null); clearError(); }} /></div>
        <div className="relative"><Lock size={18} className="absolute left-4 top-3.5 text-slate-500" />
          <input className={input} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Mật khẩu" value={password}
            onChange={e => { setPassword(e.target.value); setError(null); clearError(); }} />
          <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute right-4 top-3.5 text-slate-500">
            {show ? <Eye size={18} /> : <EyeOff size={18} />}</button></div>
        <div className="flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="h-4 w-4 accent-blue-600" />Ghi nhớ đăng nhập</label>
          <Link href="/forgot-password" className="font-medium text-blue-600 hover:underline">Quên mật khẩu?</Link></div>
        <button type="submit" disabled={disabled} className="flex h-12 w-full items-center justify-center gap-3 rounded-md bg-blue-600 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70">
          {busy === 'email' || status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}Đăng nhập</button>
      </form>
      <div className="my-6 flex items-center gap-4 text-sm text-slate-500"><span className="h-px flex-1 bg-slate-200" />Hoặc<span className="h-px flex-1 bg-slate-200" /></div>
      <button type="button" onClick={google} disabled={disabled} className="flex h-12 w-full items-center justify-center gap-3 rounded-md border border-blue-200 bg-white text-sm font-medium text-slate-800 transition hover:bg-blue-50 disabled:opacity-70">
        {busy === 'google' ? <Loader2 size={18} className="animate-spin" /> : <Google />}Đăng nhập bằng Google</button>
      <p className="mt-8 text-center text-sm text-slate-500">Chưa có tài khoản? <span className="font-medium text-blue-600">Liên hệ quản trị viên</span></p>
    </div></section>);
}
