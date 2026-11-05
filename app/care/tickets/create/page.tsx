import TicketForm from '@/components/care/TicketForm';

// Trang chỉ hiển thị sau khi xác thực phía trình duyệt nên không thể "điều hướng tức thì": tắt kiểm tra Instant cho đoạn này (xem app/care/layout.tsx)
export const instant = false;

export default function CreateTicket() {
  return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">Tạo yêu cầu hỗ trợ</h1><TicketForm /></div>;
}
