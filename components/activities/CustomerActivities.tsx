'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { listCustomerActivities } from '@/lib/activities';
import type { Activity } from '@/types/activity';
import ActivityForm from './ActivityForm';
import ActivityTimeline from './ActivityTimeline';
import { useActivityActions } from './useActivityActions';

export default function CustomerActivities({ customerId, org, customerLabel }: { customerId: string; org: string; customerLabel: { code: string; name: string } }) {
  const [rows, setRows] = useState<Activity[] | null>(null); const [error, setError] = useState(false);
  const [form, setForm] = useState<{ edit?: Activity } | null>(null);
  const load = useCallback(() => listCustomerActivities(customerId, org).then(setRows).catch(() => setError(true)), [customerId, org]);
  useEffect(() => { load(); }, [load]);
  const { canEdit, remove } = useActivityActions(load);
  return (<div className="space-y-4"><div className="flex items-center justify-between"><b className="text-sm">Nhật ký tương tác{rows ? ` (${rows.length})` : ''}</b>
    <button onClick={() => setForm({})} className="flex h-8 items-center gap-1 rounded-md bg-blue-600 px-3 text-xs text-white"><Plus size={14} />Thêm tương tác</button></div>
    {error && <p className="text-sm text-red-500">Không tải được lịch sử tương tác.</p>}
    {rows === null && !error ? <p className="text-sm text-slate-500">Đang tải…</p> : rows && <ActivityTimeline items={rows} canEdit={canEdit} onEdit={a => setForm({ edit: a })} onDelete={remove} />}
    {form && <ActivityForm customers={[{ id: customerId, ...customerLabel }]} fixedCustomerId={customerId} initial={form.edit} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}</div>);
}
