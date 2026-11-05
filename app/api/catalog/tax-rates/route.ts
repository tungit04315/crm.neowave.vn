import { readJson, route } from '@/lib/server/http';
import { createTaxRate, listTaxRates } from '@/lib/server/catalog';

export const GET = (req: Request) => route(req, c => listTaxRates(c));
export const POST = (req: Request) => route(req, async c => createTaxRate(c, await readJson(req)));
