export const stats = [
  { key: 'customers', label: 'Tổng khách hàng', value: '1.248', growth: 12, sub: 'Khách hàng mới: 186', color: '#3b82f6', icon: 'Users' },
  { key: 'opps', label: 'Cơ hội đang mở', value: '532', growth: 18, sub: 'Giá trị pipeline: 48,7 tỷ', color: '#2563eb', icon: 'Filter' },
  { key: 'sales', label: 'Doanh số tháng này', value: '2,8 tỷ', growth: 26, sub: 'Mục tiêu: 3,5 tỷ (80%)', color: '#16a34a', icon: 'TrendingUp' },
  { key: 'revenue', label: 'Doanh thu ghi nhận', value: '2,2 tỷ', growth: 22, sub: 'Thực thu: 1,8 tỷ (82%)', color: '#f59e0b', icon: 'Coins' },
  { key: 'debt', label: 'Công nợ phải thu', value: '680 triệu', growth: 8, sub: 'Quá hạn: 120 triệu (18%)', color: '#2563eb', icon: 'Wallet', down: true },
  { key: 'todo', label: 'Việc cần làm', value: '24', growth: 5, sub: 'Quá hạn: 6', color: '#10b981', icon: 'ListChecks', down: true },
] as const;

export const monthly = [1.4,1.7,3.2,1.9,2.2,2.5,2.9,3.0,3.3,3.0,3.4,3.9].map((v, i) => ({
  month: `Tháng ${i + 1}`, signed: v,
  recognized: [1.1,1.5,2.8,2.3,2.4,2.7,2.9,3.1,3.2,3.3,3.5,3.8][i],
  collected: [0.9,1.3,2.2,1.8,2.0,2.3,2.5,2.7,2.9,2.8,3.1,3.4][i],
}));

export const services = [
  { name: 'Thiết kế website', pct: 34, value: '952 triệu', color: '#2563eb' },
  { name: 'Marketing online', pct: 22, value: '616 triệu', color: '#3b9cf5' },
  { name: 'Phần mềm', pct: 18, value: '504 triệu', color: '#22b573' },
  { name: 'Tư vấn & đào tạo', pct: 14, value: '392 triệu', color: '#f5b400' },
  { name: 'Khác', pct: 12, value: '336 triệu', color: '#f4a6b5' },
];

export const activities = [
  { who: 'Nguyễn Thị Hằng', text: 'Tạo cơ hội bán hàng mới: Công ty ABC', time: '15 phút trước' },
  { who: 'Lê Văn Minh', text: 'Cập nhật tiến độ dự án: Website ABC', time: '32 phút trước' },
  { who: 'Trần Thị Mai', text: 'Ký hợp đồng: Công ty XYZ (50.000.000đ)', time: '1 giờ trước' },
  { who: 'Phạm Văn Dũng', text: 'Tạo công việc: Gọi điện chăm sóc khách hàng', time: '2 giờ trước' },
  { who: 'Hệ thống', text: 'Nhắc lịch: Hợp đồng ABC sắp hết hạn (15/05)', time: '3 giờ trước' },
  { who: 'Nguyễn Văn Nam', text: 'Duyệt báo giá: Công ty TNHH Minh Phát', time: '4 giờ trước' },
];

export const employees = [
  { name: 'Lê Văn Minh', sales: '680 triệu', target: '800 triệu', pct: 85 },
  { name: 'Nguyễn Thị Hằng', sales: '520 triệu', target: '600 triệu', pct: 87 },
  { name: 'Trần Quốc Tuấn', sales: '450 triệu', target: '600 triệu', pct: 75 },
  { name: 'Phạm Thị Lan', sales: '380 triệu', target: '500 triệu', pct: 76 },
  { name: 'Hoàng Đức Anh', sales: '320 triệu', target: '500 triệu', pct: 64 },
];

export const customers = [
  { name: 'Công ty TNHH ABC', value: '1,2 tỷ', contracts: 3 },
  { name: 'Tập đoàn XYZ', value: '980 triệu', contracts: 2 },
  { name: 'Công ty CP Minh Phát', value: '750 triệu', contracts: 4 },
  { name: 'Công ty TNHH Hòa Bình', value: '620 triệu', contracts: 2 },
  { name: 'Công ty CP Đại Việt', value: '580 triệu', contracts: 3 },
];

export const taskStatus = [
  { name: 'Hoàn thành', pct: 68, count: 102, color: '#22b573' },
  { name: 'Đang thực hiện', pct: 20, count: 30, color: '#2563eb' },
  { name: 'Quá hạn', pct: 8, count: 12, color: '#ef4444' },
  { name: 'Tạm dừng', pct: 4, count: 6, color: '#6b7280' },
];

export const funnel = [
  { stage: 'Lead mới', pct: 100, count: 532, color: '#3b82f6' },
  { stage: 'Đã liên hệ', pct: 78, count: 415, color: '#3b9cf5' },
  { stage: 'Đang tư vấn', pct: 62, count: 331, color: '#2dc4b2' },
  { stage: 'Gửi báo giá', pct: 45, count: 239, color: '#8b7cf0' },
  { stage: 'Đàm phán', pct: 28, count: 149, color: '#f9b48a' },
  { stage: 'Chốt thành công', pct: 18, count: 96, color: '#5eead4' },
];

export const alerts = [
  { text: 'Hợp đồng sắp hết hạn (trong 30 ngày)', n: 6, color: '#f97316' },
  { text: 'Công nợ đến hạn (trong 7 ngày)', n: 8, color: '#ef4444' },
  { text: 'Công nợ quá hạn', n: 5, color: '#ef4444' },
  { text: 'Khách hàng có dấu hiệu rời bỏ', n: 3, color: '#8b5cf6' },
  { text: 'Công việc quá hạn', n: 6, color: '#ef4444' },
];

export const schedule = [
  { time: '09:00', text: 'Gọi điện chăm sóc KH - Công ty ABC', owner: 'Nguyễn Thị Hằng' },
  { time: '10:30', text: 'Họp báo giá - Công ty XYZ', owner: 'Trần Quốc Tuấn' },
  { time: '14:00', text: 'Báo cáo KPI tuần', owner: 'Phòng Kinh doanh' },
  { time: '15:30', text: 'Gặp khách - Công ty Minh Phát', owner: 'Lê Văn Minh' },
  { time: '16:00', text: 'Cập nhật dự án Website', owner: 'Trần Thị Mai' },
];

export const menu = [
  ['Tổng quan','LayoutDashboard','/dashboard'],['Khách hàng','Users','/customers'],['Cơ hội bán hàng','Filter','/opportunities'],
  ['KPI','Gauge','/kpi'],['Công việc','ClipboardList','/tasks'],['Doanh số','BarChart3','/sales'],['Hợp đồng','FileText','/contracts'],
  ['Báo giá & Đơn hàng','Receipt','/quotes'],['Dự án triển khai','FolderKanban','/projects'],['Chăm sóc khách hàng','Headphones','/care'],
  ['Sản phẩm & Dịch vụ','Package','/products'],['Thu chi & Công nợ','Wallet','/finance'],['Nhân sự & Phòng ban','Building2','/hr'],
  ['Báo cáo thống kê','PieChart','/reports'],['Thông báo & Lịch','CalendarDays','/notifications'],['Cài đặt & Phân quyền','Settings','/settings'],
] as const;
