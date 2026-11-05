'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  browserLocalPersistence, browserSessionPersistence, onAuthStateChanged, sendPasswordResetEmail,
  setPersistence, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase/config';
import type { UserProfile } from '@/types/user';

type Status = 'loading' | 'unauthenticated' | 'authenticated';
interface Ctx {
  status: Status; user: User | null; profile: UserProfile | null; authError: string | null;
  loginWithEmail: (email: string, password: string, remember: boolean) => Promise<void>;
  loginWithGoogle: (remember: boolean) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>; clearError: () => void;
}
const AuthContext = createContext<Ctx | null>(null);

const MSG: Record<string, string> = {
  'auth/invalid-credential': 'Email hoặc mật khẩu không chính xác.',
  'auth/wrong-password': 'Email hoặc mật khẩu không chính xác.',
  'auth/user-not-found': 'Email hoặc mật khẩu không chính xác.',
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/too-many-requests': 'Bạn thử quá nhiều lần. Vui lòng thử lại sau ít phút.',
  'auth/network-request-failed': 'Kết nối không thành công. Vui lòng kiểm tra mạng.',
  'auth/user-disabled': 'Tài khoản đã bị khóa.',
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google.',
  'profile/missing': 'Không tìm thấy hồ sơ người dùng. Vui lòng liên hệ quản trị viên.',
  'profile/inactive': 'Tài khoản chưa được kích hoạt.',
  'profile/suspended': 'Tài khoản đã bị khóa.',
  'profile/org': 'Tài khoản không thuộc tổ chức hợp lệ.',
  'profile/network': 'Kết nối không thành công. Vui lòng thử lại.',
};
export const toMessage = (e: unknown) => MSG[(e as { code?: string })?.code ?? ''] ?? 'Có lỗi trong quá trình xác thực. Vui lòng thử lại.';
const fail = (code: string) => Object.assign(new Error(code), { code });

async function loadValidProfile(u: User): Promise<UserProfile> {
  let snap;
  try { snap = await getDoc(doc(db, 'users', u.uid)); } catch { throw fail('profile/network'); }
  if (!snap.exists()) throw fail('profile/missing');
  const p = snap.data() as UserProfile;
  if (p.status === 'inactive') throw fail('profile/inactive');
  if (p.status === 'suspended') throw fail('profile/suspended');
  if (!p.organizationId || !p.role) throw fail('profile/org');
  return { ...p, uid: u.uid };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { setUser(null); setProfile(null); setStatus('unauthenticated'); return; }
    setStatus('loading');
    try {
      const p = await loadValidProfile(u);
      setUser(u); setProfile(p); setAuthError(null); setStatus('authenticated');
      updateDoc(doc(db, 'users', u.uid), { lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
    } catch (e) {
      setAuthError(toMessage(e)); setUser(null); setProfile(null);
      await signOut(auth); // onAuthStateChanged chạy lại và đặt 'unauthenticated'
    }
  }), []);

  const persist = (remember: boolean) => setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

  const value = useMemo<Ctx>(() => ({
    status, user, profile, authError,
    clearError: () => setAuthError(null),
    loginWithEmail: async (email, password, remember) => {
      setAuthError(null); await persist(remember);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    loginWithGoogle: async (remember) => {
      setAuthError(null); await persist(remember);
      try { await signInWithPopup(auth, googleProvider); }
      catch (e) {
        if ((e as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth, googleProvider);
        else throw e;
      }
    },
    // Không tiết lộ email có tồn tại hay không: bỏ qua lỗi user-not-found
    resetPassword: async (email) => {
      try { await sendPasswordResetEmail(auth, email.trim()); }
      catch (e) { const c = (e as { code?: string }).code; if (c !== 'auth/user-not-found') throw e; }
    },
    logout: () => signOut(auth),
  }), [status, user, profile, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth phải nằm trong AuthProvider');
  return c;
};
