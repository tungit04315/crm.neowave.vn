import { readJson, route } from '@/lib/server/http';
import { snapshotPrice } from '@/lib/server/discounts';

/** Ảnh chụp giá bất biến (kèm thuế, chiết khấu) để báo giá / đơn hàng lưu cùng chứng từ. Không ghi dữ liệu. */
export const POST = (req: Request) => route(req, async c => snapshotPrice(c, await readJson(req)));
