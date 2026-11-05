import { FieldPath, type DocumentData } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import { actorOf, forbid, iso } from './catalog';
import { EXPORT_MAX } from '../catalog-io-core';
import { pricingCan } from '../pricing-core';
import type { PriceLogDto, PriceLogKind, PriceLogMode, PriceLogPage } from '@/types/pricing';

const BATCH = 200, SCAN_MAX = 2000, EXPORT_SCAN_MAX = 20000;
const KINDS: PriceLogKind[] = ['default', 'priceList', 'groupPrice'], MODES: PriceLogMode[] = ['initial', 'direct', 'approved', 'added', 'changed'];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
/** Ngày theo giờ Việt Nam (UTC+7, không có giờ mùa hè) của một mốc thời gian ISO */
const vnDay = (isoStr: string) => new Date(new Date(isoStr).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

const toDto = (id: string, d: DocumentData): PriceLogDto => ({ id, at: iso(d.at) ?? '', kind: d.kind, scopeId: d.scopeId ?? '', scopeName: d.scopeName ?? '', itemId: d.itemId, itemCode: d.itemCode, itemName: d.itemName, oldPrice: d.oldPrice ?? null, newPrice: d.newPrice,
  diff: d.diff ?? 0, pctBp: d.pctBp ?? null, reason: d.reason ?? '', mode: d.mode, changedByName: d.changedByName ?? '', approvedByName: d.approvedByName ?? null });
interface Filters { kind: PriceLogKind | ''; mode: PriceLogMode | ''; itemId: string; scopeId: string; from: string; to: string; q: string }
function parseFilters(q: Record<string, string | undefined>): Filters {
  const kind = q.kind ?? '', mode = q.mode ?? '', from = q.from ?? '', to = q.to ?? '';
  if (kind && !KINDS.includes(kind as PriceLogKind)) throw new HttpError(400, 'invalid', 'Nguồn giá không hợp lệ.');
  if (mode && !MODES.includes(mode as PriceLogMode)) throw new HttpError(400, 'invalid', 'Hình thức thay đổi không hợp lệ.');
  if ((from && !isDate(from)) || (to && !isDate(to))) throw new HttpError(400, 'invalid', 'Ngày không hợp lệ (định dạng YYYY-MM-DD).');
  if (from && to && to < from) throw new HttpError(400, 'invalid', 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  return { kind: kind as Filters['kind'], mode: mode as Filters['mode'], itemId: q.itemId ?? '', scopeId: q.scopeId ?? '', from, to, q: (q.q ?? '').trim().toLowerCase() };
}
const matches = (r: PriceLogDto, f: Filters) => (!f.kind || r.kind === f.kind) && (!f.mode || r.mode === f.mode) && (!f.itemId || r.itemId === f.itemId) && (!f.scopeId || r.scopeId === f.scopeId)
  && (!f.from || vnDay(r.at) >= f.from) && (!f.to || vnDay(r.at) <= f.to) && (!f.q || `${r.itemCode} ${r.itemName} ${r.scopeName} ${r.reason} ${r.changedByName}`.toLowerCase().includes(f.q));

/**
 * Lịch sử giá tổng hợp (mới nhất trước). Lọc phía máy chủ bằng cách quét theo lô từ con trỏ (tối đa SCAN_MAX bản ghi mỗi lần gọi)
 * để không cần chỉ mục tổng hợp. `nextCursor` là vị trí đã quét tới; khác null nghĩa là còn dữ liệu chưa quét.
 */
export async function listPriceLog(c: Ctx, q: Record<string, string | undefined>, scanMax = SCAN_MAX): Promise<PriceLogPage> {
  if (!pricingCan.view(actorOf(c))) throw forbid('Bạn không có quyền xem lịch sử giá.');
  const f = parseFilters(q), limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200), items: PriceLogDto[] = [];
  let cursor = q.cursor || null, scanned = 0, exhausted = false;
  while (items.length < limit && scanned < scanMax) {
    let query = adminDb().collection('priceLog').where('organizationId', '==', c.orgId).orderBy(FieldPath.documentId(), 'desc');
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.limit(BATCH).get();
    if (snap.empty) { exhausted = true; break; }
    for (const s of snap.docs) { cursor = s.id; scanned++; const dto = toDto(s.id, s.data()); if (matches(dto, f)) { items.push(dto); if (items.length === limit) break; } }
    if (snap.size < BATCH && items.length < limit) { exhausted = true; break; }
  }
  return { items, nextCursor: exhausted ? null : cursor, can: { export: pricingCan.export(actorOf(c)) } };
}
export async function exportPriceLog(c: Ctx, q: Record<string, string | undefined>) {
  if (!pricingCan.export(actorOf(c))) throw forbid('Bạn không có quyền xuất lịch sử giá.');
  const rows: PriceLogDto[] = []; let cursor: string | null = null, scanned = 0;
  do {
    const page: PriceLogPage = await listPriceLog(c, { ...q, limit: '200', cursor: cursor ?? undefined }, SCAN_MAX); rows.push(...page.items); cursor = page.nextCursor; scanned += SCAN_MAX;
  } while (cursor && rows.length < EXPORT_MAX && scanned < EXPORT_SCAN_MAX);
  return { items: rows.slice(0, EXPORT_MAX), truncated: !!cursor || rows.length > EXPORT_MAX };
}
