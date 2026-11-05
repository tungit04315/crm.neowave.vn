import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { HttpError } from './errors';
import type { Ctx } from './auth';
import { actorOf, col, customerMap, hist, mutate, notFound, toDto, type OppDoc } from './opportunities';
import { getConfig, stageNames } from './sales-config';
import { can, type Change } from '../opportunity-core';
import { checkMove, parseConfig, parseMove, parseProbability, type PipelineConfig, type Stage } from '../pipeline-core';

export const CONFIG_ROLES = ['super_admin', 'director']; // GIẢ ĐỊNH: chỉ Giám đốc / Super Admin được cấu hình giai đoạn

export async function getStages(c: Ctx) {
  return { config: await getConfig(c.orgId), can: { edit: CONFIG_ROLES.includes(c.role) } };
}

export async function putStages(c: Ctx, raw: unknown) {
  if (!CONFIG_ROLES.includes(c.role)) throw new HttpError(403, 'forbidden', 'Chỉ Giám đốc hoặc Quản trị viên mới được cấu hình giai đoạn bán hàng.');
  const p = parseConfig(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const cur = await getConfig(c.orgId);
  if (p.value.version !== cur.version) throw new HttpError(409, 'conflict', 'Cấu hình vừa được người khác thay đổi. Vui lòng tải lại trang.');
  // Chỉ giữ mã giai đoạn đã tồn tại; mã lạ do trình duyệt gửi bị bỏ, giai đoạn mới được máy chủ cấp mã
  const known = new Set(cur.stages.map(s => s.id)), taken = new Set<string>();
  const stages: Stage[] = p.value.stages.map(s => {
    let id = s.id && known.has(s.id) ? s.id : '';
    while (!id || taken.has(id)) id = `st_${randomBytes(4).toString('hex')}`;
    taken.add(id);
    return { id, name: s.name, color: s.color, probability: s.probability, requireValue: s.requireValue, requireCloseDate: s.requireCloseDate, requireDescription: s.requireDescription };
  });
  for (const old of cur.stages.filter(s => !taken.has(s.id))) { // không xóa giai đoạn còn cơ hội đang mở
    const snap = await col().where('organizationId', '==', c.orgId).where('stageId', '==', old.id).limit(50).get();
    const n = snap.docs.filter(d => !d.data().deletedAt && d.data().status === 'open').length;
    if (n) throw new HttpError(409, 'stage-in-use', `Giai đoạn “${old.name}” còn ${n} cơ hội đang mở. Hãy chuyển các cơ hội sang giai đoạn khác trước khi xóa.`);
  }
  const ref = adminDb().doc(`salesConfig/${c.orgId}`);
  await adminDb().runTransaction(async tx => {
    const s = await tx.get(ref), v = (s.data()?.version as number | undefined) ?? 0;
    if (v !== p.value.version) throw new HttpError(409, 'conflict', 'Cấu hình vừa được người khác thay đổi. Vui lòng tải lại trang.');
    tx.set(ref, { stages, allowSkip: p.value.allowSkip, backwardRequiresNote: p.value.backwardRequiresNote, version: v + 1, organizationId: c.orgId, updatedBy: c.uid, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ref.collection('history').doc(), { actorUid: c.uid, actorName: c.name, at: FieldValue.serverTimestamp(), version: v + 1,
      added: stages.filter(x => !known.has(x.id)).map(x => x.name), removed: cur.stages.filter(x => !taken.has(x.id)).map(x => x.name), stageCount: stages.length });
  });
  return { config: await getConfig(c.orgId) };
}

async function fresh(c: Ctx, id: string, cfg: PipelineConfig, changed: boolean) {
  const d = (await col().doc(id).get()).data() as OppDoc | undefined;
  if (!d) throw notFound();
  return { changed, opportunity: toDto(id, d, await customerMap(c.orgId, [d.customerId]), stageNames(cfg)) };
}

/** Chuyển giai đoạn: kiểm quyền + phạm vi, điều kiện chuyển, phiên bản; cập nhật xác suất theo giai đoạn đích; ghi lịch sử cùng giao dịch. */
export async function moveStage(c: Ctx, id: string, raw: unknown) {
  const p = parseMove(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const cfg = await getConfig(c.orgId);
  const r = await mutate(c, id, { version: p.value.version }, d => {
    if (d.status !== 'open') throw new HttpError(409, 'closed', 'Cơ hội đã đóng. Hãy mở lại trước khi chuyển giai đoạn.');
    if (!can.edit(actorOf(c), d)) throw new HttpError(403, 'forbidden', 'Bạn không có quyền chuyển giai đoạn cơ hội này.');
    const m = checkMove(cfg, d, p.value.stageId, p.value.note);
    if (!m.ok) throw new HttpError(m.status, m.code, m.error);
    const prob = m.to.probability, changes: Change[] = [{ field: 'stageId', label: 'Giai đoạn', from: m.from?.name ?? '(Giai đoạn đã xóa)', to: m.to.name }];
    if (d.probability !== prob) changes.push({ field: 'probability', label: 'Xác suất', from: `${d.probability}%`, to: `${prob}%` });
    return { update: { stageId: m.to.id, probability: prob, stageEnteredAt: Timestamp.now(), stageReached: FieldValue.arrayUnion(m.to.id) }, history: hist(c, 'stage', changes, p.value.note) };
  });
  return fresh(c, id, cfg, r.changed);
}

export async function setProbability(c: Ctx, id: string, raw: unknown) {
  const p = parseProbability(raw); if (!p.ok) throw new HttpError(400, 'invalid', p.error);
  const cfg = await getConfig(c.orgId);
  const r = await mutate(c, id, { version: p.value.version }, d => {
    if (d.status !== 'open') throw new HttpError(409, 'closed', 'Cơ hội đã đóng, không thể đổi xác suất.');
    if (!can.edit(actorOf(c), d)) throw new HttpError(403, 'forbidden', 'Bạn không có quyền sửa cơ hội này.');
    if (d.probability === p.value.probability) return { update: {}, history: null };
    return { update: { probability: p.value.probability }, history: hist(c, 'probability', [{ field: 'probability', label: 'Xác suất', from: `${d.probability}%`, to: `${p.value.probability}%` }]) };
  });
  return fresh(c, id, cfg, r.changed);
}
