import { readJson, route } from '@/lib/server/http';
import { listGroupPrices, saveGroupPrices } from '@/lib/server/pricing';

export const GET = (req: Request) => route(req, c => listGroupPrices(c, Object.fromEntries(new URL(req.url).searchParams)));
export const POST = (req: Request) => route(req, async c => saveGroupPrices(c, await readJson(req)));
