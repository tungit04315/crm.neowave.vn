// Logic thuần cho phân hệ tương tác (không phụ thuộc Firebase / trình duyệt)
const pad = (n: number) => String(n).padStart(2, '0');
export const toInputValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fromInputValue = (s: string): Date | null => { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; };

export function validateActivity(v: { customerId: string; title: string; content: string; occurredAt: Date | null; nextFollowUpAt: Date | null }): string | null {
  if (!v.customerId) return 'Vui lòng chọn khách hàng.';
  if (!v.title.trim()) return 'Vui lòng nhập tiêu đề tương tác.';
  if (v.title.length > 200) return 'Tiêu đề tối đa 200 ký tự.';
  if (v.content.length > 2000) return 'Nội dung tối đa 2000 ký tự.';
  if (!v.occurredAt) return 'Vui lòng chọn thời gian thực hiện.';
  if (v.nextFollowUpAt && v.nextFollowUpAt.getTime() < v.occurredAt.getTime()) return 'Lịch follow-up phải sau thời điểm tương tác.';
  return null;
}
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function groupByDay<T>(items: T[], get: (t: T) => Date, now = new Date()): { key: string; label: string; items: T[] }[] {
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const out: { key: string; label: string; items: T[] }[] = [];
  for (const it of items) {
    const d = get(it), k = key(d); let g = out.find(x => x.key === k);
    if (!g) { g = { key: k, label: k === key(now) ? 'Hôm nay' : k === key(y) ? 'Hôm qua' : d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }), items: [] }; out.push(g); }
    g.items.push(it);
  }
  return out;
}
export const isOverdue = (d: Date | null, now = new Date()) => !!d && d.getTime() < now.getTime();
