'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { PipelineConfig } from '@/lib/pipeline-core';
import type { OpportunityDto } from '@/types/opportunity';

/** Một nguồn dữ liệu duy nhất cho Kanban, Danh sách, Dự báo: cùng gọi /api/opportunities + /api/sales/stages */
export function usePipelineData() {
  const [items, setItems] = useState<OpportunityDto[] | null>(null);
  const [config, setConfig] = useState<PipelineConfig | null>(null);
  const [can, setCan] = useState({ create: false, export: false });
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api<{ items: OpportunityDto[]; truncated: boolean; can: { create: boolean; export: boolean } }>('/api/opportunities'), api<{ config: PipelineConfig }>('/api/sales/stages')]);
      setItems(o.items); setTruncated(o.truncated); setCan(o.can); setConfig(s.config); setError(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Không tải được dữ liệu.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const patch = useCallback((dto: OpportunityDto) => setItems(xs => (xs ? xs.map(i => (i.id === dto.id ? dto : i)) : xs)), []);
  return { items, config, can, truncated, error, setError, load, patch };
}
