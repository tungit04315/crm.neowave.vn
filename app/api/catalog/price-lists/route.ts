import { readJson, route } from '@/lib/server/http';
import { createPriceList, listPriceLists } from '@/lib/server/price-lists';

export const GET = (req: Request) => route(req, c => listPriceLists(c, Object.fromEntries(new URL(req.url).searchParams)));
export const POST = (req: Request) => route(req, async c => createPriceList(c, await readJson(req)));
