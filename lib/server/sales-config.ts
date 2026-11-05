import { adminDb } from './firebase-admin';
import { DEFAULT_CONFIG, type PipelineConfig, type Stage } from '../pipeline-core';

/** Cấu hình pipeline của tổ chức (1 tài liệu `salesConfig/{orgId}`). Chưa cấu hình thì dùng mặc định (version 0). */
export async function getConfig(orgId: string): Promise<PipelineConfig> {
  const d = (await adminDb().doc(`salesConfig/${orgId}`).get()).data();
  if (!d || !Array.isArray(d.stages) || d.stages.length < 2) return DEFAULT_CONFIG;
  return { stages: d.stages as Stage[], allowSkip: d.allowSkip !== false, backwardRequiresNote: d.backwardRequiresNote !== false, version: typeof d.version === 'number' ? d.version : 0 };
}
export const stageNames = (cfg: PipelineConfig) => new Map(cfg.stages.map(s => [s.id, s.name] as const));
