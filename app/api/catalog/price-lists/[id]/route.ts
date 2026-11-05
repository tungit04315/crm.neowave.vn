import { readJson, route } from '@/lib/server/http';
import { deletePriceList, getPriceList, updatePriceList } from '@/lib/server/price-lists';

type P = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: P) => route(req, async c => getPriceList(c, (await params).id));
export const PATCH = (req: Request, { params }: P) => route(req, async c => updatePriceList(c, (await params).id, await readJson(req)));
export const DELETE = (req: Request, { params }: P) => route(req, async c => deletePriceList(c, (await params).id, await readJson(req)));
