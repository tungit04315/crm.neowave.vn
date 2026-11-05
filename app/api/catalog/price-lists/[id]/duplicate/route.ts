import { readJson, route } from '@/lib/server/http';
import { duplicatePriceList } from '@/lib/server/price-lists';

type P = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: P) => route(req, async c => duplicatePriceList(c, (await params).id, await readJson(req)));
