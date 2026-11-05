import type { ActiveStatus } from './catalog';

export type PriceListType = 'standard' | 'customer_group' | 'partner' | 'promotion' | 'region' | 'other';
/** Trạng thái hiệu lực tính theo ngày hôm nay: sắp áp dụng / đang áp dụng / hết hạn / ngừng hoạt động */
export type ListState = 'upcoming' | 'current' | 'expired' | 'inactive';
export interface PriceListDto {
  id: string; code: string; name: string; description: string; type: PriceListType; scopeNote: string;
  startDate: string | null; endDate: string | null; currency: 'VND'; customerGroupIds: string[]; customerGroupNames: string[];
  status: ActiveStatus; state: ListState; itemCount: number; version: number; createdByName: string; createdAt: string; updatedAt: string;
}
export interface PriceListRowDto {
  itemId: string; code: string; name: string; type: 'product' | 'service'; categoryName: string; unitName: string; taxText: string; itemStatus: ActiveStatus;
  defaultPrice: number; price: number; updatedAt: string; updatedByName: string;
}
export interface PriceListHistoryDto {
  id: string; type: 'created' | 'updated' | 'status_changed' | 'item_added' | 'item_removed' | 'price_changed' | 'duplicated' | 'deleted';
  itemId: string | null; itemCode: string | null; itemName: string | null; oldPrice: number | null; newPrice: number | null; reason: string; note: string;
  changes: { field: string; label: string; from: string; to: string }[]; actorName: string; at: string;
}
export interface PriceListFlags { edit: boolean; export: boolean }
export interface PriceListDetail { list: PriceListDto; can: PriceListFlags }
export interface PriceListRows { rows: PriceListRowDto[]; nextCursor: string | null }
/** Kết quả từng dòng khi thêm / cập nhật giá hàng loạt */
export interface UpsertResult { index: number; itemId: string | null; result: 'added' | 'updated' | 'unchanged' | 'error'; error?: string }
