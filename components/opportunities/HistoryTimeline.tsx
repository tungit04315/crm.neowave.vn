import type { HistoryDto } from '@/types/opportunity';
import Timeline from '@/components/ui/HistoryTimeline';

const META: Record<string, [string, string]> = { stage: ['Chuyển giai đoạn', '#6366f1'], probability: ['Điều chỉnh xác suất', '#0ea5e9'], created: ['Tạo cơ hội', '#2563eb'], updated: ['Cập nhật thông tin', '#64748b'], assigned: ['Phân công', '#8b5cf6'], won: ['Chốt thành công', '#10b981'], lost: ['Đánh dấu thất bại', '#ef4444'], reopened: ['Mở lại', '#f59e0b'], deleted: ['Xóa cơ hội', '#ef4444'] };
export default function HistoryTimeline({ items }: { items: HistoryDto[] }) { return <Timeline items={items} meta={META} />; }
