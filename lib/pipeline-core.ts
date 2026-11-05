// Logic thuần của Sales Pipeline: cấu hình giai đoạn, điều kiện chuyển giai đoạn, bảng Kanban, dự báo và phân tích chuyển đổi.
// Dùng chung cho máy chủ (API) và giao diện; không phụ thuộc Firebase/trình duyệt nên kiểm thử độc lập được.
import type { OppStatus } from './opportunity-core';

export interface Stage { id: string; name: string; color: string; probability: number; requireValue: boolean; requireCloseDate: boolean; requireDescription: boolean }
export interface PipelineConfig { stages: Stage[]; allowSkip: boolean; backwardRequiresNote: boolean; version: number }
const S = (id: string, name: string, color: string, probability: number, extra: Partial<Stage> = {}): Stage => ({ id, name, color, probability, requireValue: false, requireCloseDate: false, requireDescription: false, ...extra });
/** Cấu hình mặc định khi tổ chức chưa tự cấu hình. Mã giai đoạn đầu tiên là "new" để khớp dữ liệu Phase 01. */
export const DEFAULT_CONFIG: PipelineConfig = {
  stages: [S('new', 'Mới', '#3b82f6', 10), S('contacted', 'Đã liên hệ', '#06b6d4', 20), S('consulting', 'Đang tư vấn', '#10b981', 40),
    S('quoting', 'Gửi báo giá', '#8b5cf6', 60, { requireValue: true }), S('negotiating', 'Đàm phán', '#f59e0b', 80, { requireValue: true, requireCloseDate: true })],
  allowSkip: true, backwardRequiresNote: true, version: 0,
};
export const STAGE_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

// ---- Kiểm tra cấu hình ----
export interface StageInput extends Omit<Stage, 'id'> { id?: string }
export interface ConfigInput { stages: StageInput[]; allowSkip: boolean; backwardRequiresNote: boolean; version: number }
type R<T> = { ok: true; value: T } | { ok: false; error: string };
export function parseConfig(raw: unknown): R<ConfigInput> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(b.stages)) return { ok: false, error: 'Thiếu danh sách giai đoạn.' };
  if (b.stages.length < 2 || b.stages.length > 12) return { ok: false, error: 'Cần từ 2 đến 12 giai đoạn.' };
  if (typeof b.version !== 'number' || !Number.isInteger(b.version) || b.version < 0) return { ok: false, error: 'Thiếu số phiên bản cấu hình.' };
  const names = new Set<string>(), ids = new Set<string>(), stages: StageInput[] = [];
  for (const [i, x] of (b.stages as unknown[]).entries()) {
    const s = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>, n = i + 1;
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (!name) return { ok: false, error: `Giai đoạn ${n}: vui lòng nhập tên.` };
    if (name.length > 40) return { ok: false, error: `Giai đoạn ${n}: tên tối đa 40 ký tự.` };
    if (names.has(name.toLowerCase())) return { ok: false, error: `Tên giai đoạn “${name}” bị trùng.` };
    names.add(name.toLowerCase());
    if (typeof s.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.color)) return { ok: false, error: `Giai đoạn “${name}”: màu không hợp lệ.` };
    if (typeof s.probability !== 'number' || !Number.isInteger(s.probability) || s.probability < 0 || s.probability > 100) return { ok: false, error: `Giai đoạn “${name}”: xác suất phải là số nguyên từ 0 đến 100.` };
    let id: string | undefined;
    if (s.id !== undefined && s.id !== null && s.id !== '') {
      if (typeof s.id !== 'string' || !/^[a-z0-9_]{1,40}$/.test(s.id) || s.id === 'won' || s.id === 'lost') return { ok: false, error: `Giai đoạn “${name}”: mã không hợp lệ.` };
      if (ids.has(s.id)) return { ok: false, error: `Mã giai đoạn bị trùng.` };
      ids.add(s.id); id = s.id;
    }
    stages.push({ id, name, color: s.color, probability: s.probability, requireValue: s.requireValue === true, requireCloseDate: s.requireCloseDate === true, requireDescription: s.requireDescription === true });
  }
  return { ok: true, value: { stages, allowSkip: b.allowSkip !== false, backwardRequiresNote: b.backwardRequiresNote !== false, version: b.version } };
}

// ---- Điều kiện chuyển giai đoạn ----
export interface MoveSubject { status: OppStatus; stageId: string; value: number; expectedCloseDate: string | null; description: string }
export type MoveResult = { ok: true; from: Stage | null; to: Stage; backward: boolean } | { ok: false; status: number; code: string; error: string };
export const stageIndex = (stages: Stage[], id: string) => stages.findIndex(s => s.id === id);
export function checkMove(cfg: PipelineConfig, o: MoveSubject, targetId: string, note: string): MoveResult {
  const fail = (status: number, code: string, error: string): MoveResult => ({ ok: false, status, code, error });
  if (o.status !== 'open') return fail(409, 'closed', 'Cơ hội đã đóng. Hãy mở lại trước khi chuyển giai đoạn.');
  const toIdx = stageIndex(cfg.stages, targetId);
  if (toIdx < 0) return fail(400, 'bad-stage', 'Giai đoạn không tồn tại.');
  const fromIdx = stageIndex(cfg.stages, o.stageId), to = cfg.stages[toIdx];
  if (fromIdx === toIdx) return fail(400, 'same-stage', 'Cơ hội đang ở giai đoạn này.');
  if (!cfg.allowSkip && fromIdx >= 0 && toIdx - fromIdx > 1) return fail(422, 'skip-not-allowed', 'Không được bỏ qua giai đoạn. Hãy chuyển lần lượt từng giai đoạn.');
  if (to.requireValue && !(o.value > 0)) return fail(422, 'condition', `Giai đoạn “${to.name}” yêu cầu giá trị dự kiến lớn hơn 0.`);
  if (to.requireCloseDate && !o.expectedCloseDate) return fail(422, 'condition', `Giai đoạn “${to.name}” yêu cầu ngày dự kiến chốt.`);
  if (to.requireDescription && !o.description.trim()) return fail(422, 'condition', `Giai đoạn “${to.name}” yêu cầu mô tả cơ hội.`);
  const backward = fromIdx >= 0 && toIdx < fromIdx;
  if (backward && cfg.backwardRequiresNote && !note.trim()) return fail(422, 'needs-note', 'Quay lại giai đoạn trước cần ghi chú lý do.');
  return { ok: true, from: fromIdx >= 0 ? cfg.stages[fromIdx] : null, to, backward };
}
export function parseMove(raw: unknown): R<{ stageId: string; note: string; version?: number }> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof b.stageId !== 'string' || !b.stageId) return { ok: false, error: 'Thiếu giai đoạn đích.' };
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length > 500) return { ok: false, error: 'Ghi chú tối đa 500 ký tự.' };
  if (b.version !== undefined && (typeof b.version !== 'number' || !Number.isInteger(b.version))) return { ok: false, error: 'Số phiên bản không hợp lệ.' };
  return { ok: true, value: { stageId: b.stageId, note, version: b.version as number | undefined } };
}
export function parseProbability(raw: unknown): R<{ probability: number; version?: number }> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof b.probability !== 'number' || !Number.isInteger(b.probability) || b.probability < 0 || b.probability > 100) return { ok: false, error: 'Xác suất phải là số nguyên từ 0 đến 100.' };
  if (b.version !== undefined && (typeof b.version !== 'number' || !Number.isInteger(b.version))) return { ok: false, error: 'Số phiên bản không hợp lệ.' };
  return { ok: true, value: { probability: b.probability, version: b.version as number | undefined } };
}

// ---- Dữ liệu Kanban / dự báo / phân tích ----
export interface PItem { status: OppStatus; stageId: string; value: number; probability: number; expectedCloseDate: string | null; stageReached?: string[]; createdAt: string; closedAt: string | null; lostReason: string }
const sumW = (xs: PItem[]) => Math.round(xs.reduce((s, i) => s + (i.value * i.probability) / 100, 0));
const sumV = (xs: PItem[]) => xs.reduce((s, i) => s + i.value, 0);
export interface Column<T> { key: string; stage: Stage | null; items: T[]; count: number; value: number; weighted: number }
/** Gom cơ hội theo cột. Cơ hội thuộc giai đoạn đã bị xóa được xếp vào cột đầu tiên. */
export function boardColumns<T extends PItem>(items: T[], stages: Stage[]): { columns: Column<T>[]; won: Column<T>; lost: Column<T> } {
  const make = (key: string, stage: Stage | null, xs: T[]): Column<T> => ({ key, stage, items: xs, count: xs.length, value: sumV(xs), weighted: sumW(xs) });
  const ids = new Set(stages.map(s => s.id)), open = items.filter(i => i.status === 'open');
  return {
    columns: stages.map((s, idx) => make(s.id, s, open.filter(i => i.stageId === s.id || (idx === 0 && !ids.has(i.stageId))))),
    won: make('won', null, items.filter(i => i.status === 'won')), lost: make('lost', null, items.filter(i => i.status === 'lost')),
  };
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function forecast(items: PItem[], now = new Date()) {
  const open = items.filter(i => i.status === 'open'), today = ymd(now);
  const months = Array.from({ length: 6 }, (_, k) => { const d = new Date(now.getFullYear(), now.getMonth() + k, 1); return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` }; });
  const defs = [{ key: 'overdue', label: 'Quá hạn' }, ...months, { key: 'later', label: 'Sau 6 tháng' }, { key: 'none', label: 'Chưa có ngày chốt' }];
  const bucketOf = (i: PItem) => !i.expectedCloseDate ? 'none' : i.expectedCloseDate < today ? 'overdue' : months.find(m => i.expectedCloseDate!.startsWith(m.key))?.key ?? 'later';
  const buckets = defs.map(d => { const xs = open.filter(i => bucketOf(i) === d.key); return { ...d, count: xs.length, value: sumV(xs), weighted: sumW(xs) }; });
  const commit = open.filter(i => i.probability >= 80), monthKey = today.slice(0, 7);
  const wonNow = items.filter(i => i.status === 'won' && i.closedAt && ymd(new Date(i.closedAt)).startsWith(monthKey));
  return { buckets, totals: { openCount: open.length, openValue: sumV(open), weighted: sumW(open), commitCount: commit.length, commitValue: sumV(commit) }, wonThisMonth: { count: wonNow.length, value: sumV(wonNow) } };
}
export function funnel(items: PItem[], stages: Stage[]) {
  const first = stages[0]?.id, ids = new Set(stages.map(s => s.id));
  const reachedSet = (i: PItem) => { const r = new Set((i.stageReached ?? []).filter(x => ids.has(x))); if (i.status === 'open' && ids.has(i.stageId)) r.add(i.stageId); if (!r.size && first) r.add(first); return r; };
  const sets = items.map(reachedSet);
  const rows = stages.map((st, idx) => ({ stage: st, reached: sets.filter(r => r.has(st.id)).length,
    current: items.filter((i, k) => i.status === 'open' && (i.stageId === st.id || (idx === 0 && !ids.has(i.stageId)))).length, conversionFromPrev: null as number | null }));
  rows.forEach((r, idx) => { if (idx > 0) r.conversionFromPrev = rows[idx - 1].reached ? Math.round((r.reached * 100) / rows[idx - 1].reached) : null; });
  const won = items.filter(i => i.status === 'won'), lost = items.filter(i => i.status === 'lost'), closed = won.length + lost.length;
  const cycles = won.map(i => i.closedAt ? (new Date(i.closedAt).getTime() - new Date(i.createdAt).getTime()) / 86400000 : NaN).filter(n => Number.isFinite(n) && n >= 0);
  const reasons = new Map<string, number>(); lost.forEach(i => reasons.set(i.lostReason || 'Không ghi lý do', (reasons.get(i.lostReason || 'Không ghi lý do') ?? 0) + 1));
  return { total: items.length, stages: rows, won: won.length, lost: lost.length, winRate: closed ? Math.round((won.length * 100) / closed) : 0,
    avgCycleDays: cycles.length ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10 : null,
    lostReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count) };
}

// ---- Bộ lọc thời gian (theo ngày dự kiến chốt) ----
export type Period = 'all' | 'overdue' | 'month' | 'quarter' | 'next30' | 'none';
export const PERIOD_LABEL: Record<Period, string> = { all: 'Mọi thời gian', overdue: 'Quá hạn chốt', month: 'Tháng này', quarter: 'Quý này', next30: '30 ngày tới', none: 'Chưa có ngày chốt' };
export function matchPeriod(date: string | null, status: OppStatus, period: Period, now = new Date()): boolean {
  if (period === 'all') return true;
  if (period === 'none') return !date;
  if (!date) return false;
  const today = ymd(now);
  if (period === 'overdue') return status === 'open' && date < today;
  if (period === 'month') return date.startsWith(today.slice(0, 7));
  if (period === 'quarter') { const d = new Date(`${date}T00:00:00`); return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3); }
  return date >= today && date <= ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));
}
export const requirementText = (s: Stage) => [s.requireValue && 'giá trị > 0', s.requireCloseDate && 'ngày dự kiến chốt', s.requireDescription && 'mô tả'].filter(Boolean).join(', ');
