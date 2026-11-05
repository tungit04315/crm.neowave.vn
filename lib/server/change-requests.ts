import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import { actorOf, body, forbid, iso, notFound } from './catalog';
import { can as catalogCan, parsePrice } from '../catalog-core';
import { groupPriceId, pricingCan } from '../pricing-core';
import { savePrices } from './price-lists';
import { saveGroupPrices } from './pricing';
import { formatVnd } from '../catalog-core';
import type { ChangeRequestStatus, PriceChangeRequestDto } from '@/types/pricing';

const db = () => adminDb();
const col = (n: string) => db().collection(n);
const STATUSES: ChangeRequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];
const toDto = (id: string, d: DocumentData): PriceChangeRequestDto => ({ id, kind: d.kind, targetId: d.targetId, targetName: d.targetName ?? '', itemId: d.itemId, itemCode: d.itemCode, itemName: d.itemName, oldPrice: d.oldPrice ?? null, newPrice: d.newPrice, reason: d.reason ?? '', status: d.status,
  requestedBy: d.requestedBy, requestedByName: d.requestedByName ?? '', requestedAt: iso(d.requestedAt) ?? '', decidedByName: d.decidedByName ?? null, decidedAt: iso(d.decidedAt) ?? null, decisionNote: d.decisionNote ?? '' });

/** Giá hiện tại của mặt hàng trong bảng giá / nhóm (null nếu chưa có). Đọc trong giao dịch. */
async function currentPrice(tx: FirebaseFirestore.Transaction, kind: string, targetId: string, itemId: string): Promise<number | null> {
  const ref = kind === 'priceList' ? col('priceLists').doc(targetId).collection('items').doc(itemId) : col('groupPrices').doc(groupPriceId(itemId, targetId));
  const d = (await tx.get(ref)).data(); return d ? d.price : null;
}
/** Người không có quyền sửa trực tiếp (manager) gửi yêu cầu đổi giá một mặt hàng trong bảng giá hoặc giá theo nhóm. */
export async function requestChange(c: Ctx, raw: unknown) {
  const a = actorOf(c), b = body(raw);
  if (!catalogCan.requestPrice(a)) throw forbid(pricingCan.edit(a) ? 'Bạn có quyền sửa giá trực tiếp, không cần gửi yêu cầu.' : 'Bạn không có quyền gửi yêu cầu đổi giá.');
  const kind = b.kind, targetId = typeof b.targetId === 'string' ? b.targetId.trim() : '', itemId = typeof b.itemId === 'string' ? b.itemId.trim() : '', reason = typeof b.reason === 'string' ? b.reason.trim() : '', p = parsePrice(b.price);
  if (kind !== 'priceList' && kind !== 'groupPrice') throw new HttpError(400, 'invalid', 'Loại yêu cầu không hợp lệ.');
  if (!targetId || !itemId) throw new HttpError(400, 'invalid', 'Thiếu bảng giá / nhóm khách hàng hoặc mặt hàng.');
  if (!p.ok) throw new HttpError(400, 'invalid', 'Giá phải là số nguyên không âm (VND).');
  if (!reason) throw new HttpError(400, 'invalid', 'Vui lòng nhập lý do đổi giá.'); if (reason.length > 500) throw new HttpError(400, 'invalid', 'Lý do tối đa 500 ký tự.');
  return db().runTransaction(async tx => {
    const [t, it, cur, pend] = await Promise.all([tx.get(col(kind === 'priceList' ? 'priceLists' : 'customerGroups').doc(targetId)), tx.get(col('catalogItems').doc(itemId)), currentPrice(tx, kind, targetId, itemId),
      tx.get(col('priceChangeRequests').where('organizationId', '==', c.orgId).where('status', '==', 'pending').where('kind', '==', kind).where('targetId', '==', targetId).where('itemId', '==', itemId).limit(1))]);
    const target = t.data(), item = it.data();
    if (!target || target.organizationId !== c.orgId || target.deletedAt) throw new HttpError(400, 'bad-ref', kind === 'priceList' ? 'Bảng giá không tồn tại.' : 'Nhóm khách hàng không tồn tại.');
    if (!item || item.organizationId !== c.orgId || item.deletedAt) throw new HttpError(400, 'bad-ref', 'Sản phẩm / dịch vụ không tồn tại.');
    if (cur === null && item.status !== 'active') throw new HttpError(400, 'inactive-item', 'Mặt hàng đang ngừng kinh doanh, không thể thêm giá mới.');
    if (cur === p.value) throw new HttpError(400, 'same-price', 'Giá mới trùng với giá hiện tại.');
    if (!pend.empty) throw new HttpError(409, 'pending-exists', 'Đã có một yêu cầu đổi giá đang chờ duyệt cho mặt hàng này.');
    const ref = col('priceChangeRequests').doc();
    tx.set(ref, { organizationId: c.orgId, kind, targetId, targetName: kind === 'priceList' ? `${target.code} – ${target.name}` : target.name, itemId, itemCode: item.code, itemName: item.name, oldPrice: cur, newPrice: p.value, reason, status: 'pending',
      requestedBy: c.uid, requestedByName: c.name, requestedAt: FieldValue.serverTimestamp(), decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: '' });
    return { id: ref.id };
  });
}
export async function listChangeRequests(c: Ctx, status?: string) {
  const a = actorOf(c);
  if (!catalogCan.viewRequests(a)) throw forbid('Bạn không có quyền xem yêu cầu đổi giá.');
  let q = col('priceChangeRequests').where('organizationId', '==', c.orgId);
  if (status && STATUSES.includes(status as ChangeRequestStatus)) q = q.where('status', '==', status);
  const approve = catalogCan.approvePrice(a, { requestedBy: '' });
  if (!approve) q = q.where('requestedBy', '==', c.uid);
  const snap = await q.limit(200).get();
  return { items: snap.docs.map(d => toDto(d.id, d.data())).sort((x, y) => y.requestedAt.localeCompare(x.requestedAt)), can: { approve } };
}
/**
 * Duyệt / từ chối (Giám đốc, Quản trị viên — không tự duyệt yêu cầu của mình) hoặc hủy (chỉ người gửi).
 * Duyệt: giữ chỗ (pending → approved) trong một giao dịch, rồi áp dụng giá bằng đúng luồng đặt giá thường (có nhật ký, người đề xuất + người duyệt);
 * nếu áp dụng thất bại, trả yêu cầu về pending để không mất yêu cầu.
 */
export async function decideChange(c: Ctx, rid: string, raw: unknown) {
  const b = body(raw), decision = b.decision, note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : '';
  if (decision !== 'approve' && decision !== 'reject' && decision !== 'cancel') throw new HttpError(400, 'invalid', 'Quyết định không hợp lệ.');
  const a = actorOf(c), ref = col('priceChangeRequests').doc(rid);
  const r = await db().runTransaction(async tx => {
    const s = await tx.get(ref), d = s.data();
    if (!d || d.organizationId !== c.orgId) throw notFound();
    if (!catalogCan.viewRequests(a)) throw forbid('Bạn không có quyền xử lý yêu cầu đổi giá.');
    if (d.status !== 'pending') throw new HttpError(409, 'closed', 'Yêu cầu này đã được xử lý.');
    if (decision === 'cancel') { if (d.requestedBy !== c.uid) throw forbid('Chỉ người gửi mới được hủy yêu cầu.'); }
    else if (!catalogCan.approvePrice(a, { requestedBy: d.requestedBy })) throw forbid(d.requestedBy === c.uid ? 'Bạn không thể tự duyệt yêu cầu của chính mình.' : 'Bạn không có quyền duyệt yêu cầu đổi giá.');
    if (decision === 'approve') {
      const cur = await currentPrice(tx, d.kind, d.targetId, d.itemId);
      if (cur !== (d.oldPrice ?? null)) throw new HttpError(409, 'stale', `Giá hiện tại (${cur === null ? 'chưa có' : formatVnd(cur)}) đã khác lúc gửi yêu cầu. Hãy từ chối và yêu cầu gửi lại.`);
    }
    tx.update(ref, { status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'cancelled', decidedBy: c.uid, decidedByName: c.name, decidedAt: FieldValue.serverTimestamp(), decisionNote: note });
    return d;
  });
  if (decision !== 'approve') return { id: rid, status: decision === 'reject' ? 'rejected' : 'cancelled' };
  const attrib = { changedBy: { uid: r.requestedBy as string, name: r.requestedByName as string }, approvedBy: c };
  const reason = `${r.reason} (đề xuất bởi ${r.requestedByName}, duyệt bởi ${c.name})`.slice(0, 500), rows = [{ itemId: r.itemId, price: r.newPrice, ...(r.oldPrice !== null && r.kind === 'priceList' ? { expectedPrice: r.oldPrice } : {}) }], mode = r.oldPrice === null ? 'add' : 'set';
  try {
    const res = r.kind === 'priceList' ? await savePrices(c, r.targetId, { rows, reason, mode }, attrib) : await saveGroupPrices(c, { groupId: r.targetId, rows, reason, mode }, attrib);
    const x = res.results[0]; if (x.result === 'error') throw new HttpError(409, 'apply-failed', x.error ?? 'Không áp dụng được giá.');
  } catch (e) {
    await db().runTransaction(async tx => { // trả về chờ duyệt (chỉ khi vẫn là bản ghi do chính lần duyệt này giữ chỗ)
      const cur = (await tx.get(ref)).data();
      if (cur && cur.status === 'approved' && cur.decidedBy === c.uid) tx.update(ref, { status: 'pending', decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: '' });
    });
    throw e instanceof HttpError ? e : new HttpError(500, 'apply-failed', 'Không áp dụng được giá. Yêu cầu vẫn đang chờ duyệt.');
  }
  return { id: rid, status: 'approved' };
}
