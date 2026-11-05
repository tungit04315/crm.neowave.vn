import { readJson, route } from '@/lib/server/http';
import { listPriceListRows, removePriceListItems, savePrices } from '@/lib/server/price-lists';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => listPriceListRows(c, (await params).id, Object.fromEntries(new URL(req.url).searchParams)));
export const POST = (req: Request, { params }: P) => route(req, async c => savePrices(c, (await params).id, await readJson(req)));
export const DELETE = (req: Request, { params }: P) => route(req, async c => removePriceListItems(c, (await params).id, await readJson(req)));
