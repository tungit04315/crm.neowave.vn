import { route } from '@/lib/server/http';
import { listPriceListHistory } from '@/lib/server/price-lists';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => listPriceListHistory(c, (await params).id));
