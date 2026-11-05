import { readJson, route } from '@/lib/server/http';
import { setPriceListStatus } from '@/lib/server/price-lists';

type P = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: P) => route(req, async c => setPriceListStatus(c, (await params).id, await readJson(req)));
