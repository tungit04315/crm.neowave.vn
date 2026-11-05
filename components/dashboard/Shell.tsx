'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { menu } from '@/lib/dashboard-data';
import { useAuth } from '@/contexts/AuthContext';
import { CARE_ROLES } from '@/lib/care-core';

export const Ic = ({ n, ...p }: { n: string } & Icons.LucideProps) => {
  const C = (Icons as unknown as Record<string, Icons.LucideIcon>)[n]; return <C {...p} />;
};

type Item = { label: string; icon: string; href: string; children?: { label: string; href: string }[] };
// Menu phân cấp: thêm `children` cho mục nào cần mở rộng
const tree: Item[] = menu.map(([label, icon, href]) => label === 'Khách hàng'
  ? { label, icon, href, children: [
      { label: 'Tất cả khách hàng', href: '/customers' },
      { label: 'Nhóm khách hàng', href: '/customers/groups' },
      { label: 'Khách hàng tiềm năng', href: '/leads' },
      { label: 'Lịch sử tương tác', href: '/customers/activities' }] }
  : label === 'Cơ hội bán hàng'
  ? { label, icon, href, children: [
      { label: 'Tất cả cơ hội', href: '/opportunities' },
      { label: 'Pipeline', href: '/opportunities/pipeline' },
      { label: 'Cơ hội của tôi', href: '/opportunities/mine' },
      { label: 'Cơ hội thành công', href: '/opportunities/won' },
      { label: 'Cơ hội thất bại', href: '/opportunities/lost' },
      { label: 'Dự báo & phân tích', href: '/opportunities/forecast' },
      { label: 'Cấu hình giai đoạn', href: '/opportunities/stages' }] }
  : label === 'Chăm sóc khách hàng'
  ? { label, icon, href, children: [
      { label: 'Tất cả yêu cầu', href: '/care/tickets' },
      { label: 'Yêu cầu mới', href: '/care/tickets/status/new' },
      { label: 'Yêu cầu đang xử lý', href: '/care/tickets/status/in-progress' },
      { label: 'Yêu cầu chờ phản hồi', href: '/care/tickets/status/waiting' },
      { label: 'Yêu cầu đã giải quyết', href: '/care/tickets/status/resolved' }] }
  : label === 'Sản phẩm & Dịch vụ'
  ? { label, icon, href, children: [
      { label: 'Tất cả sản phẩm & dịch vụ', href: '/products' },
      { label: 'Bảng giá', href: '/products/price-lists' },
      { label: 'Giá theo nhóm KH', href: '/products/group-prices' },
      { label: 'Ưu tiên nhóm KH', href: '/products/group-priorities' },
      { label: 'Chính sách chiết khấu', href: '/products/discounts' },
      { label: 'Tính thử giá', href: '/products/price-check' },
      { label: 'Lịch sử thay đổi giá', href: '/products/price-history' },
      { label: 'Nhóm sản phẩm', href: '/products/product-groups' },
      { label: 'Nhóm dịch vụ', href: '/products/service-groups' },
      { label: 'Đơn vị tính', href: '/products/units' },
      { label: 'Thuế suất', href: '/products/tax-rates' },
      { label: 'Yêu cầu đổi giá', href: '/products/price-requests' }] }
  : { label, icon, href });

// Khớp theo đường dẫn; mục con có đường dẫn dài hơn sẽ được ưu tiên
const hit = (path: string, href: string, all: string[] = []) =>
  (path === href || path.startsWith(href + '/')) && !all.some(o => o.length > href.length && (path === o || path.startsWith(o + '/')));

export function Sidebar({ collapsed, open, onClose }: { collapsed: boolean; open: boolean; onClose: () => void }) {
  const path = usePathname();
  const { profile } = useAuth();
  const [expanded, setExpanded] = useState<string[]>([]);
  // Mục "Chăm sóc khách hàng" chỉ hiện với vai có quyền (máy chủ vẫn kiểm tra lại ở mọi API)
  const items = tree.filter(i => i.label !== 'Chăm sóc khách hàng' || (!!profile && CARE_ROLES.includes(profile.role)));
  const kids = (i: Item) => i.children?.map(c => c.href) ?? [];
  const childActive = (i: Item) => !!i.children?.some(c => hit(path, c.href, kids(i)));

  useEffect(() => {
    items.forEach(i => { if (childActive(i)) setExpanded(e => e.includes(i.label) ? e : [...e, i.label]); });
  }, [path, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors';
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-[#0b1f4d] text-white transition-all
        ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 ${collapsed ? 'w-[72px]' : 'w-[216px]'}`}>
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4 text-xl font-bold">
          <Icons.Hexagon className="fill-sky-500 text-sky-400" size={28} />{!collapsed && 'CRM'}
        </div>
        <nav className="sidebar-scroll flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map(item => {
            if (!item.children || collapsed) {
              const active = item.children ? childActive(item) : hit(path, item.href);
              return (<Link key={item.href} href={item.href} title={item.label} onClick={onClose}
                className={`${base} ${active ? 'bg-blue-600 font-semibold' : 'text-slate-200 hover:bg-white/10'}`}>
                <Ic n={item.icon} size={18} className="shrink-0" />{!collapsed && <span className="truncate">{item.label}</span>}</Link>);
            }
            const isOpen = expanded.includes(item.label), active = childActive(item);
            return (<div key={item.label}>
              <button onClick={() => setExpanded(e => isOpen ? e.filter(x => x !== item.label) : [...e, item.label])} aria-expanded={isOpen}
                className={`${base} ${active ? 'bg-white/10 font-semibold' : 'text-slate-200 hover:bg-white/10'}`}>
                <Ic n={item.icon} size={18} className="shrink-0" /><span className="flex-1 truncate text-left">{item.label}</span>
                <Icons.ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
              {isOpen && <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/15 pl-2">{item.children.map(c => (
                <Link key={c.href} href={c.href} onClick={onClose}
                  className={`block truncate rounded-md px-3 py-1.5 text-[12.5px] transition-colors ${hit(path, c.href, kids(item)) ? 'bg-blue-600 font-semibold' : 'text-slate-300 hover:bg-white/10'}`}>{c.label}</Link>))}</div>}
            </div>);
          })}
        </nav>
        {!collapsed && (
          <div className="m-3 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 p-4 text-xs">
            <div className="text-sm font-semibold">Enterprise CRM</div>
            <div className="mt-1 text-slate-300">Kết nối dữ liệu - Tối ưu vận hành<br />Tăng trưởng bền vững</div>
          </div>)}
      </aside>
    </>);
}

export function Header({ onToggle }: { onToggle: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [noti, setNoti] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
      <button onClick={onToggle} aria-label="Toggle sidebar"><Icons.Menu size={20} /></button>
      <div className="relative max-w-xl flex-1">
        <Icons.Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input placeholder="Tìm kiếm khách hàng, hợp đồng, công việc..."
          className="h-9 w-full rounded-lg bg-slate-100 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
      </div>
      <div className="ml-auto flex items-center gap-4 text-slate-600">
        <div className="relative">
          <button onClick={() => setNoti(!noti)} className="relative"><Icons.Bell size={20} />
            <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-[10px] text-white">3</span></button>
          {noti && <div className="absolute right-0 top-8 w-64 rounded-lg border bg-white p-3 text-sm shadow-lg">
            <b>Thông báo</b><p className="mt-2 text-slate-500">Hợp đồng ABC sắp hết hạn (15/05)</p></div>}
        </div>
        <Icons.Calendar size={20} /><Icons.MessageSquare size={20} />
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">NN</span>
            <span className="hidden text-left leading-tight md:block"><span className="block text-[13px] font-semibold text-slate-900">Nguyễn Văn Nam</span>
              <span className="text-[11px] text-slate-500">Giám đốc kinh doanh</span></span>
            <Icons.ChevronDown size={16} /></button>
          {menuOpen && <div className="absolute right-0 top-11 w-44 rounded-lg border bg-white py-1 text-sm shadow-lg">
            {['Hồ sơ cá nhân', 'Cài đặt', 'Đăng xuất'].map(t => <div key={t} className="cursor-pointer px-3 py-2 hover:bg-slate-50">{t}</div>)}</div>}
        </div>
      </div>
    </header>);
}
