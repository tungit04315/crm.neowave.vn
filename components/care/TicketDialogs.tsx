'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/opportunities/ui';
import { api, ApiError } from '@/lib/api';
import { TICKET_STATUS_LABEL, type StaffDto, type TicketDto, type TicketStatus } from '@/types/care';
import { inp, useCareMeta } from './ui';

const ta = 'min-h-[80px] w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-500';

/** Khung chung: tiêu đề, vùng nhập, nút Hủy / Xác nhận, chặn gửi đúp và hiển thị lỗi từ máy chủ. `valid` trả về thông báo lỗi (nếu có) trước khi gửi. */
function ActionDialog({ title, submit, danger, onClose, onDone, valid, run, children }: {
  title: string; submit: string; danger?: boolean; onClose: () => void; onDone: () => void; valid?: string | null; run: () => Promise<unknown>; children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (valid) return setErr(valid);
    setBusy(true); setErr(null);
    try { await run(); onDone(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Không thực hiện được thao tác.'); setBusy(false); }
  }
  return (<Modal title={title} onClose={onClose}><form onSubmit={go} className="space-y-3">
    {err && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-600">{err}</div>}
    {children}
    <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="h-10 rounded-md border px-4 text-sm">Hủy</button>
      <button disabled={busy} className={`flex h-10 items-center gap-2 rounded-md px-5 text-sm font-medium text-white disabled:opacity-70 ${danger ? 'bg-red-600' : 'bg-blue-600'}`}>{busy && <Loader2 size={15} className="animate-spin" />}{submit}</button></div></form></Modal>);
}
const Note = ({ v, set, label = 'Ghi chú (không bắt buộc)' }: { v: string; set: (s: string) => void; label?: string }) => <textarea className={ta} maxLength={500} placeholder={label} value={v} onChange={e => set(e.target.value)} />;
type Props = { onClose: () => void; onDone: () => void };

export function AssignDialog({ t, onClose, onDone }: Props & { t: Pick<TicketDto, 'id' | 'departmentId' | 'assigneeUid' | 'assigneeName'> }) {
  const [users, setUsers] = useState<StaffDto[] | null>(null); const [uid, setUid] = useState(''); const [note, setNote] = useState(''); const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => { api<{ users: StaffDto[] }>(`/api/care/staff${t.departmentId ? `?departmentId=${encodeURIComponent(t.departmentId)}` : ''}`).then(r => setUsers(r.users)).catch(e => setLoadErr(e instanceof ApiError ? e.message : 'Không tải được danh sách nhân viên.')); }, [t.departmentId]);
  return (<ActionDialog title="Phân công người phụ trách" submit="Phân công" onClose={onClose} onDone={onDone} valid={uid ? null : 'Vui lòng chọn người phụ trách.'}
    run={() => api(`/api/care/tickets/${t.id}/assign`, { method: 'POST', json: { assigneeUid: uid, note } })}>
    {loadErr && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{loadErr}</p>}
    <p className="text-sm text-slate-500">Hiện tại: <b>{t.assigneeName || 'Chưa phân công'}</b></p>
    <select className={inp} value={uid} onChange={e => setUid(e.target.value)}><option value="">{users ? '— Chọn người phụ trách —' : 'Đang tải…'}</option>
      {users?.filter(u => u.uid !== t.assigneeUid).map(u => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}</select>
    <p className="text-xs text-slate-500">Chỉ hiện nhân viên thuộc phòng đang xử lý yêu cầu này. Phân công không đổi trạng thái; người phụ trách sẽ bấm “Bắt đầu xử lý”.</p>
    <Note v={note} set={setNote} label="Ghi chú bàn giao (không bắt buộc)" /></ActionDialog>);
}

export function TransferDialog({ t, onClose, onDone }: Props & { t: Pick<TicketDto, 'id' | 'departmentId' | 'departmentName' | 'assigneeName' | 'status'> }) {
  const { meta } = useCareMeta(); const [dept, setDept] = useState(''); const [note, setNote] = useState('');
  return (<ActionDialog title="Chuyển phòng xử lý" submit="Chuyển phòng" onClose={onClose} onDone={onDone} valid={dept ? null : 'Vui lòng chọn phòng ban nhận xử lý.'}
    run={() => api(`/api/care/tickets/${t.id}/transfer`, { method: 'POST', json: { departmentId: dept, note } })}>
    <p className="text-sm text-slate-500">Phòng hiện tại: <b>{t.departmentName || '—'}</b></p>
    <select className={inp} value={dept} onChange={e => setDept(e.target.value)}><option value="">{meta ? '— Chọn phòng ban nhận —' : 'Đang tải…'}</option>
      {meta?.departments.filter(d => d.id !== t.departmentId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
    <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">Người phụ trách hiện tại{t.assigneeName ? ` (${t.assigneeName})` : ''} sẽ được gỡ{t.status === 'new' ? '' : ' và yêu cầu quay về trạng thái “Mới”'} để phòng nhận phân công lại. Nếu bạn không thuộc phòng nhận, bạn sẽ không còn xem được yêu cầu này.</p>
    <Note v={note} set={setNote} label="Lý do chuyển phòng (không bắt buộc)" /></ActionDialog>);
}

const STATUS_INFO: Record<string, { title: (from: TicketStatus) => string; submit: string; hint?: string }> = {
  in_progress: { title: from => (from === 'new' ? 'Bắt đầu xử lý' : 'Tiếp tục xử lý'), submit: 'Xác nhận', hint: 'Nếu đang chờ khách, đồng hồ giải quyết sẽ chạy tiếp và hạn được dời đúng bằng thời gian đã chờ.' },
  waiting_customer: { title: () => 'Chờ khách hàng phản hồi', submit: 'Chuyển sang chờ', hint: 'Đồng hồ giải quyết tạm dừng trong thời gian chờ. Hệ thống không tự chuyển thành “Đã giải quyết”.' },
  resolved: { title: () => 'Ghi nhận đã giải quyết', submit: 'Xác nhận đã giải quyết', hint: 'Cần ghi nhận kết quả xử lý. Nội dung trao đổi trước đó được giữ nguyên.' },
  closed: { title: () => 'Đóng yêu cầu', submit: 'Đóng yêu cầu', hint: 'Yêu cầu sẽ chuyển sang “Đã đóng” và không chỉnh sửa hay trao đổi thêm được. Chỉ trưởng nhóm trở lên mới mở lại được.' },
};
export function StatusDialog({ id, from, to, onClose, onDone }: Props & { id: string; from: TicketStatus; to: Exclude<TicketStatus, 'new'> }) {
  const [reason, setReason] = useState(''); const [resolution, setResolution] = useState(''); const [note, setNote] = useState(''); const info = STATUS_INFO[to];
  const valid = to === 'waiting_customer' && !reason.trim() ? 'Vui lòng nhập lý do chờ khách hàng phản hồi.' : to === 'resolved' && !resolution.trim() ? 'Vui lòng ghi nhận kết quả xử lý.' : null;
  return (<ActionDialog title={info.title(from)} submit={info.submit} onClose={onClose} onDone={onDone} valid={valid}
    run={() => api(`/api/care/tickets/${id}/status`, { method: 'POST', json: { to, reason, resolution, note } })}>
    <p className="text-sm text-slate-600">Trạng thái sẽ chuyển: <b>{TICKET_STATUS_LABEL[from]}</b> → <b>{TICKET_STATUS_LABEL[to]}</b></p>
    {to === 'waiting_customer' && <textarea className={ta} maxLength={500} placeholder="Lý do chờ / thông tin cần khách bổ sung *" value={reason} onChange={e => setReason(e.target.value)} />}
    {to === 'resolved' && <textarea className={`${ta} min-h-[110px]`} maxLength={2000} placeholder="Kết quả xử lý / hướng giải quyết *" value={resolution} onChange={e => setResolution(e.target.value)} />}
    {info.hint && <p className="text-xs text-slate-500">{info.hint}</p>}
    <Note v={note} set={setNote} /></ActionDialog>);
}

export function ReopenDialog({ id, onClose, onDone }: Props & { id: string }) {
  const [note, setNote] = useState('');
  return (<ActionDialog title="Mở lại yêu cầu" submit="Mở lại" onClose={onClose} onDone={onDone} run={() => api(`/api/care/tickets/${id}/reopen`, { method: 'POST', json: { note } })}>
    <p className="text-sm text-slate-600">Yêu cầu quay lại xử lý. <b>Đồng hồ giải quyết SLA được tính lại từ đầu</b>; mốc phản hồi đầu tiên được giữ nguyên.</p>
    <Note v={note} set={setNote} label="Lý do mở lại (không bắt buộc)" /></ActionDialog>);
}
