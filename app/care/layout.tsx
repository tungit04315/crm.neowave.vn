import AppShell from '@/components/layout/AppShell';

// Trang chỉ hiển thị sau khi xác thực phía trình duyệt nên không thể "điều hướng tức thì": tắt kiểm tra Instant để tránh gợi ý gây nhiễu ở chế độ dev
export const instant = false;
export default function Layout({ children }: { children: React.ReactNode }) { return <AppShell>{children}</AppShell>; }
