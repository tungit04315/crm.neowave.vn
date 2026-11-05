import TicketList from '@/components/care/TicketList';

// Trang chỉ hiển thị sau khi xác thực phía trình duyệt nên không thể "điều hướng tức thì": tắt kiểm tra Instant cho đoạn này (xem app/care/layout.tsx)
export const instant = false;
export default function Page() { return <TicketList key="in-progress" view="in-progress" />; }
