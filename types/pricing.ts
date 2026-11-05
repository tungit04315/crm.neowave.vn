import type { ActiveStatus, Change } from './catalog';
import type { ListState } from './price-list';

export type PriceSource = 'group' | 'priceList' | 'default';
export interface GroupPriceDto {
  id: string; itemId: string; itemCode: string; itemName: string; groupId: string; groupName: string; price: number; defaultPrice: number;
  startDate: string | null; endDate: string | null; status: ActiveStatus; state: ListState; version: number; updatedByName: string; updatedAt: string;
}
export interface GroupPriceHistoryDto { id: string; type: 'created' | 'price_changed' | 'updated'; oldPrice: number | null; newPrice: number | null; reason: string; changes: Change[]; actorName: string; at: string }
export interface GroupPriorityDto { groupId: string; groupName: string; color: string; groupStatus: string; priority: number; priceCount: number }
export interface ResolveResult { found: boolean; price: number | null; source: PriceSource | null; sourceId: string | null; sourceName: string; groupId: string | null; warning: string | null; trace: string[] }
export interface ItemPricesDto {
  itemId: string; code: string; name: string; defaultPrice: number;
  lists: { id: string; code: string; name: string; state: ListState; price: number; customerGroupNames: string[] }[];
  groupPrices: { id: string; groupId: string; groupName: string; price: number; state: ListState; priority: number; startDate: string | null; endDate: string | null }[];
}

export type DiscountKind = 'percent' | 'amount';
export interface DiscountPolicyDto {
  id: string; code: string; name: string; description: string; kind: DiscountKind; value: number; stackable: boolean;
  customerGroupIds: string[]; customerGroupNames: string[]; itemIds: string[]; itemNames: string[]; categoryIds: string[]; categoryNames: string[]; minOrderValue: number | null;
  startDate: string | null; endDate: string | null; status: ActiveStatus; state: ListState; version: number; createdByName: string; createdAt: string; updatedAt: string;
}
export interface DiscountHistoryDto { id: string; type: 'created' | 'updated' | 'status_changed'; changes: Change[]; actorName: string; at: string }
export interface PolicyEval { policyId: string; code: string; name: string; applicable: boolean; reason: string; discount: number; lineIndexes: number[] }
export interface DiscountResult { subtotal: number; policies: PolicyEval[]; applied: PolicyEval[]; lineDiscounts: number[]; totalDiscount: number; netTotal: number }
/**
 * Một dòng hàng sau tính giá. `lineTotal` = số lượng × đơn giá (đơn giá có thể đã gồm thuế).
 * `amountBeforeTax` = phần giá trị chưa thuế sau chiết khấu; `total` = số tiền khách phải trả cho dòng.
 */
export interface EvaluateLineOut {
  index: number; itemId: string; code: string; name: string; unitName: string; quantity: number; unitPrice: number | null; priceSource: PriceSource | null; priceSourceName: string; warning: string | null; error: string | null;
  lineTotal: number; discount: number; taxRateId: string | null; taxRateName: string; taxRateBp: number | null; priceIncludesTax: boolean; amountBeforeTax: number; tax: number; total: number;
}
export interface TaxTotals { subtotal: number; discount: number; amountBeforeTax: number; tax: number; total: number }
export interface EvaluateOut { lines: EvaluateLineOut[]; discount: DiscountResult; totals: TaxTotals; limitBp: number; discountBp: number; needsApproval: boolean; groupIds: string[] }

/** Ảnh chụp giá bất biến để phân hệ Báo giá / Đơn hàng lưu cùng chứng từ; đổi giá sau này không làm đổi ảnh chụp. */
export interface PriceSnapshot {
  schema: 1; computedAt: string; priceDate: string; currency: 'VND'; customerId: string | null; groupIds: string[]; actor: { uid: string; name: string; role: string };
  lines: EvaluateLineOut[]; appliedPolicies: { policyId: string; code: string; name: string; discount: number; lineIndexes: number[] }[]; totals: TaxTotals; discountBp: number; limitBp: number; needsApproval: boolean; fingerprint: string;
}

/** Một dòng nhật ký giá tập trung (mọi nguồn giá). */
export type PriceLogKind = 'default' | 'priceList' | 'groupPrice';
export type PriceLogMode = 'initial' | 'direct' | 'approved' | 'added' | 'changed';
export interface PriceLogDto {
  id: string; at: string; kind: PriceLogKind; scopeId: string; scopeName: string; itemId: string; itemCode: string; itemName: string;
  oldPrice: number | null; newPrice: number; diff: number; pctBp: number | null; reason: string; mode: PriceLogMode; changedByName: string; approvedByName: string | null;
}
export interface PriceLogPage { items: PriceLogDto[]; nextCursor: string | null; can: { export: boolean } }

/** Yêu cầu đổi giá bảng giá / giá theo nhóm (người không có quyền sửa trực tiếp gửi, Giám đốc / Quản trị viên duyệt). */
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface PriceChangeRequestDto {
  id: string; kind: 'priceList' | 'groupPrice'; targetId: string; targetName: string; itemId: string; itemCode: string; itemName: string; oldPrice: number | null; newPrice: number; reason: string; status: ChangeRequestStatus;
  requestedBy: string; requestedByName: string; requestedAt: string; decidedByName: string | null; decidedAt: string | null; decisionNote: string;
}
