/** Kiểu dùng chung của phân hệ Sản phẩm & Dịch vụ. Dữ liệu trả về từ API (thời gian dạng chuỗi ISO). */
export type CatalogType = 'product' | 'service';
export type ActiveStatus = 'active' | 'inactive';
export type PriceRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PriceMode = 'initial' | 'direct' | 'approved';
export interface Change { field: string; label: string; from: string; to: string }

export interface ItemDto {
  id: string; code: string; type: CatalogType; name: string; shortDescription: string; description: string;
  categoryId: string; categoryName: string; unitId: string; unitName: string; unitSymbol: string;
  taxRateId: string | null; taxRateName: string; taxRateBp: number | null; priceIncludesTax: boolean;
  defaultPrice: number; status: ActiveStatus; note: string; pendingPriceRequestId: string | null;
  version: number; createdByName: string; updatedByName: string; createdAt: string; updatedAt: string;
}
export interface CategoryDto { id: string; code: string; type: CatalogType; name: string; description: string; color: string; status: ActiveStatus; itemCount: number; version: number; createdByName: string; createdAt: string; updatedAt: string }
export interface UnitDto { id: string; code: string; name: string; symbol: string; description: string; status: ActiveStatus; itemCount: number; version: number; createdByName: string; createdAt: string; updatedAt: string }
/** rateBp: thuế suất tính theo điểm cơ bản (1% = 100). Ví dụ 1000 = 10%. */
export interface TaxRateDto { id: string; code: string; name: string; rateBp: number; status: ActiveStatus; version: number; createdByName: string; createdAt: string; updatedAt: string }
export interface CatalogHistoryDto { id: string; type: string; changes: Change[]; note: string; actorName: string; at: string }
export interface PriceHistoryDto { id: string; oldPrice: number | null; newPrice: number; diff: number; pctBp: number | null; reason: string; changedByName: string; approvedByName: string | null; mode: PriceMode; at: string }
export interface PriceRequestDto {
  id: string; itemId: string; itemCode: string; itemName: string; oldPrice: number; newPrice: number; reason: string; status: PriceRequestStatus;
  requestedBy: string; requestedByName: string; requestedAt: string; decidedByName: string | null; decidedAt: string | null; decisionNote: string;
}
export interface ItemFlags { edit: boolean; price: 'direct' | 'request' | 'none' }
export interface ItemDetail { item: ItemDto; history: CatalogHistoryDto[]; priceHistory: PriceHistoryDto[]; pendingRequest: PriceRequestDto | null; can: ItemFlags }
export interface ItemList { items: ItemDto[]; nextCursor: string | null; can: { create: boolean; export: boolean; editTax: boolean } }
export interface CatalogStats { products: number; productsActive: number; services: number; servicesActive: number; categories: number }
